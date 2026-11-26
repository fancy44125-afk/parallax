# PARALLAX

PARALLAX — Beyond the Frame opens on a moving 360° orbit around a synthetic observatory. Click a building corner in Create to place a glowing portal or 3D text. In the simulated shot, both effects share the visible reconstructed corner. The 2D comparison uses only its projected pixel position to translate a fixed-size stamp. On uploaded clips, the tracker follows the selected patch between nearby frames. Surrounding patches can support a match when their motion agrees. If a 3D anchor temporarily lacks depth, a verified image track carries its placement-frame appearance. The 3D version projects the object through the moving camera.

Break the Frame pauses the shot and opens Reveal. Inspect an image pair, corner tracks, camera positions, triangulation rays and reprojection error.

The field notes connect the observatory demonstration to the camera solve behind a visual effect such as a sign pinned to a wall. The clip solver estimates camera motion and scene points together from image correspondences. The simulated camera path is known, so you can isolate the effect of changing viewpoint.

## Run

From this checkout, run `python3 -m http.server 8000 --directory dist` and open http://localhost:8000. The interactive site uses ordinary browser APIs. The procedural scene and reconstruction run locally, including when you upload a clip.

