# Architecture Decisions

Short records, one per decision. Add to this file rather than rewriting it. If a decision gets reversed, mark it superseded and write a new one, so the reasoning trail survives.

**Client:** Joburg Church of Christ (JCOC), johannesburg.church. Part of the Southern African Churches of Christ family.

---

## ADR-001. Three tiers: organisation, region, campus. The tenant boundary sits at the region.

**Status:** **Superseded by ADR-001 revision 2 (2026-10-22).** Previously accepted, revised 2026-08-31, superseding the original two-tier version. Kept for the reasoning trail; the tenant-at-region reasoning below still holds.
**Confidence:** High on the structure. Medium on where exactly the tenant line sits, see "To confirm".

> **Superseded 2026-10-22.** The follow-up meeting answered the "To confirm" question below: Tshwane, Cape Town, Durban, PE and Mthatha are **sister churches**, not regions of one church. **ADR-001 revision 2**, at the end of this file, is the current decision.

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

**Confirmed in the follow-up meeting.** Anita chose the start of the year over birthdays. The rule is the age a person **turns during the year**, applied in January: a six-year-old turning seven in March is a scholar from January, and a child moves to teen ministry in the year they turn 14, not 13. There are no grade bands: children are either **preschooler** or **scholar**. Parent phases cascade automatically from their children's ages. Children hold several phases at once too (Anita: kid zone, scholar and pre-teen together).

Note the call itself was mixed: Sifiso first described birthday-triggered moves, then agreed to the start of the year. The build follows the start of the year.

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

**Implemented 2026-10-23** on `feature/qw-member-self-edit`. Self-editable fields are a fixed catalogue (phone, email, address), all on by default, chosen per church in `tenants/{id}/settings/memberSelfService`. Requests live in `member_change_requests`, are never deleted, and record the real reviewer. The old rule that let members write their own member record directly was removed. See `handovers/2026-10-23-member-self-edit.md`.

---

## ADR-008. Children's check-in uses a screen-based collection code

**Status:** Accepted 2026-08-31.

**Context.** Sifiso confirmed the collection code is screen-based. No label printing.

**Decision.** On check-in the system generates a code displayed on the check-in screen and sent to the guardian's phone. Collection requires the code to be presented and matched. Every check-in and check-out writes an immutable audit record naming who dropped off, who collected, and when.

**Reasoning.** No hardware dependency, which removes a whole category of go-live risk. The trade-off is that a guardian who loses their phone needs a supervisor override path, so build one, and log it loudly when it is used.

**Confirmed in the follow-up meeting.** The parent brings the child to the age-group class and signs them in there, on the teacher's device (Anita mentioned an iPad). The same adult who signed in must sign out. **Visitors' children** use the same flow: the teacher captures the child's name and age and the parent's name, phone and email the first time, and finds them again on later visits through the visitor register. Check-in must never create or change a member record.

**Note.** This module has **not been started**. It was discussed on the discovery call as though it were in development and close to release. It is not. See the risk register in `docs/03_BUILD_PLAN.md`.

---

## ADR-009. Billing rolls up to head office; JCOC is ungated

**Status:** Accepted 2026-08-31.

**Context.** Sifiso confirmed head office holds the main contract and campuses subcontract under it. JCOC is on a bespoke plan with all features enabled.

**Decision.** The `organizations` document carries the commercial relationship. Region tenants are billed through the organisation rather than individually. Tier gating via `isPaidTier` must not apply to tenants in this org.

**Consequences.** `lib/tier.ts` and `useTenantTier()` need an org-level override so every region tenant under JCOC resolves as fully enabled. **Do not do this by setting each tenant to `paid` individually**, because a region added later will silently come up gated. Resolve tier from the organisation.

---

## ADR-001 revision 2. Network, church, region, sector, family group. The tenant boundary stays at the region.

**Status:** **Accepted 2026-10-22, signed off by Sifiso.** Supersedes ADR-001. Follow-ups A1 to A5 refine it but do not reopen the tenant boundary. A4 (multi-tenant users) decided 2026-10-23: network role for Anita and Baba D, plus multi-region access for other leaders. See "A4 decision" and "A4 decision, revised" below.
**Source:** Follow-up meeting with Anita Pearson, Baba D and Erick Li Sik (transcript `transcript3.docx`, date not recorded in the transcript). Baba D shared his structure on screen.
**Confidence:** High on the hierarchy and the tenant boundary. Medium on the church level, because we do not yet know whether sister churches have regions of their own.

**What the meeting settled.**

- **Open question A is answered: they are sister churches.** Tshwane, Cape Town, Durban and PE (and Mthatha, named in the pricing discussion) are sister churches with their own logins, not regions of one church. Tshwane "falls under" Johannesburg and Johannesburg "still administers" it, but it keeps separate login details.
- **Joburg Church of Christ is one church split into regions.** Baba D: "Now we're split into three regions… that will be your campus." The client uses **region** and **campus** for the same thing. Regions named on the call: Soweto, Northwest, and Central East (see the open question on the exact list).
- **Inside a region are sectors, and inside a sector are family groups.** Soweto region has a north sector; Northwest has west and other sectors. A family group (also called a Bible discussion group) is what the base product calls a cell group.
- **A member belongs at every level at once.** Baba D: pulled for the whole church, for Soweto region, for north sector, or for a family group, the same member appears in each.
- **Membership is administered per region.** Anita: Baba D adds members for Soweto, Anita for Northwest, Baba D also for Central East.
- **Anita and Baba D oversee everything.** They must see every church and region and email all of them, while each keeps its own sign-in.
- **Billing is per region and per sister church** (R79 each, as quoted on the call), which lines up with a region tenant.

**So the original model is wrong in two places.** The level inside a region is a **sector**, not a campus. And there is a **church level** between head office and region, because the three Joburg regions roll up to "Joburg Church of Christ" separately from the sister churches. That is the four-tier case the original ADR warned about.

**Decision.**

```
organizations/{orgId}            JCOC network. Commercial relationship (ADR-009), network roles.
  churches/{churchId}            Joburg CoC, Tshwane, Cape Town, Durban, PE, Mthatha. Carries orgId.
    tenants/{tenantId}           One per REGION. Carries orgId, churchId, orgRole: "region".
                                 A sister church with no regions is a single region tenant.
      sectors/{sectorId}         tenantId, name. New entity.
        familyGroups/{groupId}   tenantId, sectorId, name, leader. New entity.
members/{memberId}               tenantId, sectorId, familyGroupId (ids, not names).
```

- `churches` is its own collection, not nested `organizations`. Four fixed levels are all this client needs, and a flat collection keeps rules reads cheap. A recursive org tree is the more general answer; revisit if a second client needs more than four levels.
- **Tenant stays at the region,** as in the original ADR. Admin rights, billing and the client's own sense of "my region" all sit there.
- **Sector and family group replace the loose strings.** `members.branch` becomes `sectorId`. `members.cellRegion` becomes `familyGroupId`. The base `tenants.cellGroupBranch` map (cell → branch) is already the family group → sector relationship, so the migration reads it rather than guessing.
- **Labels come from config.** "Region", "Sector" and "Family group" are JCOC's words. Other churches say campus, branch or cell, so the labels live in `lib/whiteLabel.ts` (or per-tenant settings) to keep the module portable.

**Roles.**

| Role | Scope | Replaces |
|---|---|---|
| `network_owner` | Every church and region in the org, full read including personal information, network broadcast | nothing. New. Anita and Baba D |
| `network_viewer` | Every church and region, read-only | nothing. New |
| `church_admin` | Every region tenant of one church | nothing. New. Needed if Joburg administers Tshwane through a role rather than as network owners |
| `owner` / `admin` | One region tenant | unchanged |
| `sector_leader` | One sector inside a region, **enforced in rules** | `branch_admin`, which is UI-only today |
| `family_group_leader` | One family group | `cell_leader` |

**Never map a JCOC person to the platform `super_admin` role.** On the call they were told they would be "super admins". In the code that means `network_owner`. `super_admin` is Kereke Hub staff only and is what the 2026-10-22 rules fix locks down.

**Consequences.**

- **A user can need roles in more than one tenant.** Baba D administers Soweto and Central East, which are two region tenants. Today every user has exactly one `tenantId`, and `firestore.rules` resolves access from it. Either Baba D works through `network_owner` alone, or users gain a tenant-access list (`users.tenantAccess: { [tenantId]: role }`) with an active-tenant switch. The second is a significant rules change and needs its own negative tests. Recommend deciding this before Phase 1 starts.

**A4 decision (2026-10-23, Sifiso): network role.** Baba D administers Soweto and Central East through `network_owner`, not through a tenant-access list. Consequences:
- Users keep exactly one `tenantId`. No `users.tenantAccess` and no active-tenant switch for now.
- `network_owner` gains **write** on members (add and edit) in any region tenant of its org, not only read. That is wider than the table above, so the rules need negative tests: no write into another org's tenants, `network_viewer` stays read-only, a region `owner`/`admin` still cannot write outside their tenant.
- The network view gets a **region filter** (and church filter) so Baba D can narrow to one region. It is a convenience on screen, not a security boundary; his access is network-wide either way.
- Keep tenant resolution in one helper in the rules and in `useAppUser()`, so a tenant-access list can be added later if a region-level admin ever needs more than one region.

**A4 decision, revised (2026-10-23, Sifiso): add multi-region access for leaders.** Some JCOC leaders look after more than one region, so the tenant-access list is needed now. The network role decision above still stands for Anita and Baba D. The "users keep exactly one `tenantId`" bullet is replaced by this:
- When a leader is created or edited, the person creating them picks **one or more regions**, and a role in each: `users.tenantAccess: { [tenantId]: role }`. A leader can hold different roles in different regions (for example admin in one, sector leader in another).
- The leader works in **one region at a time**, chosen with a region switcher. `users.tenantId` becomes the active region. Rules allow a switch only to a region listed in `tenantAccess`, and every read and write checks the role held in the active region.
- **Who may grant access:** a network owner may grant any region in the org. A region owner or admin may only grant their own region. Nobody can add a region to their own `tenantAccess`.
- **Negative tests, before any build:**
  - a leader cannot switch to, read or write a region not in their list;
  - a leader's role in region A gives nothing in region B;
  - a region admin cannot grant access to another region;
  - a user cannot edit their own `tenantAccess`;
  - removing a region from the list removes access immediately.
- Single-region users keep working unchanged: one entry in `tenantAccess`, and no switcher shown.
- **Answers (2026-10-23, Sifiso):**
  - **Any leader** can be given more than one region, because who looks after what keeps changing. Regions must be addable and removable on an existing leader at any time, not only at creation.
  - In practice every multi-region leader is a **region admin** (`admin` in each region tenant). Baba D is the exception: he works through `network_owner`. Sifiso called them "branch admins". In the commercial terms "branch" means region, and Sifiso confirmed it means admin of a whole region (campus), **not** the old `branch_admin`, which becomes `sector_leader`.
  - **Switching is enough.** No combined view across a leader's regions.
- The base product assumes one `tenantId` per user throughout, so this touches `useAppUser()`, the team and invite screens, `/api/invite-user`, and the rules' caller-tenant helper. Build it as part of Phase 2's role work, in its own delimited rules block.
- **Network roles read personal information across churches.** If sister churches are separate legal entities, each is its own POPIA responsible party, and head office reading their members' personal information needs a lawful basis and an agreement covering it. That is a governance question for Anita as information officer, not a technical one. Build the network roles to her answer.
- **Rollups aggregate at three levels:** region (tenant), church (sum of its region tenants), network (sum of churches). The scheduled rollup writes per tenant; church and network totals are computed from those.
- **Scoping inside a region becomes enforceable.** Because sector and family group become ids on the member, rules can check `sectorId` against the caller's assignment. The base product never enforced `branch_admin` in rules; this is the chance to fix that rather than copy it.
- **Visitors and their children are outside the member hierarchy.** A visitor has no sector or family group (Erick's point). See the visitor register in `docs/02_SCOPE.md`.
- **Estimate impact.** Phase 1 grows by the `churches` level, the sector and family group entities (instead of one campus entity), sector enforcement in rules, and possibly multi-tenant users. Rough estimate: +3 to +5 days, depending on the multi-tenant user decision. Not yet reflected in `docs/03_BUILD_PLAN.md` totals.

**Alternatives considered.**

- *Tenant per church* (Joburg as one tenant, region as a field). Makes the whole-church pull trivial, but puts region separation back on filters, contradicts per-region admin rights and per-region billing, and makes a missed filter expose one region's members to another. Rejected.
- *Tenant per sector.* Too fine. Sectors share administrators and members move between them. Rejected.
- *Nested `organizations` (parentOrgId).* More general, more complex rules and queries. Deferred until a client needs it.

**Still to confirm before this is accepted.** See open questions A1 to A5 in `docs/06_OPEN_QUESTIONS.md`.

---

## ADR-010. Phase 2 church structure, region access and role scoping

**Status:** **Accepted 2026-10-23 by Sifiso, with all six recommended decisions below.**
**Builds on:** ADR-001 revision 2 (tenant at the region) and its A4 decisions. Plan: `docs/jcoc-build-plan.md` version 2, Phase 2.
**Branch:** `feature/p2-church-structure`.

**Context.** JCOC has no structure list yet, so regions, sectors and family groups must be created, renamed and archived in the app, and members moved between them. Anita and Baba D need network-wide access. Any leader can be region admin of one or more regions, changing over time, and switches between them. The base product assumes one `tenantId` and one `role` per user, and every rule reads both from `users/{uid}`. Sector and cell scoping (`branch_admin`, `cell_leader`) exists only on screen.

**Approach in one line.** Keep the base's "one active region per user" model, which every existing rule and screen already understands, and add a controlled way to **switch** the active region. Add a narrow cross-region path only where the network view needs it (members and structure).

### Data model

```
organizations/{orgId}          name, labels?            JCOC network. Server-written only.
churches/{churchId}            orgId, name, archived    Joburg CoC, Tshwane, ... Server-written only.
tenants/{tenantId}             + orgId, churchId, orgRole: "region", archived, archivedAt, archivedBy
                               New regions get a generated id, not an owner's uid.
sectors/{sectorId}             tenantId, name, archived, archivedAt, archivedBy, createdAt
familyGroups/{groupId}         tenantId, sectorId, name, leaderMemberId?, archived, ...
members/{memberId}             + sectorId, familyGroupId   (ids, both optional)
member_audit/{auto}            tenantId, memberId, field, from, to, changedByUid, changedAt
                               Written by a Cloud Function on member update. Never client-written.
users/{uid}
  tenantId, role, roles        the ACTIVE region and the role held there (unchanged meaning)
  sectorId, familyGroupId      the active region's scope, for sector and family group leaders
  orgId, networkRole           "network_owner" | "network_viewer" | absent
  tenantAccess                 { [tenantId]: { role, roles?, sectorId?, familyGroupId? } }
  tenantIds                    keys of tenantAccess, as an array, so team lists can query it
```

- **Archive, never delete.** Archived regions, sectors and family groups disappear from pickers but stay readable, and members keep their ids. Rules deny `delete` on all three, for everyone.
- **Names are labels only.** Members hold ids, so a rename touches one document.
- **Labels** ("Region", "Sector", "Family group") come from a new `lib/whiteLabel.ts` (CLAUDE.md rule 7), created with only what this phase reads.

### Roles

| Role | Where it lives | Can do |
|---|---|---|
| `network_owner` (Anita, Baba D) | `users.networkRole` + `orgId` | Read and manage members in every region of the org. Switch into any region of the org as `admin`. Add, rename and archive regions. Grant and remove region access. |
| `network_viewer` | same | Read members in every region of the org. Switch into any region as `viewer`. Nothing else. |
| `owner` / `admin` (region admin) | `tenantAccess[t].role` | Unchanged inside their region. Manage sectors and family groups there, move members, grant access to **their own region only**. |
| `sector_leader` (replaces `branch_admin`) | `tenantAccess[t]` + `sectorId` | Read members in their sector, **enforced in rules**. Mark attendance. Cannot add members. |
| `family_group_leader` (replaces `cell_leader`) | `tenantAccess[t]` + `familyGroupId` | Read members in their family group, enforced in rules. Mark attendance. |
| `member_manager`, `member_viewer`, `viewer`, `follow_up` | unchanged | Unchanged, region-wide. |

`church_admin` from ADR-001 rev 2 is **deferred** until open question A3 is answered. Sister churches are set up as one region each until A1 is answered. `super_admin` is untouched and never given to JCOC staff.

### How region access works

1. **Granting and removing** goes through a server route (`/api/region-access`, Admin SDK), never a client write. It checks the caller: a network owner may grant any region in their org; a region owner or admin only their own region. Nobody may change their own access. Every change writes an `admin_audit` entry. Pure permission logic lives in `lib/regionAccess.ts` with unit tests.
2. **Switching** is the only client write that changes `tenantId`. The rule allows it only if the new region is in the user's `tenantAccess` (or, for network roles, belongs to their `orgId`), and only if `role`, `roles`, `sectorId` and `familyGroupId` are set to exactly what that entry says. The switcher does a full reload so the cached user in `useAppUser()` is replaced.
3. **Removing the active region** makes the server move the user to another region in their list, or to none. In addition, a rules helper treats a user whose active `tenantId` is no longer in `tenantAccess` as having no region, so access ends immediately even if the server step fails.
4. **Users with one region** get one entry and see no switcher. Existing single-tenant users without `tenantAccess` keep working (the helper treats a missing map as legacy).
5. All other client writes to `users` (self-edit, the owner's team page) may no longer touch `tenantId`, `role`, `roles`, `sectorId`, `familyGroupId`, `tenantAccess`, `tenantIds`, `orgId` or `networkRole`. This also closes the inherited hole where users could set their own `assignedBranch` and `assignedCellRegion`. Role changes on the team page go through the server route.

### Network view

A "Network" page for network roles lists members across regions, filtered by church, region, sector and family group. It fans out one query per region (`tenantId == X`). That keeps each query provable by the rules. The rule adds one path on `members`, `sectors` and `familyGroups`: read when the caller has a network role and the document's tenant has the caller's `orgId`. For everything else (attendance, events, settings), network owners switch into the region and use the normal screens.

### Rules shape

- New helpers in one place: `activeTenantId()`, `hasNetworkRole()`, `tenantInCallerOrg(tenantId)`. Existing rules that call `userTenantId()` keep working.
- Sector and family group scoping is added to `canReadMembers` for the two leader roles: the member's `sectorId` or `familyGroupId` must match the caller's. **List queries from those roles must filter on the same field**, or Firestore rejects them. The roster, celebrations and member-updates pages change their queries to match.
- New collections sit in a delimited `CHURCH STRUCTURE` block, and region access in a `REGION ACCESS` block.

### Replacing the branch and cell strings

The 13 files that read `branch`, `cellRegion`, `assignedBranch`, `assignedCellRegion` and the tenant's `branches`, `cellGroups` and `cellGroupBranch` lists switch to sector and family group ids and pickers. JCOC has no legacy data in this project, so nothing is migrated here. A migration script (pure mapping in `lib/`, using `cellGroupBranch`) is written and unit-tested for the later port to Kereke Hub, and logged in `07_PORTING_LOG.md`.

### Negative tests to write first (in `tests/rules/`)

- A region admin cannot read or write members, sectors or family groups of another region.
- A multi-region leader cannot switch to a region not in their list, cannot switch while setting a role other than the one listed, and has no rights in region B from their role in region A.
- No user can write their own `tenantAccess`, `tenantIds`, `networkRole` or `orgId`. No client can write anyone's.
- A region owner cannot delete a user who also has another region.
- A user whose active region was removed loses access at once.
- A network owner cannot read or switch into a region of another org. A network viewer cannot write anything.
- A sector leader cannot read a member of another sector, cannot list members without the sector filter, and cannot add members. The same applies for family group leaders.
- No one can delete a region, sector or family group. No client can create a region or church.
- A member cannot add members, and a visitor record never becomes a member (ADR-004 style, from Prompt C).
- `member_audit` cannot be written or deleted from a client.

### Inherited bug to fix in passing

`app/api/communications/email/route.ts` logs broadcasts with `tenantId: uid` (the sender), not the sender's tenant. It is wrong for anyone but a founding owner, and more so with switching. The same bug is in upstream.

### Estimate

| Piece | Days |
|---|---|
| Org, church, region documents; server routes to add, rename, archive regions | 2 |
| Sectors and family groups: entities, management screen, moving members | 2 |
| Replace branch and cell strings across 13 files; port migration script | 2 |
| Region access: server route, switch rule, switcher, team page | 3 |
| Network role rules and the Network page with filters | 2.5 |
| Sector and family group scoping in rules, query changes | 1.5 |
| Rules tests (negative first) | 1.5 |
| `member_audit` Cloud Function (recommended, see decision 5) | 1 |
| Seed one invented campus, `lib/whiteLabel.ts` labels, click-through | 1 |
| **Total** | **~16.5** |

This replaces most of the old Phase 1 (21 days) but not the rollups or network broadcast, which move to plan Phase 6. It is longer than a prototype allows. See the decisions.

### Decisions for Sifiso

1. **Adding and archiving regions:** network owners only. The plan says campus admins too, but a region admin creating new regions bypasses the commercial setup (each region is billed). Region admins manage sectors and family groups in their own region.
2. **Sector and family group leaders:** they read their own people and mark attendance, and do not add members (plan: "only named admins add members").
3. **Network owners** use the switcher for normal screens, plus the cross-region Network page. There is no special network version of every screen.
4. **Deferred:** `church_admin` (A3), sister churches with regions of their own (A1), rollups and network email (Phase 6).
5. **Member change history (`member_audit`):** build it now. It is plan v2's port item, Anita is a POPIA officer, and moving members between sectors is exactly the change worth recording. About 1 day.
6. **Prototype:** Phase 2 alone is about 16 days, so phases 1 to 3 do not fit "end of week, latest Monday". Decide what the prototype shows (P1).

**Implemented 2026-10-23** on `feature/p2-church-structure`, not merged. As designed, with three refinements found while building:
- Browser writes that change an audited member field (status, membership, roles, marital status, life phases, sector, family group, branch, cell) must stamp `updatedBy` = the user's uid and `updatedAt` = server time; the rules enforce it, so the change history can name who made each change.
- Region admins may promote a congregation member of their region (a non-region role is below every region role).
- Inviting an email that already has an account in the network adds the region to that account instead of refusing. That is how a leader gets a second region.
See `handovers/2026-10-23-phase-2-church-structure.md`.

---

## ADR-011. Phase 3 life phases: rules engine, overrides and the 1 January review

**Status:** **Accepted 2026-10-23 by Sifiso, with all the recommended decisions below.** Decisions that need Anita (for example who may collect a child) are built as recommended and flagged for her confirmation.
**Builds on:** ADR-002 (phases are an array), ADR-003 (yearly, previewed, never silent), ADR-010 (`member_audit`, stamped writes). Spec: `docs/jcoc-build-plan.md` v2, Phase 3.
**Branch:** `feature/p3-life-phases`, cut from `feature/p2-church-structure`.
**Revises ADR-003 in one place:** children up to the year they turn 13 now have a school grade (JCOC's sheet, confirmed 23 October), where ADR-003 said "no grade bands". Everything else in ADR-003 stands.

### The core idea

Life phases are **worked out, not typed in**. One pure function (`lib/lifePhases.ts`) takes a person, their household and the year, and returns their phases. It is the only place the rules live, so the save, the yearly review and the tests all agree. Admins can add phases by hand or switch an automatic one off, and those choices survive every recalculation.

### Data on the member

| Field | Meaning |
|---|---|
| `lifePhases: string[]` | What everyone sees and filters on: automatic phases, minus any switched off, plus any added by hand |
| `lifePhasesAuto: string[]` | What the rules gave, kept so the review can show what changes |
| `lifePhasesAdded: string[]` | Added by an admin (for example Single Mom, Campus Student for an older student) |
| `lifePhasesRemoved: string[]` | Automatic phases an admin switched off (for example Empty Nester for someone the rule gets wrong) |
| `gradeAdjust: number` | Children only. 0 by default; +1 started a year early, −1 repeated. Grade is worked out each year, never stored, so nothing has to "move up" in January |
| `marriageType` | `civil`, `customary` or `religious`. New field on the form |
| `anniversaryDate` | Already exists (quick win 1). Used as the wedding date; no second date field |

`maritalStatus` stays (Single, Married, Divorced, Widowed). It is an input to the rules, not a phase.

### The rules (JCOC's sheet)

Everything uses **age this year** = this year − birth year, in the region's time zone, and **grade this year** = age this year − 6 + `gradeAdjust` (Gr R = 0, Gr 00 = −1, Gr 000 = −2).

Children (member records only; children who are not members still count for their parents):

| Phase | Rule | Also holds |
|---|---|---|
| Baby | age this year 0 or 1 | Child |
| Pre-School | age 2 to 6 and grade Gr R or below | Child, Kidz Zone |
| Scholar | grade 1 to 5, and turning under 14 | Child, Kidz Zone |
| Pre-teen | grade 6 or higher, and turning under 14 | Child, Scholar, Kidz Zone |
| Teen | turning 14 to 17 this year, whatever the grade | Scholar while grade is 12 or lower |
| Campus Student | turning 18 to 20 | |

Adults (age this year 21 or more, or married/widowed/divorced at any age from 18):

| Phase | Rule |
|---|---|
| Young Single / Mature Single | Single and turning under 25 / 25 or more |
| Young Married / Mature Married | Married and wedding year less than 5 / 5 or more years ago. No wedding date: neither, admins set it by hand |
| Widowed, Divorced | From marital status |
| Parents of Kids <10 / >10 / <>10 | From the household's dependent children (turning 20 or under): all turning 10 or under / all 11 or over / both |
| Teen Parent | Any dependent child in the Teen phase |
| Empty Nester | Has children, and the youngest turns 21 or more |
| Single Mom, Single Dad | By hand only |

"Parents" are the primary member and spouse of a household; "children" are the household's member children plus its non-member children (`households.nonMemberChildren`). Automatic parent phases only work when children are linked, as the plan says.

### When phases are worked out

1. **On every save**, through a Cloud Function (`onMemberWrittenLifePhases`): when a member's birth date, marital status, wedding date, grade adjustment, household or manual choices change, it recalculates that person and everyone in their household, and writes only if something changed (so it cannot loop). Doing it on the server means every screen and the importer get it, not just the roster. These derived changes show in `member_audit` as made by "system".
2. **The 1 January review.** Early on 1 January a scheduled function works out every region's changes for the new year and saves them as a **proposal**, not as changes. A region admin sees "who changes, from what, to what" on a **New Year review** page and approves it (all at once, or leaving some people out). Only then are the changes written, with one `member_audit` entry each. An approved review can be undone for 30 days. Until approved, members keep last year's phases. This is ADR-003's "previewed, never silent".

### Filtering

The roster and the Network page get a life phase filter: pick several phases and choose "has all of these" (for example Mature Married and Parents of Kids <10) or "has any of these". Filtering happens in the browser on the list already loaded, so there is no limit on combinations.

### Old data

`lib/lifePhases.ts` also holds the mapping from the old system's marital statuses, for the importer later: "Traditional Marriage" becomes Married with `marriageType: customary`; "Scholar/Student" becomes Single (the phase follows from age).

### Rules (security)

- Only people who can already edit members (region owner/admin, member manager, network owner) can change `lifePhasesAdded`, `lifePhasesRemoved`, `gradeAdjust` and `marriageType`, and the change is stamped (they join the audited fields).
- `lifePhases` and `lifePhasesAuto` are written by the server only. A browser write that touches them is refused.
- `lifePhaseReviews/{tenantId_year}`: read and approve by that region's owner/admin and network owners; written otherwise by the server only; never deleted.

### Tests, before the build

Unit tests on `lib/lifePhases.ts`: 31 December against 1 January; children born on 1 January and on 31 December; a child turning 14 while in Grade 7 (Teen, Scholar, no Kidz Zone); a child in Grade 8 turning 13 (Pre-teen, Kidz Zone); started early and repeated (grade adjustment); Teen to Campus Student at 18 and Campus Student to Young Single at 21; families with several children (<10, >10, <>10, Teen Parent, Empty Nester); no wedding date; manual add and remove surviving a recalculation. Rules tests: browsers cannot write the computed fields; only editors can set overrides; reviews readable and approvable only inside the region (and by network owners).

### Estimate

| Piece | Days |
|---|---|
| Rules engine and unit tests | 2 |
| Member form: phases shown, add/remove, grade adjustment, marriage type | 1.5 |
| Save trigger (household recalculation) and rules | 1.5 |
| New Year review: scheduled proposal, review page, approve, undo | 3 |
| Life phase filters on roster and Network page | 1 |
| Seed, click-through, handover | 1 |
| **Total** | **~10** |

### Decisions for Sifiso

1. **The 1 January changes wait for an admin's approval** (ADR-003), rather than applying automatically as plan v2 says. Recommended: approval, because one wrong rule across a region is hard to undo by hand. Day-to-day saves still update straight away.
2. **Teen ends at 18; Campus Student is 18 to 20; single adults start at 21.** Plan v2 has Teen "up to 18" and Campus Student "18 to 21". Confirm with Anita.
3. **Teens keep Scholar until Grade 12**, using the worked-out grade. Plan v2 does not say when Scholar ends.
4. **Teen Parent means a dependent child in the Teen phase (turning 14 to 17)**. The sheet says "parent with teens".
5. **Campus Student is automatic for everyone aged 18 to 20**, studying or not (plan v2, "confirm"). Admins can switch it off per person.

---

## ADR-012. Phase 4 visitor register and children's check-in

**Status:** **Accepted 2026-10-23 by Sifiso, with all the recommended decisions below.** Decisions that need Anita (for example who may collect a child) are built as recommended and flagged for her confirmation.
**Builds on:** ADR-008 (screen-based collection code, audit trail), ADR-011 (children's bands), `docs/02_SCOPE.md` B5 and B10. Plan v2 Phase 4.
**Branch:** `feature/p4-visitors-kids`, cut from `feature/p3-life-phases`.

### What exists today

- `visitors` holds **one document per visit**, created on the dashboard only. A returning visitor becomes a new document; nothing joins them up. Follow-up workflows hang off these documents.
- **No children's check-in of any kind exists.**
- The service QR check-in page searches the whole member list by name and only works on a signed-in steward's device.

### Visitor register

- **One visitor, many visits.** A `visitors` document becomes the **person**, and each visit is a document in `visitors/{id}/visits`. When someone is captured, the app first looks for the same cell number in the region. A match adds a visit to the existing person instead of creating a duplicate, and the screen says "Welcome back, third visit".
- **Visitor children** live on the visitor: `children: [{ id, firstName, lastName, dob, allergies }]`. They never become member records.
- **Follow-up keeps working.** Workflows still attach to the visitor document; only the first visit (or a returning visitor after a long gap, configurable) starts a new follow-up.
- **Never becomes a member automatically.** No code path writes `members` from a visitor. Becoming a member stays the normal admin process. A rules test already proves the follow-up team cannot create members; one more covers "visitor data cannot be copied into members by the follow-up team".
- Visit history, visit count and last visit show on the visitor's page, for the follow-up team.

### Children's check-in (Safety Nest)

- **Classes.** `childClasses/{id}` per region: name (for example "Pre-School", "Scholars Gr 1–3"), which children belong by default (by Phase 3 band or grade range), capacity, and the teachers who run it. Managed by region admins on a Children's Ministry settings page.
- **New region role `children_teacher`**, scoped to their classes. Teachers see only the children checked into their class today, with the guardian's name and number and any allergy or medical note. They see nothing else of the roster.
- **Check-in on the teacher's tablet.** The parent searches for their child (members' children through their family; visitors' children through the visitor register, or captured on the spot: child's name and age, parent's name, cell number, email). Siblings check in together in one step.
- **Collection code.** On check-in the app makes a 4-digit code, shows it on screen and sends it to the guardian's phone by SMS when the church has BulkSMS set up (WhatsApp is not available). The code is stored where browsers cannot read it (`childCheckinSecrets`, server only). Check-out goes through a server route that compares the code, so a teacher's device can never list codes.
- **Who may collect.** At drop-off, the parent may name other adults allowed to collect (decision 1 below). At check-out the teacher picks who is collecting: the dropping-off adult or a named adult, plus the code. Anyone else needs a **supervisor override** (region admin or a named supervisor), with a reason, logged prominently.
- **Audit trail.** `childCheckins/{id}` records class, date, child, guardian, who checked in and when, who collected and when, and any override. Records are never edited after check-out and never deleted from the browser. Attendance history per child comes from these records.
- **Never touches members.** Check-in creates no member and changes no member record (ADR-008).

### Medical and allergy notes

A new optional `medicalNotes` field on member children (and `allergies` on visitor children), shown only to the child's class teacher and admins. This is special personal information under POPIA, so it is captured only where `consentedToSpecialInfo` is true.

### Rules (security), tests first

- `children_teacher` reads `childCheckins` for their own classes and today only; cannot read members, visitors or other classes.
- No browser can read `childCheckinSecrets`. No browser can mark a child as collected; only the check-out route can.
- Check-in records cannot be deleted, and cannot be changed after check-out.
- Visitors and visitor children stay readable only by the follow-up team and region staff, as today.
- Negative tests for each of the above, plus another region's teacher, a member, and a visitor record being turned into a member.

### Estimate

| Piece | Days |
|---|---|
| Visitor register: person and visits, returning-visitor match, children, history | 3 |
| Classes, teacher role, settings page | 2 |
| Check-in screen: search, siblings, visitor child capture | 2.5 |
| Codes, SMS, check-out route, supervisor override | 2.5 |
| Audit records, per-child history, rules and tests | 1.5 |
| Seed, click-through, handover | 1 |
| **Total** | **~12.5** (the plan had 8 for check-in and 3 for the register) |

### Decisions for Sifiso (and Anita)

1. **Who may collect a child.** ADR-008 says only the adult who signed in; plan v2 says "the same parent, or another listed adult". Recommended: the dropping-off adult, or an adult the parent names at drop-off; anyone else needs a logged supervisor override. **Confirm with Anita: this is a safeguarding rule.**
2. **Class names and age bands** (open question L). Until JCOC gives them, seed classes follow the Phase 3 bands: Babies, Pre-School, Scholars, Pre-teens.
3. **How long check-in records are kept** (open question L). Recommended: keep them, and decide a retention period with Anita before go-live. No automatic deletion is built now.
4. **SMS for the collection code** uses the church's BulkSMS account if set up (about 19c a message). Without it, the code shows on screen only and the parent takes a photo.

---

## ADR-013. Phase 5 event registration with proof of payment

**Status:** **Accepted 2026-10-23 by Sifiso, with all the recommended decisions below.** Decisions that need Anita (for example who may collect a child) are built as recommended and flagged for her confirmation.
**Builds on:** ADR-004 (registration never touches members), ADR-005 (uploads through a server route), ADR-006 (per-event verifiers, hold and re-upload). Plan v2 Phase 5; `docs/02_SCOPE.md` B4.
**Branch:** `feature/p5-event-registration`, cut from `feature/p4-visitors-kids`.

### What exists today

- **Events** have no price or payment fields. RSVPs are name, phone, email and "attending/maybe/declined".
- **Two open doors in the rules:** `event_rsvps` and `form_submissions` both allow anyone on the internet to create any document with any fields (`allow create: if true`). The public RSVP page already uses a server route, so the open rule is not even needed for it.
- **No file uploads from the public**; Storage refuses anything not signed in, which is correct and stays that way.
- Event check-in requires a member login and checks no RSVP.

### Design

- **Registration settings on the event** (`events.registration`), each switched on per event: amount due (ZAR); bank details and the reference to use; proof of payment required; optional fields (T-shirt size, transport, dietary needs, choice of church or region); youth indemnity upload for under-18s; capacity; closing date. Plus `organiserUid` and `verifierUids` (ADR-006).
- **`registrations/{id}`**, its own collection (ADR-004). Status: `awaiting_payment` → `payment_uploaded` → `confirmed`, or `payment_rejected` (with a reason; the registrant uploads again) or `cancelled`. **A registration counts towards capacity once proof is uploaded.**
- **Public registration page** `/register/[eventId]`: no login, no member lookup. It submits to a server route that checks the event is open and has room, validates every field, and returns a private link the registrant uses to upload proof, check their status and see their ticket. Basic rate limiting per phone number and per IP.
- **Uploads** go through a server route (ADR-005): PDF or image, 10 MB maximum, stored privately under the region's folder. Verifiers open files through short-lived links from the server, never public links.
- **Verification queue** on the event page: the organiser and named verifiers approve, or reject with a reason. Approving sends the ticket.
- **Ticket and QR check-in.** A confirmed registration gets a QR code (in the confirmation email and on the status page). At the event, the organiser's phone scans it (or types the short code) and the server marks it checked in once, only if confirmed.
- **Messaging registrants** by email through the church's Brevo account, filtered by status or by church/region. (Mailchimp is still undecided; open question.)
- **Choice of church or region** lists the network's regions by name only.

### Rules (security), tests first

- `registrations` and uploads: **no browser writes at all**. Everything goes through the server routes. Staff with event rights and the event's verifiers can read; verifiers see only their events.
- **Close the two open doors:** `event_rsvps` create only by a signed-in member for themselves in the event's region (the public page keeps working through its server route); `form_submissions` create only with the form's real `tenantId`, the form active, and a size limit.
- Negative tests: another region's staff, a verifier of a different event, a registrant reading someone else's registration, and the two closed doors.

### Estimate

| Piece | Days |
|---|---|
| Registration settings on events | 3 |
| Public page and registration route, rate limits | 3 |
| Upload route, private storage, signed links | 2 |
| Verification queue, statuses, re-upload | 3 |
| Tickets and QR check-in | 2.5 |
| Messaging registrants | 2 |
| Closing the open doors, rules and tests | 1.5 |
| **Total** | **~17** (as in the original plan) |

### Decisions for Sifiso

1. **A registration counts once proof is uploaded**, not only once confirmed, so places are held while verifiers catch up. (Plan: "before the registration counts".)
2. **Close the two open rules** (`event_rsvps`, `form_submissions`) in this phase. They are holes in the base product too, so they go on the porting list.
3. **Still needed from JCOC** (open questions I, J, K): the youth indemnity template, banking details and payment reference format, and the T-shirt, dietary and transport options. The build uses editable placeholders until then.
4. **Email only for registrant messages** for now; Mailchimp waits for a decision.

---

## Known base-repo quirks to work around, not build on

**Two WhatsApp send contracts.** The deployed Baileys service expects `POST /message/send` with `{ phoneNumber, message }` plus `X-Service-Key` and `X-Tenant-Id`. The Next.js route `app/api/whatsapp/send-message/route.ts` posts `{ sessionName, phone, message }` with only `X-Service-Key`, targeting an older wppconnect shape. The Baileys contract is the live one.

**"STOP SUMMARY" is advertised but not wired.** Outbound daily summaries tell the recipient to reply STOP SUMMARY. Nothing listens for inbound messages, so the reply is silently discarded.

**Duplicate Firebase admin helpers.** `lib/firebase-admin.ts` and `lib/firebaseAdmin.ts` both exist, and again under `app/lib/`. Pick one per file; do not add a third.

**`branch` is a string, not an entity.** Under ADR-001 this becomes the campus entity; under ADR-001 revision 2 it becomes `sectorId`, and `cellRegion` becomes `familyGroupId`. Migrate it, do not leave both alive.

**Daily summary marks before it sends.** A failed send is logged and never retried that day. Deliberate, to avoid double-sends, but worth knowing if anyone reports a missing summary.
