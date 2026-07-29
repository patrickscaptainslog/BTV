// Palette from CLAUDE.md — deep space #03040c
export const CATEGORY_HUES = {
  Watch: "#ff8fbe",
  "Eat & Drink": "#ffcf7d",
  Ideas: "#7dffc4",
  "To Do": "#7db8ff",
  "On My Mind": "#c89bff",
  Work: "#ff9670",
};

// New Claude-invented categories get a stable hue from this pool
export const FALLBACK_HUES = [
  "#8fd3ff",
  "#ffd88f",
  "#b8ff9e",
  "#ff9eae",
  "#9effe8",
  "#e3a8ff",
];

export function categoryHue(cat) {
  if (CATEGORY_HUES[cat]) return CATEGORY_HUES[cat];
  let h = 2166136261;
  for (let i = 0; i < cat.length; i++) {
    h ^= cat.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return FALLBACK_HUES[(h >>> 0) % FALLBACK_HUES.length];
}
