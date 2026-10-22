# Handover, member self-service edits with approval (quick win 2)

**Date:** 2026-10-23
**Phase:** Quick win, runs ahead of Phase 1 per CLAUDE.md
**Session:** 1 (continued)
**Branch:** `feature/qw-member-self-edit`, cut from `feature/qw-birthday-anniversary-pull`

## Context correction, read this first

Building this turned up three inherited problems. All are fixed on this branch, and the first is **also live in upstream Kereke Hub**:

1. **Members could overwrite their own member record directly.** The `members` rule let a congregation member update their own document with any fields except `tenantId` and `authUid`. A member could change their own `status`, `branch`, `cellRegion`, `churchRole` or `membershipType` from the browser. That rule is gone. Proven by test: against the old rules, the two "member writes own record" tests fail.
2. **`tenants/{id}/settings/*` had no rule at all.** Church Settings saves its form layout to `tenants/{id}/settings/formConfig`, so every browser read and write of it was denied. Proven by test, and confirmed in the browser: Church Settings now saves.
3. **The member portal profile page corrupted addresses.** It saved `address` as one string, overwriting the roster's structured address, and read `dateOfBirth` while the rest of the app uses `dob`. The page is rewritten; old string addresses are read as line 1 rather than lost.

## What I built

Discovery call commitment 1 and ADR-007: members can ask to change a church-chosen subset of their own details, and nothing changes until an administrator approves.

- **Settings.** Dashboard > Member Updates (owner and admin) has "What members may update": cell number, email address, physical address. All three are on by default, which is what Anita asked for. A church can switch any of them off, including all three.
- **Member app.** My Profile shows only the allowed fields. "Send for approval" sends just the fields that actually changed, normalised (phones to 27…). While a request is waiting, the member sees "Waiting for approval" with the requested values and the form is locked. If the last request was rejected, they see the reason. Changing the email field does not change their sign-in email, and the page says so.
- **Review queue.** Dashboard > Member Updates (owner, admin, member manager, branch admin) lists waiting requests oldest first, before and after values side by side. If the member record changed after the request was made, a warning names the fields. **Approve** updates the member record and marks the request approved in one atomic batch. **Reject** takes an optional reason the member sees. "Recent decisions" shows the last 20 with who decided and when.
- **Audit trail.** Requests are never deleted, by anyone. The rules record the real reviewer and a server timestamp, and the requested changes can never be edited after submission.

## Files added and changed

**New:**
- `lib/memberSelfService.ts` — pure logic: the field catalogue, defaults, normalising, validation, the before/after diff, the approval patch, stale-field detection. No React or Firebase.
- `app/dashboard/member-updates/page.tsx` — review queue, recent decisions and settings.
- `tests/rules/memberSelfService.test.ts` — 36 rules tests, most of them negative.
- `tests/unit/memberSelfService.test.ts` — 15 unit tests.

**Changed:**
- `firestore.rules` — member self-update removed; new `tenants/{id}/settings/{docId}` block (only `formConfig` and `memberSelfService`); new delimited `MEMBER SELF-SERVICE` block for `member_change_requests`.
- `firestore.indexes.json` — `member_change_requests (tenantId ASC, reviewedAt DESC)` for "Recent decisions".
- `app/member/[slug]/profile/page.tsx` — rewritten to send change requests.
- `app/dashboard/layout.tsx` — "Member Updates" sidebar link.
- `tests/rules/setup.ts` — seed gains linked member logins in both tenants, a cell leader, and tenant A's settings.
- `scripts/seed-emulator.mjs` — a member-app login for Thabo, the `demo-region` portal slug, and one waiting request from Lerato.

## Data shapes introduced

`member_change_requests/{auto}`:
- `tenantId`, `memberId`, `requestedByUid`, `memberName`
- `status`: `pending` | `approved` | `rejected`
- `changes`: `{ phone?: {from, to}, email?: {from, to}, address?: {from: Address, to: Address} }`
- `createdAt` (server time, enforced)
- on review: `reviewedByUid` (must be the reviewer), `reviewedByName`, `reviewedAt` (server time, enforced), `rejectReason`

`tenants/{tenantId}/settings/memberSelfService`: `{ tenantId, editableFields: string[], updatedAt, updatedBy }`. Missing document means the default (all three).

The guard against double review is the rule `resource.data.status == 'pending'`.

## Decisions taken

1. Fields are a fixed catalogue (phone, email, address), not free choice of any member field. Anything else (name, date of birth, membership, ministries, branch) stays admin-only. To add one, extend `SELF_EDITABLE_FIELDS` **and** both field lists in `firestore.rules`.
2. Default is all three on, because a church that never opens the settings should get what JCOC asked for, and every change is approved anyway.
3. One request at a time per member, enforced in the UI only (the form locks while one is waiting). The rules allow a second; an admin would see both.
4. Approval overwrites with the member's requested value even if the record changed in between, but the reviewer is warned first.
5. Approval runs in the browser as a batched write, not a Cloud Function. The rules already allow managers to update members, so no new server code was needed.

## Gotchas

- **Rules list queries must match the rules.** A member's own requests are listed with `where("requestedByUid", "==", uid)`; any other query from the member app will be denied.
- **JSX ate spaces twice.** Text after an `{expression}` that wrapped onto the next line lost its leading space in the compiled output ("Cell numberchanged"). Fixed with explicit `{" "}`. Watch for it in new pages.
- Branch admins only see requests for their branch's members. That is UI filtering, like the roster, not a rule. ADR-001 revision 2 makes sector scoping a rule in Phase 1.
- The emulator does not enforce indexes. **Deploy `firestore.indexes.json`** before "Recent decisions" will load on a real project.

## What Sifiso needs to do to make this live

When the JCOC Firebase project exists:
```bash
firebase deploy --only firestore:rules,firestore:indexes --project jcoc-hub
```
Then deploy the app. Members need a member-app login (Invite to Portal on the roster) for any of this to apply to them.

**Upstream Kereke Hub:** the member self-write hole (item 1 above) and the missing settings rule (item 2) are both live there. Port the `firestore.rules` changes with their tests.

## Verification done

- **Rules: 98 of 98 pass**, including 36 new. The new negative tests cover a member writing their own record, requesting someone else's record, fields the church disallows, fields outside the catalogue, empty changes, pre-approved or pre-reviewed requests, another tenant, a forged requester, a member approving their own request, a cell leader or another tenant approving, editing the changes while approving, a forged reviewer, double review, deleting, and settings written by a member, a cell leader or another tenant, or to an unlisted settings document.
- **Unit: 34 of 34** (15 new).
- `npx tsc --noEmit` clean. `next build` passes, 100 of 100 pages (with throwaway local credentials).
- **Clicked through on the emulators:**
  - Member app (Thabo): profile loads with the structured address; unchanged submit says "Nothing has changed yet."; a new cell number and suburb create a request with only those two fields, normalised; the record itself is unchanged (checked in the database); "Waiting for approval" shows and the form locks.
  - Admin (owner): the queue shows both requests oldest first with before and after; Lerato's shows the stale warning after her record was edited behind it; Approve updated Thabo's record and the request together (checked in the database); Reject with a reason left Lerato's record untouched; Recent decisions shows both with reviewer and time.
  - Settings: unticking Email and saving wrote `["phone","address"]`; the member app then hid the email field.
  - Church Settings: "Save Changes" now succeeds and `formConfig` exists in the database.
  - Member app after review: the approved values show, and a rejection shows its reason.
  - No console errors on the member page.

## What I did NOT verify

- **Branch admin view of the queue** was not clicked through. The filtering mirrors the celebrations page, which was.
- Member manager role not clicked through; covered by rules only.
- Not tested on a phone, though the member app is the mobile-facing part. Layout is the existing portal's.
- Email change does not update Firebase Auth or Brevo contact lists. Whether it should is a product question.
- No notification to admins when a request arrives, and none to the member when it is decided. Not in scope; worth asking Anita whether she wants one.
- "Recent decisions" index not tested against a real project (emulator ignores indexes).

## Open items for next session

1. Port the two rules fixes (member self-write, settings documents) to upstream Kereke Hub, with tests.
2. Ask Anita whether she wants an email or badge when member updates arrive.
3. Decide open question A4 before Phase 1.
