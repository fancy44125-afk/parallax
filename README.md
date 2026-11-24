# PARALLAX

An interactive two-view reconstruction experiment. Slide sideways past the desert observatory, inspect a corner, then orbit the triangulated point cloud. Switch to rotation in place to see why moving pixels alone cannot determine depth.

## Run

From this checkout, run `python3 -m http.server 8000 --directory dist` and open http://localhost:8000. The interactive site uses ordinary browser APIs. The procedural scene and reconstruction run locally, including when you upload a clip.

## Code walkthrough

- `scene.js` projects a textured, stationary world into each camera view. The solver receives only images, focal length and the simulated camera travel.
- `vision.js` detects corners in the first image, compares patches along rectified epipolar lines, checks matches backwards and estimates depth from disparity. With focal length in pixels, depth equals focal length times camera travel divided by pixel shift.
- `video.js` decodes the first three seconds of an uploaded clip into 31 frames.
- `pose.js` builds image pyramids, tracks corners using Lucas–Kanade updates, checks the return trip and fits an essential matrix with eight-point RANSAC. It tests pose candidates for positive depth, refines the relative pose and triangulates the surviving tracks.
- `app.js` runs both solvers, draws tracks, projects markers and renders the orbitable cloud.

The uploaded-video solver processes pairs independently. Each estimated translation has unit length. Different pairs therefore have different physical scales. Unknown intrinsics, rolling shutter, zoom, a moving subject, a single flat wall or poor texture can distort the answer. A marker is tied to a reference feature and may disappear if that feature is lost.

## Authorship

Codex generated the implementation and assisted with numerical checks and the captioned demo. No hosted AI or computer-vision service participates in the running experiment. The team should review, test and be prepared to explain its submission.
