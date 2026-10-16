const clamp = v => Math.max(0, Math.min(1, v));
const ease = p => p * p * (3 - 2 * p);
const progress = (t, a, b) => ease(clamp((t - a) / (b - a)));
const lerp = (a, b, p) => a + (b - a) * p;
const gait = (distance, kind, moving) => moving ? Math.abs(distance) / (kind === 'fox' ? 22 : 27) * 4 : 0;
export const SHARED_MOTIONS = ['greet', 'follow', 'leaf', 'rest'];
export const soloDuration = mode => ({ guard: 7, leaf: 7, hop: 3.4, play: 8.6 }[mode] || 0);
export const sharedDuration = mode => ({ greet: 5.4, follow: 7.8, leaf: 7, rest: 12 }[mode] || 5.4);

export function soloMotion(kind, mode, t, lane, width, scale, towardLeft = false) {
  const span = Math.max(0, lane.right - lane.left - width), sign = towardLeft ? 1 : -1;
  const home = towardLeft ? lane.left : lane.right - width, distance = Math.min(span, (mode === 'leaf' ? 92 : 42) * scale / 6);
  const a = { left: home, lift: 0, phase: 0, pose: 'stand', faceLeft: sign < 0, head: 0, tail: 0, done: t >= soloDuration(mode) };
  if (mode === 'guard') {
    const d = distance * (progress(t, .6, 2.6) - progress(t, 4.4, 6.4)); a.left += sign * d;
    a.phase = gait(d, kind, (t > .6 && t < 2.6) || (t > 4.4 && t < 6.4));
    a.faceLeft = t >= 2.8 && t < 6.8 ? sign > 0 : sign < 0;
    a.pose = t > 3.5 && t < 3.75 ? 'blink' : 'stand'; a.tail = t > 3 && t < 3.55 ? 1 : 0;
  } else if (mode === 'leaf') {
    const d = distance * progress(t, 1, 4.1); a.left += sign * d; a.phase = gait(d, kind, t > 1 && t < 4.1);
    a.pose = t > 4.1 && t < 5.7 ? 'sniff' : t > 6.2 && t < 6.45 ? 'blink' : 'stand'; a.tail = t > 5 && t < 5.5 ? 1 : 0;
    const mouth = a.left + (a.faceLeft ? 3 * scale : width - 3 * scale);
    a.leaf = { x: Math.max(lane.left + 5, Math.min(lane.right - 5, mouth + (a.faceLeft ? -10 : 10))), lift: (85 - 75 * progress(t, .7, 3.3)) * scale / 6, turn: Math.floor(t * 3) % 2 };
  } else if (mode === 'hop') {
    const p = clamp((t - 1.5) / 1.1); a.left += sign * distance * p; a.lift = Math.sin(p * Math.PI) * 22 * scale / 6;
    a.phase = t > 1.5 && t < 2.6 ? 2 : 0; a.tail = a.phase === 2 ? 1 : 0; a.pose = t > 2.9 && t < 3.15 ? 'blink' : 'stand';
  } else if (mode === 'nap') a.pose = 'curl';
  return a;
}

export function sharedMotion(mode, t, lane, sizes, leftKind = 'fox') {
  const gap = 18, f = sizes.fox, g = sizes.tiger, space = lane.right - lane.left - f.width - g.width - gap;
  if (space < 0) return null;
  const fox = { left: lane.left, lift: 0, phase: 0, pose: 'stand', faceLeft: false, head: 0, tail: 0 };
  const tiger = { left: lane.right - g.width, lift: 0, phase: 0, pose: 'stand', faceLeft: true, head: 0, tail: 0 };
  const out = { fox, tiger, leaf: null, done: t >= sharedDuration(mode) };
  if (mode === 'follow') {
    fox.left = lane.left + g.width + gap + space * progress(t, .6, 4.6);
    tiger.left = lane.left + space * progress(t, 1.3, 5.3); tiger.faceLeft = false; fox.faceLeft = t > 5.8;
    fox.phase = gait(space * progress(t, .6, 4.6), 'fox', t > .6 && t < 4.6);
    tiger.phase = gait(space * progress(t, 1.3, 5.3), 'tiger', t > 1.3 && t < 5.3);
    fox.pose = t > 6.4 && t < 6.65 ? 'blink' : 'stand'; tiger.tail = t > 6.7 && t < 7.25 ? 1 : 0;
    if (leftKind === 'fox') {
      fox.left = lane.left + lane.right - fox.left - f.width;
      tiger.left = lane.left + lane.right - tiger.left - g.width;
      fox.faceLeft = !fox.faceLeft; tiger.faceLeft = true;
    }
    return out;
  }
  const p = progress(t, .6, 2.4), travel = space * .5 * p;
  fox.left += travel; tiger.left -= travel;
  fox.phase = gait(travel, 'fox', t > .6 && t < 2.4); tiger.phase = gait(travel, 'tiger', t > .6 && t < 2.4);
  if (mode === 'greet') {
    fox.head = t > 2.8 && t < 3.15 ? 1 : 0; tiger.head = t > 3.45 && t < 3.8 ? 1 : 0;
    fox.pose = t > 4.2 && t < 4.45 ? 'blink' : 'stand'; tiger.pose = t > 4.6 && t < 4.85 ? 'blink' : 'stand';
    fox.tail = t > 3.1 && t < 3.7 ? 1 : 0; tiger.tail = t > 3.8 && t < 4.4 ? 1 : 0;
  } else if (mode === 'leaf') {
    fox.lift = Math.sin(clamp((t - 2.8) / .7) * Math.PI) * 15 * f.scale / 6;
    tiger.pose = t > 4 && t < 5.5 ? 'sniff' : 'stand'; fox.pose = t > 5.7 && t < 6.1 ? 'sniff' : 'stand';
    out.leaf = { x: lane.left + space * .5 + f.width + gap * .5, lift: 75 - 65 * progress(t, .6, 2.9), turn: Math.floor(t * 4) % 2 };
  } else if (mode === 'rest') { fox.pose = t > 2.7 ? 'curl' : 'stand'; tiger.pose = t > 3.4 ? 'curl' : 'stand'; }
  if (leftKind === 'tiger') {
    fox.left = lane.left + lane.right - fox.left - f.width;
    tiger.left = lane.left + lane.right - tiger.left - g.width;
    fox.faceLeft = true; tiger.faceLeft = false;
  }
  return out;
}

export function cardTransition(from, to) {
  const dy = Math.abs(from.top - to.top), gap = Math.max(0, to.left - from.right, from.left - to.right);
  if (dy <= 8 && gap <= 8 && (to.left >= from.right - 8 || from.left >= to.right - 8)) return 'step';
  if (dy <= 84 && gap <= 120) return 'jump';
  return 'peek';
}

export function travelMotion(mode, t, start, edge, destination, scale, kind) {
  const a = { left: start.left, top: start.top, pose: 'stand', phase: 0, lift: 0, faceLeft: destination.left < edge.left, done: false };
  if (mode === 'step') {
    const p = progress(t, .5, 3.4); a.left = lerp(start.left, destination.left, p); a.top = lerp(start.top, destination.top, p);
    a.phase = gait(a.left - start.left, kind, t > .5 && t < 3.4); a.done = t >= 3.6;
  } else {
    const approach = progress(t, 0, 1), p = clamp((t - 1.4) / 1.25);
    a.left = t < 1.4 ? lerp(start.left, edge.left, approach) : lerp(edge.left, destination.left, p);
    a.top = lerp(edge.top, destination.top, p) - 4 * 38 * scale / 6 * p * (1 - p);
    a.phase = t < 1 ? gait(a.left - start.left, kind, true) : t > 1.4 && t < 2.65 ? 2 : 0;
    a.done = t >= 3.1;
  }
  return a;
}
