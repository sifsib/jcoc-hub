# Build Plan

## Estimating basis

Days below are **developer days of focused build**, assuming AI-assisted development at roughly the pace the existing Kereke Hub codebase was produced. They do not include client response time, review cycles, or the discovery sessions that have to happen first.

I have deliberately not compressed these to match what was said in the meeting. Narrow features on an existing foundation genuinely can land in a day or two, and the birthday pull is a good example. The network architecture is a different class of work and pretending otherwise just moves the pain later.

---

## Phase 0. Discovery and setup
**Elapsed: 1 week. Effort: 4 days.**

Nothing gets built until these are closed, because most of them change what gets built.

| Task | Days |
|---|---|
| Attendance capture. JCOC will advise how they mark their register; we design to it | 1 |
| Confirm whether Cape Town, Durban, PE, Tshwane are regions or peer churches. Three tiers or four. Then lock the region and campus list | 0.5 |
| Collect life phase taxonomy, adult and child, with progression rules | 0.5 |
| Review their current platform export, assess data quality | 1 |
| Fork the repo with upstream remote and `fork-point` tag, strip marketing assets, separate Firebase project, environments, CI | 1 |

**Gate:** attendance method agreed, campus list confirmed, sample data export received. Do not proceed past this without all three.

---

## Phase 1. Network foundation
**Elapsed: 5 weeks. Effort: 21 days.**

The riskiest phase and correctly the first. Everything else assumes campuses exist.

| Task | Days |
|---|---|
| `organizations` data model, `orgId` and `orgRole` on region tenants, backfill script | 3 |
| `campuses` entity inside region tenants, migrate and retire the `branch` string | 2 |
| Org-level tier resolution so the bespoke all-features plan applies to regions added later | 1 |
| Network roles and cross-tenant Firestore rules | 3 |
| Rules test suite, including deliberate negative tests for cross-org leakage | 2 |
| HQ console: network overview, per-campus cards, read-only drill-through | 4 |
| Scheduled rollup function and `campus_rollups` documents | 2 |
| Network broadcast: compose, campus selection, fan-out, delivery report | 4 |

**Gate:** a network admin can see all campuses, a campus admin can see only their own, and a security review has confirmed there is no read path from one campus into another. This gate is not negotiable. Anita is a POPIA officer and a cross-campus leak is the one failure that ends the relationship.

---

## Phase 2. Membership and life phases
**Elapsed: 3 weeks. Effort: 14 days.**

| Task | Days |
|---|---|
| `lifePhases` array model, configurable taxonomy, migration from `maritalStatus` | 3 |
| Roll-over engine: progression rules, dry-run preview, apply, audit, undo | 4 |
| Parent phase derivation from linked children | 2 |
| Member self-editable field settings, plus the change-approval queue and review screen | 3 |
| Anniversary capture, birthday and anniversary pull for a date window | 2 |

**Gate:** run the roll-over dry-run against imported real data and have Anita review the diff. If she agrees with what it proposes, we have solved her worst annual job. If she doesn't, the rules are wrong and we fix them before anyone runs it live.

---

## Phase 3. Event registration
**Elapsed: 4 weeks. Effort: 17 days.**

| Task | Days |
|---|---|
| Per-event registration form builder on the existing forms engine | 4 |
| `file_upload` field type, signed upload route, Storage rules for public uploads | 3 |
| Payment amount, per-event verifier assignment, review queue, hold-and-re-upload lifecycle | 4 |
| Standard fields: t-shirt, dietary, transport, campus selector, indemnity | 1 |
| Registrant communications with status and campus filtering | 3 |
| QR check-in validated against confirmed registrations | 2 |

**Gate:** run one real event end to end. Registration through payment upload through approval through check-in. A dry run on a small event is worth more than any amount of internal testing here.

---

## Phase 4. Children's ministry and segmentation
**Elapsed: 3 weeks. Effort: 13 days.**

| Task | Days |
|---|---|
| Child check-in and check-out, guardian match, screen-based collection code, supervisor override | 4 |
| Rooms, capacity, session register, medical and allergy notes | 2 |
| Safeguarding audit trail and reporting | 2 |
| Segment builder across campus, ministry, life phase, volunteer role, group | 3 |
| Saved segments, recipient preview, wired into email and SMS | 2 |

**No reduction available.** Safety Nest has not been started. It was discussed, not built. The full eight days stand, and see the risk register below, because Anita was told on the call it would be out within a week.

---

## Phase 5. Migration, white-label, pilot, rollout
**Elapsed: 5 weeks. Effort: 17 days.**

| Task | Days |
|---|---|
| Import mapping tool for their export format, dedupe, validation report | 3 |
| Pilot campus setup, UAT, defect fixes | 4 |
| Remaining campus rollout and configuration | 2 |
| Training sessions and written documentation per role | 2 |
| POPIA pack: privacy notice, processing agreement, consent wording, retention settings | 2 |
| White-label configuration, custom domain, sender authentication, attribution | 4 |

**Gate:** pilot campus running live for two full weeks with no critical defects before campus two goes on.

---

## Summary

| Phase | Elapsed | Effort |
|---|---|---|
| 0. Discovery and setup | 1 week | 4 days |
| 1. Network foundation | 5 weeks | 21 days |
| 2. Membership and life phases | 3 weeks | 14 days |
| 3. Event registration | 4 weeks | 17 days |
| 4. Children's ministry and segmentation | 3 weeks | 13 days |
| 5. Migration, white-label, pilot, rollout | 5 weeks | 17 days |
| **Total** | **~21 weeks** | **~86 days** |

Call it five months to full network rollout, with the pilot region live somewhere around week twelve or thirteen.

The estimate moved up by three days on Phase 1, one day each on Phases 2 and 3, and four on Phase 5. All of it comes from confirmed answers rather than drift: the third tier and the campus entity, the change-approval queue instead of direct edits, per-event verifier assignment instead of a global role, and the white-label build. That is the estimate doing its job.

### Compressing it, if that's needed

Phases 2, 3, and 4 have no hard dependency on each other. They all depend on Phase 1. With two developers running in parallel after Phase 1, elapsed time drops to roughly thirteen weeks. Effort does not change, it slightly increases with coordination overhead.

Phase 3 could also be pulled forward and delivered against a single campus before the network layer exists, if the Client has an event coming up that they want to run on the new system. That is a reasonable trade if there is a real deadline behind it, and it would give them something tangible early. It does mean touching event code twice.

### What I would deliver early, regardless

Two quick wins that cost almost nothing and buy a lot of goodwill:

- **Birthday and anniversary pull.** Two days, sits on existing foundations, and it removes a weekly manual task Anita described in some detail. She will notice it every Friday.
- **Member self-editable field settings.** Two days, and it closes the first commitment made on the call.

Shipping those inside the first fortnight changes the tone of the whole engagement.

---

## Sequencing rationale

Network first, because campus identity is a foreign key that everything else hangs off. Building events or life phases first means building them single-campus and then retrofitting campus scoping into them, which is more total work and introduces exactly the sort of half-scoped query that leaks data.

Life phases before events, because the campus selector on event registration and the segment builder both want to filter on phase.

Migration last, because importing real member data into a schema that is still changing means importing twice.

Children's ministry could move earlier if there is a term-start deadline behind it. It has few dependencies.

---

## Risk register

| Risk | Impact | Handling |
|---|---|---|
| Attendance capture stays unsolved | High. Care tiers, analytics, and retention features all sit empty | Phase 0 gate. Do not start Phase 1 without a decision |
| Cross-campus data leak through rules error | Severe. POPIA exposure, relationship over | Dedicated rules test suite with negative tests, independent review before Phase 1 sign-off |
| Migration data is dirty or the export is poor | Medium to high. Blows out Phase 5 | Get a sample export in Phase 0, not Phase 5 |
| Timeline expectations set in the sales call | Medium. Damages trust early | Reset explicitly in the proposal document. Better an awkward conversation now |
| Scope creep, because the answer in the meeting was consistently "yes we can build that" | High | Written change control from the start. Every new request gets estimated and scheduled |
| **Fork divergence.** 69 of 86 days are product features that will be stranded in a client repo | High, and it compounds. AFM Gauteng wants the org layer already | Build the five product features as portable modules with clean seams. Log every one in `docs/07_PORTING_LOG.md` at merge time |
| **Client assumes they own the code.** A white-labelled system on their own domain in its own repo invites it | High commercially. Would block selling the org layer to anyone else | Licence, do not transfer. Get the clause agreed before Phase 1 starts, not after they see it working |
| **Safety Nest was promised on the call and does not exist** | High. Anita was told a working children's check-in would be out within a week. It has not been started | Correct this in writing, early, before she asks. Eight days of build sits behind it and it lands in Phase 4, roughly month three. This is the single most likely thing to damage trust in the first fortnight |
| Three tiers or four, unresolved | Medium to high. Rewriting the org model after Phase 1 is expensive | **Answered in the follow-up meeting: sister churches, so four levels plus sectors and family groups.** ADR-001 revision 2 accepted 2026-10-22. Follow-ups A1 to A5 in `docs/06_OPEN_QUESTIONS.md` |
| Head office access to region-level personal information not yet defined | Medium. POPIA governance question, not a technical one | Partly answered: Anita and Baba D see everything. Still open: anyone else (G), and the lawful basis if sister churches are separate legal entities (A5) |
| **Prototype promised in the follow-up meeting** | High. Sifiso committed to a working prototype "by end of week, latest Monday", based on one sector, with contracting to follow. The network layer alone is about three weeks of work. Same pattern as Safety Nest | Decide what the prototype will actually show (for example the base product configured with their sectors, family groups and life phases), and tell the client in writing before the date passes. Open question P1 |
| **Pricing quoted against scope** | High commercially. Quoted: R3,000 once-off build, R159 a month, R79 a month per region and per sister church, against ~86 developer days | Confirm the figures and the licence clause in writing before contracting. Open question S |
| **Key-person dependency, raised by the client** | Medium to high. Erick asked before Sifiso had joined; the meeting itself started late because Sifiso was travelling without a laptop | The support arrangement described on the call (a team of three) must be real and written into the agreement with response times. Open question R |
| **New requests absorbed on the call** | Medium. Visitor register agreed on the call; Mailchimp integration implied; monthly report raised | Logged with estimates in `docs/06_OPEN_QUESTIONS.md`. Visitor register adds ~3 days to Phase 4. Not yet reflected in the totals above |
