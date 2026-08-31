# Open Questions

Live document. Answer items in place, move them to Answered with a date, and do not delete them.

**Client:** Joburg Church of Christ (JCOC), johannesburg.church
**Approvers:** Anita Pearson and Oludolapo Ogundipe ("Baba D"), both
**Contracting:** Head office holds the contract, campuses subcontract under it
**Plan:** Bespoke, all features enabled

---

## Still blocking

| # | Question | Who answers | Blocks |
|---|---|---|---|
| A | Are Cape Town, Durban, PE and Tshwane **regions** of one national church, or **separate churches** each with regions underneath? If the latter, we need four tiers, not three | Anita | ADR-001 data model. Ask before writing it |
| B | Complete life phase taxonomy, adult and child, with progression rules for each | Anita, via Sifiso | Phase 2 roll-over engine. Machinery can start, rules cannot |
| C | Name of the current platform, and a sample data export | Anita, via Sifiso | Phase 5 estimate, and it is currently the largest unknown |
| D | How do they mark their register? They will advise | Anita | Phase 0 gate. Care tiers, analytics, and retention all depend on it |
| E | Full region list with member numbers per region | Anita | Campus and region setup, rollup design |
| F | Which region pilots | Anita | Phase 5 |
| G | Named head office people who may view region-level personal information, and at what depth | Anita | Network roles. She said multiple people, list to follow |

## Non-blocking, needed before the relevant phase

| # | Question | Phase |
|---|---|---|
| H | Confirm roll-over is calendar year rather than school year, given her reasoning was school-stage-driven. In South Africa these mostly coincide, but the phase rules may assume one | 2 |
| I | Youth indemnity form template, and their most complicated past registration forms | 3 |
| J | Banking details and payment reference format for registrants | 3 |
| K | Standard t-shirt size list, dietary options: fixed list or free text, transport as yes/no or pickup point | 3 |
| L | Children's ministry age bands and class names; current sign-in process and safeguarding controls; who may collect a child and how that is verified today; retention period for check-in records | 4 |
| M | Brevo account and DNS access for sender authentication. Note the free tier caps at 300 emails a day, and a network-wide send will exceed that | 5 |
| N | BulkSMS account, if SMS is wanted | 5 |
| O | POPIA information officer details, existing privacy notice, current consent wording, retention policy | 5 |
| P | JCOC branding: logo, colours, how the name should appear to members. Note regions may want to inherit rather than brand separately | 5 |

## New requests arriving mid-build

Anything not in `docs/02_SCOPE.md` goes here with an estimate before it gets built. Nothing gets silently absorbed.

| Date | Request | From | Estimate | Decision |
|---|---|---|---|---|
| | | | | |

## Answered

| # | Question | Answer | Date |
|---|---|---|---|
| 1 | Client organisation name | Joburg Church of Christ (JCOC), johannesburg.church | 2026-08-31 |
| 2 | The campus transcribed as "Swanee" | Tshwane. Not Eswatini as originally assumed | 2026-08-31 |
| 3 | Attendance capture method | They will advise. Still a Phase 0 gate, but now client-owned | 2026-08-31 |
| 4 | Hierarchy | Head office, then region, then campus. Three tiers. Drove the ADR-001 rewrite | 2026-08-31 |
| 7 | Roll-over trigger | Calendar year | 2026-08-31 |
| 8 | Member self-service edits | Queue for admin approval, do not apply directly. ADR-007 | 2026-08-31 |
| 9 | Who verifies proof of payment | The event organiser, who can also assign additional people. Per-event, not a global role. ADR-006 | 2026-08-31 |
| 10 | Rejected payment behaviour | Hold and allow re-upload. Do not cancel | 2026-08-31 |
| 11 | Children's collection code | Screen-based. No label printing. ADR-008 | 2026-08-31 |
| 13 | Who approves | Both Anita Pearson and Oludolapo Ogundipe | 2026-08-31 |
| 14 | Contracting structure | Head office contracts for the main system, campuses subcontract under it. ADR-009 | 2026-08-31 |
| 15 | State of "Safety Nest" children's check-in | **Not started.** It was discussed, not built. Full 8-day build, and it was represented on the call as nearly ready | 2026-08-31 |
| 16 | Plan and tier gating | Bespoke plan, everything enabled. Resolve tier from the organisation, not per tenant. ADR-009 | 2026-08-31 |
