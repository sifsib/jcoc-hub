# Handover, Phase 3 life phases

**Date:** 2026-10-23
**Phase:** Plan v2 Phase 3 (life phases). ADR-011, accepted by Sifiso with all recommendations.
**Session:** 2 (continued)
**Branch:** `feature/p3-life-phases`, cut from `feature/p2-church-structure` at de74217. Not pushed. Phase 2 must merge first.

## Context correction, read this first

- All checks ran on **Node 20.20.2** from `~/tools`; the new Node LTS is still not installed on this Mac.
- The click-through needed the **Cloud Functions emulator** (the phases are worked out by a trigger). Start it with `tests/rules/node_modules/.bin/firebase emulators:start --only auth,firestore,functions --project demo-jcoc` after `cd functions && npm run build`, then seed. Without the functions emulator, members show no phases.
- The **rules tests cannot run while the click-through emulators are up** (same port). Stop them first.
- ADR-011 revises ADR-003 in one place: children under 14 now have a school grade.

## What I built

1. **The rules engine** (`functions/src/lifePhasesEngine.ts`): JCOC's sheet as one pure function. Children's bands (Baby to Campus Student) by age this year and worked-out grade; adult phases from marital status and wedding year; parent phases from the household's member and non-member children; Empty Nester; manual-only Single Mom and Single Dad. The app uses the same file through `lib/lifePhases.ts`, so the form, the server and the tests never disagree.
2. **Saved on every change.** `onMemberWrittenLifePhases` and `onHouseholdWrittenLifePhases` recalculate a person and their whole household when any input changes, and write only what changed.
3. **Manual control.** On a member's record (Membership Management, Edit), a Life Phases panel shows the phases, lets an admin untick an automatic one or add one by hand, set a child's grade ("a year ahead", "repeated"), and set the marriage type. These choices survive every recalculation.
4. **The 1 January review.** A daily job (`lifePhaseNewYear`) prepares each region's changes when its year moves on; nothing changes until a region owner or admin approves on the new **Life Phases** page. People can be left out (they keep today's phases as hand-set choices), the list can be prepared early, and an approval can be undone for 30 days. Until approval, saves keep using last year's rules (the region's `lifePhaseYear`).
5. **Filters** on the roster and the Network page: tick several phases and choose "has all of" or "has any of". The Network export includes life phases.

## Data shapes introduced

- `members`: `lifePhases`, `lifePhasesAuto`, `lifePhasesYear` (server only); `lifePhasesAdded`, `lifePhasesRemoved`, `gradeAdjust` (whole number, −3 to 3), `marriageType` (`civil`, `customary`, `religious` or empty). The four admin inputs are audited and must be stamped.
- `tenants.lifePhaseYear`: the year phases are worked out for (server only).
- `lifePhaseReviews/{tenantId}_{year}`: `status` (`awaiting_review`, `approved`, `undone`), `changes` (name, before, after), `applied` (what each person had before, for undo), `leftOut`, `previousYear`, `undoUntil`, who prepared/approved/undid and when.
- `admin_audit` gains `life_phase_review_approve` and `life_phase_review_undo`.

## Decisions taken while building

1. A region with no approved year yet is pinned to the current year by the daily job, so a region set up mid-year is not rolled back.
2. Leaving someone out of a review keeps their current phases by turning them into hand-set choices, so they also survive later saves. The admin can change those choices on the record.
3. Approval works the changes out again at that moment, so edits made after preparing are included.
4. Review documents that do not exist yet can be checked by owners and admins (a missing document holds nothing), which the review page needs.

## Gotchas

- **Phases appear a few seconds after saving**, because the server works them out. The panel says so.
- **Married members without a wedding date get no married phase.** That is the plan's rule; existing married members need their wedding date entered (it is the same `anniversaryDate` field as the birthday pull).
- The scheduled job needs the Pub/Sub emulator to run locally; the review page's "Prepare it now" does the same work on demand.
- The rules engine is written for JCOC. Porting to another church means writing its own rules in the same shape.

## What Sifiso needs to do to make this live

After Phase 2 is live and this branch is merged:
1. `firebase deploy --only firestore:rules --project jcoc-hub`
2. `firebase deploy --only functions:onMemberWrittenLifePhases,functions:onHouseholdWrittenLifePhases,functions:lifePhaseNewYear --project jcoc-hub`
3. Deploy the app.
4. Existing members get their phases the next time each is saved. A one-off script to work them all out at once is still to write (open item 2).

## Verification done (Node 20.20.2)

- **Unit: 120 of 120 pass**, 34 of them new for life phases, written before the engine and failing first. They cover 31 December against 1 January, children born on 1 January and 31 December, turning 14 in Grade 7, Grade 8 turning 13, started early and repeated, Teen to Campus Student to Young Single, families with several children, no wedding date, manual add and remove, the time zone, the review list and the old marital statuses.
- **Rules: 184 of 184 pass**, 14 new, written before the rules (9 failed first).
- `npx tsc --noEmit` clean in the root and `functions/`; **`next build` succeeds**.
- **Clicked through on the emulators, with the functions emulator running and invented people:**
  - After seeding, the trigger worked out everyone correctly (checked in the database): Neo, turning 13, is Child, Pre-teen, Scholar, Kidz Zone; his parents are Mature Married and Parents of Kids <>10 (Neo plus a 6-year-old non-member child); Kayla, 24, is Young Single; married members without a wedding date have no married phase.
  - **Life Phases page** (Soweto owner): "Prepare it now" listed exactly four 2027 changes (Neo to Teen and Scholar, his parents gain Teen Parent, Kayla to Mature Single). Leaving Kayla out and approving moved three people on; Kayla kept Young Single through hand-set choices, and the trigger did not undo it. `member_audit` named the owner as approver. "Undo" put everyone back, including Kayla's choices, and returned the region to 2026.
  - **Member record:** unticking Kayla's Young Single and adding Single Mom saved, and the trigger updated her phases to Single Mom only.
  - **Roster filter:** "has all of" Mature Married and Parents of Kids <>10 returned exactly Thabo and Lerato.
- **Fixed during the click-through:** the review page could not check for a review that did not exist yet (rule plus test added); the automatic-phase tick boxes had no accessible names.

## What I did NOT verify

- The daily `lifePhaseNewYear` job itself (needs the Pub/Sub emulator). Its logic is the same `reviewChanges` used by "Prepare it now".
- The grade adjustment and marriage type controls were not clicked; both are covered by rules tests.
- The Network page life phase filter was not clicked (same logic as the roster's).
- Undo after 30 days being refused; a network owner approving another region's review.
- Phone-sized screens. Real data.

## Open items for next session

1. Phase 4 (visitor register and children's check-in), ADR-012, on `feature/p4-visitors-kids` from this branch.
2. A one-off backfill to work out phases for all existing members at go-live (or after the import).
3. Anita to confirm V1 to V5 in `docs/06_OPEN_QUESTIONS.md`.
