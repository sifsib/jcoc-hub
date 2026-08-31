# Workspace Setup

How to get from this folder to a working build environment. Do this once, then ignore this file.

**Decided 2026-08-31:** hard fork. Separate repository, separate Firebase project, separate domain, white-labelled to JCOC with a "Designed by Kereke Hub" attribution.

---

## Before you start: the one thing that makes a fork survivable

A fork diverges. That is not a warning, it is a certainty, and it starts on day one. Six months in you will have two church management systems and every bug will need fixing twice.

You cannot prevent that. You can make it cost less, and the whole trick is this: **of the 86 days scoped, roughly 17 are JCOC-specific and 69 are product.** The organisation layer, life phases and the annual roll-over, event registration with proof of payment, children's check-in, and comms segmentation are all things other South African churches would pay for. AFM Gauteng has already asked for the first one.

So build those five as **self-contained modules with clean seams**, even inside the fork. Not woven through existing pages. Not reaching into unrelated helpers. If a feature can be lifted out as a folder plus a rules block plus a migration, it can be cherry-picked back into Kereke Hub later. If it is smeared across forty files, it will be rebuilt from scratch, and you will pay for it twice.

That discipline costs almost nothing while you are building. Retrofitting it costs weeks.

`docs/07_PORTING_LOG.md` is where you record what is portable as you go. Fill it in during the build, not afterwards. Afterwards never happens.

---

## Which tool for which job

**Claude Code** is where the build happens. Real repo access, branches, commits, type checks, rules tests, and it holds `CLAUDE.md` in context every session. Everything from Phase 1 onward.

**Cowork** is better for the surrounding material. Client documents, chasing the requirements checklist, migration mapping spreadsheets, training material, the POPIA pack. Work that produces files rather than commits.

Keep the two synchronised through `docs/`, which lives in the repo and is the source of truth for both.

---

## Step 1. Create the repository as a real fork

Not a fresh repo with code copied in. An actual fork with the base repo as an upstream remote, because that is what lets you pull fixes across in either direction later.

```bash
# create the new private repo on GitHub first, e.g. jcoc-hub
git clone https://github.com/<you>/jcoc-hub.git
cd jcoc-hub
git remote add upstream https://github.com/sifsib/kereke-hub.git
git fetch upstream
git checkout -b main upstream/main
```

Then tag the fork point immediately:

```bash
git tag fork-point
git push origin main --tags
```

That tag is how you produce a clean diff of everything built for JCOC versus everything inherited. You will want it when you come to port features back.

Private repository, always. Client personal data will flow through this system.

## Step 2. Strip the repo down

The base repo root has sponsorship decks, logos, marketing scripts, tutorial documents and Word files committed alongside application code. A client-facing fork should not carry any of it.

Remove:

```
*.docx  *.pptx  *.pdf at root
Kereke_logo.*  Logo 192.jpg  and other root-level marketing images
_marketing-site-files/  brevo-emails/  Documents/
wppconnect-server/                      <- stale, superseded by kereke-whatsapp
example-AttendanceMarkingOffline.tsx
BR_Sponsorship_*  KerekeHub_*  Kereke_Hub_*  Beta_Letter.docx
root-level *.md handovers, scopes, content calendars, scripts
youtube_thumbnail_*.svg  thumbnail_*.svg  visitor-followup-thumbnail.html
marketing_setup_graphic.html
```

Keep:

```
app/  components/  lib/  functions/  public/  icons/
package.json  package-lock.json  tsconfig.json  next.config.ts
postcss.config.mjs  next-env.d.ts
firebase.json  .firebaserc  firestore.rules
firestore.indexes.json  storage.rules  apphosting.yaml
```

Keep `kereke-whatsapp/` only if WhatsApp is in scope for JCOC. It is really a separate Railway service and may be cleaner as its own repo.

```bash
git rm -r --cached <the removals>
git commit -m "Strip marketing assets and stale services from client fork"
```

Note that removing files does not remove them from history. If anything in there is genuinely sensitive, rewrite history now rather than later.

## Step 3. Separate Firebase project

**Do not point this at the live Kereke Hub Firebase project.** Phase 1 rewrites cross-tenant read paths in `firestore.rules`, and that file is the only thing standing between every live church and every other one. That surgery does not happen where paying customers live.

```bash
firebase projects:create jcoc-hub
firebase use --add          # alias it "jcoc"
firebase deploy --only firestore:rules,firestore:indexes,storage
```

Enable Auth with email and password, Firestore, Storage, Functions. Set up a second project for staging before Phase 5.

## Step 4. Environment variables

Build `.env.local` from what the code actually expects. Check `lib/firebase.ts` and `lib/firebaseAdmin.ts` for exact names rather than assuming. At minimum: Firebase web config, Admin SDK service account, and Brevo and BulkSMS keys if you are exercising communications.

`.env.local` is gitignored. Keep it that way.

## Step 5. White-label configuration

JCOC gets their own branding and their own domain, with a "Designed by Kereke Hub" attribution. Do this as **configuration, not find-and-replace**, so the fork stays portable and so the same mechanism can serve future white-label clients.

Create a single `lib/whiteLabel.ts` exporting product name, logo paths, colours, support contact, email sender name, SMS sender ID, PWA name, and the attribution string. Everything else reads from it. Nothing hardcodes "Kereke Hub" in a component.

Things that need to change and are easy to miss:

- PWA `manifest.json`: name, short name, icons, theme colour
- `app/layout.tsx` metadata: title, description, favicon, apple icon
- Member portal headers, which currently default to `#1A5C38`
- Brevo sender name and reply-to
- BulkSMS sender ID
- Support ticket flow, which currently routes to Kereke Hub and says so
- Transactional email templates
- Anything rendering the Kereke logo from `public/`

The attribution belongs in the app footer and the member portal footer. Agree the exact wording with JCOC and put it in `whiteLabel.ts` as one string.

## Step 6. Custom domain

JCOC's own domain, so you need DNS access from them.

```bash
firebase hosting:sites:create <site>
# then add the custom domain in the Firebase console and follow the DNS records
```

The email sender domain must also be theirs, with SPF and DKIM configured, or deliverability will suffer badly on a 380-person newsletter.

## Step 7. Rules test harness

Not optional. ADR-001 puts the entire cross-region isolation guarantee in `firestore.rules`, and Anita is a registered POPIA officer.

```bash
npm install --save-dev @firebase/rules-unit-testing vitest
```

Write the first test **before** the first rule change. It should assert that a user in region A gets permission denied reading a member document in region B. Get that failing correctly, then build the org layer around it.

## Step 8. Verify it runs

```bash
npm install
npm run dev
npx tsc --noEmit
cd functions && npm install && npx tsc --noEmit && cd ..
```

Fix anything broken before Claude Code touches it. Starting a session on a repo that does not compile wastes the first hour every time.

---

## Starting a Claude Code session

Open the repo in Claude Code. It reads `CLAUDE.md` automatically.

Open the session with something like this, adjusting the phase:

> Read CLAUDE.md, docs/06_OPEN_QUESTIONS.md, docs/07_PORTING_LOG.md, and the most recent file in handovers/. We are working on Phase 1, the network foundation. Start with the organisations data model and the orgId backfill, per docs/02_SCOPE.md section B1. Build it as a self-contained module with clean seams, because this feature is going back into Kereke Hub later. Write the negative cross-region rules test before any rules change. Update the porting log when you finish.

Four things to keep insisting on:

**Portability on the five product features.** Clean seams, minimal coupling, and a porting log entry when done. This is the whole mitigation for the fork.

**Negative tests before rules changes.** A rule that lets the right person in is easy. A rule that keeps the wrong person out is the thing being paid for.

**Handover before the session ends**, not when context is nearly full. The "what I did NOT verify" section is the valuable one.

**Stop and ask rather than guess.** If the brief and the code disagree, the code wins and Sifiso gets asked. That happened on the base repo and writing it down loudly was the right response.

---

## Starting a Cowork session

Point Cowork at `docs/`. Good first tasks:

- Turn `04_CLIENT_REQUIREMENTS_CHECKLIST.md` into a tracker to send Anita and update as things arrive.
- Build the migration field-mapping spreadsheet once the sample export lands.
- Draft the POPIA pack: processing agreement, privacy notice, consent wording.
- Draft the licensing clause. See the note below, it matters more than it looks.
- Role-specific training material during Phase 5.

---

## One commercial note, because a fork invites the wrong assumption

A white-labelled system on their own domain, in its own repository, built to their specification, will feel to JCOC like their software. Some clients then assume they own the code.

They should not. Kereke Hub should **license** the system to them, not transfer it. Otherwise the organisation layer you are about to build cannot be sold to AFM Gauteng, and 69 days of genuinely reusable work becomes JCOC's asset instead of yours.

Get that written into the agreement before Phase 1 starts, not after they have seen it working. It is a much easier conversation early.

---

## Branching

```
main              protected, deployable
develop           integration
feature/p1-org-model
feature/p2-lifephase-rollover
upstream-sync     for pulling base repo fixes across
```

Phase-prefixed feature branches, so the history reads as the plan.

## Before every merge to develop

- `npx tsc --noEmit` clean, root and functions.
- Rules tests passing, negative tests included.
- Porting log updated if the work touched one of the five product features.
- Handover written if the branch closes a session.
- `docs/06_OPEN_QUESTIONS.md` updated if anything new surfaced.
