# CLAUDE.md

Read this first, every session. Then read `docs/06_OPEN_QUESTIONS.md` and the most recent file in `handovers/`.

---

## What this project is

A customised build of **Kereke Hub** for **Joburg Church of Christ (JCOC)**, johannesburg.church, part of the Southern African Churches of Christ family.

Kereke Hub is a multi-tenant church management platform built by Sifiso Sibuyane. It assumes one tenant equals one church. JCOC is a network: Joburg Church of Christ is split into **regions** (which the client also calls campuses: Soweto, Northwest, Central East), each region into **sectors**, each sector into **family groups**. Tshwane, Cape Town, Durban, PE and Mthatha are **sister churches** with their own logins. Anita and Baba D oversee all of it. They need region-level isolation plus network visibility above it. That gap is the main build.

Read ADR-001 **and ADR-001 revision 2** before touching the org model. Revision 2 records this structure and is **proposed, not yet accepted**. Do not build the org model until Sifiso signs it off.

This is a **hard fork** of Kereke Hub, decided 2026-08-31. Separate repository, separate Firebase project, JCOC's own domain, white-labelled with a "Designed by Kereke Hub" attribution. The base repo is available as the `upstream` git remote, and the fork point is tagged `fork-point`.

---

## Stack

Next.js 16 App Router, React 19, TypeScript 5, Tailwind 4. Firebase for Auth, Firestore, Storage, and Cloud Functions v2. Hosted on Firebase App Hosting. Brevo for email, BulkSMS for SMS, a separate Baileys service on Railway for WhatsApp.

Multi-tenancy is a `tenantId` field on every document, enforced entirely in `firestore.rules`. There is no per-tenant database. `tenantId` equals the owner's Firebase Auth UID.

---

## The rules that matter

### 1. Never widen a Firestore rule without a negative test
The rules file is the only thing standing between one campus and another campus's personal information. The Client's primary contact is a registered POPIA officer. Any change to `firestore.rules` needs a matching test in `tests/rules/` that asserts the read **fails** from the wrong tenant, not just that it succeeds from the right one.

### 2. Ask before assuming a data shape
The base codebase has grown organically. There are two Firebase admin helpers with near-identical names, two conflicting WhatsApp send contracts, and a `branch` concept that is a string field rather than an entity. If something looks like it might be one of these, check `docs/05_ARCHITECTURE_DECISIONS.md` before building on it.

### 3. Stop and check rather than guess at requirements
A previous session on the base repo burned time building against a briefed architecture that did not exist in the connected folder. The right move then was to stop and ask, and it is the right move here. If the brief and the code disagree, the code wins and Sifiso gets asked.

### 4. Every session ends with a handover
Write `handovers/YYYY-MM-DD-<topic>.md` following `docs/HANDOVER_TEMPLATE.md`. Include what you did not verify, not just what you did. The base repo's `HANDOVER.md` is a good model, particularly the "gotchas" section.

### 5. South African context
Currency is ZAR. Dates display as `en-ZA`. Default timezone `Africa/Johannesburg`, but campuses outside South Africa need their own, so do not hardcode it. Phone numbers normalise to `27XXXXXXXXX`. POPIA, not GDPR.

### 6. Build the product features so they can be ported back

This is a fork, so it diverges. Roughly 69 of the 86 scoped days are features other churches would pay for: the organisation layer, life phases and roll-over, event registration with proof of payment, children's check-in, and the segment builder. AFM Gauteng has already asked for the first one.

Build those five as self-contained modules with clean seams. Own route folders, new collections rather than fields smeared across `members`, rules in a delimited block, pure logic separated from framework wrappers, and anything JCOC-specific read from `lib/whiteLabel.ts` rather than hardcoded. Then log the work in `docs/07_PORTING_LOG.md` when the branch merges.

If a feature ends up smeared across forty files it will be rebuilt from scratch rather than ported, and the fork will have cost double. The discipline is nearly free while building and expensive to retrofit.

### 7. Never hardcode a product name or brand string

JCOC is white-labelled. Product name, logo paths, colours, sender names, support contact and the attribution string all come from `lib/whiteLabel.ts`. If you are about to type "Kereke Hub" into a component, stop.

### 8. No scope creep without writing it down
If something new is requested mid-build, add it to `docs/06_OPEN_QUESTIONS.md` under "New requests" with an estimate. Do not silently absorb it.

---

## Architecture decision you must not undo

The tenant boundary sits at the **region**, not the sector and not head office. Regions are separate tenants under a shared `organizations` document. Under ADR-001 campuses are entities inside a region tenant; the proposed revision 2 replaces that with sectors and family groups, and adds a church level above regions.

The reasoning is in `docs/05_ARCHITECTURE_DECISIONS.md`, ADR-001. Filtering inside a region tenant is correct and expected. Cross-region reads without an explicit network role are not. If you are unsure which side of the line you are on, stop and re-read the ADR.

**Terminology trap:** the client uses "region" and "campus" for the same thing. The level inside a region is a "sector". Also: Anita and Baba D were told on a call they would be "super admins". That means a network role, **never** the platform `super_admin` role, which is Kereke Hub staff only.

---

## Build order

Phases are in `docs/03_BUILD_PLAN.md`. Do not start a phase before its gate is met.

1. Discovery and setup
2. Network foundation
3. Membership and life phases
4. Event registration
5. Children's ministry and segmentation
6. Migration, pilot, rollout

Two quick wins run ahead of everything: the birthday and anniversary pull, and member self-editable field settings. Both were promised to the Client on the discovery call.

---

## Conventions

- Client components carry `"use client"`. Most dashboard pages are client-side with `onSnapshot` listeners.
- Tenant and role come from `useAppUser()` in `lib/useAppUser.ts`. Do not re-implement.
- Tier gating comes from `lib/tier.ts` and `useTenantTier()`. The Client is on a custom plan, so check how tier applies before locking anything behind `isPaidTier`.
- Firestore field naming is camelCase. Dates that are compared as strings use `YYYY-MM-DD`.
- Cloud Functions go in `functions/src/`, exported from `functions/src/index.ts`. Keep pure logic in a separate file from the function wrapper so it can be tested without pulling in `firebase-functions`. `summaryFormat.ts` in the base repo is the pattern to copy.
- Run `npx tsc --noEmit` in both root and `functions/` before declaring anything done.
- Rules tests live in `tests/rules/`, a standalone package like `functions/`. Run `npm install` then `npm test` there. Needs Java 21 for the Firestore emulator. It uses a `demo-` project id, so it never touches a real Firebase project.

---

## What is deliberately switched off for this Client

Finance suite and worship planning. Do not build against them and do not spend time on them.

The base first-time visitors pipeline stays off, but a narrower **visitor register** (returning visitors and their children, kept apart from members) was agreed in the follow-up meeting. See `docs/02_SCOPE.md` B10.

JCOC is on a bespoke plan with everything else enabled, resolved at organisation level, so do not gate anything behind `isPaidTier` (ADR-009).

---

## Who is who

- **Sifiso Sibuyane** — Kereke Hub founder, product owner, makes the calls.
- **Anita Pearson** — JCOC regional administrator (administers Northwest region), operational owner, the person whose daily work this has to improve. Registered POPIA officer. Needs network-wide visibility.
- **Oludolapo Ogundipe ("Baba D")** — JCOC leadership. Joint approver with Anita. Administers Soweto and Central East regions. Owns the life phase list and the monthly statistics report. Needs network-wide visibility.
- **Erick Li Sik** — JCOC, joined from the follow-up meeting. Focused on support continuity, clean separation of members, visitors and children, and email to segments (they use Mailchimp today). Raised the key-person risk directly. Not confirmed as an approver.

Client communication goes from sifiso@kerekehub.co.za.
