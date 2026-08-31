# Kereke Connect — Member Portal Scope
*Last updated: 2026-06-17*

---

## What We're Building

A congregation-facing member portal that lives at **hub.kerekehub.co.za/member/[tenantId]/...**

This sits inside the same Next.js app already deployed on Vercel. No new repo, no new deployment. Same Firebase backend, same Firestore database. Members get their own login that's completely separate from the admin dashboard.

---

## What Already Exists (Reusable)

Before scoping what's new, here's what's already partially built and can be connected rather than rebuilt:

| What | Route | Status |
|---|---|---|
| Membership join form (full household + children + spouse) | `/join/[tenantId]` | Built. Needs provisioning trigger added. |
| Public giving page (EFT bank details) | `/give/[tenantId]` | Built. Keep as public, enhance in portal. |
| Public event RSVP | `/rsvp/[eventId]` | Built. Will link from member events page. |
| Check-in kiosk | `/checkin/[tenantId]/[serviceId]` | Built. Attendance data already in Firestore. |
| Admin invite acceptance | `/accept-invite` | Built. Admin-only. Member flow will be separate. |
| Birthday email function | `brevoBirthdayEmails` (Cloud Function) | Built. Extend for push notifications. |
| **Groups admin page** | `/dashboard/groups` | **Built.** Create static + dynamic groups, assign members. No admin changes needed. |
| **Events admin page** | `/dashboard/events` | **Built.** Create events, generates RSVP links. No admin changes needed. |
| **Worship admin page** | `/dashboard/worship` | **Built.** Full setlist + song library. Needs one small addition: assign members to setlists. |

---

## Architecture Decision

**Same Next.js app, new `/member` route tree.** Members log in at `/member/login` and their portal lives under `/member/[tenantId]/`. Admins and members use the same Firebase project but have different roles and see completely different parts of the app.

**Auth separation:**
- Admin users: role = `owner`, `admin`, `member_manager`, etc. → `/dashboard/*`
- Congregation members: role = `congregation_member` → `/member/*`
- Middleware guards each tree separately.

**Bridge field:** When a member gets a portal account, their Firestore `/members/{memberId}` document gets a new field: `authUid`. This is how the system knows which member doc belongs to which logged-in user.

---

## Phase 0 — Authentication Foundation
*Must be built first. Everything else depends on this.*

### 0A. Member Provisioning (Existing Members)

**The goal:** Church admins in the roster can click "Invite to Portal" on any member who has an email address. That member gets an email with a link to set their password and access their profile.

**What to build:**
- "Invite to Portal" button on each member card in `/dashboard/roster`
- API route: `/api/invite-member` — creates a Firebase Auth account for the member, sets role to `congregation_member`, stores `authUid` on the member doc, sends a password-setup email via Brevo
- Separate from the existing `/accept-invite` (which is for admin team invites)
- New page: `/member/setup` — where member lands after clicking the email link to set their password
- Show invite status on roster (Invited / Active / Not invited)

**Bulk invite:** Option in roster to "Invite all members with email" so a church doesn't have to do it one by one.

### 0B. Auto-Provisioning (New Members Going Forward)

**The goal:** Any new member who submits the join form at `/join/[tenantId]` with an email address automatically gets a portal invite. No admin action required.

**What to build:**
- Extend the existing `onMemberCreated` Cloud Function: if `email` is present on the new member doc, trigger the same provisioning flow as 0A.
- Same applies to members added manually via the roster modal.

### 0C. Children Linkage

**The goal:** When a primary member logs in, their children appear in their family section automatically, pulled from the existing household model.

**How it works:**
- The join form already stores children in the household doc and marks children who are members as separate member docs with `householdRole: 'child'`.
- On login, query households where `primaryMemberId == authUser.memberId` to pull all linked children.
- Non-member children (stored as embedded objects in the household doc) show up as managed sub-profiles — the parent can edit their name, DOB, and profile photo.
- Member children (who have their own member docs) also show up here. Parent can manage their profile until they're old enough to have their own login.

### 0D. Firestore Rules Update

Add a `congregation_member` function to the existing rules:

```
function isCongregationMember() {
  return userData().role == 'congregation_member';
}
```

Then add member-self-access rules:
- `/members/{memberId}` — member can read/update their own doc (where `resource.data.authUid == request.auth.uid`)
- `/households/{id}` — member can read their own household
- `/announcements/{id}` — congregation members can read published announcements for their tenant
- `/events/{id}` — congregation members can read active events for their tenant
- `/attendance/{id}` — member can read their own attendance records

### 0E. Member Login Page

- `/member/login` — clean, branded login page separate from the admin login
- "Forgot password" link
- On login, redirect to `/member/[tenantId]/home`
- Middleware extended: `/member/*` routes check for `congregation_member` role

---

## Phase 1 — Member Profile

**Route:** `/member/[tenantId]/profile`

The first thing a member sees after login. They can view and edit their own details.

**Fields visible/editable:**
- Profile photo (upload to Firebase Storage)
- Name, DOB, gender, phone, email
- Address
- Marital status, ministry group, membership type, cell region
- Baptism and born-again status (read-only, only admin can change)
- POPIA consent status (read-only)

**What they cannot edit:**
- Member ID, date added, status (active/inactive) — admin-controlled

**Family section (within same profile page):**
- Shows spouse (if linked in household) — read-only link to their own profile
- Shows children — with edit capability (see Phase 0C above)
- Each child card shows: name, DOB, age, profile photo
- "Edit child" opens a modal: name, DOB, gender, photo — no auth account for kids

---

## Phase 2 — Home Feed / Dashboard

**Route:** `/member/[tenantId]/home`

The landing page after login. Keeps members connected without overwhelming them.

**Sections:**
- Welcome banner with member's name and church logo
- Upcoming events (next 3, with RSVP buttons)
- Latest announcements (most recent 3, with "See all" link)
- Quick links: Give, My Groups, My Attendance
- If member is on worship team: "My Next Assignment" card

---

## Phase 3 — Cell Groups

**Route:** `/member/[tenantId]/groups`

**Admin side: ALREADY BUILT at `/dashboard/groups`.**
Static groups (manually assign members) and dynamic groups (auto-built from member filter criteria — e.g., all members in a specific cell region). No admin changes needed.

**Member side (new):**
- See all groups they belong to, pulled from `group_members` collection
- Each group card shows: group name, leader name, meeting day/time, location
- Tap into a group to see the group member list
- Members cannot join or leave themselves — admin controls membership

---

## Phase 4 — Events

**Route:** `/member/[tenantId]/events`

**Admin side: ALREADY BUILT at `/dashboard/events`.**
Creates events (title, type, date, time, location, capacity), shows upcoming/past tabs, generates and copies the RSVP link for sharing. No admin changes needed.

**Member side (new):**
- List of upcoming events (with capacity and type badges)
- Each event: tap for full details and RSVP inline (Attending / Maybe / Can't make it)
- RSVP saves to Firestore and increments `rsvpCount` on the event doc
- Past events tab available
- The existing public `/rsvp/[eventId]` page stays for non-members and external sharing. The member portal version pre-fills the member's name.

---

## Phase 5 — Announcements

**New Firestore collection:** `announcements/{id}` — `{tenantId, title, body, type, publishedAt, expiresAt, publishedBy, pinned}`

**Admin side (extend `/dashboard/communications` or new `/dashboard/announcements`):**
- Create announcement: title, body, type (General / Youth / Finance / Prayer)
- Set expiry date (auto-hides old ones)
- Pin option (always shows at top)

**Member side:**
- `/member/[tenantId]/announcements` — scrollable feed, newest first, pinned on top
- Filter by type
- Also surfaces on the home feed (Phase 2)

---

## Phase 6 — Giving History

**Route:** `/member/[tenantId]/give`

The existing `/give/[tenantId]` public page already shows bank details. This is the member-authenticated version.

**What's added for logged-in members:**
- Their giving history (list of contributions from the `contributions` Firestore collection, filtered by their memberId)
- Total given this year / this month
- Download giving statement as PDF (annual, for tax purposes — South African Section 18A basis)
- The EFT bank details remain (no PayFast integration yet — that's a future phase)

---

## Phase 7 — Attendance History

**Route:** `/member/[tenantId]/attendance`

Members can see their own attendance record. Data already exists in Firestore — this just surfaces it.

**What they see:**
- List/calendar of services they attended
- Streak badge (e.g., "5 weeks in a row")
- Total attendance this year vs last year
- Children's attendance shown in family section

---

## Phase 8 — Worship Planning

**Admin side: ALREADY BUILT at `/dashboard/worship`.**
Full setlist management (service date, service label, song order, per-song key overrides, notes) and a song library (title, artist, key, tempo, tags, lyrics). Data lives in subcollections: `tenants/{tenantId}/setlists` and `tenants/{tenantId}/songs`.

**One addition needed on the admin side:**
Add an `assignedMembers: string[]` field to each Setlist document. In the setlist detail view, add a simple "Assign Team Members" section: dropdown of members (pulled from roster), select and add. This is a small UI extension, not a rebuild.

**Member side (new):**
- `/member/[tenantId]/worship` — hidden from members with no assignments
- A member sees only the setlists where their `memberId` appears in `assignedMembers`
- Each setlist card shows: service date, service label, song list (with keys), notes
- Read-only. No editing by members.
- Firestore rule: `congregation_member` can read a setlist doc only if `request.auth.uid` maps to a memberId in `assignedMembers`

---

## Phase 9 — Push Notifications

*Built after Phases 1-8 are stable. Requires PWA setup.*

**PWA setup (one-time):**
- Add `manifest.json` and service worker (`/public/sw.js`) to the hub app
- Configure Firebase Cloud Messaging (FCM) with VAPID key
- Add "Enable notifications" prompt on the member home page

**New Firestore collection:** `push_subscriptions/{uid}` — `{tenantId, fcmToken, createdAt}`

**Notifications triggered:**

| Trigger | Who gets it | When |
|---|---|---|
| New announcement published | All congregation members in tenant | On create |
| New event created | All congregation members in tenant | On create |
| Birthday today | The member themselves + all admins | Daily 7am scheduled function |
| Kid's birthday today | The parent (primary member) | Daily 7am scheduled function |
| Worship assignment added | The assigned member | On assignment create |

**Cloud Functions to add:**
- `onAnnouncementCreated` — fetch all `push_subscriptions` for the tenant, send FCM push
- `onEventCreated` — same pattern
- Extend `brevoBirthdayEmails` (already exists) to also fire a push notification alongside the email
- `onWorshipAssignmentCreated` — push to the assigned member

---

## Build Order Summary

| Phase | What | Admin work? | Member work? | Blocks |
|---|---|---|---|---|
| 0 | Member auth, provisioning, kids linkage, Firestore rules | Small (invite button in roster) | New login + setup pages | Everything |
| 1 | Profile view/edit | None | New page | Phase 2 |
| 2 | Home feed | None | New page | Phases 3-8 |
| 3 | Cell groups | None (already built) | New page | None |
| 4 | Events | None (already built) | New page | Phase 9 |
| 5 | Announcements | New admin page | New page | Phase 9 |
| 6 | Giving history | None | New page | None |
| 7 | Attendance history | None | New page | None |
| 8 | Worship planning | Small extension (assign members) | New page | Phase 9 |
| 9 | Push notifications | None | Permission prompt in home feed | Phases 4, 5, 8 must be live |

---

## What This Doesn't Include (Yet)

- Online payment / PayFast giving (EFT only for now)
- Member-to-member messaging
- Prayer request submission (simple to add to announcements module later)
- Kids check-in kiosk integration with the family profile (can link later)
- Group-specific WhatsApp broadcast (already partially exists, can wire in later)

---

## New Files / Routes Summary

```
app/
  member/
    login/page.tsx                    ← Member login (NEW)
    setup/page.tsx                    ← Password setup on invite (NEW)
    [tenantId]/
      layout.tsx                      ← Auth guard for congregation_member role (NEW)
      home/page.tsx                   ← Home feed (NEW)
      profile/page.tsx                ← Profile view/edit (NEW)
      family/page.tsx                 ← Children management (NEW)
      groups/page.tsx                 ← Groups (NEW)
      events/page.tsx                 ← Events + RSVP (NEW)
      announcements/page.tsx          ← Announcements feed (NEW)
      give/page.tsx                   ← Giving history (NEW)
      attendance/page.tsx             ← Attendance history (NEW)
      worship/page.tsx                ← Worship assignments (NEW)

  api/
    invite-member/route.ts            ← Provision member Firebase Auth account (NEW)
    bulk-invite-members/route.ts      ← Invite all members with email (NEW)

  dashboard/
    groups/page.tsx                   ← ALREADY EXISTS. No changes needed.
    events/page.tsx                   ← ALREADY EXISTS. No changes needed.
    announcements/page.tsx            ← Admin announcements (NEW)
    worship/page.tsx                  ← ALREADY EXISTS. Small extension: add assignedMembers field to setlist.

functions/src/index.ts
  + onMemberCreated (EXTEND)          ← Add provisioning trigger if email present
  + onAnnouncementCreated (NEW)       ← Push to all congregation members in tenant
  + onEventCreated (NEW)              ← Push to all congregation members in tenant
  + onSetlistAssigned (NEW)           ← Push to newly assigned worship team member
  + brevoBirthdayEmails (EXTEND)      ← Also fire push notification alongside email

firestore.rules (EXTEND)
  + isCongregationMember()
  + member self-read/update rules
  + announcements read rules
  + push_subscriptions rules
  + worship_services/assignments rules

public/
  sw.js                               ← Service worker for PWA push (NEW)
  manifest.json                       ← PWA manifest (NEW)
```
