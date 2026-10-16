// Shared cached glow primitive; independent of either lake or character renderer.
const glows = new Map<string, HTMLCanvasElement>();
export function drawGlow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number, inner: string, outer = inner) {
  const key = inner + "|" + outer;
  let c = glows.get(key);
  if (!c) {
    const G = 128;
    const cv = document.createElement("canvas"); cv.width = cv.height = G;
    const g = cv.getContext("2d")!;
    const gr = g.createRadialGradient(G / 2, G / 2, 0, G / 2, G / 2, G / 2);
    gr.addColorStop(0, `rgba(${inner},1)`); gr.addColorStop(1, `rgba(${outer},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, G, G);
    glows.set(key, (c = cv));
  }
  const a = ctx.globalAlpha; ctx.globalAlpha = a * alpha;
  ctx.drawImage(c, x - r, y - r, r * 2, r * 2); ctx.globalAlpha = a;
}
