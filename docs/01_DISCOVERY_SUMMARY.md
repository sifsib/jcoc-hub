# Discovery Summary

**Source:** Zoom demo and requirements call, transcript supplied as `Transcript.docx` (approx. 59 minutes).
**Present:** Sifiso Sibuyane (Kereke Hub), Anita Pearson (church administrator), "Baba D" (leadership, joined late).
**Base product demonstrated:** Kereke Hub, live demo account with dummy data.

> **Updated 2026-08-31.** The client is **Joburg Church of Christ (JCOC)**, johannesburg.church, part of the Southern African Churches of Christ family. Approvers are Anita Pearson and Oludolapo Ogundipe ("Baba D"), both.
>
> **Updated 2026-10-22.** A follow-up meeting answered the structure question in section 1: the other cities are **sister churches**, and Joburg itself is split into regions, sectors and family groups. Section 7 summarises that meeting. Where it conflicts with sections 1 to 6, section 7 wins.

---

## 1. Who they are, as far as we can tell

JCOC is a multi-site church network, not a single congregation. From the call:

- Three branches in Johannesburg.
- Further sites in Cape Town, Durban, Port Elizabeth, and Tshwane. The transcript renders the last as "Swanee", which we initially read as Eswatini. It is Tshwane.
- These are described as "part of our church, but separate". JCOC's own site says "one church, meeting in many locations across the city", so the word separate is doing ambiguous work here and still needs pinning down.
- The hierarchy is three tiers: head office, then region, then campus. Anita administers a region.
- Anita's region alone runs at "almost 380 people". Total network size was never given.
- They already run some other platform for membership and events. They didn't name it. They complained that on that platform, event registration forces people to find themselves on the membership list, and when someone can't find themselves they create a duplicate profile, which corrupts the membership count.
- They have their own finance and accounting arrangements in place already.

So the shape here is a small-to-mid national network, administratively mature, currently frustrated by a tool that doesn't fit.

One thing still genuinely unclear: whether Cape Town, Durban, PE and Tshwane are regions of one national church, or peer churches each with their own regions. The public SA-ICOC material reads more like the latter. If it is the latter, the model needs four tiers rather than three, and that is worth ten minutes of Anita's time before anyone writes it.

## 2. What they reacted well to

Worth recording, because it tells us what to keep and what to lead with in training.

- **Care tiers / at-risk tracking.** The three, four, five week absence escalation landed well. Anita's concern was purely mechanical: how do you capture attendance for 380 people, not whether the concept is useful.
- **Role-based access.** The idea that a treasurer sees only finance, a cell leader sees only their twelve, an apostle gets view-only, all of that was accepted without pushback.
- **Workflows as standard operating procedures.** The framing of workflows as SOPs rather than automation seemed to click.
- **Volunteers module.** Anita said "I like that" outright, then immediately asked whether she could message a single volunteer role group. That is a signal, she is thinking about using it.
- **Configurable lists.** The ability to add and remove ministries, membership types, offices, branches was reassuring to her.
- **POPIA and tenant isolation.** She identified herself as a POPIA officer and probed on data separation. She accepted the Firebase tenant isolation answer, but see the risk note in section 5.

## 3. What they explicitly said would not work

These are the honest negatives from the call and they matter more than the positives.

- **Self check-in via tablet or QR.** Raised twice. "I somehow don't think that's going to work for us." No reason given. This needs a proper discovery conversation, because attendance capture is the input that makes care tiers, analytics, and the whole retention story work. If we don't solve attendance capture for them, half the product's value never lands.
- **First-time visitors module.** "I don't know if the visiting thing will work for us, but I mean, we'll look at that." Softer than the attendance objection, but still a no for now.
- **Finance module.** Flat no. "We've got all of our stuff in place already." Fine, this is a switch-off, not a build.

## 4. What they actually asked us to build

Ordered roughly by how much work each represents.

### 4.1 Multi-campus network architecture
The largest single item. The ask, in their words: each region and each church needs its own sign-in details and its own database with all their information in it, and then a layer above where head office can message everybody at once, or select specific branches and message only those.

So: campus-level isolation, plus a head office console with visibility and network-wide communication. Sifiso noted on the call that he is already scoping something structurally similar for AFM Gauteng, which is useful precedent.

### 4.2 Life phases, multi-select
Their member segmentation is far richer than the current marital status field. They listed: divorced, single parents, widows and widowers, married, young married, mature married, younger singles, mature singles, parents with children under 10, parents with children over 10, parents with both, teen parents, empty nesters. Children have their own phases: babies, preschoolers, and then school-grade-linked bands.

Critically, **a person can hold more than one phase at once.** Anita's own example: she is a widow, an empty nester, and arguably a single parent. The current system stores one marital status value. This is a data model change, not a dropdown change.

### 4.3 Annual life phase roll-over
This is the pain point she described most vividly, and I think it is the thing that will make or break their view of us. Once a year, at the start of the year, everyone's life phase has to move on. A preschooler becomes a grade one. A teen becomes an adult. And it cascades: a parent who was "parent with children under 10" becomes "parent with children over 10" because their child turned eleven.

Today she does this manually, family by family, across the whole membership. Her words: "it just takes forever."

She was specific that it must be annual, not birthday-triggered, because school phase, not age, is the real driver. Someone who turns thirteen in March is still not a teenager in their model until the new school year starts. The existing system has age-band logic that fires on birthdays, so the architecture partly exists, but the trigger and the parent cascade do not.

### 4.4 Event registration, substantially upgraded
Current RSVP captures name, phone, email, and an attending or not answer. What they need is closer to a full registration and payment-verification workflow:

- Display the amount payable.
- Registrant uploads proof of payment as a PDF. Registration is only confirmed once that is uploaded and, presumably, checked.
- Youth indemnity form upload for minors.
- T-shirt size.
- Dietary requirements.
- Transport required, yes or no.
- Campus or region selector, so head office knows who is coming from where.
- Ability to communicate with registrants after they have registered.
- QR check-in on the day, at least for some events.
- Registration must **not** be gated on finding yourself in the membership database. This is the specific failure of their current platform and it must not be reproduced.

Sifiso committed on the call to building this "within 12 hours". I would push back on that internally, see section 6.

### 4.5 Member self-service, but locked down
Members must not be able to add themselves to the membership roll. Admin adds members, full stop. But on the member app, members should be able to update a defined subset of their own details: cell number, email address, physical address.

Sifiso committed to a settings screen where the church chooses which fields members can edit. That does not exist today.

### 4.6 Birthdays and anniversaries for the weekly email
Anita sends a members' email every Friday. She needs to pull all birthdays from Friday through to the following Thursday, and the same for wedding anniversaries. The current membership screen shows a rolling fourteen-day birthday view, which is close but not the shape she needs, and anniversaries are not captured at all.

Sifiso committed to a "pull birthdays for the next seven days" action. Small build on existing foundations.

### 4.7 Targeted communications
Send to a specific slice: only the parking volunteers, only one campus, only a ministry group. Today the communications module offers all members, a group, or hand-picked individuals. A proper segment builder is needed.

### 4.8 Children's ministry sign-in and sign-out
Anita asked directly whether there is a secure check-in and check-out for children. Sifiso confirmed it is in development under the name "Safety Nest" and said it should be out by the end of the following week. The scope of what exactly that includes was not discussed with her, so we are carrying an undefined promise here.

## 5. Risks and things I'd flag

**The POPIA answer given on the call was incomplete.** Sifiso told Anita that her information is "locked away" and that as system owner he cannot see it. As a description of tenant isolation and Firestore rules that is broadly the right spirit, but it isn't strictly true at the infrastructure level: whoever holds the Firebase project's admin credentials can read tenant data through the Admin SDK, and the codebase does exactly that in its API routes and Cloud Functions. Anita is a registered POPIA officer. If she asks a harder version of that question later, or if her legal people do, the loose answer will come back at us. We should get ahead of it with a proper data processing agreement, an accurate description of who can access what and under what controls, and the operator or processor distinction spelled out. Better we raise it than they discover it.

**Attendance capture is unsolved and it is load-bearing.** Two rejections of the proposed capture methods, no alternative offered. Care tiers, analytics, at-risk alerts, and the retention narrative all depend on attendance data existing. If this stays unsolved we will deliver a system whose best features are permanently empty.

**Timeline promises made in the room are aggressive.** "Within 12 hours" for the event registration build, "three to four days" for a scoped feature, "end of next week" for children's check-in. Some of that is achievable for narrow features on an existing foundation. The multi-campus architecture is not in that category. I would rather reset expectations now with a phased plan than miss a date we set ourselves in a sales conversation.

**The other platform is unnamed.** We don't know what we're migrating from, what export formats we get, or how clean the data is. This is the single biggest unknown in the estimate.

## 6. Commitments made on the call, tracked

| # | Commitment | Made to | Status |
|---|---|---|---|
| 1 | Settings toggle controlling which fields members may edit | Anita | Not built |
| 2 | Proof of payment upload on event registration | Anita | Not built |
| 3 | Region or campus selector on event registration form | Anita | Not built |
| 4 | Extended event registration fields (t-shirt, dietary, transport, indemnity) | Anita | Not built |
| 5 | "Pull birthdays for next seven days" action | Anita | Not built |
| 6 | Anniversary capture and pull | Anita | Not built |
| 7 | Children's check-in and check-out, "Safety Nest" | Anita | **Not started.** Represented on the call as in development and out within a week. It was a discussion, not a build |
| 8 | Multi-campus network architecture, scoping session to follow | Anita | This document |
| 9 | Life phase list fully customisable, multi-select | Anita | Partially exists, needs rework |
| 10 | Annual life phase roll-over | Anita | Not built |

### Corrections from a re-read of the first transcript (2026-10-22)

- **All three attendance methods were rejected, not two.** Anita heard self check-in by QR, cell leaders marking their own groups, and welcomers with tablets, then said "I somehow don't think that's going to work for us." Cell-leader capture, listed in B8 as an option to put to her, has already been heard once.
- **Anita liked the controlled join link.** "I actually like that link that you can send to people… but you controlling who is getting the link." So "admin adds members, full stop" overstates it: admin entry and an admin-approved form are both acceptable. The follow-up meeting confirmed both options.
- **Multi-select life phases were described as already working.** On the call Anita was told "Yes, you are able to take more than one." The system stores one value. Add this to the expectations to correct alongside Safety Nest.
- **The phrase "head office" was Sifiso's, not Anita's.** She asked for sign-in per region and per church, plus "one signing detail for all of the campuses together with all the information in", meaning full data, not only totals.

---

## 7. Follow-up meeting

**Source:** Fireflies transcript "Kereke Hub JOCC Follow-Up Meeting" (`transcript3.docx`). The date is not recorded in the transcript.
**Present:** Sifiso Sibuyane, Anita Pearson, Baba D, and **Erick Li Sik**, who had not met Sifiso before.
**Context:** Sifiso joined late, from Mozambique without a laptop, after the client sent him the link. Before he joined, Erick raised whether the business depends on one person.

### 7.1 Structure, answering open question A

Baba D shared the structure on screen:

- **Joburg Church of Christ** is one church, split into **regions**, which they also call **campuses**. Named: Soweto, Northwest, Central East. Baba D said three regions.
- Each region is split into **sectors** (for example Soweto's north sector; Northwest's west sector and others).
- Each sector holds **family groups**, also called Bible discussion groups. This is what Kereke Hub calls a cell group.
- A member sits at every level at once: church, region, sector, family group. Lists are pulled at any level.
- **Tshwane, Cape Town, Durban, PE and Mthatha are sister churches** with their own logins. Tshwane "falls under" Joburg, which still administers it.
- **Anita and Baba D must see everything** across all churches and email any of them. Each church and region keeps its own sign-in, and access narrows the lower down the hierarchy a user sits.
- Members are administered per region: Baba D for Soweto and Central East, Anita for Northwest.

This drives **ADR-001 revision 2 (accepted 2026-10-22)** in `docs/05_ARCHITECTURE_DECISIONS.md`.

### 7.2 Life phases and roll-over

- A person holds several life phases, and so do children (kid zone, scholar and pre-teen together). Lists are pulled on combinations, such as mature married with children.
- Baba D showed the life phase list on screen and agreed to send the spreadsheet. Still outstanding.
- **Roll-over at the start of the year**, by the age turned during that year. A child joins the teen ministry in the year they turn 14. Children are preschooler or scholar; there are no grade bands. Parents move automatically with their children's ages.
- On the call, birthday-triggered automation was described first, then the start of the year was agreed. The start of the year is what gets built.

### 7.3 Children's check-in

- The parent brings the child to their age-group class and signs them in on the teacher's device. The same adult must sign out.
- Visitors' children check in the same way, with name, age, parent name, phone and email captured.
- Check-in must not let anyone add or change member data.

### 7.4 Visitors (new request)

Erick asked for visitors to be kept in their own register, separate from members, so a returning visitor and their children can be checked in without filling in the form again, and so the church can follow up with them. Sifiso agreed and said he would add it to scope. This brings the visitors module back, in a narrower form. Logged in `docs/06_OPEN_QUESTIONS.md`.

### 7.5 Communications

- They send regular email through **Mailchimp** today. Sifiso said Kereke Hub would plug in their Mailchimp API key. Only Brevo is built. Logged as a new request.
- They want to email segments such as "campus students" or one region's members directly from the system.
- **WhatsApp:** Sifiso said it is "a couple of months out", pending Meta. Do not demonstrate or promise it.

### 7.6 Monthly report (new request, deferred)

Baba D compiles a monthly report by hand: baptisms, restorations, transfers, move-ins and move-outs per region, feeding a final sheet. He asked whether the system could produce it, then deferred it himself: "our priority is actually to get a database system up and running." Definitions to come in a one-to-one with Sifiso.

### 7.7 Commercial and support

- **Pricing as quoted on the call:** a once-off build fee of R3,000; a R159 monthly subscription; R79 per month for each region and each sister church, regardless of member numbers. The transcript is garbled on the monthly figure. Sister churches outside South Africa (Mozambique, Zimbabwe, Angola were mentioned) would be "in the same ballpark", subject to local data protection law.
- **Support:** Erick asked directly what happens when Sifiso is unavailable. Sifiso said that once the system is live, a team of three handles support and the support line.
- **Test access:** Baba D was told to register a free church on the public Kereke Hub site to try the base product.

### 7.8 Risks raised by this meeting

- **Prototype promise.** Sifiso committed to a working prototype "by the end of the week, latest Monday", based on one sector, with contracting to follow. The network layer alone is scoped at about three weeks. This repeats the Safety Nest pattern from the first call and should be reset in writing before the date passes.
- **Pricing against scope.** The quoted build fee and monthly fees need checking against the ~86-day scope before contracting, together with the licence clause.
- **Key-person dependency.** The client noticed it before Sifiso joined. The support arrangement described on the call needs to be real and written into the agreement.
- **"Super admin".** Anita and Baba D were told they would be super admins. In the system this must be a network role, never the platform `super_admin` role.
- **Sender identity.** Erick noticed the meeting invite came from a JUMO email address. Client communication should come from sifiso@kerekehub.co.za.

### 7.9 Commitments made in the follow-up meeting

| # | Commitment | Made to | Status |
|---|---|---|---|
| 11 | Working prototype "by end of week, latest Monday", based on one sector | All | **Not started.** See risk above |
| 12 | Visitor register with returning-visitor check-in, kept apart from members | Erick | Not built. Logged as a new request |
| 13 | Mailchimp integration via their API key | Erick | Not built. Logged as a new request |
| 14 | Sector and family group structure, pullable at every level | Anita | Not built. ADR-001 revision 2 (accepted) |
| 15 | Network-wide visibility and email for Anita and Baba D | Anita | Not built. Phase 1 |
| 16 | Monthly statistics report | Baba D | Deferred by Baba D. Definitions pending |
| 17 | Support from a team of three once live | Erick | To be written into the agreement |
