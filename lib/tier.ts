// Shared free/paid tier constants and helpers.
// Safe to import from client OR server code (no server-only dependencies here).

export const STANDARD_RATE = 159;
export const FREE_MEMBER_LIMIT = 50;

export type Tier = "free" | "paid";

// A tenant counts as "paid" for feature access when its tier is anything other
// than "free". Comped accounts (internal, beta) are stored as tier "paid", so
// they get full access through this same check.
export function isPaidTier(tier?: string | null): boolean {
  return tier != null && tier !== "free";
}

// The features locked to the paid plan. `key` is used in code, `label` in the UI.
export const PAID_FEATURES = {
  workflows: "Automation workflows",
  forms: "Custom forms",
  communications: "Bulk email and SMS",
  team: "Multiple admins and custom roles",
  advancedAnalytics: "Advanced analytics and at-risk alerts",
} as const;

export type PaidFeatureKey = keyof typeof PAID_FEATURES;

// Nav hrefs that belong to the paid plan, used to lock the sidebar for free tenants.
export const PAID_NAV_HREFS: string[] = [
  "/dashboard/workflows",
  "/dashboard/forms",
  "/dashboard/communications",
  "/dashboard/team",
  "/dashboard/events",
  "/dashboard/worship",
  "/dashboard/volunteers",
  "/dashboard/daily-summary",
];
