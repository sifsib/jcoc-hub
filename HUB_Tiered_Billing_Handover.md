# Kereke Hub, Tiered Billing Build, Handover

Last updated: 14 July 2026

This document covers the hub-side work needed to finish the member-based free tier and hard block. It assumes the marketing site (pricing, homepage, features) is already reworked and live.

## 1. The model we are building

Two tiers, member-based, not time-based.

- Free tier: up to 50 active members, R0, forever. Core admin features only. A hard block stops the church adding member number 51 until they upgrade.
- Paid tier ("Church"): unlimited members, flat R159 a month, every module.

Decisions already locked with Sifiso:

- Free ceiling is 50 active members.
- The gate is a hard block, immediate, at member 51. No grace period.
- The paid rate is R159.
- We did a full switch away from the old time-based trial model (30-day trial, evaluation, full rate) to this member-based model for new standard signups.
- Free tier is generous on core admin. Paid unlocks the depth.

Free tier includes: member roster and pastoral notes, attendance tracking, visitor and follow-up pipeline, online giving (PayFast and EFT), public church profile, CSV export.

Paid tier adds: unlimited members, automation workflows and custom forms, advanced analytics and at-risk alerts, bulk email (Gmail SMTP), events, worship setlists and rosters, multi-admin and custom roles, custom branding, priority support.

Special account types stay full-access comps: `internal` is free forever, `beta` is free for 6 months then R159.

## 2. What is already built and deployed (Stage 1)

Done in `app/signup/page.tsx`, `app/api/signup/route.ts`, and `functions/src/index.ts`, already pushed and deployed.

- The signup form now asks "Roughly how many congregants?" and sends it to the API.
- The signup API sets the starting tier from that number: 50 or fewer starts `free`, more than 50 starts `paid` at R159. Internal and beta accounts stay comped.
- Every new tenant document now stores these fields:
  - `tier`: `"free"` or `"paid"`
  - `memberLimit`: `50` for free, `null` for paid (unlimited)
  - `activeMemberCount`: starts at `0`
  - `congregantsAtSignup`: the number they typed, for reference
  - plus existing billing fields (`billingPhase`, `currentRate`, etc.)
- A Cloud Function `onMemberCountWrite` keeps `activeMemberCount` accurate. It fires on every member create, update, and delete, and adjusts the tenant's count by the change. An "active member" is a member document with `status === "active"`, which matches how the rest of the app counts members.

Important: the counter only tracks changes from now on. Existing churches will not have a correct `activeMemberCount` until the backfill (below) runs. And nothing is blocked yet. That is intentional, so Stage 1 could not lock anyone out.

## 3. Data model reference

Tenant document, `tenants/{tenantId}`:

```
tier: "free" | "paid"
memberLimit: number | null      // 50 on free, null (unlimited) on paid
activeMemberCount: number        // maintained by onMemberCountWrite
congregantsAtSignup: number | null
billingPhase: "free" | "trial" | "active" | ...
currentRate: number              // 0 on free/comped, 159 on paid
accountType: "internal" | "beta" | "standard"
status: "active" | "trial" | ...
```

Member document, `members/{memberId}` (top-level collection, tagged by tenant):

```
tenantId: string
status: "active" | "inactive" | "archived" | "pending" | ...
```

Only `status === "active"` counts toward the limit.

## 4. What still needs to be built (Stage 2)

Build in this order. The order matters: the count must be correct before anything blocks on it.

### 4.1 Backfill existing tenants (do this first)

Existing churches have no accurate `activeMemberCount`, `tier`, or `memberLimit` yet. Write a one-time job that, for every tenant, counts its active members and sets the fields. Respect comps.

Recommended as a temporary, secret-protected HTTPS function in `functions/src/index.ts`, called once after deploy, then removed:

```ts
import { onRequest } from "firebase-functions/v2/https";

export const backfillMemberCounts = onRequest(async (req, res) => {
  if (req.query.key !== process.env.BACKFILL_KEY) {
    res.status(403).send("Forbidden");
    return;
  }
  const tenantsSnap = await db.collection("tenants").get();
  let updated = 0;
  for (const tenantDoc of tenantsSnap.docs) {
    const data = tenantDoc.data();
    const membersSnap = await db
      .collection("members")
      .where("tenantId", "==", tenantDoc.id)
      .where("status", "==", "active")
      .get();
    const count = membersSnap.size;

    // Comped and large churches are paid (unlimited); everyone else under 50 is free.
    const tier =
      data.tier ??
      (data.accountType === "internal" || data.accountType === "beta" || count > 50
        ? "paid"
        : "free");
    const memberLimit = tier === "paid" ? null : (data.memberLimit ?? 50);

    await tenantDoc.ref.update({
      activeMemberCount: count,
      tier,
      memberLimit,
      updatedAt: new Date().toISOString(),
    });
    updated++;
  }
  res.status(200).send(`Backfilled ${updated} tenants.`);
});
```

Open decision for Sifiso before running: what to do with an existing FREE church that is already over 50 members at backfill time. Two choices, pick one and build it into the backfill:

- Grandfather them: leave their existing members untouched (the block only stops NEW adds beyond the limit, which the rule already does), or
- Auto-move them to paid.

Recommended: grandfather. Do not delete or hide anyone's members. The hard block only prevents going further.

Acceptance: after running, every tenant has a numeric `activeMemberCount` matching a manual count of its active members, plus a `tier` and `memberLimit`.

### 4.2 Hard block in Firestore security rules

This is the airtight backstop, so nobody can exceed the limit even by calling the database directly. Add it to the `members` create rule in `firestore.rules`.

```
function tenantData(tenantId) {
  return get(/databases/$(database)/documents/tenants/$(tenantId)).data;
}

match /members/{memberId} {
  // ...keep all existing create checks (signed in, correct tenant, role, etc.)...
  allow create: if isSignedIn()
    && <existing checks>
    && (
      // allow unless the tenant is on free tier and at or over the limit
      tenantData(request.resource.data.tenantId).tier != 'free'
      || tenantData(request.resource.data.tenantId).activeMemberCount
           < tenantData(request.resource.data.tenantId).memberLimit
    );
}
```

Notes for the builder:
- Security rules cannot increment or write; they only read. The read of the tenant doc via `get()` is fine, it adds one document read per member create.
- Be defensive about missing fields. If `tier`, `memberLimit`, or `activeMemberCount` is null (an un-backfilled tenant), the expression should NOT block. Only block when the tenant is explicitly `free` with a known count at or above a known limit. Run the backfill first so this never happens in practice.
- Deploy rules with `firebase deploy --only firestore:rules`.

Acceptance: with a test free tenant at `activeMemberCount: 50`, creating member 51 is denied by rules. At 49, it succeeds. A paid tenant is never blocked.

### 4.3 Dashboard usage meter

So the block never surprises anyone. The dashboard layout already loads tenant data, so surface `activeMemberCount` against `memberLimit`.

- Show something like "47 / 50 members" for free tenants.
- Turn amber at ~45 and red at 50.
- Hide it (or show "Unlimited") for paid tenants.

Acceptance: a free tenant sees a live count that matches the roster; a paid tenant sees no limit.

### 4.4 Friendly block and upgrade prompt in the roster

The rule denies the write, but the user must see a kind message, not a raw error. In the roster "add member" flow (`app/dashboard/roster/page.tsx`):

- Before/at the point of adding, if `tier === "free"` and `activeMemberCount >= memberLimit`, stop and show a modal: the church has grown past the free tier, invite them to upgrade to R159 for unlimited members, with a button to the billing/upgrade page.
- Also handle the case where the rule rejects the write (belt and braces), and show the same upgrade modal rather than a generic failure.

Acceptance: a free tenant at 50 who tries to add a member sees the upgrade modal, not an error toast, and no member is created.

### 4.5 Gate paid features by tier

Free stays generous on core admin; paid unlocks depth. Gate these behind `tier === "paid"`:

- Automation workflows and custom forms
- Advanced analytics and at-risk alerts (basic attendance stays free)
- Bulk email (Gmail SMTP)
- Custom branding
- Multi-admin team and custom roles

For each: hide or lock the UI entry point for free tenants with an "Upgrade to unlock" state, AND enforce on the server (API routes / rules) so the gate cannot be bypassed from the browser. Do not rely on hiding the button alone.

Acceptance: a free tenant cannot reach or trigger a paid feature from the UI or the API; a paid tenant can.

### 4.6 Upgrade flow, free to paid

Moving a church from free to paid. The hub already has PayFast wiring (`app/api/billing/payfast/route.ts`, `app/api/billing/itn/route.ts`, `app/dashboard/billing/page.tsx`).

- Add an "Upgrade to R159 unlimited" action that starts a PayFast subscription.
- On successful payment (the ITN webhook), set the tenant `tier: "paid"`, `memberLimit: null`, `currentRate: 159`, `billingPhase: "active"`.
- Confirm the billing page copy reflects the new model. It still describes the old trial phases and should be updated to "Free under 50 members, R159 unlimited above."

Acceptance: completing PayFast checkout flips the tenant to paid, lifts the cap, and unlocks paid features. Cancelling leaves them on free.

## 5. Cross-cutting notes

- Definition of active member is `status === "active"`. If the roster ever introduces a new "active-like" status, update both `onMemberCountWrite` and the backfill.
- Archiving a member (moving status away from "active") frees a slot automatically via the counter. Good, make sure the roster has an obvious archive action so churches can self-manage near the limit.
- Downgrade path (paid back to free) is out of scope for now. If added later, decide what happens to a church over 50 that stops paying.
- The `currentRate` in older code was R139 in places; the new standard rate is R159 everywhere. Watch for any other R139 references.

## 6. Deployment reminders

- Website (signup page, API routes, dashboard, billing): pushed to `kereke-hub` on GitHub, deploys via Vercel.
- Cloud Functions (`onMemberCountWrite`, backfill): deploy with `firebase deploy --only functions`. Note: the deploy will prompt for the `WHATSAPP_SERVICE_URL` secret if it is not yet set, this is unrelated to billing but blocks the deploy until a value is provided.
- Security rules: deploy with `firebase deploy --only firestore:rules`.
- Always run `npm run build` inside `functions/` first to catch TypeScript errors before deploying.

## 7. Suggested build order (checklist)

1. Run the backfill, verify counts on every existing tenant.
2. Decide and implement the over-50-free grandfather rule.
3. Add and deploy the security-rule hard block, test create at 49, 50, 51.
4. Add the dashboard usage meter.
5. Add the friendly upgrade modal in the roster add-member flow.
6. Gate the paid features, UI and server.
7. Wire the free-to-paid PayFast upgrade and update billing page copy.
8. Remove the temporary backfill function.
