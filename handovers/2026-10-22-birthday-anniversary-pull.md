# Handover, birthday and anniversary pull (quick win 1)

**Date:** 2026-10-22
**Phase:** Quick win, runs ahead of Phase 1 per CLAUDE.md
**Session:** 1 (continued)
**Branch:** `feature/qw-birthday-anniversary-pull`, cut from `feature/p0-rules-harness-tenant-lockdown`

## Context correction, if any

None for this feature. Earlier in the same session ADR-001 revision 2 was signed off by Sifiso and marked Accepted (commit `a007285`).

## What I built

Discovery call commitments 5 and 6: "pull birthdays for the next seven days" and anniversary capture and pull, shaped to Anita's actual job, which is the Friday members' email covering Friday through the following Thursday.

1. **Anniversary capture.** The member form shows an optional "Wedding Anniversary" date when marital status is Married. It is saved as `anniversaryDate` on the member and on a spouse created in the same form. Editing a member mirrors the date onto a linked spouse who is also married. Changing marital status away from Married clears the date.
2. **Birthdays & Anniversaries page** at `/dashboard/celebrations`, linked in the sidebar under Membership Management.
   - Defaults to this Friday to next Thursday, in the church's time zone. On a Saturday it looks ahead to the next Friday, because that week's email has gone.
   - Presets for this week, next week and the next 30 days, plus any custom range up to a year.
   - Birthdays with the age being turned. Anniversaries with years married, one row per linked couple.
   - "Copy text" puts paste-ready text on the clipboard; "Export CSV" downloads the list.
   - Same scoping as the roster: cell leaders see their cell, branch admins their branch, everyone else the whole church. Suspended members are left out.

Example of the copied text:

```
Birthdays
Fri 24 Oct  Thabo Dlamini (40)

Anniversaries
Sun 26 Oct  Lerato & Thabo Dlamini (12 years)
```

## Files added and changed

**New:**
- `lib/celebrations.ts` — pure date logic: parsing the date formats found in member records, the weekly window, year-end and 29 February handling, couple de-duplication, email text. No React or Firebase, so it is unit-tested and ports straight back to Kereke Hub.
- `app/dashboard/celebrations/page.tsx` — the page. Reads members once, everything else is computed in the browser.
- `tests/unit/` — standalone vitest package (like `tests/rules/`) with 19 tests for `lib/celebrations.ts`.

**Changed:**
- `app/dashboard/roster/page.tsx` — `anniversaryDate` on the member type and form state, the date field under Marital Status, written on create, join-family and update, mirrored to a linked spouse on update.
- `app/dashboard/layout.tsx` — sidebar link, same roles as Membership Management.

## Data shapes introduced

- `members.anniversaryDate`: `"YYYY-MM-DD"` or `""`. Optional and additive; nothing else reads it. Empty unless marital status is Married.

No new collections, no rules change. The existing member read and update rules already cover the field.

## Decisions taken

1. The window defaults to Friday to Thursday because that is Anita's weekly email (discovery call). The weekday is a constant on the page, not configurable yet.
2. Couples appear once only when both records link to each other **and** carry the same date. If they disagree, both rows show, so a data error is visible rather than hidden.
3. 29 February birthdays and anniversaries show on 28 February in non-leap years.
4. The church's time zone comes from `tenants.timezone` when set, else `Africa/Johannesburg` (CLAUDE.md rule 5). **No screen sets `tenants.timezone` yet.**
5. Not added to the CSV member import. Anniversaries will arrive with the Phase 5 migration mapping instead.

## Gotchas

- The page reads the whole member list for the caller's scope on load, like the roster. Fine at 380 members per region; worth a query by month if a tenant ever has many thousands.
- Branch and cell scoping here is UI-only, exactly like the roster. ADR-001 revision 2 replaces it with rules-enforced sector scoping in Phase 1. Do not treat this page as a security boundary.
- The anniversary field only appears on the primary member's form section. A spouse added in the same form inherits the primary's date; there is no separate spouse anniversary input, deliberately.
- Existing married members have no anniversary until someone edits their record. The page shows a count of linked spouses with no date, to prompt Anita.

## What Sifiso needs to do to make this live

Nothing beyond the normal app deploy. No functions, rules or index changes.

## Verification done

- `tests/unit`: 19 of 19 pass (`cd tests/unit && npm install && npm test`). Covers date formats, the Friday window on Wednesday, Friday and Saturday, a window across the new year, 29 February in leap and non-leap years, suspended members, linked and unlinked couples, mismatched spouse dates, sorting, reversed and oversized ranges, the email text, and time zone handling.
- `npx tsc --noEmit` clean in the root.
- `next build` succeeds (99 of 99 pages, `/dashboard/celebrations` included). It needs Firebase env vars to collect page data; I ran it with a locally generated throwaway admin key and placeholder web config. Nothing was sent anywhere.
- Rules tests not rerun; no rules changed.

## What I did NOT verify

- **Not clicked through in a browser.** No Firebase project exists for jcoc-hub yet, so the page has never loaded real or seeded data. The roster form changes were checked by type and build only.
- The clipboard copy relies on `navigator.clipboard`, which needs HTTPS or localhost. Not tested on a phone.
- ESLint was not run: the repo has no ESLint config (inherited from upstream).
- Whether Anita wants the anniversary field required for married members. It is optional; open question in `docs/04_CLIENT_REQUIREMENTS_CHECKLIST.md` ("Confirmation that anniversary date should be captured").

## Open items for next session

1. Click through on a seeded emulator or the JCOC Firebase project once it exists.
2. Quick win 2: member self-editable field settings with the approval queue (ADR-007).
3. Decide A4 (multi-region admins) before Phase 1.
4. Port to upstream Kereke Hub when there is a reason: `lib/celebrations.ts` and the page lift cleanly; the roster edits are small and additive.
