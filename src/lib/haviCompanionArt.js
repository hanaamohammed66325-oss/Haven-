export const COMPANION_W = { fox: 9, tiger: 11 };
export const COMPANION_ROWS = 7;
export const COMPANION_PAD = 3;
const palette = {
  fox: { body: '#eaa04a', hi: '#f2b46a', pale: '#f7d7a8', paw: '#c77a2e', nose: '#8f3a2c' },
  tiger: { body: '#e07a2e', hi: '#f0a058', pale: '#f7ead9', paw: '#c76a24', nose: '#8f3a2c' },
};
const K = '#111111';

/** Owner-approved pixel silhouette. Ground is the bottom of the planted paws. */
export function paintCompanion(ctx, kind, s, x, ground, { pose = 'stand', phase = 0, faceLeft = false, head = 0, tail = 0, breath = 0, hideTail = false } = {}) {
  const p = palette[kind], tiger = kind === 'tiger', w = COMPANION_W[kind];
  ctx.save(); ctx.translate(Math.round(x), Math.round(ground - 7 * s));
  if (faceLeft) { ctx.translate(w * s, 0); ctx.scale(-1, 1); }
  const R = (x, y, w, h, color) => { ctx.fillStyle = color; ctx.fillRect(Math.round(x * s), Math.round(y * s), Math.round(w * s), Math.round(h * s)); };
  if (pose === 'curl') {
    const width = tiger ? 9 : 7;
    R(1, 3 - breath, width, 3, p.body); R(1, 3 - breath, width, 1, p.hi); R(0, 3, 2, 2, p.body); R(0, 2, 2, 1, p.hi);
    if (tiger) for (const stripe of [3, 5, 7]) R(stripe, 3 - breath, 1, 2, K);
    const hx = tiger ? 7 : 6;
    R(hx, 2, tiger ? 3 : 2, 3, p.body); R(hx, 2, tiger ? 3 : 2, 1, p.hi); R(hx + 1, 4, 1, 1, K); R(hx + 2, 4, 1, 1, p.nose);
    if (!tiger) { R(1, 4, 5, 2, p.hi); R(1, 5, 3, 1, p.pale); }
    else { R(-1, 4, 1, 2, p.body); R(0, 5, 3, 1, p.body); R(-1, 3, 1, 1, K); R(0, 5, 1, 1, K); }
    ctx.restore(); return;
  }
  if (!hideTail) {
    if (!tiger) {
      R(0, 3 - breath, 2, 2, p.body); R(-1, 2 + tail - breath, 2, 3 - tail, p.body);
      R(-2, 1 + tail - breath, 2, 3, p.body); R(-2, 1 + tail - breath, 1, 1, p.hi);
      R(-3, 1 + tail - breath, 1, 2, p.pale); R(-2, tail - breath, 1, 1, p.pale);
    } else {
      const root = 3 - breath, tip = tail * .5;
      R(-1, root, 3, 1, p.body); R(-3, root, 2, 1, p.body);
      R(-3, root - 1 - tip, 1, 2 + tip, p.body); R(-2, root - 2 - tip, 1, 2, p.body);
      R(-1, root, 1, 1, K); R(-3, root, 1, 1, K); R(-2, root - 2 - tip, 1, 1, K);
    }
  }
  const front = tiger ? 7 : 5;
  R(1, 2 - breath, front, 3, p.body); R(1, 2 - breath, front, 1, p.hi);
  if (tiger) { R(1, 4, 7, 1, p.pale); for (const stripe of [3, 5]) R(stripe, 2, 1, 2, K); }
  const hy = pose === 'sniff' ? 1 : head;
  R(front, 1 + hy, tiger ? 4 : 3, 3, p.body); R(front, 1 + hy, tiger ? 4 : 3, 1, p.hi);
  R(front, hy, 1, 1, p.body); R(front + 2, hy, 1, 1, p.body); if (tiger) R(front + 2, 1 + hy, 1, 1, K);
  R(front + 1, 2 + hy, 1, pose === 'blink' ? .5 : 1, K);
  R(front + 3, 3 + hy, 1, 1, p.pale); R(front + 3, 2 + hy, 1, 1, p.nose);
  if (tiger) { R(front + 2, 3 + hy, 2, 1, p.pale); R(front + 3, 3 + hy, 1, 1, p.nose); }
  R(front, 4, 1, 1, p.body);
  const q = ((Math.floor(phase) % 4) + 4) % 4, back = [0, 1, 0, -1][q], fore = [0, -1, 0, 1][q];
  R(2 + back, 5, 1, q === 1 ? 1 : 2, p.paw); R(front + fore, 5, 1, q === 3 ? 1 : 2, p.paw);
  R(Math.max(1, 1 - back), 5, 1, 1, p.nose); R(q === 1 ? front : front + 1 - fore, 5, 1, 1, p.nose);
  ctx.restore();
}

export function paintLeaf(ctx, x, y, u = 2, turn = 0) {
  x = Math.round(x); y = Math.round(y);
  ctx.fillStyle = '#789969'; ctx.fillRect(x - u, y - u, u * 2, u); ctx.fillRect(Math.round(x - u * 1.5), y, u * 3, u * 2); ctx.fillRect(Math.round(x - u * .5), y + u * 2, u, u * 2);
  ctx.fillStyle = '#bfd0ab'; ctx.fillRect(x + (turn ? -u : 0), y, u, u * 2);
}
