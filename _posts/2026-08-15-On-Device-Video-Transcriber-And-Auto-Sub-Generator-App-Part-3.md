---
layout: post
published: true
title: "Building an On-Device Video Editor app with Swift/SwiftUI and SpeechAnalyzer — Part 3"
date: 2026-08-24 13:00:00 -0000
categories: []
tags: [swift, swiftui, speech, speech-to-text, avfoundation]
permalink: /blog/:year/:month/:day/:title
---

Here we are with Part 3!

If you are new here, head back to [Part 1]({% post_url 2026-08-14-On-Device-Video-Transcriber-And-Auto-Sub-Generator-App-Part-1 %}) and [Part 2]({% post_url 2026-08-14-On-Device-Video-Transcriber-And-Auto-Sub-Generator-App-Part-2 %}) to see the progress so far. In this part, we will look at how to split the full transcript into subtitle groups and show them on top of the video player.

We will show subtitles in three ways, and the user can choose the one that suits them:

- One word at a time
- A group of words
- A group of words with the currently spoken word highlighted

Let's define these methods as an enum.

```swift
import SwiftUI

enum SubtitleShowMethod: String, CaseIterable, Identifiable {
    case oneWord
    case wholeSentence
    case wholeSentenceWithHighlightedWord

    var id: Self { self }

    var description: LocalizedStringResource {
        switch self {
        case .oneWord:
            "Word"
        case .wholeSentence:
            "Group"
        case .wholeSentenceWithHighlightedWord:
            "Highlight"
        }
    }
}
```

Now, let's move on to look at how to make our subtitles from the full transcript

```swift
struct SubtitleGrouper {
    private let maximumCharacterCount = 40

    func apply(to words: [TranscriptWord]) -> [SubtitleGroup] {
        let timedWords = words.filter { $0.audioTimeRange != nil }
        guard !timedWords.isEmpty else { return [] }

        var groups: [SubtitleGroup] = []
        var currentWords: [TranscriptWord] = []
        var currentCharacterCount = 0

        for word in timedWords {
            let separatorCount = currentWords.isEmpty ? 0 : 1
            let proposedCount = currentCharacterCount + separatorCount + word.word.characters.count

            if currentWords.isEmpty || proposedCount <= maximumCharacterCount {
                currentWords.append(word)
                currentCharacterCount = proposedCount
            } else {
                groups.append(makeGroup(from: currentWords, endTime: word.audioTimeRange?.start))
                currentWords = [word]
                currentCharacterCount = word.word.characters.count
            }
        }

        if let finalEndTime = currentWords.last?.audioTimeRange?.end {
            groups.append(makeGroup(from: currentWords, endTime: finalEndTime))
        }

        return groups
    }

    private func makeGroup(from words: [TranscriptWord], endTime: CMTime?) -> SubtitleGroup {
        let startTime = words.first?.audioTimeRange?.start ?? .zero
        let endTime = endTime ?? words.last?.audioTimeRange?.end ?? startTime
        let text = AttributedString(
            words
                .map { String($0.word.characters) }
                .joined(separator: " ")
        )

        return SubtitleGroup(
            text: text,
            words: words,
            startTime: startTime,
            endTime: endTime
        )
    }

}
```

```swift
import AVFoundation

/// A short group of timed words displayed together over the video.
struct SubtitleGroup: Identifiable {
    let id = UUID()
    let text: AttributedString
    let words: [TranscriptWord]
    let startTime: CMTime
    let endTime: CMTime
}
```

To make things simple, only rule I set to separate subtitles is `maximumCharacterCount`, but it's possible to go more complex and detailed about how you want to build up it.
Storing both `text` and `words` properties helps us to have more control over each word like we did the same for the transcript model.

Well. since we are going to show each word as a separate UI element, again, we need to define a custom `Layout` for the subtitles.

```swift
import SwiftUI

/// Wraps subtitle words into centered rows.
struct SubtitleLayout: Layout {
    var alignment: Alignment = .center
    var spacing: CGFloat = 4

    func sizeThatFits(
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) -> CGSize {
        let maximumWidth = proposal.width ?? .infinity
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)

            if x > 0, x + size.width > maximumWidth {
                x = 0
                y += rowHeight
                rowHeight = 0
            }

            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }

        return CGSize(width: maximumWidth, height: y + rowHeight)
    }

    func placeSubviews(
        in bounds: CGRect,
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) {
        let rows = rows(for: subviews, maximumWidth: bounds.width)
        var y = bounds.minY

        for row in rows {
            let rowWidth = row.reduce(0) {
                $0 + $1.sizeThatFits(.unspecified).width
            } + CGFloat(max(row.count - 1, 0)) * spacing

            var x = startingX(for: rowWidth, in: bounds)
            var rowHeight: CGFloat = 0

            for subview in row {
                let size = subview.sizeThatFits(.unspecified)
                subview.place(
                    at: CGPoint(x: x, y: y),
                    proposal: ProposedViewSize(size)
                )
                x += size.width + spacing
                rowHeight = max(rowHeight, size.height)
            }

            y += rowHeight
        }
    }

    private func rows(for subviews: Subviews, maximumWidth: CGFloat) -> [[LayoutSubview]] {
        var rows: [[LayoutSubview]] = []
        var currentRow: [LayoutSubview] = []
        var currentWidth: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)

            if !currentRow.isEmpty, currentWidth + size.width > maximumWidth {
                rows.append(currentRow)
                currentRow = []
                currentWidth = 0
            }

            currentRow.append(subview)
            currentWidth += size.width + spacing
        }

        if !currentRow.isEmpty {
            rows.append(currentRow)
        }

        return rows
    }

    private func startingX(for rowWidth: CGFloat, in bounds: CGRect) -> CGFloat {
        switch alignment {
        case .leading:
            bounds.minX
        case .trailing:
            bounds.maxX - rowWidth
        default:
            bounds.minX + (bounds.width - rowWidth) / 2
        }
    }
}
```

Well, AI did almost the whole job for this mathematical calculations, I don't really understand the everything that's going on, so I'm just gonna get past on this part:))

## SubtitleOverlayView

```swift
import SwiftUI

struct SubtitleOverlayView: View {
    let group: SubtitleGroup?
    let currentWord: TranscriptWord?
    let showMethod: SubtitleShowMethod

    var body: some View {
        Group {
            if let group {
                switch showMethod {
                case .oneWord:
                    if let currentWord {
                        Text(String(currentWord.word.characters))
                    }
                case .wholeSentence:
                    Text(group.text)
                        .multilineTextAlignment(.center)
                case .wholeSentenceWithHighlightedWord:
                    SubtitleLayout(alignment: .center) {
                        ForEach(group.words) { word in
                            Text(String(word.word.characters))
                                .foregroundStyle(
                                    word.id == currentWord?.id ? .yellow : .white.opacity(0.95)
                                )
                        }
                    }
                }
            }
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 24)
        .padding(.bottom, 24)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
        .font(.headline.weight(.semibold))
        .fontDesign(.rounded)
        .shadow(color: .black.opacity(0.85), radius: 6)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
```

This is our view for displaying the subtitle depending on the selected style of user. As you can see, `SubtitleLayout` is used here for putting all words inside `ForEach` and highlighting the specific `Text` view by comparing ids'(`word.id == currentWord?.id`). For all the other cases, putting single `Text` view is enough

## ViewModel setup
Now we have implemented all the pieces, it's time to put them in places.
Here are the new properties we want to introduce in our ViewModel
```swift
final class TranscriptDemoViewModel {
    /* ... */

    private(set) var subtitleGroups: [SubtitleGroup] = [] // +
    /// User's selected style to show subtitles. // +
    var subtitleShowMethod: SubtitleShowMethod = .wholeSentenceWithHighlightedWord // +

    var currentSubtitleGroup: SubtitleGroup? { // +
        subtitleGroups.first { group in // +
            group.startTime.seconds <= playbackTime && playbackTime < group.endTime.seconds // +
        } // +
    } // +

    var currentSubtitleWord: TranscriptWord? { // +
        currentSubtitleGroup?.words.first { word in // +
            guard let timeRange = word.audioTimeRange else { return false } // +
            return timeRange.start.seconds <= playbackTime && playbackTime < timeRange.end.seconds // +
        } // +
    } // +

    /* ... */
}
```
And update `processVideo(at:) method`
```swift
private func processVideo(at videoURL: URL) async throws {
    // Playback can be prepared immediately; transcription does not need to
    // finish before the user can inspect the selected video.
    preparePlayer(for: videoURL)
    transcript = nil
    transcriptWords = []
    subtitleGroups = [] // +
    playbackTime = 0
    state = .extractingAudio

    let audioURL = try await audioExtractor.extractAudio(from: videoURL)
    defer {
        // The extracted track is an intermediate input, not user data.
        try? FileManager.default.removeItem(at: audioURL)
    }

    state = .transcribing
    let transcript = try await transcriber.transcribe(audioAt: audioURL)
    self.transcript = transcript
    transcriptWords = transcript.transcriptWords()
    subtitleGroups = subtitleGrouper.apply(to: transcriptWords) // +
    state = .ready
}
```

## View setup
```swift
VStack(spacing: 24) {
    if let player = model.player {
        VideoPlayer(player: player) // -
        VideoPlayer(player: player) { // +
            SubtitleOverlayView( // +
                group: model.currentSubtitleGroup, // +
                currentWord: model.currentSubtitleWord, // +
                showMethod: model.subtitleShowMethod // +
            ) // +
        } // +
        .aspectRatio(16 / 9, contentMode: .fit)
        .clipShape(.rect(cornerRadius: 12))
    }

    SubtitleShowMethodPicker(selection: $model.subtitleShowMethod) // +

    TranscriptContainerView(
        /* ... */
    )
}
```
```swift
import SwiftUI

struct SubtitleShowMethodPicker: View {
    @Binding var selection: SubtitleShowMethod

    var body: some View {
        Picker("Subtitle Display", selection: $selection) {
            ForEach(SubtitleShowMethod.allCases) { method in
                Text(method.description)
                    .tag(method)
            }
        }
        .pickerStyle(.segmented)
    }
}
```

## Result
<section class="post-video-intro post-video-intro--compact">
  <div class="post-video-intro__text" markdown="1">
We now have a nicely working subtitles appearing over the video in 3 different versions with seamless transitions while switching between them.

<a href="{{ '/assets/downloads/video-editor-part-3.zip' | relative_url }}" download>Download</a> project after changes here in part 3.

Thanks for reading, see you in the part 4!
  </div>

  <figure class="post-video-intro__media">
    <video controls playsinline preload="metadata">
      <source src="{{ '/assets/images/video-editor-part-3-result.MP4' | relative_url }}" type="video/mp4">
      Your browser does not support embedded videos.
    </video>
    <figcaption>
      Final Result.
    </figcaption>
  </figure>
</section>
