import { describe, expect, it } from "vitest";
import {
  DEFAULT_EDITABLE_FIELDS,
  diffChanges,
  formatValue,
  normaliseAddress,
  normalisePhone,
  patchFromChanges,
  resolveEditableFields,
  staleFields,
  validate,
} from "../../lib/memberSelfService";

const addr = { line1: "1 Test Street", line2: "", suburb: "Soweto", town: "Johannesburg", postalCode: "1800" };

describe("resolveEditableFields", () => {
  it("falls back to the default when nothing is saved", () => {
    expect(resolveEditableFields(undefined)).toEqual(DEFAULT_EDITABLE_FIELDS);
  });
  it("keeps an explicit empty list, so a church can switch self-service off", () => {
    expect(resolveEditableFields([])).toEqual([]);
  });
  it("drops anything outside the catalogue", () => {
    expect(resolveEditableFields(["phone", "status", "branch", 7])).toEqual(["phone"]);
  });
});

describe("normalisePhone", () => {
  it("turns a local number into 27…", () => {
    expect(normalisePhone("082 123 4567")).toBe("27821234567");
  });
  it("keeps 27… and strips +", () => {
    expect(normalisePhone("+27 82 123 4567")).toBe("27821234567");
  });
  it("handles 00 international prefix for other countries", () => {
    expect(normalisePhone("00258 84 123 4567")).toBe("258841234567");
  });
});

describe("normaliseAddress", () => {
  it("keeps an old single-string address as line 1", () => {
    expect(normaliseAddress("12 Old Road")).toEqual({ ...addr, line1: "12 Old Road", suburb: "", town: "", postalCode: "" });
  });
});

describe("validate", () => {
  it("accepts good values", () => {
    expect(validate({ phone: "0821234567", email: "a@b.co.za", address: addr })).toEqual([]);
  });
  it("flags each bad field", () => {
    const errors = validate({ phone: "12", email: "not-an-email", address: { line1: "", town: "" } });
    expect(errors.map((e) => e.field)).toEqual(["phone", "email", "address"]);
  });
});

describe("diffChanges", () => {
  const current = { phone: "27821234567", email: "old@x.co.za", address: addr };

  it("returns only fields that changed, normalised", () => {
    const changes = diffChanges(current, { phone: "082 123 4567", email: "NEW@x.co.za " }, DEFAULT_EDITABLE_FIELDS);
    expect(changes).toEqual({ email: { from: "old@x.co.za", to: "new@x.co.za" } });
  });

  it("ignores fields the church does not allow", () => {
    expect(diffChanges(current, { phone: "0830000000" }, ["email"])).toEqual({});
  });

  it("diffs addresses as a whole", () => {
    const changes = diffChanges(current, { address: { ...addr, suburb: "Orlando" } }, ["address"]);
    expect(changes.address?.to).toEqual({ ...addr, suburb: "Orlando" });
  });

  it("builds the approval patch from the changes", () => {
    const changes = diffChanges(current, { phone: "0830000000" }, ["phone"]);
    expect(patchFromChanges(changes)).toEqual({ phone: "27830000000" });
  });
});

describe("staleFields", () => {
  it("flags a field edited by someone else since the request", () => {
    const changes = { phone: { from: "27821234567", to: "27830000000" } };
    expect(staleFields(changes, { phone: "27821234567" })).toEqual([]);
    expect(staleFields(changes, { phone: "27849999999" })).toEqual(["phone"]);
  });
});

describe("formatValue", () => {
  it("renders an address on one line, skipping blanks", () => {
    expect(formatValue(addr)).toBe("1 Test Street, Soweto, Johannesburg, 1800");
    expect(formatValue("")).toBe("(blank)");
  });
});
