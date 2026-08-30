---
layout: post
published: false
title: "How to prevent fraud in your iOS App."
date: 2026-08-30 13:00:00 -0000
categories: []
tags: [swift, swiftui, TrustInsight]
permalink: /blog/:year/:month/:day/:title
---

"The Trust Insights framework enables your app to request an evaluation, or insight, to help detect and respond to social engineering threats people may face." as the official [TrustInsight](https://developer.apple.com/documentation/trustinsights) documentation says.
So what does it really mean and how does it work? This was the questions that popped out to my mind, when I saw about this in WWDC26.
Social threats don't always happen when someone in the other side of the world, steals your password, and ...
It also commonly happens with manupulation, the person you speak on the phone or on the street misidentifying himself and pushes you to do actions such as loging-in to your account, sending money to an account, etc. Since, YOU are the one doing the operation, no security protections like 2FA will be help in these scenarios. From the moment our imaginary victim "Bill" also gives the 2FA code to the other person that guides him to do, done, there is nothing do about it.
Well, this is what TrustInsight is for. It "magically"(of course not magically, will come to this later in the article) senses this potential anomalies, coercive activies based on the context you give and returns the result to you to take an appropriate action, such as