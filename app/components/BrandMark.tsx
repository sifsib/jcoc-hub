// The product's logo, or its name as text until a logo is set in
// lib/whiteLabel.ts. Used on the welcome, login and member setup screens.
import { BRAND } from "../../lib/whiteLabel";

export function BrandMark({ className = "h-20" }: { className?: string }) {
  if (BRAND.logo.src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={BRAND.logo.src} alt={BRAND.logo.alt} className={`${className} w-auto mx-auto`} />;
  }
  return <p className="text-3xl font-black tracking-tight text-emerald-800 text-center">{BRAND.productName}</p>;
}
