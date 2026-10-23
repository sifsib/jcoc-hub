# Handover, Phase 5: event registration with proof of payment

**Date:** 2026-10-23
**Phase:** Event registration (plan v2 phase 4 in the original numbering; ADR-013)
**Session:** continues the Phase 2–4 session

## Context correction, if any

None. The design followed ADR-013 and ADR-006 as approved, with all recommendations.

One honest note on "tests first": the rules tests were written and run failing before the rules. The 16 unit tests for `lib/eventRegistration.ts` were written in the same step as the logic, not run failing first.

## What I built

Anyone can register for an event from a public link without logging in. Registration does not depend on finding themselves on the membership list.

1. **Public form** at `/register/{eventId}`. It asks only the questions the event has switched on: T-shirt size, transport, dietary needs, church or region, and date of birth for the indemnity. There is a consent line.
2. **Private status page.** After registering, the person gets a link to their own status page. It is the only key, so they are told to save it. It shows:
   - the amount and payment reference, for example `YC26-VANDERME-001`;
   - the bank details;
   - an upload box for proof of payment (PDF, PNG or JPG, up to 10 MB, checked by content and not just by name);
   - an upload box for a signed indemnity if they are under 18 on the event date.
   - Once their payment is confirmed, it shows a QR ticket and an 8-character code.
3. **Staff screens:**
   - **Registration tab** on each event: switch registration on; set the amount, bank details, reference prefix, which questions to ask, capacity, closing date, organiser and verifiers; copy the share link.
   - **Registrations and payments** page: filter by status, search, view proof and indemnity, approve, or reject with a reason the registrant sees (they can upload again). Staff only: cancel, and email registrants by status.
   - **Check in** page: scanning the QR code with a phone camera opens the page and checks the person in. A code can also be typed. Each ticket works once, and only for confirmed registrations.
   - **Payment Reviews** in the menu: lists the events where you are a verifier.

## Files added and changed

**New:**
- `lib/eventRegistration.ts`: the pure rules (statuses, references, uploads, capacity and closing date, indemnity age, rate limits).
- `app/lib/eventsServer.ts`: shared server helpers (access check, tokens, rate limit, storage, Brevo).
- `app/api/events/[eventId]/{public,register,checkin,message}/route.ts`
- `app/api/events/registration/route.ts` and `registration/upload/route.ts`
- `app/api/events/registrations/{file,review}/route.ts`
- `app/register/[eventId]/page.tsx` and `app/register/status/page.tsx`
- `app/dashboard/events/[eventId]/RegistrationSettings.tsx`
- `app/dashboard/events/[eventId]/registrations/page.tsx` and `scan/page.tsx`
- `app/dashboard/payment-reviews/page.tsx`
- `tests/unit/eventRegistration.test.ts` and `tests/rules/events.test.ts`

**Changed:**
- `firestore.rules`:
  - new block `EVENT REGISTRATION (ADR-013)`;
  - verifier read on `events`;
  - closed the open `event_rsvps` and `form_submissions` creates.
- `firestore.indexes.json`: three registration indexes.
- `storage.rules`: a comment only; the private path is covered by the default deny.
- `app/dashboard/events/[eventId]/page.tsx`: one new tab.
- `app/dashboard/layout.tsx`: a "Payment Reviews" nav item.
- `firebase.json`, `scripts/dev-emulator.mjs` and `package.json`: the storage emulator on port 9199 is part of `npm run emulators`.
- `scripts/seed-emulator.mjs`:
  - a paid demo "Youth Camp (demo)";
  - a verifier login, `verifier@demo-jcoc.test`;
  - registrations are cleared on each run.
- `docs/06_OPEN_QUESTIONS.md` (X1–X6) and `docs/07_PORTING_LOG.md`.

## Data shapes introduced

- **`events/{id}` fields:**
  - `registration { enabled, amountCents, paymentInstructions, referencePrefix, proofRequired, fields {tshirt, transport, dietary, region, indemnity}, tshirtSizes, capacity, closesAt, eventDate }`;
  - `organiserUid` and `verifierUids[]`; the organiser is always added to `verifierUids` on save;
  - `registrationSeq`, the reference counter, increased in a transaction.
- **`registrations/{id}`** (server writes only):
  - `tenantId`, `eventId`, `eventTitle`;
  - `firstName`, `lastName`, `phone`, `email`, `dob`, `tshirtSize`, `transport`, `dietary`, `regionId`;
  - `status`: `awaiting_payment` → `payment_uploaded` → `confirmed`, `payment_rejected` or `cancelled`;
  - `amountCents`, `reference`, `needsIndemnity`;
  - `proofPath`, `proofContentType`, `proofUploadedAt` and the same three for `indemnity`;
  - `rejectReason`, `ticketCode`, `confirmedAt`, `checkedInAt`, `checkedInBy`;
  - `accessTokenHash` (sha256; the token itself is never stored).
- **`registrationRateLimits/{sha256}`**: no browser access at all.
- **Storage:** `private/registrations/{tenantId}/{regId}/{proof|indemnity}-{time}.{ext}`. The browser cannot reach these files; staff open them through `/api/events/registrations/file`.

## Decisions taken

1. All ADR-013 recommendations, approved by Sifiso.
2. A place is held from the moment proof is uploaded, not only when it is confirmed (X3).
3. The organiser is added to the verifier list instead of widening the rules to cover organisers. The rules test covers verifiers only, so no new access path was opened.
4. Scanning a QR code checks the person in straight away. This is quicker at the door, and a second scan is refused.

## Gotchas

- **The status link is the registrant's only key.** If they lose it, staff can see the registration but cannot resend the link yet. Approval emails the ticket only when Brevo is set up.
- **Emails need Brevo on the region's tenant document**, as upstream does. Without it:
  - approval still works, but no email is sent;
  - "Email registrants" says no email account is connected.
- **The public page shows the region's name** (e.g. "Soweto") as the church name, including in the consent line. Check this is acceptable for network-wide events.
- **The team picker lists the network owner** in the region they are in, because of the legacy `tenantId` field. This is harmless.
- **The browser pane wedges** after several Firestore pages. Restart the preview server; the app is fine.

## What Sifiso needs to do to make this live

1. Deploy the rules and indexes: `firebase deploy --only firestore:rules,firestore:indexes`. The indexes take a few minutes to build.
2. Deploy the app (App Hosting) as usual.
3. Make sure `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` is set in App Hosting. The upload and file routes use it.
4. For emails, set up Brevo for the region (item M).
5. **Before real use:** have the consent wording and status page text reviewed by Anita, as POPIA officer. They are shown to the public.

## Verification done

- `npx tsc --noEmit` is clean in the root and in `functions/`. `next build` succeeds.
- Unit tests: 154 pass. Rules tests: 217 pass. Among them:
  - another region, members, leaders, the teacher and the public cannot read registrations;
  - nobody can write registrations from the browser;
  - a verifier can list only their own event's registrations, not another event's or the whole region's (added this session);
  - the RSVP and form doors are closed.
- Clicked through on the emulators (Node 20.20.2), with invented people only:
  - A public registration as a 15-year-old got reference `YC26-VANDERME-001`.
  - The PDF proof upload worked. A fake "PDF" and a wrong link were refused.
  - As the verifier: Payment Reviews showed the event; the queue was visible without a Cancel button; the proof opened.
  - Rejected with a reason. The registrant saw the reason and uploaded a PNG proof and an indemnity PDF.
  - Approved. The registrant saw the QR ticket.
  - The scan link checked the person in; a second scan and a made-up code were refused.
  - As the owner: the Registration tab loaded and saved, with the organiser and verifiers ticked.
  - "Email registrants" without Brevo gives a clear message. A double approval and a reject without a reason are refused.
  - The staff "Add RSVP" and a member's own RSVP still save under the tightened rules.

## What I did NOT verify

- Real email sending through Brevo (there is no account in test).
- Scanning a QR code with a real phone camera. I only opened the scan link directly.
- A real large photo upload, or the 10 MB limit, in the browser. The limit is unit tested only.
- The capacity-full and registration-closed paths in the browser. They are unit tested only.
- Rate limiting in the browser. It is server logic and was not exercised.
- Cancelling from the queue's button. The cancel action and its staff-only check were tested through the route, not the button.
- Anything on a real Firebase project, including Storage on a real bucket.
- Mobile layout on a real phone.

## Open items for next session

1. Anita to confirm X1–X5, and items I, J and K, in `docs/06_OPEN_QUESTIONS.md`.
2. Sifiso to decide on X6 (c), tenant Storage access, X7 (hardcoded "Powered by" footer), and Mailchimp vs Brevo.
3. Possible addition: a "resend my link" for registrants who lose it (needs email or SMS). Log it as a new request if wanted.
4. Push and deploy are Sifiso's. Nothing has been pushed.

## Follow-up the same day: inherited RSVP faults (X6 a and b)

Asked for by Sifiso after the phase above.

**The problem.** When a member said "Going" in the member app:
- the RSVP saved, but the event's attendee counter never moved, because members are not allowed to write to events;
- the page logged a permission error on load, because it tried to read RSVPs that did not exist yet;
- so it forgot the member's answer on the next visit.

Both faults were in the base product.

**Tests first, run failing before the fix:**
- `tests/unit/rsvpCount.test.ts` (6 tests) failed because the module did not exist.
- The new rules tests in `tests/rules/events.test.ts` ("members see only their own RSVPs...") failed on "a member reads another member's RSVP".

**The fix:**
- `functions/src/rsvpCount.ts` (pure) and `functions/src/rsvpCountTrigger.ts`. The new Cloud Function `onRsvpWrittenCount` recounts the event's attending RSVPs whenever one changes, and sets `rsvpCount`. This covers the member app, the staff page and the public RSVP route alike. It counts afresh rather than adding or subtracting, so a wrong number corrects itself on the next change.
- `app/member/[slug]/events/page.tsx` loads the member's own RSVPs in one query and no longer writes to the event.
- `firestore.rules`: members can read only their own RSVPs. This tightens access; nothing is widened.

**Checks:**
- `tsc` is clean in the root and in `functions/`.
- Unit tests: 160 pass. Rules tests: 221 pass.
- Clicked through as Thabo with the functions emulator running:
  - the events page loads with no error;
  - "Going" set the count to 1, and the function ran;
  - "Not Going" set it back to 0;
  - after a reload, the page still showed "Not Going".
- `next build` was not re-run after this small change.

**To make it live:** also deploy functions, with `firebase deploy --only functions:onRsvpWrittenCount` along with the rules. Until the function is deployed, member RSVPs still save, but the counter will not move.

**Not verified:** the function on a real project, and the count after many simultaneous RSVPs. Each run counts afresh, so the last run should leave the right number.
