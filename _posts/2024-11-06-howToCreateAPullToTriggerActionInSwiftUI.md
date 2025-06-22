---
layout: post
title: "How to create a pull-to-trigger action for ScrollView in SwiftUI"
date: 2024-11-06 12:00:00 -0000
categories: []
tags: []
permalink: /blog/:year/:month/:day/:title
---

While I was working on making a performant calendar for my SwiftUI project, I was looking for a solution to load new dates as users scroll. Finally, decided to put only a single year's data in a lazy container, and when you reach the end, pull to load more data, similar to "pull to refresh".
The solutions I found for pull-to-trigger action in SwiftUI were using drag gestures to track changes, but encountered bugs and weird behaviors while using ScrollView + drag gestures, so looked for another solution.
With iOS 17, ScrollView has become more powerful with the addition of the missing APIs. The main modifier we're going to use is scrollPosition(id:anchor:) to track the current position.

```swift
struct CalendarView: View {
    @State private var scrollId: Int? = 3
    var body: some View {
        ScrollView(.horizontal) {
            LazyHStack(spacing: 10) {
                ForEach(0..<30) { item in
                    ItemView(item)
                        .containerRelativeFrame(.horizontal, count: 7, spacing: 10)
                        .background(scrollId == item ? .pink : .gray.opacity(0.3), in: .circle)
                        .id(item)
                }
            }
            .scrollTargetLayout()
        }
        .scrollPosition(id: $scrollId, anchor: .center)
        .scrollTargetBehavior(.viewAligned)
        .frame(height: 90)
    }
}
```

![firstGif]({{ "/assets/images/firstGif.gif" | relative_url }})

Here is our setup, now, we can trigger an event depending on the current scroll position.

```swift
ScrollView(.horizontal) {
    LazyHStack(spacing: 10) { /*...*/ }
    .scrollTargetLayout()
    .overlay(alignment: .leading) {
        Text("Text")
            .padding()
            .background([0, 1].contains(scrollId) ? .green : .gray, in: .capsule)
            .offset(x: -90)
    }
}
.onChange(of: scrollId, { oldValue, newValue in
    // trigger action if scrollId goes from trigger zone to non trigger zone
    if [0, 1].contains(oldValue),
       ![0, 1].contains(newValue) {
        // do something
    }
})
```

Obviously, added a label for users to see what is going on and used a different color when the scroll position comes to the "trigger zone."

![secondGif]({{ "/assets/images/secondGif.gif" | relative_url }})

It seems done, but let's say we don't want to trigger the action if we change our mind midway by scrolling back. In the current version, the action will be triggered no matter what.
We can track the scroll phase change to determine whether the user is interacting with the ScrollView or not. Fortunately, from iOS 18, there is a onScrollPhaseChange(_:) modifier.

```swift
/* ... */

@State private var isInteracting = false
var body: some View {
ScrollView(.horizontal) { /*...*/ }
.onChange(of: scrollId, { oldValue, newValue in
    if [0, 1].contains(oldValue),
       ![0, 1].contains(newValue),
       !isInteracting {
        // do something
        print("triggered")
    }
})
.onScrollPhaseChange({ _, phase in
    isInteracting = phase == .interacting
})
```

Finally, now we only trigger the action if the scrollId goes from the trigger zone to the non-trigger zone "naturally".
Obviously, this approach is not suitable for all pull-to-trigger scenarios since it relies on the scroll position. You can use ```onScrollGeometryChange(for:of:action:)``` to get the current offset to handle more complex scenarios.
I made a [Calendar View for SwiftUI using this approach]("https://github.com/alpaycli/ScrollableCalendarKit") — take a look if you're interested.
Thanks for reading!
