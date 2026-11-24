# PARALLAX

The first experiment puts the camera on a tripod. Turning it sweeps the image through 360 degrees. A corner can move many pixels while its distance stays unknowable. Choose **Orbit the building** to walk a full circle around the observatory. Now two lines of sight from different positions can locate a corner in space. The sideways slide isolates the simplest version of this effect.

The field notes connect these experiments to the camera solve behind a visual effect such as a sign pinned to a wall. The clip solver estimates camera motion and scene points together from image correspondences. The simulated camera path is known, so you can isolate the effect of changing viewpoint.

## Run

From this checkout, run `python3 -m http.server 8000 --directory dist` and open http://localhost:8000. The interactive site uses ordinary browser APIs. The procedural scene and reconstruction run locally, including when you upload a clip.

## Code walkthrough

- `scene.js` projects a textured, stationary world into each camera view. Each world-space face has a fixed color. A depth buffer chooses the visible face at each pixel as the camera turns. The tracker receives the images and camera calibration separately from this geometry.
- `vision.js` detects corners in the first image, compares patches along rectified epipolar lines, checks matches backwards and estimates depth from disparity. With focal length in pixels, depth equals focal length times camera travel divided by pixel shift.
- `video.js` decodes the first three seconds of an uploaded clip into 31 frames.
- `pose.js` builds image pyramids, tracks corners using Lucas–Kanade updates, checks the return trip and fits an essential matrix with eight-point RANSAC. For uploads it tests pose candidates for positive depth, refines the relative pose and triangulates the surviving tracks. For the simulated orbit it uses the known camera poses and measured pixel matches from frames up to four degrees apart. For the tripod turn it validates tracked pixels against the known rotation. Those matches measure image motion even when depth is unobservable.
- `app.js` runs both solvers, draws tracks, projects markers and renders the orbitable cloud.

The uploaded-video solver processes pairs independently. Each estimated translation has unit length. Different pairs therefore have different physical scales. Unknown intrinsics, rolling shutter, zoom, a moving subject, a single flat wall or poor texture can distort the answer. A marker is tied to a reference feature and may disappear if that feature is lost.

## Authorship

Codex generated the implementation and assisted with numerical checks and the captioned demo. No hosted AI or computer-vision service participates in the running experiment. The team should review, test and be prepared to explain its submission.
