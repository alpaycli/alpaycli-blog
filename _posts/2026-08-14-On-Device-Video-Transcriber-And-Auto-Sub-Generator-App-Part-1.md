---
layout: post
title: "Building an On-Device Video Editor app with Swift/SwiftUI and SpeechAnalyzer — Part 1"
date: 2026-08-14 12:00:00 -0000
categories: []
tags: [swift,swiftui, speech, speech-to-text]
permalink: /blog/:year/:month/:day/:title
---

<section class="post-video-intro">
  <div class="post-video-intro__text" markdown="1">
Hi everyone, this is going to be the first part of a few-part series where I’m going to share my experience of building kind of a video editor app where user can see the full transcription of the video, see auto-generated subtitles on it, and even select words to censor(add beep or duck sound). It will work fully on-device, thanks to Apple’s SpeechAnalyzer API for speech-to-text conversion.

Actually, I built the final version of this app as my submission for the Swift Student Challenge this year, which didn’t turn out to be selected among the winners. Still, after some time passed, I thought it was a cool app where I tried and learned different technologies, and it would be nice to share my experiences and how I solved some technical barriers.
  </div>

  <figure class="post-video-intro__media">
    <video controls playsinline preload="metadata">
      <source src="{{ '/assets/images/video-editor-demo.mp4' | relative_url }}" type="video/mp4">
      Your browser does not support embedded videos.
    </video>
    <figcaption>
      A preview of the final app, including transcription, subtitles, and word censoring.
    </figcaption>
  </figure>
</section>

There are several interesting parts we will take a look at, such as muting selected words with high precision to not cause any odd behaviour or adding layers at specific positions in an export video which is unfortunately, is not as straightforward as adding an `.overlay` modifier in SwiftUI.

We will get to those in the following parts of the series.

In this first part, we will look at how to:

- Import a video from Files or the Photo Library.
- Transcribe the audio fully on-device.
- Display the video using SwiftUI’s native `VideoPlayer`.
- Highlight the currently spoken word as the video plays or the user changes its playback position.

I haven't included all the code in this post to keep the code snippets minimal. You can download the complete Xcode project for Part 1 <a href="{{ '/assets/downloads/video-editor-part-1.zip' | relative_url }}" download>here</a>.

## Creating the transcriber

Here is our `Transcriber` class, which accepts the URL of an audio file, transcribes it, and returns the final result as an `AttributedString`.

```swift
import Speech

protocol Transcribable {
    func transcribe(audioAt url: URL) async throws -> AttributedString
}

final class Transcriber: Transcribable {
    private let locale = Locale(identifier: "en-US")

    func transcribe(audioAt url: URL) async throws -> AttributedString {
        guard SpeechTranscriber.isAvailable else {
            throw TranscriptError.notAvailable
        }

        let transcriber = SpeechTranscriber(
            locale: locale,
            transcriptionOptions: [],
            reportingOptions: [],
            attributeOptions: [.audioTimeRange]
        )

        let analyzer = SpeechAnalyzer(modules: [transcriber])
        let audioFile = try AVAudioFile(forReading: url)

        if let lastSample = try await analyzer.analyzeSequence(from: audioFile) {
            try await analyzer.finalizeAndFinish(through: lastSample)
        } else {
            await analyzer.cancelAndFinishNow()
        }

        var transcription = AttributedString()

        for try await result in transcriber.results where result.isFinal {
            transcription.append(result.text)
        }

        guard !transcription.characters.isEmpty else {
            throw TranscriptError.emptyTranscript
        }

        return transcription
    }
}
```

Let’s go through some of the code here.

We check the availability of `SpeechTranscriber` for the user’s device by putting a guard statement with `SpeechTranscriber.isAvailable` at the very beginning.

This property tells us whether the transcriber module is available based on the device’s hardware and capabilities.

```swift
guard SpeechTranscriber.isAvailable else {
    throw TranscriptError.notAvailable
}
```

If it is unavailable, you can disable this feature or fall back to [`DictationTranscriber`](https://developer.apple.com/documentation/speech/dictationtranscriber). In this article, however, we are going to use the new `SpeechTranscriber` API.

This demo assumes that the on-device speech model for `en-US` is already installed. In a production app, you should also handle cases where the required model is unavailable.

## Configuring SpeechTranscriber

After checking its availability, we create a `SpeechTranscriber` for the locale we want to support.

```swift
let transcriber = SpeechTranscriber(
    locale: locale,
    transcriptionOptions: [],
    reportingOptions: [],
    attributeOptions: [.audioTimeRange]
)
```

The most important option for our use case is:

```swift
attributeOptions: [.audioTimeRange]
```

Without this option, we would still receive the transcribed text, but we would not know when each word was spoken.

With `.audioTimeRange`, the returned `AttributedString` contains an `audioTimeRange` attribute for its timed ranges. That timing information is what will later allow us to compare every word with the current playback time of the video.

This is also why we return an `AttributedString` instead of converting the result into a regular `String`. A regular `String` would preserve the characters, but it would lose the Speech framework’s timing attributes.

## Analyzing the file

`SpeechAnalyzer` manages the analysis session, while `SpeechTranscriber` is the module that performs speech-to-text processing.

```swift
let analyzer = SpeechAnalyzer(modules: [transcriber])
let audioFile = try AVAudioFile(forReading: url)
```

We then give the audio file to the analyzer:

```swift
if let lastSample = try await analyzer.analyzeSequence(from: audioFile) {
    try await analyzer.finalizeAndFinish(through: lastSample)
} else {
    await analyzer.cancelAndFinishNow()
}
```

There is a small but important detail here.

`analyzeSequence(from:)` returns after the file has been read, but the last audio samples may still be undergoing analysis. Its return value is the time of the last sample that was read.

Passing that value to `finalizeAndFinish(through:)` tells the analyzer to finish processing everything through that point before we continue.

Apple explains this behavior in the documentation for [`analyzeSequence(from:)`](https://developer.apple.com/documentation/speech/speechanalyzer/analyzesequence%28from%3A%29).

Finally, transcription results are delivered asynchronously through `transcriber.results`.

```swift
var transcription = AttributedString()

for try await result in transcriber.results where result.isFinal {
    transcription.append(result.text)
}
```

For a prerecorded video, we only need finalized results. Volatile results are more useful for live transcription, where you want to display SpeechTranscriber’s latest guess while the person is still speaking.

## View setup
For this demo, the user can select a video from either Files or the Photo Library.

```swift
import AVKit
import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

struct TranscriptDemoView: View {
    @State private var model = TranscriptDemoViewModel()
    @State private var isFileImporterPresented = false
    @State private var isPhotoPickerPresented = false
    @State private var photoPickerItem: PhotosPickerItem?

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                if let player = model.player {
                    VideoPlayer(player: player)
                        .aspectRatio(16 / 9, contentMode: .fit)
                        .clipShape(.rect(cornerRadius: 12))

                    TranscriptContainerView(
                        transcript: model.transcript,
                        playbackTime: model.playbackTime
                    )
                } else {
                    contentUnavailableView
                }
            }
            .padding()
        }
        .safeAreaInset(edge: .bottom) {
            if model.player != nil {
                videoImporterView
            }
        }
        .fileImporter(
            isPresented: $isFileImporterPresented,
            allowedContentTypes: [.movie],
            allowsMultipleSelection: false,
            onCompletion: handleFileImport
        )
        .photosPicker(
            isPresented: $isPhotoPickerPresented,
            selection: $photoPickerItem,
            matching: .videos
        )
        .onChange(of: photoPickerItem, handlePhotoSelection)
        .onDisappear(perform: model.stopPlayback)
    }

    private func handleFileImport(_ result: Result<[URL], any Error>) {
        switch result {
        case .success(let urls):
            guard let url = urls.first else { return }
            Task {
                await model.importVideo(from: url)
            }
        case .failure(let error):
            model.reportFileImportFailure(error)
        }
    }

    private func handlePhotoSelection(_ oldItem: PhotosPickerItem?, _ newItem: PhotosPickerItem?) {
        guard let newItem else { return }

        Task {
            await model.importVideo(from: newItem)
            photoPickerItem = nil
        }
    }
}

extension TranscriptDemoView {
    private var contentUnavailableView: some View {
        ContentUnavailableView {
            Label("Import a Video", systemImage: "video.badge.plus")
        } description: {
            Text("Choose a video from Files or your Photo Library to create a word-timed transcript.")
        } actions: {
            VideoImportMenu(
                isFileImporterPresented: $isFileImporterPresented,
                isPhotoPickerPresented: $isPhotoPickerPresented,
                isDisabled: model.isProcessing
            )
        }
        .containerRelativeFrame(.vertical) { height, _ in
            height * 0.65
        }
    }
    
    private var videoImporterView: some View {
        VideoImportMenu(
            isFileImporterPresented: $isFileImporterPresented,
            isPhotoPickerPresented: $isPhotoPickerPresented,
            isDisabled: model.isProcessing
        )
        .padding()
    }
}
```

## ViewModel setup

```swift
import AVFoundation
import Observation
import PhotosUI
import SwiftUI

/// Coordinates importing, audio extraction, transcription, and video playback.
///
/// The view owns this model, while the model exposes only UI-facing state. Media
/// processing details stay in the focused helper types below it.
@MainActor
@Observable
final class TranscriptDemoViewModel {
    private(set) var player: AVPlayer?
    /// Speech's attributed result, including an `audioTimeRange` on each word.
    private(set) var transcript: AttributedString?
    private(set) var playbackTime: TimeInterval = 0
    private(set) var state = TranscriptState.empty

    @ObservationIgnored private let audioExtractor = VideoAudioExtractor()
    @ObservationIgnored private let transcriber: Transcribable = Transcriber()
    @ObservationIgnored private let videoStore = ImportedVideoStore()
    @ObservationIgnored private var timeObserver: Any?

    init() {
        AVPlayer.isObservationEnabled = true
    }

    var isProcessing: Bool {
        state.isProcessing
    }

    func importVideo(from fileURL: URL) async {
        state = .importing

        // File importer URLs require explicit access. Copy the video while access
        // is active, then release the external file immediately afterward.
        guard fileURL.startAccessingSecurityScopedResource() else {
            state = .failed("The selected file could not be accessed.")
            return
        }

        defer {
            fileURL.stopAccessingSecurityScopedResource()
        }

        do {
            let localURL = try await videoStore.copyVideo(from: fileURL)
            try await processVideo(at: localURL)
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    func importVideo(from item: PhotosPickerItem) async {
        state = .importing

        do {
            guard let video = try await item.loadTransferable(type: TransferableVideo.self) else {
                throw TranscriptError.photoImportFailed
            }

            try await processVideo(at: video.url)
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    func reportFileImportFailure(_ error: any Error) {
        state = .failed(error.localizedDescription)
    }

    func stopPlayback() {
        player?.pause()
    }

    private func processVideo(at videoURL: URL) async throws {
        // Playback can be prepared immediately; transcription does not need to
        // finish before the user can inspect the selected video.
        preparePlayer(for: videoURL)
        transcript = nil
        playbackTime = 0
        state = .extractingAudio

        // somehow, i remember that feeding video url to transcriber used to cause
        // some issue/throw error, but now it seems fine, so keeping both.
        // let audioURL = try await audioExtractor.extractAudio(from: videoURL)
        let audioURL = videoURL
        defer {
            // The extracted track is an intermediate input, not user data.
            try? FileManager.default.removeItem(at: audioURL)
        }

        state = .transcribing
        transcript = try await transcriber.transcribe(audioAt: audioURL)
        state = .ready
    }

    private func preparePlayer(for videoURL: URL) {
        // An observer belongs to the player that created it, so remove the old
        // token before replacing the player with one for a newly imported video.
        removeTimeObserver()
        player?.pause()

        let player = AVPlayer(url: videoURL)
        self.player = player

        // VideoPlayer owns play, pause, and seeking controls. This observer
        // mirrors its clock into observable state so the transcript follows them.
        let interval = CMTime(seconds: 0.05, preferredTimescale: 600)
        timeObserver = player.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            Task { @MainActor [weak self] in
                self?.playbackTime = time.seconds
            }
        }
    }

    private func removeTimeObserver() {
        guard let player, let timeObserver else { return }
        player.removeTimeObserver(timeObserver)
        self.timeObserver = nil
    }
}

```

There is one thing we should keep in mind here: the URLs received from these importers may not remain available forever.

Files returns a security-scoped URL. We start accessing it, copy the video into our app’s temporary directory, and then stop accessing the original URL.

```swift
guard fileURL.startAccessingSecurityScopedResource() else {
    state = .failed("The selected file could not be accessed.")
    return
}

defer {
    fileURL.stopAccessingSecurityScopedResource()
}

let localURL = try await videoStore.copyVideo(from: fileURL)
```

The file delivered by `PhotosPicker` is also temporary. Our `TransferableVideo` implementation copies it before the transfer closure returns.

```swift
import CoreTransferable
import Foundation
import UniformTypeIdentifiers

/// A durable local copy of a video selected through `PhotosPicker`.
///
/// The URL supplied to a transfer closure is temporary. Copying the file before
/// the closure returns ensures AVPlayer and the audio extractor can use it later.
struct TransferableVideo: Transferable {
    let url: URL

    nonisolated static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(importedContentType: .movie) { receivedVideo in
            let sourceURL = receivedVideo.file
            let destinationURL = FileManager.default.temporaryDirectory
                .appending(path: UUID().uuidString)
                .appendingPathExtension(sourceURL.pathExtension)

            try FileManager.default.copyItem(at: sourceURL, to: destinationURL)
            return TransferableVideo(url: destinationURL)
        }
    }
}
```

By doing this, `AVPlayer` and the transcriber both receive a local URL that remains valid while the demo is running.

Using `VideoPlayer` means we do not need to build our own play, pause, scrubbing, or fullscreen controls.

However, the transcript still needs to know the current playback time. For that, we added an observer to the player.

```swift
let interval = CMTime(
    seconds: 0.05,
    preferredTimescale: 600
)

timeObserver = player.addPeriodicTimeObserver(
    forInterval: interval,
    queue: .main
) { [weak self] time in
    Task { @MainActor [weak self] in
        self?.playbackTime = time.seconds
    }
}
```

Every time the observer runs, we copy the player’s time into observable state.

This works not only while the video is playing. If the user pauses the video or changes its position using the native controls, the observer receives the updated time and the transcript follows it.

Before replacing the player with another imported video, we also need to remove the previous observer:

```swift
private func removeTimeObserver() {
    guard let player, let timeObserver else {
        return
    }

    player.removeTimeObserver(timeObserver)
    self.timeObserver = nil
}
```

A periodic time observer belongs to the player that created it. Keeping an observer after replacing its player can leave us with callbacks from an object we no longer use.

## Highlighting the current word

At this point, we have two pieces of information:

- An `AttributedString` whose words contain `audioTimeRange` attributes.
- The current playback time of the video.

Now we need to connect and synchronize them.

```swift
import Speech
import SwiftUI

struct DynamicTranscriptTextView: View {
    let transcript: AttributedString
    let playbackTime: TimeInterval

    var body: some View {
        Text(highlightedTranscript)
            .font(.body)
            .multilineTextAlignment(.leading)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityLabel(String(transcript.characters))
    }

    private var highlightedTranscript: AttributedString {
        var result = transcript
        result.foregroundColor = .secondary

        let currentTime = CMTime(
            seconds: playbackTime,
            preferredTimescale: 600
        )

        let currentInstant = CMTimeRange(
            start: currentTime,
            duration: CMTime(value: 1, timescale: 600)
        )

        guard let currentWord = result
            .rangeOfAudioTimeRangeAttributes(
                intersecting: currentInstant
            ) else {
            return result
        }

        result[currentWord].foregroundColor = .primary
        result[currentWord].backgroundColor = .mint.opacity(0.35)
        result[currentWord].underlineStyle = .single

        return result
    }
}
```

We begin by creating a copy of the transcript and applying the default secondary color.

Then we convert the player’s current time into `CMTime` and create a very small `CMTimeRange` starting at that position.

```swift
let currentInstant = CMTimeRange(
    start: currentTime,
    duration: CMTime(value: 1, timescale: 600)
)
```

This range represents one tick on a 600-timescale timeline. In other words, it gives us a tiny interval around the current playback position.

We then ask the attributed transcript for the range whose `audioTimeRange` intersects that interval:

```swift
guard let currentWord = result
    .rangeOfAudioTimeRangeAttributes(
        intersecting: currentInstant
    ) else {
    return result
}
```

If a matching word exists, we update only that attributed range.

```swift
result[currentWord].foregroundColor = .primary
result[currentWord].backgroundColor = .mint.opacity(0.35)
result[currentWord].underlineStyle = .single
```

Because this view receives `playbackTime` from observable state, SwiftUI recalculates the attributed text whenever the player time changes. The highlighted range therefore moves through the transcript together with the video.

The nice part is that we do not need to create a separate array containing every word and its timestamp. SpeechTranscriber has already attached the timing information to the returned `AttributedString`.

Apple demonstrates the same general technique—comparing playback time with the `audioTimeRange` attributes—in its [WWDC25 SpeechAnalyzer session](https://developer.apple.com/videos/play/wwdc2025/277/).

## Putting everything together

<video class="post-result-video" controls playsinline preload="metadata">
  <source src="{{ '/assets/images/video-editor-part-1-result.mp4' | relative_url }}" type="video/mp4">
  Your browser does not support embedded videos.
</video>

The complete flow now looks like this:

1. The user imports the video.
2. `SpeechAnalyzer` and `SpeechTranscriber` process its audio on-device.
3. We keep the returned `AttributedString`, including its word-timing attributes.
4. We compare those audio ranges with the current playback time and highlight the matching word.

And that gives us a fully on-device video transcript that follows the native video player, including when the user pauses or seeks to another position.

In the next part, we will look at generating subtitle groups and placing them over the video. After that, we will look at the more complicated part: rendering those layers into the exported video itself.

Thanks for reading, see you in the next part!
