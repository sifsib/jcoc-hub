// The app icon (browser tab, phone home screen), drawn from lib/whiteLabel.ts:
// the logo on white when there is one, otherwise the product's initials on
// the brand colour.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { BRAND } from "../../lib/whiteLabel";

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 3).toUpperCase();
}

function logoDataUrl(): string | null {
  if (!BRAND.logo.src) return null;
  const ext = BRAND.logo.src.split(".").pop()?.toLowerCase();
  const type = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "svg" ? "image/svg+xml" : `image/${ext}`;
  const bytes = readFileSync(join(process.cwd(), "public", BRAND.logo.src));
  return `data:${type};base64,${bytes.toString("base64")}`;
}

export function brandIcon(size: number) {
  const logo = logoDataUrl();
  return new ImageResponse(
    logo ? (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt="" width={size} height={size} />
      </div>
    ) : (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
          background: BRAND.colours.primary, color: "#ffffff", fontSize: size * 0.42, fontWeight: 700,
          borderRadius: size * 0.18,
        }}
      >
        {initials(BRAND.productName)}
      </div>
    ),
    { width: size, height: size },
  );
}
