// Answered 2026-10-23: children's check-in records are kept for 24 months,
// then removed by the kidsRetention function. Dates are YYYY-MM-DD strings.

import { describe, expect, it } from "vitest";
import { RETENTION_MONTHS, retentionCutoff, pastRetention } from "../../functions/src/kidsRetention";

describe("children's check-in retention", () => {
  it("keeps records for 24 months", () => {
    expect(RETENTION_MONTHS).toBe(24);
  });

  it("works out the cutoff 24 months before today", () => {
    expect(retentionCutoff("2026-10-23")).toBe("2024-10-23");
    expect(retentionCutoff("2026-01-05")).toBe("2024-01-05");
  });

  it("uses the last day of the month when the day does not exist", () => {
    expect(retentionCutoff("2026-02-28", 12)).toBe("2025-02-28");
    expect(retentionCutoff("2028-02-29", 12)).toBe("2027-02-28");
  });

  it("removes only records from before the cutoff", () => {
    expect(pastRetention("2024-10-22", "2024-10-23")).toBe(true);
    expect(pastRetention("2024-10-23", "2024-10-23")).toBe(false);
    expect(pastRetention("2025-06-01", "2024-10-23")).toBe(false);
    expect(pastRetention("", "2024-10-23")).toBe(false);
  });
});
