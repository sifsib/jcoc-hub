# Handover, white-label configuration (B9)

**Date:** 2026-10-24
**Phase:** B9 white-label, before JCOC sees the app
**Session:** continues the deployment session

## Context correction, if any

- **The church's name.** The logo says "Johannesburg Church of Christ (ICOC)", while our notes say "Joburg Church of Christ". The app shows "Joburg Church of Christ" until Sifiso confirms (Y1).
- **Signup.** The welcome page used to offer public "Sign Up". It is removed, because JCOC regions are created by the network, not by strangers. `/signup` itself still works (Y4).

## What I built

**Sifiso's decisions:**
- the app is called **JCOC Hub**;
- support stays **"Kereke Hub support"**;
- the logo was sent by Sifiso (a WhatsApp copy).

Everything a JCOC user sees now comes from `lib/whiteLabel.ts`. Two parts:
- **`BRAND`:** the product name, short name, church name, description, address, logo, colours and email sender name.
- **`PLATFORM`:** Kereke Hub itself, named only for support, billing and invoices, the shared WhatsApp number and the "Powered by" attribution.

**What changed on screen:**
- **Welcome, login, member setup and offline pages:** show the JCOC logo and "JCOC Hub". The login button now uses the brand colour instead of blue.
- **Page titles:** every page has the title "JCOC Hub".
- **Phone app:** the manifest (`app/manifest.ts`), the browser tab icon and the iPhone icon (`app/icon.tsx`, `app/apple-icon.tsx`) come from the settings. The icon uses the logo, or the initials if there is no logo.
- **Colours:** every `emerald-*` class in the app now reads JCOC's palette (`--brand-*` set on `<html>`). The old fixed `#1A5C38` fallbacks use `BRAND.colours.primary`. Until JCOC sends colour codes, the palette is the original emerald, so nothing looks different yet.
- **Emails** (invites, reactivation, assignment notices) use JCOC Hub, JCOC's address and the brand colour. Kereke Hub's own invoice keeps the platform's name, company details and colour.
- **A real bug fixed along the way:** the member portal link, the join form link and embed code, and the "give" link were hard-wired to `hub.kerekehub.co.za`, the base product. They now use JCOC's address (`appUrl()`; `NEXT_PUBLIC_APP_URL` overrides it).

## Files added and changed

**New:**
- `app/components/BrandMark.tsx`, `app/lib/brandIcon.tsx`, `app/icon.tsx`, `app/apple-icon.tsx`, `app/manifest.ts`
- `public/brand/logo.jpg`
- `tests/unit/whiteLabel.test.ts`, `tests/unit/brandStrings.test.ts`

**Removed:**
- `public/manifest.json`, `app/icon.png`, `app/apple-icon.png`, `app/favicon.ico`. These were the base product's.

**Changed:**
- `lib/whiteLabel.ts`, `app/layout.tsx`, `app/globals.css`, `app/page.tsx`, `public/sw.js` (manifest path)
- About 40 screens and routes now read from the settings.

## Decisions taken

1. **Brand colours** map onto the existing `emerald-*` classes rather than rewriting about 850 class names. This keeps the change small and portable.
2. **The tests:**
   - `brandStrings.test.ts` fails if any "Kereke" name or address is typed into `app/`, `lib/` or `public/` outside `lib/whiteLabel.ts`.
   - Comments are allowed.
   - Two internal identifiers are allowed: the offline database name and the service worker cache name.
   - The base product's beta access code is allowed.
3. **Cloud Functions are not converted (Y5).** The base product's own emails there are not deployed for JCOC.

## Verification done

- **Tests first.** 8 new tests failed as expected before the change: the settings did not exist, and the guard listed every hard-coded mention.
- **Checks.** `tsc` is clean in the root and in `functions/`. Unit tests: 183 pass. Rules tests: 233 pass. `next build` succeeds, and `/icon`, `/apple-icon` and `/manifest.webmanifest` are generated.
- **Clicked through on the emulators:**
  - **Welcome and login pages:** show the logo and "JCOC Hub".
  - **Page titles:** "JCOC Hub".
  - **Icons and manifest:** `/icon` shows the logo; `/manifest.webmanifest` names JCOC Hub.
  - **Dashboard, menu and public event registration:** no "Kereke" anywhere.
  - **Offline page:** shows the logo.
  - **Colour switch:** setting the brand colour to red turned `emerald-600` elements red, so JCOC's colours will apply app-wide.

## What I did NOT verify

- **Emails:** not seen in an inbox, because Brevo is not set up.
- **Phone install:** adding the app to a real phone's home screen.
- **Printouts:** finance printouts and payslips (finance is off for JCOC).
- **The live site:** it updates when this is pushed.

## Open items for next session

1. JCOC's colour codes (Y2); then set `BRAND.colours` and check contrast.
2. Confirm the church's full name (Y1), and get the original logo file (Y3).
3. Decide whether to close `/signup` on JCOC's deployment (Y4).
4. Push, then check the live site.

## Follow-up 2026-10-25: member import test file and fixes (Z1-Z4)

**The test file.**
- `docs/testing/JCOC-Hub-Test-Members.xlsx` has 18 invented households, covering each life stage and the edge cases, with an Expected results sheet.
- It is built from the structure in Sifiso's screenshot: Sector 2 Test and Test sector, with their family groups.

**First import (on the emulators).** 33 records came in. Four gaps showed up:
- **Z1:** the wedding date was dropped.
- **Z2:** spouses and children were left unplaced.
- **Z3:** only an exact "Married" created the spouse.
- **Z4:** the Import screen showed another church's Firebase export instructions.

**Fixed, tests first.**
- `tests/unit/memberImport.test.ts`: 8 tests. The 3 that check the import code failed before the fix.
- The pure helpers are in `lib/memberImport.ts`. The import now reads "Anniversary Date", places the whole household, and uses the life phase marital rule.
- The foreign panel is replaced by a column guide.

**Second import (on the emulators).**
- **Records:** 34 came in (Palesa, the customary spouse, is now created).
- **Placement:** every spouse and child is in the household's sector and family group.
- **Life phases:** married couples have their anniversary and Young Married or Mature Married.
- **Duplicates:** re-importing the file flags all 18 households.

**Checks.** `tsc` is clean in the root and in `functions/`. Unit tests: 191 pass. Rules tests: 233 pass. `next build` succeeds.

**Gotcha.** `npm run seed:emulator` sometimes fails on its first run straight after the functions emulator starts. Run it again.

**Not verified.**
- The import on the live site.
- Birthdays & Anniversaries showing the imported anniversaries: the logic is unchanged, and it reads `anniversaryDate`.
