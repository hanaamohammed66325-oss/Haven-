import { COSMETICS, COSMETIC_ORDER, cosmeticsConflict } from "@/lib/haviCosmetics";

type Layer = "back" | "front";
type Pixel = (x: number, y: number, width: number, height: number, color: string) => void;
type Rect = { x: number; y: number; width: number; height: number; color: string };
const empty: readonly string[] = Object.freeze([]);
const definitions = COSMETICS as Record<string, Partial<Record<Layer, (ctx: CanvasRenderingContext2D, size: number) => void>>>;
const layers = new Map<string, readonly Rect[]>();

/** Same known wardrobe/zones as the app; untrusted member data cannot add art. */
export function normalizeHaviOutfit(raw: unknown): readonly string[] {
  if (!Array.isArray(raw) || raw.length > 32) return empty;
  const selected: string[] = [];
  for (const id of COSMETIC_ORDER) {
    if (id === "none" || !raw.includes(id) || selected.some(other => cosmeticsConflict(id, other))) continue;
    selected.push(id);
  }
  return selected.length ? selected : empty;
}

/** Compile the ORIGINAL rectangle art once, independent of Canvas/React/poses. */
function rectangles(id: string, layer: Layer): readonly Rect[] {
  const key = `${id}:${layer}`, cached = layers.get(key);
  if (cached) return cached;
  const out: Rect[] = [];
  const recorder = {
    fillStyle: "#000000",
    fillRect(x: number, y: number, width: number, height: number) { out.push({ x, y, width, height, color: this.fillStyle }); },
  };
  definitions[id]?.[layer]?.(recorder as unknown as CanvasRenderingContext2D, 1);
  layers.set(key, out);
  return out;
}

/** Map each grid row through the body's pixel painter, including sleep/squish. */
export function drawHaviOutfitLayer(ids: unknown, layer: Layer, pixel: Pixel): void {
  for (const id of normalizeHaviOutfit(ids)) {
    for (const r of rectangles(id, layer)) {
      for (let row = 0; row < r.height; row++) pixel(r.x, r.y + row, r.width, 1, r.color);
    }
  }
}
