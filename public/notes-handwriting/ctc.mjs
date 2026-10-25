// Local-only preprocessing and prefix decoding for the English line recognizer.
// No dictionary guesses: probabilities come from the student's ink alone.
export function lineTensor(pixels, width, height) {
  const targetWidth = Math.max(320, Math.min(3200, Math.ceil(48 * width / height)));
  const resizedWidth = Math.min(targetWidth, Math.ceil(48 * width / height));
  const plane = 48 * targetWidth, tensor = new Float32Array(3 * plane);
  for (let y = 0; y < 48; y++) {
    const sy = Math.max(0, Math.min(height - 1, (y + .5) * height / 48 - .5)), y0 = Math.floor(sy), y1 = Math.min(height - 1, y0 + 1), fy = sy - y0;
    for (let x = 0; x < resizedWidth; x++) {
      const sx = Math.max(0, Math.min(width - 1, (x + .5) * width / resizedWidth - .5)), x0 = Math.floor(sx), x1 = Math.min(width - 1, x0 + 1), fx = sx - x0;
      for (let channel = 0; channel < 3; channel++) {
        const c = 2 - channel; // The official model uses BGR, NCHW, [-1,1].
        const top = pixels[(y0 * width + x0) * 4 + c] * (1 - fx) + pixels[(y0 * width + x1) * 4 + c] * fx;
        const bottom = pixels[(y1 * width + x0) * 4 + c] * (1 - fx) + pixels[(y1 * width + x1) * 4 + c] * fx;
        tensor[channel * plane + y * targetWidth + x] = (top * (1 - fy) + bottom * fy) / 127.5 - 1;
      }
    }
  }
  return { data: tensor, width: targetWidth };
}

const logAdd = (a, b) => a === -Infinity ? b : b === -Infinity ? a : Math.max(a, b) + Math.log1p(Math.exp(-Math.abs(a - b)));
/** Merge alternate alignments rather than taking a single greedy character path. */
export function decodeLine(probabilities, steps, classes, characters, beamWidth = 8) {
  let beam = [{ ids: [], blank: 0, nonblank: -Infinity }];
  for (let t = 0; t < steps; t++) {
    const offset = t * classes;
    const best = Array.from({ length: classes }, (_, id) => id).sort((a, b) => probabilities[offset + b] - probabilities[offset + a]).slice(0, 6);
    if (!best.includes(0)) best.push(0);
    const next = new Map();
    const get = ids => {
      const key = ids.join(',');
      if (!next.has(key)) next.set(key, { ids, blank: -Infinity, nonblank: -Infinity });
      return next.get(key);
    };
    for (const prefix of beam) {
      const total = logAdd(prefix.blank, prefix.nonblank), last = prefix.ids.at(-1);
      for (const id of best) {
        const p = Math.log(Math.max(1e-30, probabilities[offset + id]));
        if (!id) { const same = get(prefix.ids); same.blank = logAdd(same.blank, total + p); }
        else if (id === last) {
          const same = get(prefix.ids); same.nonblank = logAdd(same.nonblank, prefix.nonblank + p);
          const extended = get([...prefix.ids, id]); extended.nonblank = logAdd(extended.nonblank, prefix.blank + p);
        } else {
          const extended = get([...prefix.ids, id]); extended.nonblank = logAdd(extended.nonblank, total + p);
        }
      }
    }
    beam = [...next.values()].sort((a, b) => logAdd(b.blank, b.nonblank) - logAdd(a.blank, a.nonblank)).slice(0, beamWidth);
  }
  return beam[0]?.ids.map(id => characters[id] ?? '').join('').trim() ?? '';
}
