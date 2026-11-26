# PARALLAX

PARALLAX — Beyond the Frame opens on a moving 360° orbit around a synthetic observatory. Click a building corner in Create to place a glowing portal, planet, title, miniature city or imported OBJ. In the simulated shot, both effects share the visible reconstructed corner. The 2D comparison uses only its projected pixel position to translate a fixed-size stamp. Uploaded clips use an image-patch track for the 2D comparison, bridging an isolated missed sample when its neighboring matches agree. The 3D version projects the object through the moving camera.

Break the Frame pauses the shot and opens Reveal. Inspect an image pair, corner tracks, camera positions, triangulation rays and reprojection error. Experiments compares two scaled rooms and measures reconstruction error against known 3D coordinates under six adjustable capture conditions.

The field notes connect these experiments to the camera solve behind a visual effect such as a sign pinned to a wall. The clip solver estimates camera motion and scene points together from image correspondences. The simulated camera path is known, so you can isolate the effect of changing viewpoint.

## Run

From this checkout, run `python3 -m http.server 8000 --directory dist` and open http://localhost:8000. The interactive site uses ordinary browser APIs. The procedural scene and reconstruction run locally, including when you upload a clip.

## Code walkthrough

- `scene.js` projects a textured, stationary world into each camera view. Each world-space face has a fixed color. A depth buffer chooses the visible face at each pixel as the camera turns. The tracker receives the images and camera calibration separately from this geometry.
- `vision.js` detects corners in the first image, compares patches along rectified epipolar lines, checks matches backwards and estimates depth from disparity. With focal length in pixels, depth equals focal length times camera travel divided by pixel shift.
- `video.js` decodes the first three seconds of an uploaded clip into 31 frames.
- `pose.js` builds image pyramids, tracks corners using Lucas–Kanade updates, checks the return trip and fits an essential matrix with eight-point RANSAC. For uploads it tests pose candidates for positive depth, refines the relative pose and triangulates the surviving tracks. For the simulated orbit it uses the known camera poses and measured pixel matches from frames up to four degrees apart.
- `app.js` runs the solvers and connects the timeline, point placement and workspaces.
- `fx.js` projects procedural meshes, a textured sign or a local OBJ. Object visibility in the synthetic scene uses the rendered depth at the anchor. Uploads use track visibility.
- `reveal.js` draws the measured observations, viewing rays and sparse cloud for the current frame pair.
- `break.js` renders two scaled rooms from equations and compares the resulting pixels. Its separate stress test measures RMS 3D position error against the reference depth of three synthetic surfaces.

The uploaded-video solver processes pairs independently. Each estimated translation has unit length. Different pairs therefore have different physical scales. Unknown intrinsics, rolling shutter, zoom, a moving subject, a single flat wall or poor texture can distort the answer. A marker is tied to a reference feature and may disappear if that feature is lost.
