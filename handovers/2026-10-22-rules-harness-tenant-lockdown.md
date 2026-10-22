# Handover, rules test harness and tenant lockdown

**Date:** 2026-10-22
**Phase:** 0. Discovery and setup
**Session:** 1 on the new machine
**Branch:** `feature/p0-rules-harness-tenant-lockdown`

## Context correction, read this first

The recovery handover said setup was complete. It was not. On a fresh clone:

- `.firebaserc` still pointed `default` at **`kereke-hub`, the live production project**. Any `firebase deploy` from this repo would have pushed JCOC rules and functions onto every live Kereke Hub church. Fixed on this branch (see below), but the JCOC Firebase project itself still does not exist.
- There was no `tests/rules/` harness, no `handovers/` folder and no `lib/whiteLabel.ts`, although CLAUDE.md depends on all three.
- The `upstream` remote does not travel with a clone. Re-added locally, push disabled.

Separately, the meeting transcript supplied this session is the same 59-minute discovery call the docs were built from. It does **not** answer open question A.

## What I built

1. **Rules test harness** in `tests/rules/`, a standalone package (like `functions/`) so the root lockfile is untouched and the harness ports straight back to Kereke Hub. It runs the real `firestore.rules` in the Firestore emulator under a `demo-jcoc-rules` project id, so it can never reach a real project.
2. **Negative tests first**, in `tests/rules/tenants.test.ts`, for:
   - creating a tenant (stranger, existing owner, unauthenticated, and the `accountType: "internal"` escalation)
   - owners and admins changing any of 17 server-only tenant fields, one test each, plus smuggling one in alongside an allowed field
   - cross-tenant reads and writes of tenant and member documents
   - escalation through `users` docs, including the second hole below
   Positive tests make sure Branding, Church Profile, Configure Lists and team role changes still work.
3. **Rule fixes** in `firestore.rules`:
   - `tenants` create is now `if false`. Only `/api/signup` creates tenants, through the Admin SDK.
   - `tenants` update by owner or admin now rejects changes to server-only fields (`touchesServerOnlyTenantFields()`: account type, plan, status, tier, limits, billing dates and state, slug, signup and login stamps, and the Phase 1 `orgId`/`orgRole`). Super admins are unaffected.
   - `users` update through the owner "manage team" path now keeps `tenantId` unchanged and refuses `super_admin` in `role` or `roles`.

## Files added and changed

**New:**
- `tests/rules/package.json` — harness dependencies and the `npm test` script (`firebase emulators:exec`).
- `tests/rules/vitest.config.ts` — runs test files serially, because they share one emulator.
- `tests/rules/setup.ts` — loads the rules, seeds two tenants and six users in different roles.
- `tests/rules/tenants.test.ts` — the tests above.
- `handovers/2026-10-22-rules-harness-tenant-lockdown.md` — this file.

**Changed:**
- `firestore.rules` — tenant create closed, server-only tenant fields, owner user-management path constrained.
- `.firebaserc` — `default` and `jcoc` now point at `jcoc-hub`, not `kereke-hub`.
- `firebase.json` — Firestore emulator config (port 8080, UI off, single project).
- `tsconfig.json` — `tests` excluded so the Next.js build does not type-check the harness.
- `CLAUDE.md` — removed the duplicated ADR-009 sentence and added how to run the rules tests.

## Decisions taken

1. The harness is a separate package rather than root dev dependencies. Reason: no Node on this machine to regenerate `package-lock.json`, and a separate package also ports cleanly. Taken by me, not yet confirmed by Sifiso.
2. Server-only tenant fields are a deny-list, not an allow-list. An allow-list is stricter but would break any dashboard field not yet catalogued. Revisit once Phase 1 settles the tenant shape.
3. `lib/whiteLabel.ts` was **not** created. It is Phase 5 scope (B9, 4 days) and an empty file with no readers would be misleading. CLAUDE.md rule 7 still applies to any new code.

## Gotchas

- **The second hole was worse than the first.** In the base rules, the owner "manage team" branch of `users` update (`sameTenant(resource) && canManageUsers()`) put no limit on the new document. Any church owner could set their own `role` to `super_admin`, or move any account into another tenant. That is fixed here, but it is still live in upstream Kereke Hub.
- **`touchesServerOnlyTenantFields()` uses `diff().affectedKeys()`,** so writing a protected field with its *current* value is allowed. That is intended.
- **Existing data is not cleaned up.** If anyone already exploited the open create rule on the live Kereke Hub project, those tenant docs are still there. See "What Sifiso needs to do".
- `firebase-tools` in the harness is pinned to `^14`, which needs **Java 21** for the emulator.

## What Sifiso needs to do to make this live

1. Install Node 20 (`.nvmrc`) and Java 21.
2. Run the rules tests:
   ```bash
   cd tests/rules && npm install && npm test
   ```
   Commit the generated `tests/rules/package-lock.json`.
3. Run the type checks from CLAUDE.md, root and `functions/`.
4. Create the JCOC Firebase project with the id `jcoc-hub` (SETUP.md Step 3). Until it exists, `firebase deploy` from this repo will fail, which is the safe failure.
5. **Upstream Kereke Hub, separately and urgently:** cherry-pick the `firestore.rules` change into kereke-hub and deploy it to the live project. Then check the live `tenants` collection for any `accountType: "internal"` tenant you did not create yourself, and any `users` doc with `role: "super_admin"` that is not yours. The second check matters because the owner path allowed self-promotion.

## Verification done

- All edited JSON files parse.
- Checked every client-side write to `tenants/{id}` (branding, profile, roster lists, super-admin signups). None writes a newly protected field. Only the super-admin signups page writes billing fields, and super admins pass.
- Checked the team page's writes to `users`: `role`, `assignedBranch`, `assignedCellRegion`, `visitorMinistry`. None changes `tenantId` or grants `super_admin`.

## What I did NOT verify

- **The tests have never been run.** This machine has no Node, npm, Java or Firebase CLI. They are written against the documented `@firebase/rules-unit-testing` v4 API and have not been executed. Expect at least one fix on first run.
- The `@firebase/rules-unit-testing` ^4 / `firebase` ^11 / `firebase-tools` ^14 versions are not confirmed compatible with each other.
- `npx tsc --noEmit` was not run, root or functions. The only root change that affects compilation is the `tests` exclude.
- The rules file was not compiled. A syntax error would surface on the first test run or deploy.
- No app screen was clicked through against the new rules.

## Open items for next session

1. Run the tests and fix anything the first run surfaces.
2. Port the rules fix to upstream Kereke Hub and run the live-data checks above.
3. Remaining inherited security issues, not touched here:
   - Users can still set their own `visitorMinistry`, `assignedBranch`, `assignedCellRegion` and `memberId`. The self-update path only protects `role`, `roles` and `tenantId`.
   - Brevo, BulkSMS and PayFast secrets sit in plain text on the tenant doc, which any signed-in user of that tenant can read, including congregation members.
   - `/api/visitors/send-sms` has no role check.
   - The public QR check-in page lists every member in the church without a login.
   - `branch_admin` scoping is UI-only. Rules treat it as tenant-wide. ADR-001's campus work should replace it.
4. Open question A is still with Anita. Phase 1 cannot start until it is answered.
5. Make `jcoc-hub` private again. It was made public temporarily for this session.
