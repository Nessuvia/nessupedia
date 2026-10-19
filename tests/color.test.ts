import { describe, expect, it } from "vitest";
import { ACCENT_PALETTE, isHexColor, textOn } from "@/utils/color";

describe("accent colors", () => {
  it("puts black text on light accents and white on dark ones", () => {
    expect(textOn("#ffffff")).toBe("#000000");
    expect(textOn("#f472a8")).toBe("#000000");
    expect(textOn("#c41e3a")).toBe("#ffffff");
    expect(textOn("#1b191a")).toBe("#ffffff");
  });

  it("accepts only #rrggbb colors", () => {
    expect(ACCENT_PALETTE.every(isHexColor)).toBe(true);
    expect(isHexColor("#fff")).toBe(false);
    expect(isHexColor("red")).toBe(false);
    expect(isHexColor(undefined)).toBe(false);
  });
});
