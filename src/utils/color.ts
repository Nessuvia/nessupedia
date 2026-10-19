export const DEFAULT_ACCENT = "#c41e3a";

// nessuvia's reds and pinks, plus black, offered as swatches before the free color picker.
export const ACCENT_PALETTE = ["#c41e3a", "#9f1239", "#e11d48", "#e63462", "#f472a8", "#db2777", "#1b191a"];

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const channel = parseInt(hex.slice(at, at + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Black or white, whichever has more contrast on the given #rrggbb color.
export function textOn(hex: string): "#000000" | "#ffffff" {
  const light = luminance(hex);
  return (light + 0.05) / 0.05 > 1.05 / (light + 0.05) ? "#000000" : "#ffffff";
}

export const isHexColor = (value: unknown): value is string => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
