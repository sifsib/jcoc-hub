# Discovery Summary

**Source:** Zoom demo and requirements call, transcript supplied as `Transcript.docx` (approx. 59 minutes).
**Present:** Sifiso Sibuyane (Kereke Hub), Anita Pearson (church administrator), "Baba D" (leadership, joined late).
**Base product demonstrated:** Kereke Hub, live demo account with dummy data.

> **Updated 2026-08-31.** The client is **Joburg Church of Christ (JCOC)**, johannesburg.church, part of the Southern African Churches of Christ family. Approvers are Anita Pearson and Oludolapo Ogundipe ("Baba D"), both.

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
