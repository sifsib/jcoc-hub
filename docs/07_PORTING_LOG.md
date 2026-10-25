# Porting Log

The purpose of this file is to stop 69 days of reusable work getting stranded in a fork.

This build is a hard fork of Kereke Hub. Forks diverge. The mitigation is not to fight that, it is to know precisely which pieces are worth bringing back, and to have built those pieces so they *can* be brought back.

**Fill this in during the build.** Not at the end. The end never comes, and by then nobody remembers which of forty commits touched the roll-over engine.

---

## The five features that must stay portable

These were scoped for JCOC but are product features. Other South African churches would pay for every one. AFM Gauteng has already asked for the first.

| Feature | Phase | Days | Why it is product, not client-specific |
|---|---|---|---|
| Organisation, region and campus layer | 1 | 21 | Any denomination or multi-site church. AFM Gauteng asked for this by name |
| Life phases and annual roll-over | 2 | 14 | Any church running life-stage ministry. The manual version is a week of somebody's year |
| Event registration with proof of payment | 3 | 17 | The strongest of the five. SA churches run on EFT and POP screenshots in WhatsApp groups. No international CHMS handles it because American churches do not have this problem |
| Children's check-in and check-out | 4 | 8 | Every church with a kids ministry. Safeguarding is not optional anywhere |
| Communications segment builder | 4 | 5 | Every church above about a hundred people |

**Not portable, and that is fine:** discovery, JCOC data migration, their training material, white-label configuration for their brand. Roughly 17 days.

---

## What "portable" means in practice

A feature is portable if it can be lifted as a folder, a rules block, and a migration. Concretely:

- Its pages live under their own route folder rather than being bolted into existing pages.
- Its Firestore collections are new, not extra fields smeared across `members`. Where a new field on an existing collection is unavoidable, it is additive and optional, never a rename.
- Its rules sit in a clearly delimited block in `firestore.rules`, with a comment marking the start and end.
- It reads tenant and role through `useAppUser()` rather than reimplementing them.
- Anything JCOC-specific in it comes from config, not from a hardcoded string.
- Pure logic sits in its own file, separate from the framework wrapper, so it can be tested in isolation. `functions/src/summaryFormat.ts` in the base repo is the pattern.

If a feature fails two or more of those, it will be rebuilt from scratch rather than ported, and the fork will have cost double.

---

## Log

One row per merged piece of work. Add the row when the branch merges, while it is still fresh.

| Date | Feature | Branch or commit | Portable | Files and collections touched | Notes for the port back |
|---|---|---|---|---|---|
| 2026-10-22 | Birthday and anniversary pull (quick win, not one of the five) | `feature/qw-birthday-anniversary-pull` | yes | `lib/celebrations.ts`, `app/dashboard/celebrations/page.tsx`, `tests/unit/`, small additive edits to `app/dashboard/roster/page.tsx` and `app/dashboard/layout.tsx`; field `members.anniversaryDate` | Lifts as is. The Friday default is a page constant; make it a setting if another church sends its email on a different day. Not merged yet, so this row is early |
| 2026-10-23 | Member self-service edits with approval (quick win, not one of the five) | `feature/qw-member-self-edit` | yes | `lib/memberSelfService.ts`, `app/dashboard/member-updates/`, `app/member/[slug]/profile/page.tsx` (rewritten), rules block `MEMBER SELF-SERVICE` plus the `tenants/{id}/settings` block, index on `member_change_requests`, `tests/rules/memberSelfService.test.ts`, `tests/unit/memberSelfService.test.ts` | **Port the rules first and urgently**: upstream still lets members write their own member record and has no settings rule. The feature itself lifts cleanly. Not merged yet, so this row is early |
| 2026-10-23 | Organisation layer, Phase 2 part 1: church structure, multi-region access, network roles (one of the five) | `feature/p2-church-structure` | partial | Rules blocks `CHURCH STRUCTURE (ADR-010)` and `REGION ACCESS AND NETWORK ROLES` helpers; `userTenantId()` and the `users`, `members`, `attendance`, `tenants` rules; collections `organizations`, `churches`, `sectors`, `familyGroups`, `member_audit`; users fields `tenantAccess`, `tenantIds`, `orgId`, `networkRole`, `sectorId`, `familyGroupId`; `lib/regionAccess.ts`, `lib/churchStructure.ts`, `lib/memberAuditFields.ts`, `lib/useChurchStructure.ts`, `lib/whiteLabel.ts`; `app/api/region-access`, `app/api/regions`, `app/lib/serverCaller.ts`; pages `structure`, `network`, `team` (rewritten), `RegionSwitcher`; roster, attendance, report, celebrations, join form, church settings switched from branch/cell strings to ids; `functions/src/memberAudit*.ts`; `tests/rules/churchStructure.test.ts`, `tests/rules/regionAccess.test.ts`, three unit test files | **Partial because** the roster, attendance pages and team page were edited in place rather than kept in their own folders, and team role changes now need `/api/region-access`. Port order: rules and tests first, then `lib/regionAccess.ts` and the two routes, then the migration (`planBranchCellMigration` in `lib/churchStructure.ts`, script not yet written), then the screens. Upstream also needs the email route fix (`/api/communications/email` used the caller's uid as the tenant) and the self-update hole fix (`assignedBranch`, `visitorMinistry`). Not merged yet, so this row is early |
| 2026-10-23 | Life phases and the 1 January review (one of the five) | `feature/p3-life-phases` | partial | `functions/src/lifePhasesEngine.ts` (the rules, shared with the app through `lib/lifePhases.ts`), `functions/src/lifePhases.ts` (save triggers, daily review job), `app/api/life-phases/review`, `app/dashboard/life-phases`, `app/dashboard/roster/LifePhasePanel.tsx`; roster and Network page filters; rules for `lifePhaseReviews` and the server-only phase fields; member fields `lifePhases`, `lifePhasesAuto`, `lifePhasesAdded`, `lifePhasesRemoved`, `lifePhasesYear`, `gradeAdjust`, `marriageType`; `tenants.lifePhaseYear`; `tests/unit/lifePhases.test.ts`, `tests/rules/lifePhases.test.ts` | **Partial because** the rules engine is JCOC's sheet written as code, not a configurable rule set. Another church needs its own `householdPhases` rules (the triggers, review, overrides and filters port as they are). Depends on the Phase 2 stamped writes and `member_audit`. Not merged yet, so this row is early |
| 2026-10-23 | Children's check-in and check-out, and the visitor register (one of the five, plus B10) | `feature/p4-visitors-kids` | yes | `lib/kidsCheckin.ts`, `lib/visitorRegister.ts` (pure, unit tested), `app/lib/kidsServer.ts`, `app/api/kids/*` (families, visitor-child, checkin, session, checkout), `app/dashboard/kids/` (tablet page and settings), `app/dashboard/visitors/VisitorRegisterPanel.tsx`, `app/dashboard/roster/CareNotesPanel.tsx`; small edits to the visitors page capture, roster edit form and layout; rules block `VISITOR REGISTER AND CHILDREN'S CHECK-IN (ADR-012)`; collections `childClasses`, `childCheckins`, `childCheckinSecrets`, `memberCareNotes`, `visitors/{id}/visits`; visitor fields `visitCount`, `firstVisitDate`, `lastVisitDate`, `children`; region role `children_teacher`; 4 indexes; `tests/rules/kids.test.ts`, `tests/unit/kidsCheckin.test.ts` | Lifts cleanly: own folders, own collections, own rules block. Class suggestion uses the life phase ids from Phase 3; without Phase 3, map classes by age instead. Later the same day: classes take typed-in ages (`ageFrom`/`ageTo`) before life phases, only the drop-off adult may collect, and `functions/src/kidsRetention*.ts` removes records after 24 months; make the retention period a setting on port. The BulkSMS sender in `app/lib/kidsServer.ts` duplicates the one in `/api/visitors/send-sms`; unify on port. Not merged yet, so this row is early |
| 2026-10-23 | Event registration with proof of payment (one of the five) | `feature/p5-event-registration` | yes | `lib/eventRegistration.ts` (pure, unit tested), `app/lib/eventsServer.ts`, `app/api/events/*` (public, register, registration, registration/upload, registrations/file, registrations/review, checkin, message), `app/register/` (public form and status page), `app/dashboard/events/[eventId]/RegistrationSettings.tsx`, `registrations/` and `scan/` pages, `app/dashboard/payment-reviews/`; small edits to the event page (one tab) and layout (one nav item); rules block `EVENT REGISTRATION (ADR-013)` plus a verifier read on `events`; collections `registrations`, `registrationRateLimits`; event fields `registration`, `organiserUid`, `verifierUids`, `registrationSeq`; private Storage path `private/registrations/`; 3 indexes; `tests/rules/events.test.ts`, `tests/unit/eventRegistration.test.ts` | Lifts cleanly. Also port the security fixes in this branch: `event_rsvps` and `form_submissions` creates were open to anyone (`if true`) upstream, and members could read every RSVP in their tenant. Port the RSVP count fix too (`functions/src/rsvpCount.ts` and `rsvpCountTrigger.ts`, member events page loads its own RSVPs in one query): upstream's member RSVP counter never updates. Port the Storage rules too (`storage.rules`, `tests/rules/storage.test.ts`): upstream lets any signed-in user of a tenant, members included, read, replace and delete the tenant's logo, invoices and banners. Brevo credentials are read from the tenant document, as upstream does; move to a secret on port. Not merged yet, so this row is early |
| 2026-10-24 | White-label configuration (B9) | `feature/p5-event-registration` | yes | `lib/whiteLabel.ts` (BRAND, PLATFORM, ATTRIBUTION, `appUrl`, `appUrlText`, `brandCssVars`), `app/components/BrandMark.tsx`, `app/lib/brandIcon.tsx`, `app/icon.tsx`, `app/apple-icon.tsx`, `app/manifest.ts` (replaces `public/manifest.json`), brand palette mapped onto every `emerald-*` class in `app/globals.css`, about 40 files reading names, addresses and colours from the settings, `tests/unit/whiteLabel.test.ts`, `tests/unit/brandStrings.test.ts` (fails on any hard-coded platform name) | Ports as the white-label mechanism for any client: upstream gets `PLATFORM` = BRAND = Kereke Hub. Also ports a real fix: member portal, join form and give links were hard-wired to `hub.kerekehub.co.za`. Cloud Functions emails not yet converted (Y5) |
| 2026-10-25 | Member import fixes (Z1-Z4) | `feature/p5-event-registration` | yes | `lib/memberImport.ts` (`normalizeDob`, `isMarriedStatus`, `anniversaryFromRow`), `maritalCategory` exported from `functions/src/lifePhasesEngine.ts`, `app/dashboard/roster/page.tsx` import (wedding date, household placement, shared marital rule, column guide), `tests/unit/memberImport.test.ts`, test file `docs/testing/JCOC-Hub-Test-Members.xlsx` | All four are base product faults; port as-is. Z4 removes another client's project name from the Import screen, which matters most upstream |

**Portable column:** `yes`, `no`, or `partial`. If `partial`, say in the notes exactly what would need untangling, because that sentence is the entire value of this row.

---

## Known coupling to untangle before porting

Record anything that will make a port harder as you discover it. Better to write it down now than to rediscover it in a year.

| Item | Why it complicates a port |
|---|---|
| White-label config in `lib/whiteLabel.ts` | Kereke Hub has no equivalent yet. Porting a feature that reads from it needs either the config file ported first, or defaults added |
| `branch` string replaced by `sectorId`, `cellRegion` by `familyGroupId` (ADR-010; the `campuses` entity was never built) | Base Kereke Hub still uses the loose strings. Port the migration (`planBranchCellMigration`, plus a script to write it) before any screen that reads the ids |
| Team role changes go through `/api/region-access` | The rules no longer let an owner change a role from the browser. Porting the rules without the route breaks the base team page |
| Org-level tier resolution (ADR-009) | Base resolves tier per tenant. A ported feature checking org-level tier will need the base's `lib/tier.ts` updated first |

---

## When to actually port

Do not port continuously. That is just maintaining two repos with extra steps.

Port when there is a reason: a second multi-site client signs, or a Kereke Hub customer asks for one of these five. Then take the feature from this fork, using `git diff fork-point` to see the true extent of the change, and bring it across as its own piece of work with its own testing.

The porting log is what makes that a two-day job instead of a two-week archaeology exercise.
