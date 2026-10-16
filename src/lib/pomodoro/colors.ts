import { hashString } from "./math";
const BLOOM_FALLBACK = ["#e86f9e", "#f2c14e", "#7db6f0", "#c48be0", "#5fce9e", "#ef8f4b", "#e0576b", "#8fd0ff"];
export function fallbackColor(id: string): string {
  return BLOOM_FALLBACK[hashString(id) % BLOOM_FALLBACK.length];
}
