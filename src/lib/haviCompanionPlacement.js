/** A card-edge lane that keeps the whole companion outside Havi's visible box. */
export function companionLane(card, width, height, ground, havi, side = "left", gap = 12, preferred = null) {
  const left = card.left + 8, right = card.right - 8;
  if (right - left < width) return null;
  const top = card.top - height + ground, bottom = card.top + ground;
  let lanes = [{ left, right }];
  for (const obstacle of Array.isArray(havi) ? havi : [havi]) {
    if (!obstacle || obstacle.bottom + gap <= top || obstacle.top - gap >= bottom) continue;
    lanes = lanes.flatMap(lane => obstacle.right + gap <= lane.left || obstacle.left - gap >= lane.right ? [lane] : [
      { left: lane.left, right: Math.min(lane.right, obstacle.left - gap) },
      { left: Math.max(lane.left, obstacle.right + gap), right: lane.right },
    ]).filter(lane => lane.right - lane.left >= width);
  }
  if (preferred !== null) lanes.sort((a, b) => Math.max(a.left - preferred, preferred + width - a.right, 0) - Math.max(b.left - preferred, preferred + width - b.right, 0));
  else if (side === "right") lanes.reverse();
  return lanes.find(lane => lane.right - lane.left >= width) || null;
}
