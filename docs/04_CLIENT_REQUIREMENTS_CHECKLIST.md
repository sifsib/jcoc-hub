# What We Need From Joburg Church of Christ

**Confirmed 2026-08-31:** organisation is JCOC (johannesburg.church). Sites: Johannesburg, Tshwane, Cape Town, Durban, Port Elizabeth. Hierarchy is head office, region, campus. Roll-over runs on the calendar year. Member edits queue for approval. Event organisers verify payments and can assign helpers. Rejected payments hold and allow re-upload. Children's collection codes are screen-based. Both Anita Pearson and Oludolapo Ogundipe approve. Head office contracts, campuses subcontract. Bespoke plan, all features on.

The items below are what is still outstanding.

Grouped by when it blocks us. The Phase 0 items are hard blockers, everything below that has some slack.

---

## Blocks Phase 0. Needed before any build starts.

### Organisation and structure
- [x] **Are Cape Town, Durban, PE and Tshwane regions of one national church, or peer churches?** Answered in the follow-up meeting: sister churches, each with its own login. Joburg is split into regions (also called campuses), sectors and family groups
- [ ] Full list of Joburg regions with correct names. Soweto, Northwest and Central East were named; confirm whether Central East is one region or two
- [ ] Each region's sectors, and the family groups in each sector
- [ ] Whether the sister churches (Tshwane, Cape Town, Durban, PE, Mthatha) have regions and sectors of their own
- [ ] Approximate member count per region and per sister church, and network total
- [ ] Which region is the pilot
- [ ] The life phase spreadsheet Baba D showed on screen

### Decisions we cannot make for them
- [ ] **How you mark your register.** You said you would advise. We build to whatever that is, but the care tier and analytics features stay empty until it exists
- [x] **First-time visitors.** In, as a visitor register that remembers returning visitors and their children, kept apart from members (follow-up meeting, Erick)
- [ ] **Finance module.** Confirming it stays switched off
- [ ] **Online payments.** Confirming they want proof of payment upload only, and not a payment gateway

### Data
- [ ] Name of your current platform
- [ ] A sample export from it, Excel or CSV, one campus is enough to start. Real structure, dummy or redacted values is fine
- [ ] Whether historic attendance, giving, or event data needs to come across, or just current membership

---

## Blocks Phase 2. Membership and life phases.

### The taxonomy itself
- [ ] Complete adult life phase list. From the call we have: divorced, single parent, widow, widower, married, young married, mature married, married group, younger single, mature single, parent with children under 10, parent with children over 10, parent with both, teen parent, empty nester. Confirm and complete this
- [ ] Complete child and youth phase list, with the school grades or age bands each maps to
- [ ] **The progression rules.** For each phase, what does it become at roll-over, and on what basis. This is the heart of the automation and we cannot infer it
- [ ] Which phases can be held at the same time, and whether any combinations are invalid
- [ ] Confirm calendar year rather than school year for the roll-over, since your reasoning was school-stage-driven and the two are not quite the same thing

### Configurable lists
- [ ] Ministries and ministry groups
- [ ] Membership types, and whether an equivalent of "associate member" is useful to them
- [ ] Church offices and titles
- [ ] Cell group or small group structure, if they use one
- [ ] Volunteer roles

### Fields
- [ ] Their current membership form, so we can match the fields
- [ ] Which fields are compulsory
- [ ] Which fields members may edit themselves
- [ ] Confirmation that anniversary date should be captured

---

## Blocks Phase 3. Event registration.

- [ ] Two or three real examples of past registration forms, ideally the most complicated ones
- [ ] The youth indemnity form template
- [ ] Banking details and the payment reference format registrants should use
- [ ] Standard t-shirt size list
- [ ] Dietary requirement options, free text or a fixed list
- [ ] Whether transport is a yes or no, or needs a pickup point
- [ ] Which events need QR check-in and which don't
- [ ] Whether registration ever needs to be members-only

---

## Blocks Phase 4. Children's ministry.

- [ ] Age bands or classes for children's ministry, and their names
- [ ] Their current sign-in and sign-out process, including what safeguarding controls already exist
- [ ] Who is authorised to collect a child, and how that is currently verified
- [ ] Medical and allergy information they need visible to room leaders
- [ ] How long check-in records must be retained

---

## Blocks Phase 5. Migration and go-live.

### Accounts and access
- [ ] Brevo account, or agreement for us to create one. Note the free tier caps at 300 emails a day, and a 380-member campus newsletter fits, but a network-wide send will not
- [ ] Domain and DNS access for email sender authentication, SPF and DKIM. Without this, deliverability suffers
- [ ] BulkSMS account, if SMS is wanted. Roughly 19c per message
- [ ] Whether WhatsApp is wanted, understanding it is still constrained on our side

### People
- [ ] Named users per campus with their roles, mapped to: owner, admin, member manager, member viewer, cell leader, branch admin, follow-up, finance, viewer
- [ ] Named head office users and their network-level roles. So far: Anita and Baba D, with full visibility
- [ ] Named head office people who may view region-level personal information, and at what depth. Anita and Baba D confirmed; anyone else still needed

### Compliance
- [ ] Their POPIA information officer's details
- [ ] Their existing privacy notice, if they have one
- [ ] The consent wording currently used on membership and event forms
- [ ] Agreement to sign a data processing agreement with us
- [ ] Their data retention policy, particularly for children's records
- [ ] Confirmation of who at head office may lawfully view campus-level personal information. This is a governance question, not a technical one, and their answer shapes the network roles we build

### Branding
- [ ] Logo, vector preferred. The system is white-labelled to JCOC, so this is the primary brand, not an accent
- [ ] Brand colours, hex values
- [ ] How the organisation name should appear on member-facing pages
- [ ] Whether regions and campuses brand individually or all inherit head office
- [ ] **The domain the system will run on**, and DNS access to configure it
- [ ] **The sending domain for email**, with DNS access for SPF and DKIM. Deliverability on a 380-person newsletter depends on this
- [ ] Agreed wording for the "Designed by Kereke Hub" attribution
- [ ] Whether JCOC users should see Kereke Hub at all in the support ticket flow, or whether support appears to come from JCOC

### Commercial
- [ ] Billing arrangement for the region subcontracts under the head office agreement. Quoted on the call: R79 a month per region and per sister church; confirm in writing
- [ ] Agreement to a written change control process, so requests that arrive mid-build get estimated rather than absorbed
- [ ] **Licence agreement signed before Phase 1 starts.** The system is licensed to JCOC, not transferred. A white-labelled build on their own domain will feel like their software and the ownership question is much easier to settle before they see it working

---

## Quick summary for the email

If you want the short version to send first, ask for these five and start work on the rest:

1. Whether the sites are regions or peer churches, then the region list with member numbers.
2. A sample data export from the current system.
3. The complete life phase list with progression rules.
4. Two examples of their most complicated event registration forms.
5. How you mark your register.
