import type { CSSProperties } from "react";

// The HUD over the pond and the lake floats as dark frosted glass, so it reads
// on any part of the scene, by day or night, in either app theme.
export const GLASS: CSSProperties = {
  background: "rgba(16, 30, 25, 0.5)",
  backdropFilter: "blur(14px) saturate(140%)",
  WebkitBackdropFilter: "blur(14px) saturate(140%)",
  border: "1px solid rgba(255,255,255,0.14)",
  color: "#f4f1e6",
  boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
};

// The one clear action over the scene (start, resume, "yes, it's done"): the
// student's theme colour, the same gradient as the app's own buttons.
export const ACTION: CSSProperties = {
  background: "var(--grad-primary)",
  color: "#fff",
  border: "1px solid rgba(255,255,255,0.18)",
  boxShadow: "0 10px 26px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.2)",
};

// Text straight on the scene (a hint under the buttons).
export const ON_SCENE: CSSProperties = {
  color: "#f4f1e6",
  textShadow: "0 1px 10px rgba(0,0,0,0.55)",
};
