# Build Scope

## Part A. What we already have

The base is Kereke Hub, and it is a lot more finished than a starting point usually is. Roughly 29,000 lines across dashboard pages alone, plus Cloud Functions and a 47KB Firestore rules file that has clearly been iterated on properly.

### Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16, App Router |
| UI | React 19, Tailwind CSS 4, TypeScript 5 |
| Auth | Firebase Auth |
| Database | Cloud Firestore |
| File storage | Firebase Storage |
| Background jobs | Firebase Cloud Functions v2, `onSchedule` |
| Hosting | Firebase App Hosting (`apphosting.yaml`) |
| Offline | `next-pwa` plus a hand-rolled sync layer in `lib/offline` |
| Email | Brevo |
| SMS | BulkSMS |
| WhatsApp | Separate Baileys service, deployed on Railway, in `kereke-whatsapp/` |
| Charts | Recharts |
| Spreadsheet import/export | SheetJS (`xlsx`) |

### Multi-tenancy model as it stands

Single flat Firestore database. Every document carries a `tenantId`. Isolation is enforced entirely in `firestore.rules`, which resolves the caller's tenant by reading their `users/{uid}` document. `tenantId` is set equal to the owner's Firebase Auth UID at signup, so one tenant means one church means one owner account.

There is a `branch` concept, and a `branch_admin` role, but branch is a **string field on members and users**, not a separate entity. There is no notion of a parent organisation, no cross-tenant read path, and no aggregation layer.

That is the crux of the whole build. It is not a flaw, it is just a design that assumed one church per account, and the Client is not one church.

### Roles that exist today

`owner`, `admin`, `viewer`, `finance`, `member_manager`, `member_viewer`, `cell_leader`, `branch_admin`, `follow_up`, and `super_admin` for Kereke's own staff.

### Modules that exist and are usable as-is or nearly so

| Module | State | Fit for the Client |
|---|---|---|
| Membership roster | Mature, 3,400 lines | Good, needs life phase rework |
| Households and family linking | Built | Good, and needed for the phase cascade |
| Attendance capture and reporting | Mature | Capture method rejected, reporting fine |
| Care tiers / at-risk | Built | Wanted, but starved of data until attendance is solved |
| Groups and group attendance | Mature | Good |
| Workflows and workflow instances | Mature, 1,100 lines on the editor alone | Good |
| Forms builder | Built, 9 field types | Good foundation, missing file upload |
| Events, multi-day, sessions | Built | Foundation only, see gaps |
| Public RSVP | Basic | Needs substantial replacement |
| Event check-in | Built | Reusable |
| Volunteers and roles | Built | Wanted |
| Communications (Brevo, BulkSMS) | Mature, 2,100 lines | Needs segmentation work |
| Announcements | Built, pending member app | Fine |
| Pastoral care logs | Built | Fine |
| Worship planning | Built | Nice-to-have, not requested |
| Team members and role assignment | Built | Needs network extension |
| Church settings, configurable lists | Mature | Good, this is why the base fits |
| Branding | Built | Fine |
| Finance suite | Mature | Switch off for this client |
| Member portal (`app/member/[slug]`) | In development | Needed, needs field-level edit control |
| Daily WhatsApp summary | Built | Optional |
| Offline support | Partial | Relevant if attendance moves to mobile |

### Known technical debt worth knowing about before we start

From `HANDOVER.md` and my own read of the tree:

1. **Two conflicting WhatsApp send contracts.** The deployed Baileys service expects `POST /message/send` with `{ phoneNumber, message }`. The Next.js route `app/api/whatsapp/send-message/route.ts` posts a different shape aimed at an older wppconnect service. One of them is stale. There is also an unused `wppconnect-server/` directory sitting in the repo.
2. **"STOP SUMMARY" is advertised in outbound messages but not wired.** There is no inbound message listener anywhere, so the reply goes nowhere.
3. **Daily summary marks-before-send**, so a failed send is logged but never retried.
4. **The repo root is cluttered.** Sponsorship decks, logos, marketing scripts, and Word documents are committed alongside application code. For a client build I would want a clean separation.
5. **Duplicate Firebase admin helpers.** Both `lib/firebase-admin.ts` and `lib/firebaseAdmin.ts` exist, and again under `app/lib/`. Worth reconciling before adding more.

---

## Part B. What we need to build

### B1. Network architecture (the big one)

**Requirement.** Campus-level data isolation with campus-level logins, plus a head office layer with visibility across all campuses and the ability to broadcast to all campuses or a chosen subset.

**Two ways to do this.**

*Option 1, tenant-per-campus with an organisation layer above.* Each campus stays its own tenant exactly as today. Introduce an `organizations` collection. Tenants gain `orgId` and `orgRole` of either `hq` or `campus`. Head office users get a new console that fans out reads across the org's tenants, backed by pre-computed rollup documents so the dashboard doesn't do nine live queries on every page load.

*Option 2, one tenant for the whole network with a campus field on every document.* Aggregation becomes trivial. Everything else becomes hard: every query across 29,000 lines needs campus scoping added, the rules file needs a rewrite, and one mistake in one rule leaks the entire network rather than one campus.

**Recommendation: Option 1.** Three reasons, in order of weight.

First, it matches what they actually asked for. Anita said "each region to have their own... where they have their database and everything in there". Option 1 gives that literally. Option 2 gives them a shared database with a filter on top, which is a different thing and a harder POPIA conversation.

Second, it preserves the isolation guarantee that already works. The existing rules file has been hardened over many iterations. Option 2 throws that away and rebuilds it under time pressure, which is how leaks happen.

Third, the cost of Option 1 is bounded and known. Fan-out reads across nine campuses are cheap, and where they aren't, a scheduled rollup function solves it. That is a well-understood pattern and the codebase already runs scheduled functions.

The honest counter-argument, for the record: if this network grows to fifty or a hundred campuses, fan-out starts to hurt and the rollup layer becomes load-bearing rather than an optimisation. I think that's a bridge we cross later, and the rollup design should anticipate it rather than the architecture being rebuilt around a scale they don't have.

**Scope.**
- `organizations` collection, org creation and region enrolment tooling.
- `orgId` and `orgRole` on tenants, plus backfill.
- `campuses` entity inside each region tenant, migrating the existing loose `branch` string and retiring it.
- Org-level tier resolution, so JCOC's bespoke all-features plan applies to every region including ones added later (ADR-009).
- New roles: `network_owner`, `network_admin`, `network_viewer`.
- Firestore rules extension permitting network-role reads across tenants sharing an `orgId`. This is the highest-risk change in the build and needs its own review and test pass.
- HQ console: network overview, per-campus cards, drill-through into a campus in read-only mode.
- Scheduled rollup function writing `campus_rollups/{tenantId}` with member counts, attendance, at-risk counts, and event registration totals.
- Network broadcast: compose once, select campuses, fan out through the existing Brevo and BulkSMS paths, with a per-campus delivery report.
- Invite and user management at network level.

### B2. Life phases

**Scope.**
- Replace the single `maritalStatus` string with a `lifePhases` array field, multi-select, backed by a fully configurable taxonomy in church settings.
- Separate child phase taxonomy, since children's bands are school-linked rather than status-linked.
- Migration from existing `maritalStatus` values into the new array without data loss.
- Filter and segment on life phase across roster, communications, and analytics.

Note the taxonomy itself must come from the Client. What we build is the machinery; the list is their content.

### B3. Annual roll-over engine

The interesting piece of the build.

**Scope.**
- Per-phase progression rules, configurable: which phase advances to which, and on what basis (school grade, age band, or manual).
- Parent phase derivation, computed from the ages of children linked through `households`. This is why the existing household model matters; without family linking there is no cascade.
- A dry-run preview: show every proposed change as a diff before anything is written. Anita has done this manually for years and will not trust a silent bulk update, nor should she.
- Apply, with a full audit log and an undo window.
- Manual overrides that survive the roll-over, because there will always be a family that doesn't fit the rule.

The existing birthday-triggered age band logic gives us a partial foundation, but the trigger, the cascade, and the preview are all new.

### B4. Event registration

**Scope.**
- Per-event registration form, built on the existing forms engine, attached to an event rather than standalone.
- Two new field types on that engine: `file_upload` and `payment_reference`.
- Public file upload to Firebase Storage from an unauthenticated registrant. This needs a signed-upload API route, because the current Storage rules require a signed-in user whose tenant matches, and an event registrant is neither.
- Registration lifecycle: `submitted`, `awaiting_payment`, `payment_uploaded`, `confirmed`, `rejected`, `cancelled`.
- Review queue for proof of payment, with approve and reject plus a reason. Verification is **per event**: the organiser verifies and can assign additional verifiers on their own event only (ADR-006).
- Rejected payments **hold and allow re-upload** rather than cancelling the registration.
- Standard optional fields: t-shirt size, dietary requirements, transport needed, campus or region.
- Youth indemnity upload, conditional on the registrant being a minor.
- Registrant communications: message all registrants, or filter by status or campus.
- QR check-in at the event, validating against confirmed registrations rather than the membership roll.
- Registration deliberately decoupled from membership lookup, no duplicate profiles created.

### B5. Children's ministry check-in and check-out

**Not started.** This was represented on the discovery call as in development with a one-week horizon. It was a discussion, not a build. Full estimate stands, and the expectation set with Anita needs correcting.

- Child check-in tied to a guardian, with a **screen-based** collection code sent to the guardian's phone. No label printing (ADR-008), which removes a hardware dependency but means a supervisor override path is needed for lost phones.
- Check-out requiring the matching code, and an audit record of who collected whom and when.
- Rooms or classes with capacity, and a session register.
- Sibling group check-in in one action.
- Medical and allergy notes surfaced to the room leader.
- Reports and a retained audit trail.

This is a safeguarding feature, so the audit trail is not optional and the failure modes matter more than the happy path.

### B6. Communications segmentation

**Scope.**
- Segment builder combining campus, ministry group, life phase, volunteer role, group membership, and age band.
- Saved segments, reusable across email and SMS.
- Recipient count preview before send.
- Birthday and anniversary pulls for a chosen date window, exportable, feeding the weekly Friday email.

### B7. Member self-service controls

**Scope.**
- Church settings screen defining which member fields are self-editable.
- Enforcement in the member portal UI and, more importantly, in Firestore rules. A UI-only restriction is not a restriction.
- Change-approval queue. Confirmed: edits **queue for admin review**, they do not apply directly (ADR-007). Needs a review screen in the dashboard and a pending indicator on the member app.

### B8. Attendance capture, to be determined

Still unscoped, but now client-owned: JCOC will advise how they mark their register, and we build to that. We know the two proposed methods were rejected and we do not know why. Options to put in front of them include cell-leader capture on mobile with offline support, a bulk paper-to-digital entry screen designed for speed, headcount-only capture where individual tracking isn't realistic, or something we haven't thought of. This needs a working session, not a guess.

### B9. White-label configuration

Confirmed 2026-08-31. JCOC gets their own branding on their own domain, with a "Designed by Kereke Hub" attribution. Wording to be agreed with them.

**Scope.**
- `lib/whiteLabel.ts` as the single source for product name, logo paths, colour tokens, support contact, email sender name, SMS sender ID, PWA name, and the attribution string.
- Replace every hardcoded brand reference with a read from that config. The member portal currently hardcodes `#1A5C38` as a fallback in several files.
- PWA manifest: name, short name, icons, theme colour.
- App metadata: title, description, favicon, apple icon.
- Brevo sender name and reply-to; BulkSMS sender ID.
- Transactional email templates.
- Support ticket flow, which currently routes to Kereke Hub and says so in the UI. Decide whether JCOC's users see Kereke Hub at all in that flow.
- Attribution in the dashboard footer and the member portal footer.
- Custom domain setup on Firebase Hosting, plus SPF and DKIM on JCOC's sending domain.

Done as configuration rather than find-and-replace, so the fork stays portable and the same mechanism serves the next white-label client.

**Estimated 4 days.**

---

## Part C. Explicitly out of scope

- Finance suite. Switched off for this tenant.
- First-time visitors module. Available but not configured until they decide.
- Worship planning. Not requested.
- Online payment processing. They want proof of payment upload, not a payment gateway. Worth confirming that stays true.
- Ticketing in the commercial sense.
- Native mobile applications. The member portal is a PWA.
