// A calibrated two-view solver for a camera sliding sideways with a fixed heading.
// Coordinates are centered at camera A, with +X right, +Y up, and +Z forward.
globalThis.Vision = (() => {
  function luminance(image) {
    const values = new Uint8Array(image.width * image.height);
    for (let i = 0; i < values.length; i++) {
      const j = i * 4;
      values[i] = (77 * image.data[j] + 150 * image.data[j + 1] + 29 * image.data[j + 2]) >> 8;
    }
    return values;
  }

  function corners(gray, w, h) {
    // Integral images give each corner's 5x5 gradient tensor in constant time.
    const stride = w + 1;
    const integral = Array.from({length: 3}, () => new Float64Array(stride * (h + 1)));
    for (let y = 1; y < h - 1; y++) {
      let xx = 0, yy = 0, xy = 0;
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const dx = gray[i + 1] - gray[i - 1];
        const dy = gray[i + w] - gray[i - w];
        xx += dx * dx;
        yy += dy * dy;
        xy += dx * dy;
        const j = (y + 1) * stride + x + 1;
        integral[0][j] = integral[0][j - stride] + xx;
        integral[1][j] = integral[1][j - stride] + yy;
        integral[2][j] = integral[2][j - stride] + xy;
      }
    }
    const candidates = [];
    for (let y = 6; y < h - 6; y += 2) {
      for (let x = 6; x < w - 6; x += 2) {
        const a = (y - 2) * stride + x - 2, b = a + 5 * stride;
        const [xx, yy, xy] = integral.map(t => t[b + 5] - t[b] - t[a + 5] + t[a]);
        const strength = (xx + yy - Math.hypot(xx - yy, 2 * xy)) / 2;
        if (strength > 500) candidates.push({x, y, strength});
      }
    }
    candidates.sort((a, b) => b.strength - a.strength);
    const blocked = new Uint8Array(w * h);
    const selected = [];
    for (const p of candidates) {
      if (blocked[p.y * w + p.x]) continue;
      selected.push(p);
      for (let y = Math.max(0, p.y - 6); y <= Math.min(h - 1, p.y + 6); y++) {
        blocked.fill(1, y * w + Math.max(0, p.x - 6), y * w + Math.min(w, p.x + 7));
      }
      if (selected.length === 280) break;
    }
    return selected;
  }

  function matcher(src, dst, w, h, sign, p) {
    const radius = 4, limit = Math.min(64, Math.floor(w / 3));
    const scores = new Float64Array(limit + 1).fill(Infinity);
    const rows = new Int8Array(limit + 1);
    let best = 0;
    for (let d = 0; d <= limit; d++) {
      const x = p.x - sign * d;
      if (x < radius || x >= w - radius) continue;
      for (let dy = -4; dy <= 4; dy++) {
        const y = p.y + dy;
        if (y < radius || y >= h - radius) continue;
        let sad = 0;
        for (let row = -radius; row <= radius; row += 2) {
          const a = (p.y + row) * w + p.x, b = (y + row) * w + x;
          for (let col = -radius; col <= radius; col += 2) {
            sad += Math.abs(src[a + col] - dst[b + col]);
          }
        }
        if (sad < scores[d]) {
          scores[d] = sad;
          rows[d] = dy;
        }
      }
      if (scores[d] < scores[best]) best = d;
    }
    let alternative = Infinity;
    for (let d = 0; d <= limit; d++) {
      if (Math.abs(d - best) > 2) alternative = Math.min(alternative, scores[d]);
    }
    if (scores[best] > 25 * 23 || scores[best] + 12 >= alternative * 0.87) return null;
    // Fit a parabola around the integer minimum for fractional-pixel disparity.
    const left = scores[best - 1], right = scores[best + 1];
    const curvature = left + right - 2 * scores[best];
    const offset = Number.isFinite(curvature) && curvature > 0
      ? Math.max(-0.5, Math.min(0.5, (left - right) / (2 * curvature))) : 0;
    return {x: p.x - sign * best, y: p.y + rows[best], disparity: sign * (best + offset)};
  }

  function solve(imageA, imageB, baseline, focal) {
    const w = imageA.width, h = imageA.height;
    if (w !== imageB.width || h !== imageB.height) throw new Error('Frame sizes differ');
    const empty = {points: [], matches: 0};
    if (!Number.isFinite(baseline) || !baseline || !Number.isFinite(focal) || focal <= 0) return empty;
    const a = luminance(imageA), b = luminance(imageB), sign = Math.sign(baseline);
    const pairs = [];
    for (const p of corners(a, w, h)) {
      const q = matcher(a, b, w, h, sign, p);
      if (!q || Math.abs(q.disparity) < 1) continue;
      const back = matcher(b, a, w, h, -sign, q);
      if (back && Math.hypot(back.x - p.x, back.y - p.y) <= 1.5) pairs.push({p, q});
    }
    // In a rectified pair, epipolar lines are horizontal. The only nuisance
    // parameter allowed here is a small constant vertical image offset.
    // One correspondence supplies a hypothesis; enumerate all distinct offsets.
    let offset = 0, consensus = 0;
    const offsets = [...new Set(pairs.map(({p, q}) => q.y - p.y))].sort((a,b) => Math.abs(a)-Math.abs(b));
    for (const dy of offsets) {
      const support = pairs.filter(({p,q}) => Math.abs(q.y - p.y - dy) <= 1).length;
      if (support > consensus) { consensus = support; offset = dy; }
    }
    const points = [];
    for (const {p, q} of pairs) {
      if (consensus < 4 || Math.abs(q.y - p.y - offset) > 1) continue;
      const z = focal * baseline / q.disparity;
      points.push({u: p.x, v: p.y, u2: p.x - q.disparity, v2: q.y,
        x: (p.x - w / 2) * z / focal, y: (h / 2 - p.y) * z / focal, z});
    }
    return {points, matches: pairs.length};
  }
  return {solve};
})();
