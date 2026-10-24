// Guard for CLAUDE.md rule 7: no product or platform name typed into the
// app. Every user-visible "Kereke Hub" (or kerekehub.co.za address) must come
// from lib/whiteLabel.ts. Comments are allowed to mention it (porting notes);
// code and text are not.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../../", import.meta.url).pathname;
const SCAN = ["app", "lib", "public"];
const ALLOWED: Record<string, string> = {
  "lib/whiteLabel.ts": "the one place the names live",
  "lib/offline/storage.ts": "internal browser database name, never shown; renaming it would drop saved offline data",
  "public/sw.js": "service worker cache name, never shown",
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (name === "node_modules" || name.startsWith(".")) return [];
    if (statSync(p).isDirectory()) return files(p);
    return /\.(tsx?|json|js|mjs|html)$/.test(name) ? [p] : [];
  });
}

/** The file with comments removed, keeping line numbers. */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

describe("brand strings", () => {
  it("has no hard-coded Kereke Hub name or address outside lib/whiteLabel.ts", () => {
    const found: string[] = [];
    for (const dir of SCAN) {
      for (const f of files(join(ROOT, dir))) {
        const rel = relative(ROOT, f);
        if (ALLOWED[rel]) continue;
        code(readFileSync(f, "utf8")).split("\n").forEach((line, i) => {
          // The base product's beta access code is a code, not a name shown to anyone.
          const checked = line.replace(/KEREKEBETA\d{4}/g, "");
          if (/kereke/i.test(checked)) found.push(`${rel}:${i + 1}: ${line.trim().slice(0, 100)}`);
        });
      }
    }
    expect(found).toEqual([]);
  });
});
