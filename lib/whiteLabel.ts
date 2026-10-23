/**
 * whiteLabel.ts
 * Single source for client-specific wording and branding (CLAUDE.md rule 7).
 *
 * Phase 2 only needs the names of the structure levels. JCOC says region (or
 * campus), sector and family group; other churches say campus, branch or
 * cell. Product name, logo, colours, senders and attribution join this file
 * in the white-label work (docs/02_SCOPE.md B9).
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

/**
 * Credit shown in the footer of the member app and public pages. Sifiso chose
 * "Powered by Kereke Hub" on 2026-10-23 to propose to JCOC (docs/02_SCOPE.md B9
 * says the wording is to be agreed with them), so change it here only.
 */
export const ATTRIBUTION = "Powered by Kereke Hub";
