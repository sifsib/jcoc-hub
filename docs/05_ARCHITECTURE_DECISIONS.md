# Architecture Decisions

Short records, one per decision. Add to this file rather than rewriting it. If a decision gets reversed, mark it superseded and write a new one, so the reasoning trail survives.

**Client:** Joburg Church of Christ (JCOC), johannesburg.church. Part of the Southern African Churches of Christ family.

---

## ADR-001. Three tiers: organisation, region, campus. The tenant boundary sits at the region.

**Status:** Accepted, revised 2026-08-31. Supersedes the original two-tier version.
**Confidence:** High on the structure. Medium on where exactly the tenant line sits, see "To confirm".

**Context.** JCOC's own site puts it plainly: one church, meeting in many locations across the city. Beyond Johannesburg the network extends to Tshwane, Cape Town, Durban, and Port Elizabeth.

Sifiso has confirmed the hierarchy is three levels, not two: **head office, then region, then campus.** That is a material change from the original assumption and it changes the model.

Anita administers a region and puts it at close to 380 people. Publicly visible regional structures such as the NW Region line up with that.

**The question this ADR actually answers.** Not "how many levels" but "where does the database boundary go".

*Boundary at the campus.* Every meeting location gets its own tenant, own login, own database. Maximum isolation.

*Boundary at the region.* Each region is a tenant. Campuses are entities inside that tenant, an upgraded version of the existing `branch` field. Head office sits above as an organisation.

*Boundary at head office.* One tenant for everything, region and campus as filter fields. Rejected for the reasons in the original version of this ADR, which still hold: separation would depend on every query in roughly 29,000 lines applying a filter correctly, forever, and one miss exposes the entire network.

**Decision. The tenant is the region.**

- `organizations/{orgId}` is head office. One document for JCOC.
- Each **region** is a tenant, exactly as a standalone church is today, carrying `orgId` and `orgRole: "region"`.
- **Campus** becomes a first-class entity inside a region tenant, `campuses/{campusId}` scoped by `tenantId`, replacing the loose `branch` string.
- Head office gets network roles and a console reading across the org's region tenants.

**Reasoning.**

A campus is a meeting location, not an organisation. The people at three Johannesburg campuses share a member roll, share leaders, and share Anita as their administrator. Splitting them into three databases would fragment one congregation into three, and then immediately require a joining layer to put it back together. That is work spent undoing our own decision.

The boundary that matters for POPIA is between regions and between city churches, not between two rooms of the same congregation who already share an administrator. Putting the hard structural boundary where the real trust boundary sits, and using ordinary in-tenant scoping below it, matches the risk rather than over-engineering against it.

It also fits how Anita described her own work. She talks about "my region" as the unit she is responsible for. That is the tenant.

**The trade-off, said plainly.** Campus separation inside a region is filter-based, which is exactly the pattern rejected at network level. That is a deliberate inconsistency, not an oversight. A missed campus filter means a regional admin sees members of another campus in their own region, which is a nuisance. A missed region filter would put one church's personal information in front of another, which is a POPIA incident. Different severity, different treatment.

**To confirm with Anita before building the model.** Are Cape Town, Durban, PE and Tshwane *regions* of one national church, or separate churches each with their own regions underneath? She described them as "part of our church, but separate", which is ambiguous, and the SA-ICOC material suggests they may be peer churches rather than regions. If they are separate churches with regions inside them we need four levels and `organizations` needs to nest. **Ask before writing the model, not after.**

**Consequences.**

- Head office aggregation is fan-out across region tenants, backed by scheduled rollups at `campus_rollups/{tenantId}`. Comfortable at this size.
- The existing `branch` string and `branch_admin` role migrate into the campus entity. Do not leave both concepts alive.
- Network broadcast targets regions, and optionally campuses within them.
- Cross-tenant reads for head office remain the highest-risk change in the build, and get their own negative test suite.

---

## ADR-002. Life phases are an array, not a status

**Status:** Accepted.

**Context.** The base stores a single `maritalStatus` string. The client needs a person to hold several life phases at once. Anita's own example: widow, empty nester, and single parent simultaneously.

**Decision.** New `lifePhases: string[]` on members, backed by a configurable taxonomy in church settings. `maritalStatus` is migrated into it and then deprecated rather than deleted, so nothing that still reads it breaks mid-migration.

**Consequences.** Every filter, segment, and report touching marital status needs array semantics. Firestore `array-contains` handles single-phase filters; multi-phase filters need `array-contains-any`, which caps at thirty values, or client-side filtering on an already-scoped set. Worth knowing before someone designs a segment builder assuming unlimited AND conditions.

**Blocked on.** The taxonomy itself. Sifiso is collecting it from Anita. The machinery can be built against a placeholder list, but the progression rules in ADR-003 cannot.

---

## ADR-003. Roll-over is annual, calendar year, previewed, never silent

**Status:** Accepted. Trigger confirmed 2026-08-31.

**Context.** The base advances age bands on birthdays. The client needs an annual roll-over that cascades to parents, because a parent's phase depends on their children's ages.

**Decision.** Roll-over runs on the **calendar year**, confirmed by Sifiso. A dry-run preview is mandatory: the engine computes every proposed change and renders it as a reviewable diff, and nothing is written until a human approves. Every applied change is audit-logged with an undo window. Manual overrides on a member survive subsequent roll-overs.

**Reasoning.** Anita has done this by hand for years and knows the exceptions the rules will not catch. A silent bulk update across a 380-plus person region that gets one rule slightly wrong is not recoverable by hand, and it would destroy confidence on day one. The preview is not a nicety, it is the feature.

**Worth one sentence of confirmation.** Calendar year was chosen even though Anita's stated reasoning was school-stage-driven. South African school years start in January so the two mostly coincide, but they are not the same concept and the phase rules may quietly assume one or the other. Confirm when the taxonomy arrives.

---

## ADR-004. Event registration does not touch the membership roll

**Status:** Accepted.

**Context.** JCOC's current platform makes registrants find themselves on the membership list. When they cannot, usually because their phone number or email changed, they create a new profile, which corrupts the membership count. This was the most concrete complaint in the discovery call.

**Decision.** Registrations live in their own collection and never create or modify member records. Matching a registration to a member, if wanted at all, is a later, optional, read-only convenience.

**Consequences.** Some duplication between registrant and member details. That is the correct trade. Registration is a transaction with a person on a given day; membership is a durable relationship. Conflating them is what broke their current system.

---

## ADR-005. Public file uploads go through a server route, not direct client Storage writes

**Status:** Accepted.

**Context.** Event registrants upload proof of payment and indemnity forms while signed out. Current Storage rules require a signed-in user whose `tenantId` matches the path, so an anonymous registrant cannot write at all.

**Decision.** Uploads go to a Next.js API route which validates the event, checks the registration token, enforces content type and size, then writes with the Admin SDK. Storage rules stay closed to anonymous writes.

**Reasoning.** The alternative is loosening Storage rules to permit anonymous writes under some path, which is an open door for anyone who finds the bucket. Routing through a server we control means we can rate limit, validate, and log.

**Consequences.** Upload traffic goes through the app rather than straight to Storage, so the route needs a sensible size cap and timeout. Ten megabytes, matching the existing rule, is the starting point.

---

## ADR-006. Proof of payment verification is per-event and delegable

**Status:** Accepted 2026-08-31.

**Context.** Sifiso confirmed the event organiser verifies proof of payment, and can assign additional people to help.

**Decision.** Verification rights are granted **per event**, not by a global role. An event carries an `organiserId` and a `verifierIds` array. The organiser can add and remove verifiers on their own event only.

**Reasoning.** A global "payments verifier" role would let one person see financial documents for every event in the region, which is more access than the job needs. Per-event assignment keeps the scope tight and matches how they work, where different people run different events.

**Consequences.** Firestore rules for registration documents must check membership of the parent event's `verifierIds`, which means a document read inside a rule. The rules already use that pattern to resolve a caller's tenant, so it is not new, but it costs a read per check.

**Related, confirmed 2026-08-31.** Rejected payments **hold and allow re-upload**. The registration stays alive in a `payment_rejected` state with a reason, and the registrant can upload again. It is not cancelled.

---

## ADR-007. Member self-service edits queue for approval

**Status:** Accepted 2026-08-31.

**Context.** Anita was firm that members cannot add themselves to the roll, but should be able to update their own contact details. Sifiso has confirmed those edits should **queue for approval** rather than apply immediately.

**Decision.** A member edit writes to `member_change_requests`, not to the member record. An admin reviews, approves, or rejects. Approval applies the change and logs it.

**Reasoning.** Preserves the thing Anita actually cares about, which is that the roll is administrator-controlled. It also gives a clean audit trail of who changed what and who let it through, which matters for a POPIA-conscious client.

**Consequences.** More work than direct edits. Needs a review queue in the dashboard plus a "pending" indicator on the member app so the member knows their change was received. Budget one extra day over the direct-edit version.

---

## ADR-008. Children's check-in uses a screen-based collection code

**Status:** Accepted 2026-08-31.

**Context.** Sifiso confirmed the collection code is screen-based. No label printing.

**Decision.** On check-in the system generates a code displayed on the check-in screen and sent to the guardian's phone. Collection requires the code to be presented and matched. Every check-in and check-out writes an immutable audit record naming who dropped off, who collected, and when.

**Reasoning.** No hardware dependency, which removes a whole category of go-live risk. The trade-off is that a guardian who loses their phone needs a supervisor override path, so build one, and log it loudly when it is used.

**Note.** This module has **not been started**. It was discussed on the discovery call as though it were in development and close to release. It is not. See the risk register in `docs/03_BUILD_PLAN.md`.

---

## ADR-009. Billing rolls up to head office; JCOC is ungated

**Status:** Accepted 2026-08-31.

**Context.** Sifiso confirmed head office holds the main contract and campuses subcontract under it. JCOC is on a bespoke plan with all features enabled.

**Decision.** The `organizations` document carries the commercial relationship. Region tenants are billed through the organisation rather than individually. Tier gating via `isPaidTier` must not apply to tenants in this org.

**Consequences.** `lib/tier.ts` and `useTenantTier()` need an org-level override so every region tenant under JCOC resolves as fully enabled. **Do not do this by setting each tenant to `paid` individually**, because a region added later will silently come up gated. Resolve tier from the organisation.

---

## Known base-repo quirks to work around, not build on

**Two WhatsApp send contracts.** The deployed Baileys service expects `POST /message/send` with `{ phoneNumber, message }` plus `X-Service-Key` and `X-Tenant-Id`. The Next.js route `app/api/whatsapp/send-message/route.ts` posts `{ sessionName, phone, message }` with only `X-Service-Key`, targeting an older wppconnect shape. The Baileys contract is the live one.

**"STOP SUMMARY" is advertised but not wired.** Outbound daily summaries tell the recipient to reply STOP SUMMARY. Nothing listens for inbound messages, so the reply is silently discarded.

**Duplicate Firebase admin helpers.** `lib/firebase-admin.ts` and `lib/firebaseAdmin.ts` both exist, and again under `app/lib/`. Pick one per file; do not add a third.

**`branch` is a string, not an entity.** Under ADR-001 this becomes the campus entity. Migrate it, do not leave both alive.

**Daily summary marks before it sends.** A failed send is logged and never retried that day. Deliberate, to avoid double-sends, but worth knowing if anyone reports a missing summary.
