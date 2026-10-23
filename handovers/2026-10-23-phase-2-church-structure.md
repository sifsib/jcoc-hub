# Handover, Phase 2 church structure and region access

**Date:** 2026-10-23
**Phase:** Plan v2 Phase 2 (church structure and admin roles). ADR-010, accepted by Sifiso with all six recommendations.
**Session:** 2 (continued)
**Branch:** `feature/p2-church-structure`, cut from `docs/jcoc-build-plan` at ee456bf. Not pushed.

## Context correction, read this first

- **All checks ran on Node 20.20.2** from `~/tools`. The new Node LTS is still not installed on this Mac.
- **The in-app browser pane only lets a page reach its own port.** The Firestore emulator on 8080 was unreachable from the page, so the click-through needed an emulator-only change: in emulator mode, the browser's Firestore traffic now goes through the app's own port (a rewrite in `next.config.ts`) using long polling (`lib/firebase.ts`). Both are switched on only by `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=1`, which production never sets. It works but is slow and sometimes stalls; the browser tools then time out waiting for the page to finish loading, although the page itself is fine.
- `.claude/launch.json` gained two entries (`firestore-emulator`, `auth-emulator`) while trying to reach the emulators. They are harmless and can stay or go.

## What I built

1. **Church structure.** Sectors and family groups are now records with ids, scoped to a region. Region owners and admins add, rename, archive and restore them on a new **Church Structure** page. Nothing is deleted. Network owners also add, rename and archive **regions** there, through `/api/regions`. Members store `sectorId` and `familyGroupId`, so renaming never orphans anyone.
2. **Multi-region leaders.** A user's regions sit in `tenantAccess` (with `tenantIds` for queries). Only the server writes them, through `/api/region-access` and `/api/invite-user`. A **region menu** at the top switches the active region; the rules accept a switch only to a region held, with exactly the role held there. Inviting an email that already has an account in the network adds the region to it.
3. **Network roles.** `network_owner` (Anita, Baba D) reads and edits members in every region of their network, switches into any region as admin, and gets a **Network** page: every member across regions, filtered by church, region, sector and family group, with CSV export. `network_viewer` reads only.
4. **Sector and family group leaders**, enforced in the rules: they read only their own people and mark attendance only for them. Their roster, attendance, report and birthdays pages are scoped and read-only.
5. **Member change history.** A Cloud Function (`onMemberUpdatedAudit`) writes `member_audit` entries for status, membership, roles, marital status, life phases, sector and family group changes. The rules make every browser write to those fields stamp who made it.
6. **Team page rewritten** around regions: role changes, removal from one region, adding leaders, promoting members.
7. **Branch and cell strings replaced** in the roster, member form, attendance capture and report, celebrations, church settings and the join form. The public join form no longer lists any structure; admins place people after approval.

## Files added and changed

**New:** `lib/regionAccess.ts`, `lib/churchStructure.ts`, `lib/memberAuditFields.ts`, `lib/useChurchStructure.ts`, `lib/whiteLabel.ts` (structure labels only), `app/lib/serverCaller.ts`, `app/api/region-access/route.ts`, `app/api/regions/route.ts`, `app/dashboard/structure/page.tsx`, `app/dashboard/network/page.tsx`, `app/dashboard/RegionSwitcher.tsx`, `functions/src/memberAudit.ts`, `functions/src/memberAuditFormat.ts`, `tests/rules/regionAccess.test.ts`, `tests/rules/churchStructure.test.ts`, `tests/unit/regionAccess.test.ts`, `tests/unit/churchStructure.test.ts`, `tests/unit/memberAudit.test.ts`.

**Changed:** `firestore.rules`, `tests/rules/setup.ts`, `tests/rules/tenants.test.ts` (one positive test became negative: owners can no longer change roles from the browser), `lib/useAppUser.ts`, `lib/firebase.ts`, `next.config.ts`, `app/dashboard/layout.tsx`, `app/dashboard/team/page.tsx` (rewritten), `app/dashboard/roster/page.tsx`, `app/dashboard/attendance/page.tsx`, `app/dashboard/attendance/report/page.tsx`, `app/dashboard/celebrations/page.tsx`, `app/dashboard/church-settings/page.tsx`, `app/join/[tenantId]/page.tsx`, `app/api/tenant-join-info/[tenantId]/route.ts`, `app/api/invite-user/route.ts`, `app/api/remove-user/route.ts`, `app/api/communications/email/route.ts`, `functions/src/index.ts`, `scripts/seed-emulator.mjs`, docs 05, 06, 07.

## Data shapes introduced

- `organizations/{orgId}`: `name`. `churches/{id}`: `orgId`, `name`, `archived`. Server-written only.
- `tenants/{id}` gains `orgId`, `churchId`, `orgRole: "region"`, `archived`, `archivedAt`, `archivedBy` (all server-only in the rules). New regions get generated ids and no `tier`.
- `sectors/{id}`: `tenantId`, `name`, `archived`, `archivedAt`, `archivedBy`, `createdAt`, `createdBy`, `updatedAt`, `updatedBy`.
- `familyGroups/{id}`: as sectors, plus `sectorId`, optional `leaderMemberId`.
- `members` gain `sectorId`, `familyGroupId`; audited writes carry `updatedBy` (uid) and `updatedAt`.
- `attendance` records gain `sectorId`, `familyGroupId` copied from the person.
- `users` gain `tenantAccess { [tenantId]: { role, roles?, sectorId?, familyGroupId? } }`, `tenantIds`, `orgId`, `networkRole`, `sectorId`, `familyGroupId`, `accessUpdatedAt`, `accessUpdatedBy`.
- `member_audit/{auto}`: `tenantId`, `memberId`, `memberName`, `field`, `from`, `to`, `changedByUid` (or `system`), `changedAt`.
- `admin_audit` gains `region_access_grant`, `region_access_revoke`, `region_create`, `region_rename`, `region_archive`, `region_restore`.

## Decisions taken while building

1. Audited member fields must be stamped by the browser (`updatedBy` = uid, `updatedAt` = server time), enforced in rules. Existing roster writes used the email address; they now use the uid. Nothing read `updatedBy` before.
2. Region owners can give any role except owner; region admins give roles below admin; network owners give anything. Nobody changes their own access.
3. Removing someone's active region moves them to their next region (alphabetically), or to no region. The rules also treat a region missing from the list as no region, so access ends at once either way.
4. "Deactivate" (blocks sign-in completely) is only offered for people who hold one region and no network role; otherwise "Remove from this region".
5. Sector leaders' attendance reads are limited to records stamped with their sector, because records hold absence reasons.
6. The public join form no longer offers branch or sector choices.

## Gotchas

- **Leader queries must carry the same filter as the rules** (`where("sectorId", "==", …)` or `familyGroupId`), or Firestore refuses the whole query.
- **Any new browser write to an audited member field must stamp `updatedBy` and `updatedAt: serverTimestamp()`** or it will be denied. The list is in `lib/memberAuditFields.ts` and must match the rules and `functions/src/memberAuditFormat.ts` (a unit test checks the two TypeScript lists).
- The user document's `tenantId` and `role` are still "the active region and role", so every older rule works unchanged. Do not add a second notion of active region.
- Switching region writes the user's own document, then reloads the page so `useAppUser()`'s cache is replaced.
- The pending-approvals badge logs one permission error at the moment of switching or logging out, while it still listens to the old region. Harmless.
- `tests/rules/tenants.test.ts` changed one positive test to negative on purpose.

## What Sifiso needs to do to make this live

When the `jcoc-hub` Firebase project exists, after merging:
1. `firebase deploy --only firestore:rules,firestore:indexes --project jcoc-hub`
2. `firebase deploy --only functions:onMemberUpdatedAudit --project jcoc-hub`
3. Deploy the app.
4. Create the organisation and churches, then set `orgId` and `networkRole: "network_owner"` on Anita's and Baba D's user documents. There is no screen for this yet (open question U1). Regions can then be added from Church Structure.

## Verification done (Node 20.20.2)

- **Rules: 169 of 169 pass**, 71 of them new for this phase, mostly negative. Written before the rules and run first against the old rules (32 failed, as expected). Two rules were deliberately weakened afterwards to prove the tests catch it (the cross-org check and the removed-region check); the right tests failed, and the rules were restored.
- **Unit: 86 of 86 pass** (52 new).
- `npx tsc --noEmit` clean in the root, `functions/` and `tests/rules/`.
- **`next build` succeeds** with offline emulator settings.
- **Clicked through on the emulators with invented data:**
  - Network owner: region menu lists all three regions; Network page shows 11 active members across regions (the suspended one hidden) and filters correctly down to one family group; Church Structure adds a sector, refuses a duplicate name, adds a family group, archives a sector (its groups kept), and adds a new region; Team page lists the region's people with their other regions; switching into the new region works; adding an existing leader's email adds the region to them.
  - Two-region leader: sees exactly their three regions and no Network link; switching to Northwest shows only Northwest's two members; editing a member's family group saves, and the record holds the ids and `updatedBy` = their uid (checked in the emulator database).
  - Sector leader: menu reduced to roster, birthdays, attendance, report and support; roster shows "Viewing your sector: North" and only North's four active members, with no edit or add buttons.

## What I did NOT verify

- **Not clicked:** attendance capture and the attendance report as a leader; the family group leader's views; promoting a congregation member; "Remove from this region" and "Deactivate"; renaming a region; restoring an archived item; the CSV export (download); member import matching of sector and group names.
- **The `onMemberUpdatedAudit` function was not run** (the functions emulator was not started). Its logic is unit-tested; the trigger wrapper is not.
- The emulator-only Firestore proxy (`next.config.ts`, `lib/firebase.ts`) was only tried in the in-app browser pane, not in a normal browser.
- Not tested on a phone or narrow screen.
- Nothing deployed; no real data used.

## Open items for next session

1. Install the Node LTS and rerun the checks.
2. Click through the unverified items above (attendance as a leader, family group leader, promote, remove, deactivate).
3. Write the port-back migration script around `planBranchCellMigration` (logic and tests exist).
4. Open questions U1 to U4 in `docs/06_OPEN_QUESTIONS.md`, plus A1, A3 and A5, which still shape sister churches and `church_admin`.
5. The plan's Phase 3 (life phases) can start once Sifiso is happy with this branch; it builds on `member_audit` and the stamped writes.
