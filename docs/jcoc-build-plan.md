# JCOC Hub build plan

Version 2, 23 October 2026. Owner: Sifiso Sibuyane.

Save this file in the jcoc-hub repo as `docs/jcoc-build-plan.md` so every Claude Code session can read it. It replaces version 1.

Changes from version 1:
- Teen now starts on 1 January of the year a child turns 14, whatever their grade. Teen replaces Pre-teen and Kidz Zone. The Phase 3 summary, the life phases tables and Prompt D are updated to match.
- Phase 0 status updated: the rules fix is live and the misuse checks are done (see Phase 0).
- New item for porting to kereke-hub: an audit trail for member changes.

## Commercial terms (agreed with JCOC)

- Once-off build fee: R3,000.
- Main branch: R159 per month.
- Every other branch: R79 per month.
- Billing is handled outside the app for now (manual invoices). Don't build billing for JCOC yet.
- The three Joburg regions (Soweto, Central East, Northwest) each count as an "other branch" at R79.
- Sifiso treats JCOC as a proof of concept.

## Hosting facts

- The live Kereke Hub app is on Vercel (free Hobby plan). Firestore and Auth are on Firebase.
- DNS for kerekehub.co.za is managed in DirectAdmin.
- Vercel's Hobby plan is for non-commercial personal use only, and being paid to build or host a site counts as commercial. Kereke Hub and JCOC both take payment, so they need Vercel Pro or another host. Decide before JCOC goes live.

## Ground rules for every phase

- jcoc-hub runs on its own Firebase project (`jcoc-hub`), separate from live Kereke Hub. JCOC data never sits in the `kereke-hub` project.
- Work on one phase at a time, on its own branch named `feature/<phase>`.
- Write the rules tests first, including negative tests (things that must be blocked). Then build.
- Run the type check, unit tests, rules tests and production build before committing.
- Click through the feature on the emulators with seeded test data. Never use real member data.
- Don't push or deploy. Sifiso does that.
- Any security hole found that also exists in the base code goes on a list for porting to kereke-hub.
- The repos pin Node 20 in `.nvmrc`, but Node 20 reached end of life on 30 April 2026. Move both repos to the current Node LTS (and set the same version in Vercel) as a small, separate change.
- Finish every session with a handover in `handovers/` and a plain-language summary for Sifiso, who is not a developer.

## Phases

### Phase 0: security and housekeeping (Sifiso, now)

1. Make kereke-hub, jcoc-hub and LeyabonasBoutique private on GitHub. Done for kereke-hub and jcoc-hub. LeyabonasBoutique not yet checked.
2. Deploy the Firestore rules fix to live Kereke Hub. Done on 23 October 2026. The first CLI deploy didn't take. The rules from commit `86d3232` were then published in the Firebase console and checked. Members, roster and Church Settings save work on the live app. Storage rules were not changed by the fix.
3. Check live data for signs of misuse. Done on 23 October 2026:
   - Tenants with `accountType == "internal"`: one, Sifiso's own.
   - Users with `role == "super_admin"`: one, Sifiso.
   - Member status, branch and role changes: can't be checked. The app keeps no audit trail of member changes, and Firestore point-in-time recovery has not been confirmed as on.
   - Vercel logs for `/api/admin/*`: can't be checked. The Hobby plan keeps one hour of logs.
   - So no signs of misuse were found, but two checks had no data behind them. Use that wording when getting legal advice.
4. Push `fix/rules-tenant-escalation` (kereke-hub) and the jcoc-hub branches. kereke-hub branch pushed on 23 October 2026. Don't merge into `main` until the app changes are tested in a browser.

Items to port to kereke-hub:
- Audit trail for member changes (who changed what, and when), at least for status, branch, role and life phase fields.
- Server-side allowlist of Sifiso's UID for `/api/admin` routes.

### Phase 1: hosting on jcoc.kerekehub.co.za

- Find out how hub.kerekehub.co.za is hosted today (Vercel or Firebase App Hosting) and where the DNS for kerekehub.co.za is managed.
- Set up the jcoc-hub app on the `jcoc-hub` Firebase project and the subdomain jcoc.kerekehub.co.za.
- Covers: hosting backend, custom domain and DNS records, Firebase Auth authorised domains, environment variables and secrets for the jcoc-hub project, deploying rules and indexes.

### Phase 2: church structure and admin roles (needs Sifiso's structure list)

- Hierarchy: church > campus/region > sector > family group (Bible discussion group).
- Known Joburg campuses: Soweto, Central East, Northwest. Sister churches: Tshwane, Cape Town, Durban, PE and others to come, each with their own logins.
- Each member sits at one point in the hierarchy. Admins can filter and pull members at any level.
- Roles: super admin (Anita, Dolapo) sees every church and campus; campus/region admin sees their own campus; lower roles see less.
- Only named admins can add members. Members never add themselves. Visitors never become members automatically.
- JCOC has no structure list yet. We build it with them. Super admins and campus admins must be able to add, rename and archive campuses, sectors and family groups in the app, and move members between them. Archiving keeps history; nothing is hard-deleted.
- Seed data: invented people only, shaped like the old system's export columns, spread across invented sectors and family groups.
- Map this onto the existing branch and cell model where possible (check whether campus = branch and family group = cell). Record the decision in an ADR.

### Phase 3: life phases (needs Sifiso's life phases list)

- A person can hold several life phases at once (for example widow, empty nester, single parent).
- Admins can filter on combinations (for example mature married with children).
- Life phases move at the start of each year, not on birthdays.
- Children up to the year they turn 13: the school grade drives the phase (see the spec below).
- Teen starts on 1 January of the year a child turns 14, whatever their grade. Some children turn 13 while still in primary school, so grade can't decide this.
- Parents' phases follow their children's ages (parent of child under 10, over 10, teen parent).
- Admins can still set or override a phase by hand.

#### Life phases spec (from JCOC's "Life Phases" sheet)

Children: up to the year they turn 13, the school grade drives the phase, not the birthday. Store a grade per child. Default it from the birth year (Grade 1 in the year the child turns 7, which matches the sheet), let admins override it for children who started early or repeated, and move everyone up one grade each January.

From the year a child turns 14, age decides, not grade (confirmed 23 October 2026). On 1 January of that year the child becomes Teen and drops Pre-teen, Child and Kidz Zone, even if they are still in Grade 7.

| Band | Age (sheet) | Grade | Tags the child holds |
|---|---|---|---|
| Baby | 0 to 1 | none | Child, Baby |
| Pre-School | 1 to 6 | Gr 000, Gr 00, Gr R | Child, Pre-School, Kidz Zone |
| Scholar | 6 to 11 | Gr 1 to Gr 5 | Child, Scholar, Kidz Zone |
| Pre-teen | 11 to 13 | Gr 6 to Gr 7, or later grades while under 14 | Child, Pre-teen, Scholar, Kidz Zone |
| Teen | Turns 14 this year, up to 18 | Any | Teen, Scholar |
| Campus Student | 18 to 21 | none | Campus Student |

Edge cases (Sifiso's reading of the 14 rule; confirm with Anita):
- A child who turns 14 while in Grade 7: Teen and Scholar only. No Kidz Zone.
- A child in Grade 8 who turns 13 this year (started early): stays Pre-teen and Kidz Zone until 1 January of the year they turn 14.
- Teens keep the Scholar tag while they're still at school.

Reading of the sheet's fourth column: each band lists the tags in a vertical run. Confirmed on 23 October 2026.

Adults:

| Phase | Rule | Automatic? |
|---|---|---|
| Young Single | Single, under 25 | Yes (age + marital status) |
| Mature Single | Single, 25 or older | Yes |
| Young Married | Married under 5 years | Yes, needs a wedding date |
| Mature Married | Married 5 years or more | Yes, needs a wedding date |
| Widowed | Spouse has passed away | From marital status |
| Divorced | Divorced | From marital status |
| Teen Parent | Parent with teens (not a teenage parent) | Yes, from linked children |
| Parents of Kids <10 | All linked children under 10 | Yes |
| Parents of Kids >10 | All linked children over 10 | Yes |
| Parents of Kids <>10 | Children both under and over 10 | Yes |
| Single Mom | No father in the picture, children still dependent | Manual |
| Single Dad | No mother in the picture, children still dependent. A separate phase from Single Mom | Manual |
| Empty Nester | Youngest linked child is 21 or older | Yes, from linked children; admins can override |

Confirmed answers (23 October 2026):
- The tag reading is correct. Kidz Zone runs from Pre-School to Grade 7, and ends early for any child who turns 14 before finishing Grade 7.
- Single Dad is a separate phase from Single Mom.
- Campus Student is automatic from 18 up to 21. Admins can mark anyone else as a student by hand. At 21 they become Young Single (or whatever their marital status gives).
- A child stops being dependent at 21 (used for Empty Nester and for the Single Mom/Dad definition).
- Add a wedding date field to the member record and the membership form. Young/Mature Married is worked out from it. Where it's blank, admins set the phase by hand.

The 1 January rule (applies to every age-based phase):
- All changes happen on 1 January of the year the age changes. Work with "age this calendar year" = current year minus birth year, never the exact birthday.
- Examples: a child becomes Teen on 1 January of the year they turn 14, whatever their grade. A child counts as under 10 up to and including the year they turn 10. From 1 January of the year they turn 11, the parent becomes "Parents of Kids >10". A single becomes Mature Single on 1 January of the year they turn 25. Campus Student ends on 1 January of the year they turn 21. Empty Nester starts on 1 January of the year the youngest child turns 21. Young/Mature Married uses the wedding year in the same way.
- A scheduled job runs early on 1 January to apply the changes, and the same logic runs whenever a member's details are saved.
- Unit tests must cover December 31 vs January 1, and children born on 1 January and 31 December.
- Unit tests must also cover the Teen switch: a child turning 14 while in Grade 7 (becomes Teen, loses Kidz Zone), and a child in Grade 8 turning 13 (stays Pre-teen).

Old marital statuses (confirmed):
  - "Traditional Marriage" (customary marriage) becomes Married, with a marriage type field (civil, customary, religious). It counts for Young/Mature Married.
  - "Scholar/Student" is not a marital status. It becomes Single, and the person gets the Scholar or Campus Student phase from their age (or by hand).

Automatic parent phases only work when the children are linked in the family. Admins must be able to set any phase by hand.

#### Import from the old system

The "Database Membership Capture" export has these columns: userid, firstname, surname, knownas, maiden, emailaddress, physicaladdress, postaladdress, hometel, worktel, mobiletel, dob (dd/mm/yyyy), statusname, gender (M/F), maritalstatus, campusname (e.g. "SA - JCC Soweto Region"), dateofmembership, area (a suburb, not a sector), createdby, DateCreated.

- The export has no sector, family group, wedding date or family links. Those must come from somewhere else or be captured after import.
- Build and test any importer with invented data in these columns only. Real exports never go into the repo, seed data, tests or AI chats.

### Prototype checkpoint

- Phases 1 to 3 plus quick wins 1 and 2, seeded with one sector, on jcoc.kerekehub.co.za.
- JCOC tests it. Contracting follows if they're happy.

### Phase 4: recurring visitors and children's check-in

- A visitor register, separate from members, so returning visitors are found and checked in without filling the form again.
- Children's check-in and check-out (Safety Nest), by class:
  - The teacher's tablet shows the class.
  - A parent signs the child in. The same parent, or another listed adult, signs them out.
  - Works for members' children (linked to the family) and visitors' children (name, age, parent names, cell numbers, email).
  - Attendance history per child.

### Phase 5: event registration extras

- Show the amount due. Require a PDF proof-of-payment upload before the registration counts.
- Optional fields per event: T-shirt size, transport needed, dietary needs, youth indemnity upload, choice of church or region.
- QR check-in at the event.
- Message registrants after they register.
- Each event chooses which of these it needs.

### Phase 6: group email

- Send email to chosen groups (campus, sector, life phase, ministry, volunteers) from inside the app, through the church's own mail provider (Brevo or Mailchimp) using their API key.

### Later (not in the current scope)

- Monthly campus report (baptisms, restorations, transfers, move-ins, move-outs). Needs definitions from Baba D.
- Member app push notifications.
- WhatsApp (depends on Meta).
- The finance module is not wanted by JCOC.

## Open questions

- Testing host: Vercel Pro trial (14 days) or Firebase App Hosting on the jcoc-hub project.
- Vercel plan for production.
- Prototype date: the transcript says "Friday, latest Monday" with no exact date.
- Transcript 2 and the Word discovery document are missing.

---

# Claude Code prompts

Paste one at a time, in the jcoc-hub folder unless the prompt says otherwise. Wait for each to finish and check its summary before the next.

## Prompt A: add the plan and check it against the docs

```
Save the build plan I'm pasting below as docs/jcoc-build-plan.md. Then read CLAUDE.md, every ADR in docs/, jcoc-hub-project.md and every file in handovers/. Compare them with the plan. Don't write any code.

Report back in plain language, as I'm not a developer:
1. Anything in the plan that conflicts with an accepted ADR or existing doc.
2. Anything the docs say JCOC asked for that the plan is missing.
3. For Phase 2, how the existing branch and cell model would map to church > campus > sector > family group, and what would need to change.
4. Your list of open questions.

Commit the plan on a new branch docs/jcoc-build-plan. Don't push.

<paste the plan here>
```

## Prompt B: hosting investigation (read-only)

Run in `~/Projects/kereke-hub` first, then in `~/Projects/jcoc-hub`.

```
Read-only investigation, don't change any files. I want JCOC's app on jcoc.kerekehub.co.za using the jcoc-hub Firebase project, kept fully separate from the live hub.kerekehub.co.za.

Find out and explain in plain language:
1. How this app is hosted and deployed today (Vercel, Firebase App Hosting, or something else). Look at vercel.json, apphosting.yaml, firebase.json, package.json scripts and any CI config.
2. Which environment variables and secrets the app needs, by name only. Never print their values.
3. Anything hard-coded to hub.kerekehub.co.za, kereke-hub, or the kereke-hub Firebase config that would need to change for a jcoc deployment.
4. A step-by-step setup plan for jcoc.kerekehub.co.za: what I click in which console, what DNS records I'll need to add (say the console will show the exact values), and which Firebase Auth authorised domains to add.
```

## Prompt C: Phase 2, structure and roles (after the structure list is in)

```
Read docs/jcoc-build-plan.md and the latest handover. Build Phase 2 on a new branch feature/p2-church-structure.

JCOC doesn't have a fixed structure list yet, so admins must be able to add, rename and archive campuses, sectors and family groups in the app (see Phase 2 in the plan). Seed one campus (Soweto) with invented sectors, family groups and people only.

Start by writing an ADR for the data model and role scoping and show it to me. Wait for me to approve it before writing code. After that: rules tests first, including negative tests (a campus admin can't read another campus, a member can't add members, a visitor can't become a member automatically), then the build, then seed data for one full campus, then a click-through on the emulators. Don't push or deploy. Finish with a handover and a plain-language summary.
```

## Prompt D: Phase 3, life phases (after the list is in)

```
Read docs/jcoc-build-plan.md and the latest handover. Build Phase 3 on a new branch feature/p3-life-phases.

The life phases spec is in the plan under Phase 3, including the 1 January rule and the Teen-from-14 rule.

Write an ADR first, covering: multi-select phases, the grade field for children up to 13, which phases are age-based, the 1 January transition (Teen on 1 January of the year a child turns 14 whatever their grade, grade-driven bands below that, parents following children's ages), the wedding date and marriage type fields, how old marital statuses map, and manual overrides. Show it to me and wait for approval. Then add unit tests for the transition rules with edge cases (31 December vs 1 January, children born on 1 January and 31 December, a child turning 14 in Grade 7, a child in Grade 8 turning 13, families with several children), rules tests, the build, filters for combinations, and a click-through. Don't push or deploy. Finish with a handover and a plain-language summary.
```

## Prompt E: prototype checkpoint

```
Read docs/jcoc-build-plan.md and every handover. Get the prototype ready for JCOC: phases 1 to 3 plus quick wins 1 and 2, with seed data for one sector made up of invented people only. Write a short test guide for Anita, Dolapo and Erick in plain English (what to try, what should happen), plus a list of known gaps. Don't deploy. Tell me exactly what I need to deploy and in which order.
```

Prompts for phases 4 to 6 follow the same pattern as C and D: new branch, ADR first and wait for approval, tests first, build, click-through, handover.
