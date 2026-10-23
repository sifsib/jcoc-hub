# Handover, Phase 4 visitor register and children's check-in

**Date:** 2026-10-23
**Phase:** Plan v2 Phase 4. ADR-012, accepted by Sifiso with all recommendations (safeguarding points flagged for Anita).
**Session:** 2 (continued)
**Branch:** `feature/p4-visitors-kids`, cut from `feature/p3-life-phases` at 4779b5f. Not pushed. Phases 2 and 3 must merge first.

## Context correction, read this first

- All checks ran on **Node 20.20.2** from `~/tools`; the new Node LTS is still not installed on this Mac.
- Check-in and check-out work **only through server routes** (`/api/kids/*`). Teachers have no direct Firestore access to members, visitors or check-in records; that is deliberate and tested.
- In the in-app browser, the emulator connection still builds up after several page changes; restart the dev server when pages stop loading (see the Phase 2 handover).

## What I built

1. **Visitor register.** A visitor document is now a person, with visits underneath (`visitors/{id}/visits`, one per date, never changed). Capturing a visitor whose cell number already exists in the region adds a visit instead of a duplicate and says "Welcome back, … 2nd visit". A new follow-up starts only for a first visit, or a return after 180 days. The visitor pop-up shows visit history and the visitor's children, and children can be added there.
2. **Children's classes** (Children's Ministry page): name, which life phases belong (for the suggested class), capacity, teachers, supervisors. Archived, never deleted. Plus the check-in history, with overrides highlighted.
3. **New role "Children's teacher"**, given on the Team page. A teacher sees only Children's Check-in and only the classes they teach.
4. **Check-in tablet page** (Children's Check-in): pick a class, see today's children with care-note warnings. Find a family by either parent's cell number or name, tick siblings, adjust classes, name other adults allowed to collect, check in. A 4-digit code shows on screen and goes by SMS when the church has BulkSMS. "New visitor child" captures a visiting child and parent at the door (into the visitor register, never the member list).
5. **Check-out**: the dropping-off adult or a named adult, with the code. Anyone else, a lost code, or a locked code (5 wrong tries) needs a supervisor (region owner/admin or a class supervisor) with a reason; the override is shown on the record, in the history and in `admin_audit`.
6. **Care notes** (allergies, medical): a separate `memberCareNotes` record per child, edited on the member's record by owners, admins and member managers, only where special-information consent is recorded. Copied onto the check-in record so the class teacher sees it for that session.

## Data shapes introduced

- `visitors`: `visitCount`, `firstVisitDate`, `lastVisitDate`, `children: [{ id, firstName, lastName, dob, dobApprox?, allergies? }]`, `source` (`kids_checkin` when created at the door). `visitors/{id}/visits/{YYYY-MM-DD}`: `tenantId`, `serviceDate`, `reason`, `capturedBy`, `source?`.
- `childClasses/{id}`: `tenantId`, `name`, `phases`, `capacity`, `teacherUids`, `supervisorUids`, `archived`.
- `childCheckins/{id}`: `tenantId`, `classId`, `className`, `serviceDate`, `groupId`, `child { key, kind, name, age }`, `guardian { name, phone }`, `allowedCollectors`, `careNotes`, `status` (`in`/`out`), `checkedInAt/By/ByName`, `checkedOutAt/By/ByName`, `collectedBy { kind, name }`, `override { byUid, byName, reason } | null`.
- `childCheckinSecrets/{groupId}`: `tenantId`, `codeHash` (sha256 of group id and code), `failedAttempts`. Never readable from a browser.
- `memberCareNotes/{memberId}`: `tenantId`, `notes`, `updatedAt`, `updatedBy`.
- Region role `children_teacher`. Indexes: `childCheckins` (tenantId, serviceDate, status), (tenantId, serviceDate, classId), (tenantId, serviceDate desc); `visitors` (tenantId, phone).

## Decisions taken while building

1. Children's ministry covers children up to the year they turn 13 (end of Kidz Zone); teens are not offered for check-in.
2. The suggested class follows the child's most specific phase (a pre-teen goes to a Pre-teens class if one exists, else Scholars), not the order classes are listed.
3. A family is found by either parent's number or name, not only the primary member's (found and fixed in the click-through).
4. Check-in records keep a copy of the care note at the time, so the teacher sees it; the note itself stays in `memberCareNotes`.

## Gotchas

- `matchesSearch` treats input of only digits (and spaces or +) as a phone number; anything else as a name. Three characters minimum.
- Visitor children captured with an age get `dob` set to 1 January of the birth year (`dobApprox: true`); ages then stay right in later years.
- BulkSMS credentials still sit on the tenant document (inherited issue, readable by the region's users). The check-in route reads them on the server only.

## What Sifiso needs to do to make this live

After Phases 2 and 3:
1. `firebase deploy --only firestore:rules,firestore:indexes --project jcoc-hub`
2. Deploy the app.
3. In each region, an admin sets up classes (Children's Ministry) and gives teachers the "Children's teacher" role (Team Members).

## Verification done (Node 20.20.2)

- **Unit: 138 of 138 pass**, 18 new for this phase, written before the logic (returning visitors, visitor children, class suggestion including order, codes, who may collect, overrides, time zone, family search including the other parent, building the family list).
- **Rules: 202 of 202 pass**, 18 new. Against the previous rules, the 5 "allowed" cases failed and the "denied" cases passed (new collections are closed by default; these tests guard against loosening later).
- `npx tsc --noEmit` clean in the root and `functions/`; **`next build` succeeds**.
- **Clicked through on the emulators with invented people:**
  - Teacher: menu shows only Children's Check-in; class menu shows only her two classes.
  - Searching Lerato's cell number found the Dlamini family (after the fix), with Neo (13) and their non-member daughter Ayo (6). Checked both in (Neo moved to Scholars), naming Lerato as allowed to collect. Code shown; "not sent by SMS" because the test church has no BulkSMS. Stored: one code group, hash only, Neo's peanut allergy on his record, his member record untouched.
  - Lerato collecting Ayo with a wrong code: refused. With the right code: released, "Collected by Lerato Dlamini".
  - Called the routes directly as the teacher: releasing Neo to "someone else" with a reason was refused (not a supervisor); another class and "all classes" were refused; five wrong codes locked the code, and the right code was then refused.
  - Owner: released Neo to his aunt with a supervisor override and reason; the record and the Children's Ministry history show the override and who made it.
  - Visitors page: capturing Sam Mokoena again with his number said "Welcome back, Sam Mokoena: 2nd visit"; the database has one visitor with two visits and no member was created.
  - "New visitor child" route created a visitor family with the child suggested for Pre-School; an age of 25 was refused.
- **Fixed during the click-through:** family search by the other parent; accessible names on the child tick boxes and the check-out choices.

## What I did NOT verify

- Not clicked: adding or editing a class through the form, capacity being reached, the visitor pop-up's visit history and "Add a child", the care notes panel on a member's record, the "New visitor child" form itself (the route was called directly), a real SMS.
- Phone and tablet screen sizes (the page is built for tablets but was viewed in a small desktop pane).
- Real data.

## Open items for next session

1. Phase 5 (event registration), ADR-013, on `feature/p5-event-registration` from this branch.
2. Anita to confirm W1 to W6 in `docs/06_OPEN_QUESTIONS.md`, W1 especially.
3. Move BulkSMS credentials off the tenant document (inherited security issue, also upstream).
