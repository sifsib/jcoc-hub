// White-label settings (docs/02_SCOPE.md B9, CLAUDE.md rule 7). Everything
// a JCOC user sees about the product comes from lib/whiteLabel.ts: the
// product name, logo, colours, address, email sender and the attribution.
// Kereke Hub appears only where the platform itself is meant (support,
// billing, the attribution), and then from the PLATFORM settings.

import { describe, expect, it } from "vitest";
import { ATTRIBUTION, BRAND, PLATFORM, appUrl, appUrlText, brandCssVars } from "../../lib/whiteLabel";

const HEX = /^#[0-9a-f]{6}$/i;
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const lum = (hex: string) => {
  const [r, g, b] = rgb(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const hue = (hex: string) => {
  const [r, g, b] = rgb(hex); const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
const STEPS = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];

describe("white-label settings", () => {
  it("names the product JCOC Hub, for Johannesburg Church of Christ (decided 2026-10-24, full name 2026-10-29)", () => {
    expect(BRAND.productName).toBe("JCOC Hub");
    expect(BRAND.shortName).toBe("JCOC Hub");
    expect(BRAND.churchName).toBe("Johannesburg Church of Christ");
    expect(BRAND.description).toContain("Johannesburg Church of Christ");
    expect(BRAND.description.length).toBeGreaterThan(10);
  });

  it("keeps the platform's name out of every product field", () => {
    for (const v of [BRAND.productName, BRAND.shortName, BRAND.churchName, BRAND.description, BRAND.email.senderName]) {
      expect(v).not.toMatch(/kereke/i);
    }
  });

  it("names the platform once, for support, billing and the attribution", () => {
    expect(PLATFORM.name).toBe("Kereke Hub");
    expect(PLATFORM.supportName).toBe("Kereke Hub support");
    expect(PLATFORM.supportEmail).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i);
    expect(PLATFORM.website).toMatch(/^https:\/\//);
    expect(ATTRIBUTION).toBe(`Powered by ${PLATFORM.name}`);
  });

  it("has a full, valid colour palette and a primary colour", () => {
    expect(BRAND.colours.primary).toMatch(HEX);
    expect(Object.keys(BRAND.colours.palette)).toEqual(STEPS);
    for (const step of STEPS) expect(BRAND.colours.palette[step as keyof typeof BRAND.colours.palette]).toMatch(HEX);
  });

  // JCOC's colours, green, blue and white, from the logo (2026-10-29). White
  // text must stay readable on the shades used for buttons and headers.
  it("uses JCOC's green and blue, readable with white text", () => {
    const g = BRAND.colours.palette, b = BRAND.colours.secondary;
    expect(Object.keys(b)).toEqual(STEPS);
    for (const step of STEPS) expect(b[step as keyof typeof b]).toMatch(HEX);
    expect(hue(g["600"])).toBeGreaterThan(90); expect(hue(g["600"])).toBeLessThan(150);   // green
    expect(hue(b["600"])).toBeGreaterThan(200); expect(hue(b["600"])).toBeLessThan(230);  // blue
    for (const c of [BRAND.colours.primary, g["600"], g["700"], b["600"], b["700"]]) expect(contrast(c, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("turns the palette into CSS variables for the whole app", () => {
    const vars = brandCssVars();
    for (const step of STEPS) expect(vars[`--brand-${step}`]).toBe(BRAND.colours.palette[step as keyof typeof BRAND.colours.palette]);
    expect(vars["--brand-primary"]).toBe(BRAND.colours.primary);
    for (const step of STEPS) expect(vars[`--brand-blue-${step}`]).toBe(BRAND.colours.secondary[step as keyof typeof BRAND.colours.secondary]);
  });

  it("points links at JCOC's own address, never the base product's", () => {
    const old = process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(appUrl()).toBe("https://jcoc.kerekehub.co.za");
    expect(appUrl("/member/x/home")).toBe("https://jcoc.kerekehub.co.za/member/x/home");
    expect(appUrlText("/give/abc")).toBe("jcoc.kerekehub.co.za/give/abc");
    process.env.NEXT_PUBLIC_APP_URL = "https://example.test/";
    expect(appUrl("/login")).toBe("https://example.test/login");
    if (old === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = old;
  });

  it("has either no logo yet or a path to a file in public/", () => {
    expect(BRAND.logo.src === null || /^\/[\w./-]+\.(png|svg|jpg|webp)$/.test(BRAND.logo.src)).toBe(true);
    expect(BRAND.logo.alt).toBe(BRAND.productName);
  });
});
