---
layout: post
title: "How I managed requsting reviews in Treaty"
date: 2025-06-21 12:00:00 -0000
categories: []
tags: []
permalink: /blog/:year/:month/:day/:title
---

Requesting reviews and gathering feedback from users is an important part of all apps. 

<!-- Add image here -->

<img src="{{ '/assets/images/requestreview-img.jpg' | relative_url }}" alt="Request Review Preview" style="width: 350px; max-width: 100%;">

Apple allows you to show this alert to users only up to 3 times within a 365-day period, so it's important to use it wisely.

I'll show how I managed requesting reviews in [Treaty - Dog Health](https://apps.apple.com/az/app/treaty-dog-health/id6743374042) by building a similar structure to [TipKit](https://developer.apple.com/documentation/tipkit/).

---

Before starting, let's set the rules:

Don't show the alert more than once
- in the same app version
- within a certain period (I will set it to 7 days)

---

```swift
@Observable
class RequestReviewManager {
   private let userDefaults: UserDefaults
   private let lastRequestReviewKey = "lastRequestReviewDate"
   private let lastVersionPromptedKey = "lastVersionPromptedForReview"
   
   private var lastRequestDate: Date? { userDefaults.value(forKey: lastRequestReviewKey) as? Date }
   private var lastVersionPrompted: String? { userDefaults.string(forKey: lastVersionPromptedKey) }
   
   private var currentAppVersion: String = Bundle.main.releaseVersionNumber

   init(userDefaults: UserDefaults = .group) { self.userDefaults = userDefaults }
}

extension Bundle {
    var releaseVersionNumber: String {
       return infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
    }
}
```

Here are all the properties we need.

Now, obviously, I want to show the alert to users at the most appropriate times.
Enum is a nice choice to define our showing cases.

```swift
enum RequestReviewReason: String {
   case loggedEnoughFeedActivities
   case loggedEnoughHygieneActivities
   case endedWalk
   
   var triggerValue: Int {
      switch self {
         case .loggedEnoughFeedActivities, .loggedEnoughHygieneActivities: 3
         case .endedWalk: 1
      }
   }
}
```

```swift
import StoreKit

@Observable
class RequestReviewManager {
   /*...*/
   func donate(to reason: RequestReviewReason) async {
      // Don't show the alert, if it's already shown within 7 days.
      if let lastRequestDate, lastRequestDate.numberOfDays(from: .now) < 7 { return }
      
      // Don't show the alert, if it's already shown in current app version.
      if let lastVersionPrompted, lastVersionPrompted == currentAppVersion { return }
      
      let count = userDefaults.integer(forKey: reason.rawValue)
      if count + 1 == reason.triggerValue {
         guard let scene = await UIApplication.shared.foregroundActiveScene else { return }
         await AppStore.requestReview(in: scene)
         
         userDefaults.set(Date.now, forKey: lastRequestReviewKey)
         userDefaults.set(currentAppVersion, forKey: lastVersionPromptedKey)
      }
      userDefaults.set(count + 1, forKey: reason.rawValue)
   }
}
```
Ignoring donations and not incrementing the counter if the 7-day period hasn't passed yet or this version has already been prompted for review.

You can change the waiting period for the next trigger, apply your own rules, etc.

Now, all we need to do is call the `donate()` method in the right places, and the alert will trigger if all conditions are met.

```swift
struct FeedView: View {
   @Environment(RequestReviewManager.self) var requestReviewManager

   var body: some View { /*...*/ }
   func addButtonTapped() async {
      // save action...
      
      await requestReviewManager.donate(to: .loggedEnoughFeedActivities)
   }
}
```

<video width="350" style="max-width: 100%; border-radius: 16px;" controls>
  <source src="/assets/images/requestreview-preview.mp4" type="video/mp4">
  Your browser does not support the video tag.
</video>

Thanks for reading!