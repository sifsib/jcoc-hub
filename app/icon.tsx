// Browser tab and home-screen icon, from lib/whiteLabel.ts (app/lib/brandIcon.tsx).
import { brandIcon } from "./lib/brandIcon";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return brandIcon(512);
}
