// Phone app details (name, colours, icons), from lib/whiteLabel.ts. Replaces
// the old public/manifest.json, which named the base product.
import type { MetadataRoute } from "next";
import { BRAND } from "../lib/whiteLabel";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.productName,
    short_name: BRAND.shortName,
    description: BRAND.description,
    start_url: "/dashboard",
    display: "standalone",
    orientation: "portrait",
    background_color: BRAND.colours.primary,
    theme_color: BRAND.colours.primary,
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png", purpose: "any" },
    ],
    categories: ["business", "productivity"],
  };
}
