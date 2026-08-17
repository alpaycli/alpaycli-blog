---
layout: post
published: false
title: "Building an On-Device Video Editor app with Swift/SwiftUI and SpeechAnalyzer — Part 2"
date: 2026-08-14 13:00:00 -0000
categories: []
tags: [swift, swiftui, speech, speech-to-text, avfoundation]
permalink: /blog/:year/:month/:day/:title
---

In [Part 1]({% post_url 2026-08-14-On-Device-Video-Transcriber-And-Auto-Sub-Generator-App-Part-1 %}), we imported a video, transcribed its audio fully on-device, and used the timing attributes returned by `SpeechTranscriber` to highlight the currently spoken word.

This time, we are going to make the transcript interactive. The user will be able to tap any word and jump directly to the moment where it is spoken in the video.

In this part, we will look at how to:

- Split an `AttributedString` into individual words without losing Speech's attributes that we are gonna need.
- Display every word as a separate SwiftUI button.
- Jump to the exact starting time of the selected word.

If you want to get the current version of the project that was built in part 1, <a href="{{ '/assets/downloads/video-editor-part-1.zip' | relative_url }}" download>here</a> you can download.

## Why we cannot keep using one full Text view for the whole transcription

In Part 1, the entire transcript was displayed with one `Text` view.

That worked nicely for highlighting because we could create a copy of the attributed transcript, find the range for the current word, and change the styling of that range.

However, now we want each word to have its own tap action. A single `Text` view does not give us a separate button for every attributed range, so we need to split the transcript into individual values and render them separately.

There is one important detail here: we should not convert the transcript to a regular `String` before splitting it.

The `audioTimeRange` that tells us when a word was spoken is stored as an attribute on the `AttributedString`. If we first convert it to a `String`, split it, and create new attributed strings afterward, that timing information will be gone.

Instead, we split the attributed string through its `characters` view and keep each result as an `AttributedSubstring`.

## Creating a model for each word

We begin with a small model that stores one attributed word.

```swift
import AVFoundation
import Speech

struct TranscriptWord: Identifiable {
    let id = UUID()
    let word: AttributedSubstring

    var audioTimeRange: CMTimeRange? {
        word.audioTimeRange
    }
}
```

The `word` property is an `AttributedSubstring`, not a `String`. Because it is still a slice of the original attributed value, it keeps the attributes attached by `SpeechTranscriber`.

We also expose its timing as a computed property:

```swift
var audioTimeRange: CMTimeRange? {
    word.audioTimeRange
}
```

The range is optional because an attributed string can contain parts without an audio timing attribute. Later, words without a valid range will simply have their buttons disabled.(hopefully we won't face a situation like this in our example.)
## Splitting the attributed transcript

Next, we add an extension that turns the complete transcript into an array of `TranscriptWord` values.

```swift
extension AttributedString {
    func transcriptWords() -> [TranscriptWord] {
        characters
            .split { character in
                character.isWhitespace || character.isNewline
            }
            .map { characterRange in
                TranscriptWord(
                    word: self[
                        characterRange.startIndex..<characterRange.endIndex
                    ]
                )
            }
    }
}
```

We split the `characters` collection wherever we find whitespace or a new line. Each result gives us indices that still belong to the original attributed string, so we can use those indices to create an `AttributedSubstring`.

```swift
self[characterRange.startIndex..<characterRange.endIndex]
```

That line is the important part. We are taking a slice of the existing value rather than rebuilding the word from plain characters. In this way, we keep the Speech attributes, including the word's `audioTimeRange`.

Once transcription finishes, we store both versions in the view model:

```swift
let transcript = try await transcriber.transcribe(audioAt: audioURL)
self.transcript = transcript
transcriptWords = transcript.transcriptWords()
```

We still keep the original transcript because it's gonna be useful in the future. The new array exists for the interactive UI, where every word needs its own identity and action.

## Displaying words as buttons

We can now replace the single transcript `Text` with a `ForEach` that creates one button for every word.

```swift
struct DynamicTranscriptTextView: View {
    let words: [TranscriptWord]
    let playbackTime: TimeInterval
    let onSelectWord: (CMTime) -> Void

    var body: some View {
        TranscriptLayout {
            ForEach(words) { word in
                let isHighlighted = isHighlighted(word)

                Button {
                    guard let startTime = word.audioTimeRange?.start else {
                        return
                    }

                    onSelectWord(startTime)
                } label: {
                    Text(String(word.word.characters))
                        .font(.body)
                        .lineLimit(1)
                        .foregroundStyle(isHighlighted ? .primary : .secondary)
                        .underline(isHighlighted)
                }
                .disabled(word.audioTimeRange == nil)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
```

We use `.lineLimit(1)` because a single word should never wrap internally. The custom layout will decide when the complete word needs to move to the next line.

The current word is still highlighted by comparing its time range with the player's time:

```swift
private func isHighlighted(_ word: TranscriptWord) -> Bool {
    guard let timeRange = word.audioTimeRange else {
        return false
    }

    let start = timeRange.start.seconds
    let end = timeRange.end.seconds

    return start <= playbackTime && playbackTime < end
}
```

Notice that the end comparison uses `<` rather than `<=`. Two consecutive ranges may meet at the same boundary. Treating the end as exclusive prevents both words from being considered active at that exact time.

I also added a small pressed state and selection feedback through a custom `ButtonStyle`: 

```swift
struct TranscriptWordButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background {
                if configuration.isPressed {
                    RoundedRectangle(cornerRadius: 8)
                        .inset(by: -4)
                        .fill(.thinMaterial)
                }
            }
            .sensoryFeedback(
                .selection,
                trigger: configuration.isPressed
            )
    }
}
```

## Making separate buttons flow like text
If we put the buttons in an `HStack`, they will stay on one line and eventually go outside the available width. A `LazyVGrid` can wrap them, but its column-based structure does not look like a natural paragraph because every item is placed into a fixed column.

What we need is a flow layout: place views from leading to trailing, then move the next view to a new line whenever it no longer fits.

SwiftUI's `Layout` protocol gives us control over exactly that.

```swift
struct TranscriptLayout: Layout {
    var spacing: CGFloat = 4

    func sizeThatFits(
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0
        var y: CGFloat = 0
        var lineHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)

            if x > 0, x + size.width > maxWidth {
                x = 0
                y += lineHeight + spacing
                lineHeight = 0
            }

            x += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }

        return CGSize(
            width: maxWidth,
            height: y + lineHeight
        )
    }
}
```

`sizeThatFits` answers the first question SwiftUI asks our layout: how much space do you need for these subviews?

We measure each word with an unspecified proposal so it can report its natural size. We then keep track of the current horizontal position and the tallest item on the current line.

```swift
if x > 0, x + size.width > maxWidth {
    x = 0
    y += lineHeight + spacing
    lineHeight = 0
}
```

When the next word would exceed the proposed width, we reset the horizontal position and increase the vertical position by the previous line's height.

The `x > 0` check prevents us from wrapping before the first word. It also means that a word wider than the complete proposed width stays on its current line instead of causing an empty first line.

Measuring the required size is only half of a custom layout. We also need to place the subviews.

```swift
func placeSubviews(
    in bounds: CGRect,
    proposal: ProposedViewSize,
    subviews: Subviews,
    cache: inout ()
) {
    var x = bounds.minX
    var y = bounds.minY
    var lineHeight: CGFloat = 0

    for subview in subviews {
        let size = subview.sizeThatFits(.unspecified)

        if x > bounds.minX, x + size.width > bounds.maxX {
            x = bounds.minX
            y += lineHeight + spacing
            lineHeight = 0
        }

        subview.place(
            at: CGPoint(x: x, y: y),
            proposal: ProposedViewSize(size)
        )

        x += size.width + spacing
        lineHeight = max(lineHeight, size.height)
    }
}
```

The logic intentionally matches `sizeThatFits`. If measuring and placement use different wrapping rules, SwiftUI may reserve one height and then place the words as if it had another, which can produce clipping or unexpected empty space.

Here, `bounds.minX` and `bounds.minY` are also important. The placement coordinates belong to the bounds given to our layout, so we should not assume that its origin is always `(0, 0)`.

Now we can use `TranscriptLayout` almost like a standard SwiftUI stack:

```swift
TranscriptLayout(spacing: 4) {
    ForEach(words) { word in
        // Word button
    }
}
```

The result looks like one wrapping paragraph, but every word remains a real, independently accessible button.
## Seeking to the selected word

The final step is small because the timing information has already done most of the work for us.

The transcript view sends the selected word's start time upward:

```swift
guard let startTime = word.audioTimeRange?.start else {
    return
}

onSelectWord(startTime)
```

The parent passes the view model's seek method as that closure:

```swift
TranscriptContainerView(
    transcript: model.transcript,
    words: model.transcriptWords,
    playbackTime: model.playbackTime,
    onSelectWord: model.seek
)
```

And the view model asks the player to seek to the supplied `CMTime`:

```swift
func seek(to time: CMTime) {
    player?.seek(
        to: time,
        toleranceBefore: .zero,
        toleranceAfter: .zero
    )
}
```

By default, media seeking can use a tolerance around the requested position. That is useful for efficient playback because landing on a nearby frame can be faster than decoding forward to an exact time.

For word selection, however, jumping noticeably before or after the word would make the transcript feel inaccurate. We therefore pass zero tolerance on both sides and ask `AVPlayer` to seek as precisely as the media allows.

There is still a tradeoff here. Exact seeking may take more work than approximate seeking, especially with videos that have widely spaced keyframes. For this interaction, I prefer accuracy because the user selected a specific spoken word. In another interface, such as quickly scrubbing through thumbnails, a nonzero tolerance might be the better choice.

The periodic time observer from Part 1 continues to update `playbackTime` after the seek. That means we do not need to set the highlighted word manually. The player moves, its observer reports the new time, and SwiftUI highlights whichever word contains that time.

## Accessibility details

Because every word is now a button, VoiceOver should also understand what selecting it will do.

```swift
.accessibilityLabel(String(word.word.characters))
.accessibilityHint("Seeks the video to this word")
.accessibilityValue(
    isHighlighted ? "Currently speaking" : ""
)
```

The label provides the spoken word, the hint explains the action, and the value identifies the word that currently matches playback.

This is another advantage of using actual `Button` views instead of adding a tap gesture to plain text. We get button semantics and keyboard or accessibility activation behavior without recreating them ourselves.

## Putting everything together

<section class="post-video-intro post-video-intro--compact">
  <div class="post-video-intro__text" markdown="1">
The complete flow for this part looks like this:

1. `SpeechTranscriber` returns an `AttributedString` with an `audioTimeRange` attached to each timed word.
2. We split its characters into `AttributedSubstring` values so those attributes are preserved.
3. A custom SwiftUI `Layout` displays the word buttons as a wrapping paragraph.
4. Tapping a word sends its starting `CMTime` to the view model.
5. `AVPlayer` seeks to that time, and the existing time observer updates the highlighted word.

We now have a transcript that works in both directions. Playing or seeking the video updates the transcript, and selecting the transcript updates the video.

<a href="{{ '/assets/downloads/video-editor-part-2.zip' | relative_url }}" download>Download</a> project after changes here in part 2.
  </div>

  <figure class="post-video-intro__media">
    <video controls playsinline preload="metadata">
      <source src="{{ '/assets/images/video-editor-part-2-result.MP4' | relative_url }}" type="video/mp4">
      Your browser does not support embedded videos.
    </video>
    <figcaption>
      Final Result.(Well, screen touches are not visible due to recording on a real device, `SpeechAnalyzer` does not work on simulator. So assume that I press on the word that video jumps to.)
    </figcaption>
  </figure>
</section>

In the next part, we will use these timed words to create subtitle groups and place them over the video. And after that, maybe will look at censoring some selected words on the video, I'm not sure yet:)

Thanks for reading, see you in the part 3!
