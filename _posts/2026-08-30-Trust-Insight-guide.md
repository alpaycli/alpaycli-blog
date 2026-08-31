---
layout: post
published: false
title: "How to prevent  in your iOS App."
date: 2026-08-30 13:00:00 -0000
categories: []
tags: [swift, swiftui, TrustInsight]
permalink: /blog/title
---

"The Trust Insights framework enables your app to request an evaluation, or insight, to help detect and respond to social engineering threats people may face." as the official [TrustInsight](https://developer.apple.com/documentation/trustinsights) documentation says.

So what does it really mean and how does it work? This was the questions that popped out to my mind, when I saw about this in WWDC26.
Social threats don't always happen when someone in the other side of the world, steals your password, and ...[needs editing]

It also commonly happens with manupulation, the person you speak on the phone or on the street misidentifying himself and pushes you to do actions such as loging-in to your account, sending money to an account, etc. Since, YOU are the one doing the operation, no security protections like 2FA will be help in these scenarios. From the moment our imaginary victim "Bill" also gives the 2FA code to the other person that guides him to do, done, there is nothing do about it.

Well, what can you do as an Apple developer to prevent these on client-side? This is what TrustInsight is for. It "magically"(of course not magically, will come to this later in the article) senses this potential anomalies, coercive activies based on the context you give and returns the result to you to take an appropriate action, such as adding friction, additional verification, or just notify the user about it. BUT, Apple does not recommend completely blocking the operation based solely on a trust insight.

Note: Note that this evalutation process may take few seconds and requires internet connection, so WHEN using it is also important for user experience. 

In this article, we will look at 2 types of usecases, in messaging app and ...

Note: It's iOS 27.0 API so you need Xcode 27+.

## Create Entitlement
First, creating entitlement is required. You can do so by going to your app's target, press "+ Capability" and select "Trust Insights".

## Setup

Trust insight result is the combination of 2 elements that make up the trust insight evaluation request.

**_request_** - A trust insight request that represents a specific signal or insight. The framework supports one type of request, IsLikelyBeingCoachedInsight, as from the name, we can see that it is for scenarios where user is coached by someone to perform certain actions. Potentially we can see more type of requests in the future. [this needs editing, specially first sentence]

**_context_** - Kind of action that user is trying to perform.

Here are all the available contexts we can choose:

`.payment`
An action that indicates some form of payment or purchase.

`.account`
An account operation including registration, login, or the modification of account details.

`.resourceUse`
Usage of some resource, online service such as purchasing API credits, cloud rendering, etc.    

`.communication`
An action that indicates communication operation, such as sending bulk messages or making connections to other people.

`.other`
Fallback when none of the above categories fit. Use cases: Exporting sensitive data, granting remote access, or any custom sensitive action that doesn't naturally belong to the other categories.

Apple recommends filing a Feedback report with the details relating to the category of your interest, when you are left to use `.other`.

## Implementation

As a basic use-case scenario for Trust Insight, let's look at a banking app example. We have a person named Bill, who is 68 year-old, doesn't really know much about how to use a smart-phone and cyber frauds. One day he gets a call, person calling introduces himself as a bank employee and tells him mistransaction occured on your account by our customer, please follow my instructions to send it back to the x account number.

[Very basic illustration image here]

Bill says ok, opens the app(maybe not even installed), and eventually comes to the final screen to confirm the transaction. As soon as Bill is guided to press confirm button, before processing it, or sending authentication code, we can create and call Trust Insight request, wait for thr result, and decide the next action based on it.

Here is a look for our `TrustInsightManager` class.
```swift
import Foundation
#if canImport(TrustInsights)
import TrustInsights
#endif

final class TrustInsightManager {

    #if canImport(TrustInsights)
    @available(iOS 27.0, *)
    private func evaluateCoachingRiskWithTrustInsights() async -> CoachingRisk? {
        let request = IsLikelyBeingCoachedInsight.request(
            schema: .version1,
            modelVersion: .current
        )

        let context = InsightEvaluator.InsightContext(
            operationCategory: .payment,
            requestedEvaluations: request
        )

        let evaluator = InsightEvaluator()

        do {
            guard try await evaluator.requestAuthorization(for: context) == .authorized else {
                return nil
            }

            let assessment = try await evaluator.requestEvaluation(context: context)
            let outcome = try assessment.insight.outcome.get()

            switch outcome {
            case .unknown:
                return nil
            case .medium:
                assessment.reportConsumption(.usedReducedFriction)
                return .medium
            case .high:
                assessment.reportConsumption(.usedIncreasedFriction)
                return .high
            @unknown default:
                assessment.reportConsumption(.usedEvaluationOnly)
                return nil
            }
        } catch {
            return nil
        }
    }
    #endif
}

enum CoachingRisk {
    case medium
    case high

    var insight: TrustInsight {
        switch self {
        case .medium:
            TrustInsight(
                title: "Possible Scam Coaching",
                message: "We have detected signs of possible fraud that you may being pressured to take certain actions. Slow down before sharing codes, passwords, or account access."
            )
        case .high:
            TrustInsight(
                title: "High Scam Risk",
                message: "Trust Insights detected strong signs of real-time coaching. Do not share verification codes, passwords, or account access."
            )
        }
    }
}

struct TrustInsight {
    let title: LocalizedStringResource
    let message: LocalizedStringResource
}
```

### Things to look out for in the code: [this needs editing]

- Don't we feed any data? Answer is, No, ... [here needs editing]
- For `unknown` outcome case, we are not doing actually anything in the code example, and returning nil. But `unknown` does not mean there is no risk, so taking some precautionary actions, such as adding extra friction is still recommended. 
- What is `assessment.reportConsumption(:)`? - calling this is actually mandatory by Apple by after each evalutation request. Rate limits may apply if you decide not to call it with the correct consumption value related to your taken action. Here are 6 types available:
1. `.usedReducedFriction` — insight made operation easier
2. `.usedUnchangedFriction` — insight evaluated but didn’t change experience for user
3. `.usedIncreasedFriction` — insight led to additional checks (like I mentioned in the earlier, blocking the whole operation based solely on this is not recommended.)
4. `.notUsedNotNeeded` — user cancelled the operation
5. `.notUsedError` — technical failure (e.g. result arrived too late)
6. `.usedEvaluationOnly` — insight used for internal benchmarking only, no UX impact

Well, back to Bill. After we run this insight evalution, it tells us there is a high-scam risk. So in our banking app example, we can block the operation, show an alert to Bill to wait for a few minutes due to possible suspicious operation, and notify the call-service members to get in contact with Bill to make sure it's all intentional and confirm the operation.

Note: - Sandbox environment is used during development; production models/servers are used after App Store distribution.
