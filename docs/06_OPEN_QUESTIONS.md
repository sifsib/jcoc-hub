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

## From the Phase 2 build (ADR-010), 2026-10-23

| # | Question | Who answers | Notes |
|---|---|---|---|
| U1 | Who sets Anita's and Baba D's network role on the live project? There is no screen for it; it is a `networkRole` and `orgId` on their user document, set by Kereke Hub staff | Sifiso | Needs a one-off admin script or console edit at go-live. Do not give it through the app |
| U2 | Sector and family group leaders can read their people and mark attendance. Should they also see visitors, groups or events? Today they see neither | Anita | Rules deny by default; widening needs tests |
| U3 | The base roles `branch_admin` and `cell_leader` still exist in the rules for upstream compatibility, but JCOC can no longer be given them. Remove them from the JCOC rules entirely? | Sifiso | Safe to leave; removing makes the fork diverge further |
| U4 | Org-level tier resolution (ADR-009) is still not built. New regions leave `tier` unset, which the app treats as fully enabled. Fine for JCOC, but a deliberate plan for billing should replace it | Sifiso | Not blocking |

## From the Phase 3 build (ADR-011), 2026-10-23, for Anita to confirm

| # | Question | Built as |
|---|---|---|
| V1 | Teen ends in the year a child turns 18; Campus Student is 18 to 20; single adult phases start at 21 | As stated |
| V2 | When does a teen stop being a Scholar? | At the end of Grade 12, using the worked-out grade |
| V3 | Teen Parent means a dependent child aged 14 to 17 this year | As stated |
| V4 | Campus Student is automatic for everyone aged 18 to 20, studying or not | Automatic; admins can untick it per person |
| V5 | Married people with no wedding date get no Young/Mature Married phase until one is entered | As stated; the review page and roster show who is affected |

## From the Phase 4 build (ADR-012), 2026-10-23, for Anita to confirm

| # | Question | Built as |
|---|---|---|
| W1 | **Who may collect a child** (safeguarding). Plan v2 says "the same parent, or another listed adult"; ADR-008 said only the adult who signed in | The dropping-off adult, or an adult the parent names at drop-off, with the 4-digit code. Anyone else, a lost code, or 5 wrong codes needs a supervisor (region owner/admin or a named class supervisor) with a reason, logged **Answered 2026-10-23 (Sifiso): only the person who signs the child in.** Built: parents can no longer name other adults; anyone else needs a supervisor with a reason, logged. Keeping that supervisor path is my assumption, for emergencies; say if it should go. |
| W2 | Class names and which ages go in each (open question L) | Seeded as Babies, Pre-School, Scholars, Pre-teens by life phase; admins can change them **Answered 2026-10-23: they differ per region; capture them manually for each class.** Built: each region sets up its own classes and types in the ages ("age this year", 0 to 17) per class; check-in suggests the narrowest class whose ages fit, and falls back to life phases when a class has no ages. |
| W3 | How long check-in records are kept (open question L) | Kept; nothing deleted automatically. Decide a retention period before go-live **Answered 2026-10-23: 24 months.** Built: a nightly function, `kidsRetention`, removes check-in records, their code documents and supervisor-override log entries older than 24 months. |
| W4 | Children's ministry stops at the year a child turns 13 (end of Kidz Zone) | As stated; teens are not offered for check-in |
| W5 | A visitor who returns after more than 180 days gets a new follow-up | As stated (`FOLLOW_UP_GAP_DAYS`) |
| W6 | The collection code is sent by SMS only when the church's BulkSMS account is set up (about 19c per message); otherwise the parent photographs the code on screen | As stated |

## From the Phase 5 build (ADR-013), 2026-10-23, for Anita to confirm

| # | Question | Built as |
|---|---|---|
| X1 | Items I, J and K below (indemnity template, banking details and reference format, t-shirt sizes and options) are still open | Built as settings per event: the organiser types the bank details (pre-filled from the banking details on the Branding page, if saved), a reference prefix (e.g. YC26-SURNAME-007), the t-shirt sizes, and switches each question on or off. Dietary is free text; transport is yes/no. The indemnity is a signed form the registrant uploads; there is no template in the app yet |
| X2 | Who checks proof of payment | Each event names its own verifiers (any team member). The organiser is added to that list automatically. Region owners, admins and member managers can always see and act |
| X3 | Does a place count before payment is confirmed? | A place is held once proof is uploaded, so the event cannot overfill while proofs wait for checking |
| X4 | Registrants under 18 | Worked out from date of birth on the event date; they are asked to upload a signed indemnity. A missing indemnity is shown to verifiers but does not block approval |
| X5 | Emails to registrants | Approval emails the ticket, and staff can email registrants by status, only when the region's Brevo account is set up (item M). Without Brevo the registrant sees the ticket on their own status page |
| X6 | **Inherited faults found** (present in the base product too): (a) when a member RSVPs from the member app, the event's RSVP counter does not update, because members cannot write to events; (b) the member events page logs a permission error when a member has not RSVPed yet, and forgets their answer; (c) the tenant Storage rules let any signed-in user of a region, members included, read and write that region's files such as invoices | **(a) and (b) fixed 2026-10-23** at Sifiso's request: the count is kept by a new Cloud Function, `onRsvpWrittenCount`, and the member page loads its own RSVPs in one query. Also tightened: members now read only their own RSVPs (they could read everyone's in the region). **(c) fixed 2026-10-23**: region files are limited by folder to the roles that use them (logo: owner and admin change it, anyone in the region sees it; invoices: owner, admin, finance, branch admin; WhatsApp banners: owner, admin, member manager; anything else: owner and admin), in the active region only. Storage rules tests added (`tests/rules/storage.test.ts`) |
| X7 | **Inherited: "Powered by Kereke Hub" was typed into the footer of five member app pages**, and also the join, form, RSVP and two check-in pages and the member invite email, against the white-label rule | **Fixed 2026-10-23**: one `ATTRIBUTION` string in `lib/whiteLabel.ts`, used in all eleven places. It reads "Designed by Kereke Hub", the wording in `docs/02_SCOPE.md` B9, which says the exact wording is still to be agreed with JCOC. Other "Kereke Hub" mentions across the app remain for the planned white-label work (B9) Wording proposed to Sifiso 2026-10-23; awaiting a choice. |

## Non-blocking, needed before the relevant phase

| # | Question | Phase |
|---|---|---|
| I | Youth indemnity form template, and their most complicated past registration forms | 3 |
| J | Banking details and payment reference format for registrants | 3 |
| K | Standard t-shirt size list, dietary options: fixed list or free text, transport as yes/no or pickup point | 3 K partly answered 2026-10-23: T-shirt sizes XS, S, M, L, XL, XXL, XXXL (now the default for new events). Dietary and transport options still open. |
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
| 2026-10-23 | **Multi-region leaders.** A leader can be given access to more than one region when they are created, with a role in each and a switcher between them (A4 revised) | Sifiso | About 3 days on Phase 2 (rough): rules and negative tests 1.5, switcher and `useAppUser()` 1, invite and team screens 0.5. Falls inside the +3 to +5 days ADR-001 rev 2 already flagged, not yet in `03_BUILD_PLAN.md` totals | Agreed by Sifiso. Build with Phase 2 roles. Answered 2026-10-23: any leader can be given extra regions at any time (it keeps changing); they are all region admins except Baba D (network role); switching is enough, no combined view. "Branch admin" confirmed as admin of a whole region (campus) |
| 2026-10-22 (logged; raised in follow-up meeting) | **Mailchimp instead of, or alongside, Brevo.** They send regular email through Mailchimp today. Sifiso said Kereke Hub would plug in their Mailchimp API key; only Brevo is built | Erick Li Sik | 2 days proposed for a Mailchimp send path behind the existing communications screen | Needs a decision: build Mailchimp, or move them to Brevo |

## Answered

| # | Question | Answer | Date |
|---|---|---|---|
| W1 | Who may collect a child | Only the person who signs them in | 2026-10-23 |
| W2 | Class names and ages | They differ per region; capture them manually for each class | 2026-10-23 |
| W3 | How long check-in records are kept | 24 months | 2026-10-23 |
| K (part) | T-shirt sizes | XS, S, M, L, XL, XXL, XXXL | 2026-10-23 |
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
