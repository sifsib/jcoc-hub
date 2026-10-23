# Open Questions

Live document. Answer items in place, move them to Answered with a date, and do not delete them.

**Client:** Joburg Church of Christ (JCOC), johannesburg.church
**Approvers:** Anita Pearson and Oludolapo Ogundipe ("Baba D"), both
**Also involved:** Erick Li Sik (joined the follow-up meeting)
**Contracting:** Head office holds the contract, regions and sister churches come on per region (see item S)
**Plan:** Bespoke, all features enabled

---

## Still blocking

| # | Question | Who answers | Blocks |
|---|---|---|---|
| A1 | Do the sister churches (Tshwane, Cape Town, Durban, PE, Mthatha) have regions and sectors of their own, or is each one flat? | Anita / Baba D | ADR-001 revision 2. Decides whether a sister church is one tenant or several |
| A2 | Exact list of Joburg regions. Baba D said three regions; Soweto, Northwest and "Central East" were named, but his report columns read "Central, East, Northwest". Is Central East one region or two? | Baba D | Region tenant setup, rollups |
| A3 | Tshwane "falls under" Joburg and Joburg "still administers" it. Does a Joburg admin need to work inside Tshwane's data, or is that only Anita and Baba D as network owners? | Anita / Baba D | Whether a `church_admin` role or multi-tenant users are needed |
| A5 | Are the sister churches separate legal entities? If so, each is its own POPIA responsible party, and head office reading their members' personal information needs a documented lawful basis and agreement | Anita, as information officer | Network roles (ADR-001 revision 2) |
| B | Complete life phase taxonomy, adult and child. Baba D showed it on screen and said he would send the spreadsheet | Baba D, via Sifiso | Phase 2 roll-over engine. Machinery can start, rules cannot |
| C | Name of the current platform, and a sample data export | Anita, via Sifiso | Phase 5 estimate, and it is currently the largest unknown |
| D | How do they mark their register? They will advise | Anita | Phase 0 gate. Care tiers, analytics, and retention all depend on it |
| E | Full region and sister church list with member numbers for each | Anita | Region setup, rollup design |
| F | Which region pilots. Sifiso offered a prototype "based on one sector" | Anita | Phase 5 |
| G | Anyone besides Anita and Baba D who may view personal information across regions or churches, and at what depth | Anita | Network roles |
| P1 | **What exactly will the promised prototype show, and when?** Sifiso committed to a working prototype "by the end of the week, latest Monday", based on one sector, with contracting to follow if they are happy. The build plan puts the network layer alone at about 3 weeks of work | Sifiso | Client trust. Set the expectation in writing before the date passes |
| S | **Commercial terms in writing.** Quoted on the call: a once-off build fee of R3,000, a R159 monthly subscription, and R79 per month for each region and each sister church, regardless of member numbers. The transcript is garbled on the monthly figure ("1700. There' 159"). Confirm the figures, how they relate to the ~86-day scope, and the licence clause (licensed, not transferred), before contracting | Sifiso | Contract. Do not start Phase 1 without it |

## Non-blocking, needed before the relevant phase

| # | Question | Phase |
|---|---|---|
| I | Youth indemnity form template, and their most complicated past registration forms | 3 |
| J | Banking details and payment reference format for registrants | 3 |
| K | Standard t-shirt size list, dietary options: fixed list or free text, transport as yes/no or pickup point | 3 |
| L | Children's ministry age bands and class names; current safeguarding controls beyond same-adult sign-out; retention period for check-in records | 4 |
| M | Brevo account and DNS access for sender authentication. Note the free tier caps at 300 emails a day, and a network-wide send will exceed that | 5 |
| N | BulkSMS account, if SMS is wanted | 5 |
| O | POPIA information officer details, existing privacy notice, current consent wording, retention policy | 5 |
| P | JCOC branding: logo, colours, how the name should appear to members. Note regions may want to inherit rather than brand separately | 5 |
| Q | Definitions for the monthly report: baptisms, restorations, transfers, move-ins and move-outs. Baba D to walk Sifiso through them one-to-one | Later (see new requests) |
| R | Support model. Erick asked what happens when Sifiso is unavailable; Sifiso said a team of three handles support once the system is live. Write the support arrangement and response times into the agreement | Before contracting |
| T | Pricing for sister churches outside South Africa (Mozambique, Zimbabwe, Angola were mentioned). Sifiso said "same ballpark" pending a check of each country's data protection law | Later |

## New requests arriving mid-build

Anything not in `docs/02_SCOPE.md` goes here with an estimate before it gets built. Nothing gets silently absorbed.

| Date | Request | From | Estimate | Decision |
|---|---|---|---|---|
| 2026-10-22 (logged; raised in follow-up meeting) | **Visitor register that remembers people.** Visitors and their children are kept separately from members, and a returning visitor is found and checked in without filling in the form again. Never converts to a member automatically | Erick Li Sik | 3 days proposed (see `docs/02_SCOPE.md` B10). Sifiso said on the call "not a big build" and added it to scope | Agreed on the call. Reverses "first-time visitors switched off" in CLAUDE.md, in this narrower form |
| 2026-10-22 (logged; raised in follow-up meeting) | **Monthly statistics report.** Baptisms, restorations, transfers, move-ins and move-outs per region, rolled up into one network report, replacing Baba D's spreadsheets | Baba D | 4 to 6 days proposed, pending definitions (item Q) | Baba D deferred it: "we can look at it later". Not in scope yet |
| 2026-10-23 | **Multi-region leaders.** A leader can be given access to more than one region when they are created, with a role in each and a switcher between them (A4 revised) | Sifiso | About 3 days on Phase 2 (rough): rules and negative tests 1.5, switcher and `useAppUser()` 1, invite and team screens 0.5. Falls inside the +3 to +5 days ADR-001 rev 2 already flagged, not yet in `03_BUILD_PLAN.md` totals | Agreed by Sifiso. Build with Phase 2 roles. Questions for Anita: which leaders, which roles they hold across regions, and whether they need a combined view across their regions or switching is enough |
| 2026-10-22 (logged; raised in follow-up meeting) | **Mailchimp instead of, or alongside, Brevo.** They send regular email through Mailchimp today. Sifiso said Kereke Hub would plug in their Mailchimp API key; only Brevo is built | Erick Li Sik | 2 days proposed for a Mailchimp send path behind the existing communications screen | Needs a decision: build Mailchimp, or move them to Brevo |

## Answered

| # | Question | Answer | Date |
|---|---|---|---|
| 1 | Client organisation name | Joburg Church of Christ (JCOC), johannesburg.church | 2026-08-31 |
| 2 | The campus transcribed as "Swanee" | Tshwane. Not Eswatini as originally assumed | 2026-08-31 |
| 3 | Attendance capture method | They will advise. Still a Phase 0 gate, but now client-owned | 2026-08-31 |
| 4 | Hierarchy | Head office, then region, then campus. Three tiers. Drove the ADR-001 rewrite. **Superseded by item A below** | 2026-08-31 |
| 7 | Roll-over trigger | Calendar year | 2026-08-31 |
| 8 | Member self-service edits | Queue for admin approval, do not apply directly. ADR-007 | 2026-08-31 |
| 9 | Who verifies proof of payment | The event organiser, who can also assign additional people. Per-event, not a global role. ADR-006 | 2026-08-31 |
| 10 | Rejected payment behaviour | Hold and allow re-upload. Do not cancel | 2026-08-31 |
| 11 | Children's collection code | Screen-based. No label printing. ADR-008 | 2026-08-31 |
| 13 | Who approves | Both Anita Pearson and Oludolapo Ogundipe | 2026-08-31 |
| 14 | Contracting structure | Head office contracts for the main system, campuses subcontract under it. ADR-009 | 2026-08-31 |
| 15 | State of "Safety Nest" children's check-in | **Not started.** It was discussed, not built. Full 8-day build, and it was represented on the call as nearly ready | 2026-08-31 |
| 16 | Plan and tier gating | Bespoke plan, everything enabled. Resolve tier from the organisation, not per tenant. ADR-009 | 2026-08-31 |
| A | Are Cape Town, Durban, PE and Tshwane regions of one church, or separate churches? | **Separate sister churches**, each with its own login. Joburg CoC itself is split into regions (which they also call campuses), regions into sectors, sectors into family groups. Tshwane is administered by Joburg but has its own login. Follow-ups A1 to A5 above. Drives ADR-001 revision 2, accepted 2026-10-22 | Logged 2026-10-22, from the follow-up meeting (meeting date not in transcript) |
| G (part) | Who at head office may view personal information across regions | Anita and Baba D, who "have to be able to see everything" and email every church. Anyone else is still open as item G | Logged 2026-10-22, from the follow-up meeting (meeting date not in transcript) |
| H | Roll-over: calendar year or school year? | Start of the calendar year, based on the age a person turns that year. No grade bands, only preschooler and scholar. Parents cascade from children's ages. ADR-003 | Logged 2026-10-22, from the follow-up meeting (meeting date not in transcript) |
| 17 | Life phases: one per person or several? | Several, for adults and children. They select combinations to pull lists, e.g. mature married with children | Logged 2026-10-22, from the follow-up meeting (meeting date not in transcript) |
| 18 | Who checks a child in and out? | The parent, at the classroom, on the teacher's device. The same adult must sign out. Visitors' children too. ADR-008 | Logged 2026-10-22, from the follow-up meeting (meeting date not in transcript) |
| 19 | Who may add members? | Region admins only (Baba D for Soweto and Central East, Anita for Northwest). Members may also fill in the form for admin approval. Visitors never become members automatically | Logged 2026-10-22, from the follow-up meeting (meeting date not in transcript) |
| A4 | Baba D administers Soweto and Central East, two region tenants. Network role, or access to more than one region per login? | **Network role.** Baba D (and Anita) work through `network_owner`, which can add and edit members in any region of the org, with a region filter in the network view so he can narrow to Soweto or Central East. **Revised the same day:** some leaders do look after more than one region, so leaders get multi-region access, chosen when the leader is created: one or more regions, a role in each, and a region switcher. See ADR-001 revision 2 ("A4 decision, revised") and the new request below | 2026-10-23, Sifiso |
| 20 | Is WhatsApp available? | No. Sifiso told them it is "a couple of months out", pending Meta. Do not demonstrate or promise it | Logged 2026-10-22, from the follow-up meeting (meeting date not in transcript) |
