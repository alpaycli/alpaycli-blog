---
layout: page
title: Basketball Analyzer
permalink: /basketball-analyzer/
---

My (winning) submission for the WWDC25 Swift Student Challenge. It is a basketball shooting analyzer and feedback app that uses your device's camera or recorded videos to track and evaluate your shots.

![Basketball Analyzer App](/assets/images/appPreviewWithTrajectory.png)

<!-- # Basketball Analyzer -->

The app offers 2+1 ways to analyze your shot:

- **Real-time tracking** using your device's camera
- **Uploading a recorded video**
- **Test mode** with my recorded video

## Technologies Used

Here is some information about the technologies I used on this project:

**Vision DetectTrajectoryRequest** - Used for detecting the ball's trajectory on screen, seeing if the ball goes in or out, and other analysis.

**Vision DetectHumanBodyPoseRequest** - Used for detecting the player's position and body joints to calculate the release angle while shooting.

**ReplayKit** - Used for recording the screen, which makes it possible to export the session in the end.
