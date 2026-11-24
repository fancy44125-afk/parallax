/* Decode local video into equally spaced frames. No file leaves the browser. */
(() => {
  const WIDTH = 400;
  const HEIGHT = 240;
  const FRAME_COUNT = 31;
  const MAX_BYTES = 256 * 1024 * 1024;

  function waitForVideo(video, eventName, trigger) {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        video.removeEventListener(eventName, ready);
        video.removeEventListener('error', failed);
      };
      const ready = () => {
        cleanup();
        resolve();
      };
      const failed = () => {
        cleanup();
        reject(new Error('This browser could not decode the clip. Try an MP4 or WebM video.'));
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('The video took too long to decode. Try a shorter clip.'));
      }, 10000);

      video.addEventListener(eventName, ready);
      video.addEventListener('error', failed);
      try {
        trigger();
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
  }

  function releaseFrames(frames) {
    for (const frame of frames) {
      frame.width = 0;
      frame.height = 0;
    }
    frames.length = 0;
  }

  async function open(file) {
    if (!(file instanceof Blob) || !file.size) throw new Error('Choose a nonempty video file.');
    if (file.size > MAX_BYTES) throw new Error('Choose a clip smaller than 256 MB.');
    const video = document.createElement('video');
    video.preload = 'auto';
    video.playsInline = true;
    video.muted = true;
    const url = URL.createObjectURL(file);
    const frames = [];
    try {
      await waitForVideo(video, 'loadeddata', () => { video.src = url; });
      if (!Number.isFinite(video.duration) || video.duration <= 0.04 || !video.videoWidth || !video.videoHeight) {
        throw new Error('Choose a saved video with a seekable timeline.');
      }

      // Seeking exactly to the container duration can yield an empty end frame.
      const duration = Math.min(3, video.duration - 0.001);
      const scale = Math.min(WIDTH / video.videoWidth, HEIGHT / video.videoHeight);
      const width = Math.round(video.videoWidth * scale);
      const height = Math.round(video.videoHeight * scale);
      for (let i = 0; i < FRAME_COUNT; i++) {
        const time = (i / (FRAME_COUNT - 1)) * duration;
        if (Math.abs(video.currentTime - time) > 0.0001) {
          await waitForVideo(video, 'seeked', () => { video.currentTime = time; });
        }
        const frame = document.createElement('canvas');
        frame.width = WIDTH;
        frame.height = HEIGHT;
        const context = frame.getContext('2d', { willReadFrequently: true });
        context.fillStyle = '#121212';
        context.fillRect(0, 0, WIDTH, HEIGHT);
        context.drawImage(video, Math.floor((WIDTH - width) / 2), Math.floor((HEIGHT - height) / 2), width, height);
        frames.push(frame);
      }
      return { name: file.name || 'Uploaded video', frames, duration, dispose: () => releaseFrames(frames) };
    } catch (error) {
      releaseFrames(frames);
      throw error;
    } finally {
      video.pause();
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
    }
  }

  window.VideoSource = { open };
})();
