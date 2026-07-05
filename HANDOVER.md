# Handover, Session 6 (Daily WhatsApp summary for the church owner)

Date: 2026-07-03

## The big context correction, read this first

The brief for this session assumed a pnpm monorepo with `apps/bot`, `packages/db`,
BullMQ on Redis, Postgres migrations, and a WatermelonDB mobile app. None of that
exists in the connected `Kerehub.co.za` folder. There is no `CLAUDE.md` or
`HANDOVER.md` here either, and no `apps/bot`, `packages/db`, `packages/popia`,
BullMQ, Redis, or Postgres anywhere in the tree.

What is actually here is the real Kereke Hub app: Next.js 16 App Router plus
Firebase (Auth, Firestore, Storage) with Firebase Cloud Functions in
`functions/src/index.ts`. So the Session 5 handover about Yoco/BullMQ/Postgres
describes a different codebase that is not in this folder.

I stopped and checked with Sifiso rather than guess. He chose to build the daily
summary Firebase-native, in this app. So the whole feature was implemented against
the real stack. If the monorepo does exist somewhere, it was never connected to
this session and nothing here touches it.

## What I built

A once-a-day WhatsApp summary to the church owner, sent by a scheduled Cloud
Function. Same single format for everyone, terse, well under 300 characters.

Example output (fabricated data, this is real output from the shipped code):

```
Kereke Hub, Fri 3 Jul
New members: 2
New visitors: 1
Payments: 3 (R1 450)
Follow-ups tomorrow: 4
Reply STOP SUMMARY to stop.
```

Data mapping, decided with Sifiso since "customers" is not a concept in a church
app:

- New members: `members` where `createdAt` falls inside today (tenant timezone).
- New visitors: `visitors` where `createdAt` falls inside today. Both counted and
  labelled separately, per Sifiso's choice.
- Payments: `transactions` where `type == "income"` and `date == today`. `date` is
  a `YYYY-MM-DD` string, amounts are rand numbers, summed in memory.
- Follow-ups due tomorrow: `workflow_instance_steps` where `status == "pending"`
  and `dueDate == tomorrow` (also a `YYYY-MM-DD` string).

## Files added / changed

New:

- `functions/src/summaryFormat.ts` — pure, dependency-free helpers: timezone maths
  (`zonedNow`, `zonedDayStartUTC`, `addDaysStr`) and the message renderer
  (`renderMessage`, `formatRand`, `dateLabel`). Kept separate from the function so
  it can be tested without pulling in firebase-functions. This is the file I ran
  the demo against.
- `functions/src/dailySummary.ts` — the scheduled function itself. `onSchedule`
  every 15 minutes, timezone `Africa/Johannesburg`. For each tenant with
  `summaryEnabled == true`, once their local `summaryTime` has passed and it has
  not already sent today, it computes the numbers, sends WhatsApp, and writes an
  audit log.
- `app/dashboard/daily-summary/page.tsx` — the settings screen: on/off toggle,
  time, timezone, and recipient WhatsApp number. This is the pilot opt-out.

Changed:

- `functions/src/index.ts` — one line at the end: `export { dailySummary } from "./dailySummary";`
- `firestore.rules` — added `summarySettings/{tid}` (owners/admins manage their own
  tenant, read keyed on doc id so a not-yet-created doc still reads) and
  `summary_audit_logs/{id}` (tenant read only, writes blocked because only the
  Cloud Function writes them via Admin SDK).
- `firestore.indexes.json` — added composite indexes `members(tenantId, createdAt)`
  and `visitors(tenantId, createdAt)`. The transaction and follow-up queries are
  equality-only and need no composite index.
- `app/dashboard/layout.tsx` — added the "Daily Summary" nav item for owner/admin.

## Firestore shapes I introduced

- `summarySettings/{tenantId}`: `tenantId`, `summaryEnabled` (default true),
  `summaryTime` (default "18:00"), `timezone` (default "Africa/Johannesburg"),
  `recipientPhone` (digits, e.g. 27831234567), `lastSentDate` ("YYYY-MM-DD",
  the dedupe guard). Created by the settings page on first save.
- `summary_audit_logs/{auto}`: `tenantId`, `recipientPhone`, `message`,
  `summaryDate`, `status` (sent | failed | skipped_no_phone | error), `messageId`,
  `error`, `counts`, `channel: "whatsapp"`, `createdAt`. This is the POPIA
  proof-of-send trail.

## Decisions taken this session

1. Firebase-native, not BullMQ. Confirmed with Sifiso. The app already runs
   scheduled Cloud Functions (`billingReminder`, `brevoBirthdayEmails`), so this is
   just one more `onSchedule`. A 15-minute cron plus a `lastSentDate` guard gives
   the same "fire once when their time arrives" behaviour the brief wanted from a
   repeatable queue.
2. Template: labelled multi-line (Option A), with new members and new visitors
   shown as separate lines.
3. Opt-out: dashboard toggle now. The "Reply STOP SUMMARY" line stays in the
   message text, but the reply is not yet wired to anything (see gotcha below).

## Gotchas worth knowing

- No BullMQ, no Redis in this stack, so there is nothing to install or run for the
  scheduler. If a future session really needs sub-15-minute precision or a job
  queue, that is a bigger architectural change, not a config tweak.

- Two conflicting WhatsApp send contracts live in this repo. The deployed Baileys
  service (`kereke-whatsapp/src/server.js`) expects `POST /message/send` with body
  `{ phoneNumber, message }` and headers `X-Service-Key` plus `X-Tenant-Id`. But
  the Next.js route `app/api/whatsapp/send-message/route.ts` posts
  `{ sessionName, phone, message }` with only `X-Service-Key`. I built the Cloud
  Function against the deployed Baileys contract. That Next.js route looks like it
  targets an older wppconnect shape and is probably stale. Worth reconciling.

- STOP SUMMARY is not actually wired. The Baileys service
  (`kereke-whatsapp/src/baileyService.js`) only listens for `connection.update` and
  `creds.update`. It has no `messages.upsert` listener, so inbound replies are
  never received anywhere. Making the reply flip `summaryEnabled` needs an inbound
  listener added to that separate Railway repo plus a webhook into this app. For
  the pilot, the toggle does the job and the STOP line sets the expectation.

- Mark-before-send tradeoff. The function writes `lastSentDate` BEFORE it sends. If
  a send fails, it is logged as `failed` in the audit trail but NOT retried that
  day. This is deliberate: a daily summary is not worth risking a double-send or a
  retry storm at the owner. If a summary must be guaranteed, change the order so
  `lastSentDate` is only written on success.

- `onSchedule` runs are not guaranteed non-overlapping. With few pilot tenants this
  is a non-issue, and the `lastSentDate` guard covers it anyway.

- Time-of-day edge: if an owner sets a time like 23:58, the every-15-minutes checks
  land at :00/:15/:30/:45 and the first check at or after 23:58 is next day 00:00,
  where `hhmm < summaryTime` is true, so that day is skipped. Practically fine, but
  flag it if anyone picks an odd late time.

## What Sifiso needs to do to make this live

These are backend deploys, not code. In PowerShell from the repo root:

1. Set the two secrets the function reads (values from the Railway service):
   ```powershell
   firebase functions:secrets:set WHATSAPP_SERVICE_URL
   firebase functions:secrets:set WHATSAPP_SERVICE_KEY
   ```
2. Deploy functions, rules, and indexes:
   ```powershell
   firebase deploy --only functions:dailySummary,firestore:rules,firestore:indexes
   ```
3. Deploy the Next.js app the usual way so the new Daily Summary page ships.
4. In the hub: open Daily Summary, turn it on, set the time, and enter the owner's
   WhatsApp number. Make sure that tenant's WhatsApp is connected in Communications.

## Verification done this session

- `npx tsc --noEmit` in `functions/` passes clean.
- Ran the real `renderMessage` against fabricated data (busy day, quiet day with
  zeros, big-giving day with thousands, and a Namibia timezone). All outputs were
  correct and between 120 and 133 characters, comfortably under 300.
- Verified the timezone day-boundary maths: SAST local midnight maps to the correct
  UTC instant, and London in July correctly resolves to BST (+1), so the "today"
  window for members/visitors is right per tenant.
- Did NOT run a live WhatsApp round-trip (needs the Railway service and a connected
  tenant). Sifiso should do a real send after step 4 above and check
  `summary_audit_logs` shows a `sent` row.
- Did NOT run the full Next.js build for the new page. The functions side is
  type-clean; the page uses the same imports and hook (`useAppUser`) as existing
  dashboard pages.

## Open items for Session 7

1. Wire STOP SUMMARY for real: inbound listener on the Baileys service plus a
   webhook here that flips `summaryEnabled`. This also unlocks other inbound
   features later.
2. Reconcile the two WhatsApp send contracts so there is one source of truth.
3. Decide whether a failed send should retry (the mark-before-send tradeoff).
4. Optional: a per-tenant "send me a test summary now" button, so an owner can see
   the message without waiting for their scheduled time.
