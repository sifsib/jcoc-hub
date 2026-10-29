/**
 * whiteLabel.ts
 * Single source for client-specific wording and branding (CLAUDE.md rule 7,
 * docs/02_SCOPE.md B9). Nothing else in the app types a product name, logo
 * path, brand colour, address or sender; tests/unit/brandStrings.test.ts
 * fails if anything does.
 *
 * BRAND is what JCOC's people see. PLATFORM is Kereke Hub itself, named only
 * where the platform is meant: support, billing and the attribution.
 * The next white-label client changes this file, and the logo files in
 * public/brand/, and nothing else.
 */

export interface LevelLabel {
  one: string;
  many: string;
}

export const STRUCTURE_LABELS: Record<"network" | "church" | "region" | "sector" | "familyGroup", LevelLabel> = {
  network: { one: "Network", many: "Networks" },
  church: { one: "Church", many: "Churches" },
  region: { one: "Region", many: "Regions" },
  sector: { one: "Sector", many: "Sectors" },
  familyGroup: { one: "Family group", many: "Family groups" },
};

/** The client's product. Name "JCOC Hub" decided by Sifiso on 2026-10-24. */
export const BRAND = {
  productName: "JCOC Hub",
  /** Under the icon on a phone's home screen; keep it short. */
  shortName: "JCOC Hub",
  churchName: "Johannesburg Church of Christ",
  description: "Church management for Johannesburg Church of Christ.",
  /**
   * Whether anyone may register a new church at /signup. Off for JCOC
   * (2026-10-29): regions are set up by the network, people join by invitation.
   */
  publicSignup: false,
  /** Default address; NEXT_PUBLIC_APP_URL overrides it per deployment. */
  appUrl: "https://jcoc.kerekehub.co.za",
  /**
   * Logo in public/; null shows the product name as text. Also used for the
   * app icon (app/lib/brandIcon.tsx). This copy came from WhatsApp (960px);
   * swap in JCOC's original file when they send it.
   */
  logo: { src: "/brand/logo.jpg" as string | null, alt: "JCOC Hub" },
  /**
   * JCOC's colours: green, blue and white, taken from the logo (Sifiso,
   * 2026-10-29). White text stays readable on the 600 and 700 shades and on
   * primary (tests/unit/whiteLabel.test.ts checks the contrast).
   */
  colours: {
    /** Solid brand colour: phone theme colour, emails, fallback for a region's own colour. */
    primary: "#226619",
    /** Green. Every emerald-* class maps to these (app/globals.css). */
    palette: {
      "50": "#f0f8ee",
      "100": "#dcefd6",
      "200": "#b9dfae",
      "300": "#8ec97f",
      "400": "#5fae4f",
      "500": "#3c962d",
      "600": "#2a7d1f",
      "700": "#226619",
      "800": "#1d5216",
      "900": "#194314",
      "950": "#0b2509",
    },
    /** Blue. Every blue-* class (mostly links) maps to these. */
    secondary: {
      "50": "#eef5fd",
      "100": "#d9e8fb",
      "200": "#b6d2f6",
      "300": "#8db7ef",
      "400": "#6ca0e6",
      "500": "#4a86d9",
      "600": "#326cc0",
      "700": "#29579c",
      "800": "#24497f",
      "900": "#213e68",
      "950": "#162843",
    },
  },
  email: {
    /** Sender name when BREVO_SENDER_NAME is not set. */
    senderName: "JCOC Hub",
  },
};

/** Kereke Hub, the platform underneath. */
export const PLATFORM = {
  name: "Kereke Hub",
  supportName: "Kereke Hub support",
  supportEmail: "sifiso@kerekehub.co.za",
  website: "https://kerekehub.co.za",
  /** The platform's own colour, used only on its invoices to the church. */
  colour: "#1A5C38",
  /** The company behind the platform, as printed on its invoices to the church. */
  legalName: "KEREKEHUB (PTY) LTD",
  registrationNumber: "2026/413234/07",
  address: "Tembisa, 1632, Gauteng, South Africa",
  /** The platform's own logo in public/, used only on its invoices to the church. */
  logo: "/kereke-logo.jpg",
};

/**
 * Credit shown in the footer of the member app and public pages. Sifiso chose
 * "Powered by Kereke Hub" on 2026-10-23 to propose to JCOC (docs/02_SCOPE.md B9
 * says the wording is to be agreed with them), so change it here only.
 */
export const ATTRIBUTION = `Powered by ${PLATFORM.name}`;

/** An absolute link to this deployment, e.g. appUrl("/login"). */
export function appUrl(path = ""): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || BRAND.appUrl).replace(/\/+$/, "");
  return `${base}${path}`;
}

/** The same link without "https://", for showing on screen. */
export function appUrlText(path = ""): string {
  return appUrl(path).replace(/^https?:\/\//, "");
}

/** The brand colours as CSS variables, set on <html> by app/layout.tsx. */
export function brandCssVars(): Record<string, string> {
  const vars: Record<string, string> = { "--brand-primary": BRAND.colours.primary };
  for (const [step, hex] of Object.entries(BRAND.colours.palette)) vars[`--brand-${step}`] = hex;
  for (const [step, hex] of Object.entries(BRAND.colours.secondary)) vars[`--brand-blue-${step}`] = hex;
  return vars;
}
