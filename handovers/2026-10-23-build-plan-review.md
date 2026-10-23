# Handover, build plan version 2 and branch check

**Date:** 2026-10-23
**Phase:** 0. Discovery and setup (docs only, no feature code)
**Session:** 2
**Branch:** `docs/jcoc-build-plan`, cut from `feature/qw-member-self-edit` (f11baa1)

## Context correction, read this first

- **The new Node LTS is not installed on this Mac.** `node -v` gives "command not found". There is nothing in `/usr/local/bin` (where the nodejs.org installer puts it), and no installer package is recorded. The only Node is 20.20.2, unpacked in `~/tools` and not on PATH. Every check below ran on Node 20.20.2, not the new LTS.
- **`jcoc-hub-project.md` does not exist** anywhere in the repo.
- Version 2 of the plan was taken from `~/Downloads/jcoc-build-plan-v2.md`, because the file did not come through in the chat. It replaces version 1 completely.

## What I did

1. Replaced `docs/jcoc-build-plan.md` with version 2. Nothing from version 1 is kept.
2. Checked the branches against the commits Sifiso listed. All match, and the three feature branches match `origin`:

   | Branch | Expected | Local | origin |
   |---|---|---|---|
   | `feature/p0-rules-harness-tenant-lockdown` | a007285 | a007285 | a007285 |
   | `feature/qw-birthday-anniversary-pull` | af73e86 | af73e86 | af73e86 |
   | `feature/qw-member-self-edit` | f11baa1 | f11baa1 | f11baa1 |
   | `docs/jcoc-build-plan` | 921b3a2 | 921b3a2 | not pushed |

   The branches are stacked in one line: `main` (08c68bc) → p0 → birthday → self-edit → docs. Each one contains the one before it.
3. Ran the checks with Node 20.20.2 and Java 21 from `~/tools`.
4. Read CLAUDE.md, every ADR, `03_BUILD_PLAN.md`, `01`, `02`, `04`, `06`, `07` and all the handovers, and compared them with plan version 2.

## Findings (against plan version 2)

### Conflicts, and which should win

| # | Plan v2 says | Docs say | Should win |
|---|---|---|---|
| 1 | Phases: 1 hosting, 2 structure, 3 life phases, 4 visitors and kids, 5 events, 6 email | `03_BUILD_PLAN.md` and CLAUDE.md: 0 discovery, 1 network, 2 membership and life phases, 3 events, 4 children and segments, 5 migration | Plan, if Sifiso wants the new order. Then `03_BUILD_PLAN.md`, CLAUDE.md and every "before Phase 1" note (ADR-001 rev 2, `06` A4) need renumbering |
| 2 | The live app is on Vercel | This repo has `apphosting.yaml` (Firebase App Hosting) and no `vercel.json`. `02_SCOPE.md` says App Hosting | Code, for this repo. Prompt B should confirm what the live kereke-hub site really runs on |
| 3 | Domain `jcoc.kerekehub.co.za` | CLAUDE.md and B9: JCOC's own domain, white-labelled | Plan for the prototype. The move to JCOC's own domain becomes a later step |
| 4 | Anita and Dolapo are "super admin" | ADR-001 rev 2 and CLAUDE.md: never `super_admin`; use `network_owner` | ADR. It's only wording, but it must not leak into the code |
| 5 | Check whether campus = branch and family group = cell | ADR-001 rev 2 already decided: campus = region = tenant; branch → sector; cell → family group | ADR |
| 6 | Children up to 13 get a stored school grade that drives their phase | ADR-003 and `06` item H: "no grade bands", preschooler or scholar by the age turned that year | Plan. Confirmed with JCOC on 23 October, which is newer. **Teen from 14 now matches ADR-003.** ADR-003 needs a revision recording the grade field (Prompt D's ADR) |
| 7 | A 1 January job applies the changes automatically, and they also apply on every save | ADR-003: dry-run preview, nothing written until a person approves, plus an undo window | ADR-003 for the yearly run. Anita sees and approves the preview first. Working out one member's phases when they are saved is fine |
| 8 | "Add a wedding date field" | Quick win 1 already added `members.anniversaryDate` | Code. Reuse it rather than adding a second date. The marriage type field (civil, customary, religious) is new |
| 9 | Members never add themselves | `06` item 19 and `01` corrections: members may fill in the join form for admin approval | Docs. An admin-approved join link is allowed |
| 10 | A child is signed out by the same parent **or another listed adult** | ADR-008 (follow-up meeting): the same adult who signed in must sign out | Ask Anita. It's a safeguarding rule |
| 11 | Admins add and archive campuses in the app | Rules: tenant create is `if false`; tenants are created on the server only | Both. Allowed, but adding a campus must go through a server route |

### Gaps and unclear points in version 2

- **Teen to Campus Student at 18.** Teen runs "up to 18" and Campus Student "18 to 21". It isn't clear which one applies in the year a person turns 18.
- **"Teens keep Scholar while they're still at school."** From 14 the grade no longer decides the phase, so nothing says when Scholar ends. Either keep the grade field going until Grade 12, or drop Scholar at a fixed age, or let an admin remove it by hand.
- **Campus Student is automatic from 18 to 21** for everyone, whether or not they study. Confirm that is intended.
- **Audit trail for member changes** is listed only as a kereke-hub port item. jcoc-hub has the same gap: admin edits to members are not logged (only member-requested changes are, in `member_change_requests`). ADR-003 also needs an audit log for the yearly roll-over. Suggest adding it to JCOC scope too, given Anita is a POPIA officer.
- **The `/api/admin` allowlist** is also only listed for kereke-hub. jcoc-hub has the same nine `/api/admin/*` routes, so the same fix applies here.

### JCOC asked for, plan v2 is missing

- How they mark their register (attendance, open question D, a Phase 0 gate).
- A network console and totals for Anita and Baba D (per region, church and network).
- Moving real member data in (only import notes, no migration phase), white-labelling, POPIA pack, training.
- Event details already agreed: per-event payment verifiers (ADR-006), re-upload after rejection, uploads through a server route (ADR-005), indemnity only for minors.
- Children: screen-based collection code, supervisor override, medical notes (ADR-008).
- Member self-service edits (built as quick win 2) are in the checkpoint but not described anywhere in the plan.
- Mailchimp is in Phase 6 but still undecided in `06`.
- Open question A4 (see below).

### Branch and cell model today, and the change for Phase 2

Today, `tenants.branches` and `tenants.cellGroups` are lists of names, and `tenants.cellGroupBranch` maps each cell to its branch. Members carry `branch` and `cellRegion` as text, and users carry `assignedBranch` and `assignedCellRegion`. 13 files use these fields. Branch admins and cell leaders are limited only on screen, not in the rules.

How it maps:
- church → new `churches`
- campus/region → tenant (unchanged)
- sector → branch
- family group → cell

What changes: sectors and family groups become their own records with ids. Renaming one then doesn't leave members pointing at an old name, and archiving keeps history. Members store the ids, the rules enforce sector scoping, and a migration reads `cellGroupBranch`.

### A4 options (for Sifiso)

1. Baba D works through his network role only. Nothing new to build, but `network_owner` must be allowed to write members in any region, not only read them.
2. One login with roles in several regions and a region switcher. Most flexible, and the biggest rules change (+ a few days, with its own negative tests).
3. A separate login per region. No build work, but awkward, and it needs a separate email address for each login.

Recommendation: option 1 now. Keep the tenant lookup in one place so option 2 can be added later.

**Decided by Sifiso, 2026-10-23: option 1, with a region filter in the network view.** Recorded in ADR-001 revision 2 ("A4 decision") and moved to Answered in `06_OPEN_QUESTIONS.md`.

### Merge order

The branches are already stacked, so merge them in this order, each one a fast-forward: p0 rules → birthday pull → member self-edit → docs.

## Verification done (Node 20.20.2, not the new LTS)

- Root `npx tsc --noEmit`: clean.
- `functions/` `npx tsc --noEmit`: clean after `npm ci`. Its `node_modules` was missing, and the first run failed on missing modules only.
- `tests/rules` type check clean; **rules 98 of 98 pass**.
- `tests/unit`: **34 of 34 pass**.

## What I did NOT verify

- Anything on the new Node LTS. It isn't installed on this Mac.
- `next build` was not run.
- How the live kereke-hub site is hosted (needs Prompt B in that repo).

## Gotchas

- `functions/package.json` pins `"node": "20"`, which also sets the Cloud Functions runtime. Moving to the new LTS means changing `.nvmrc`, that engine setting, and the hosting setting, then redeploying functions. Plan v2 already lists this as a separate small change.
- Under A4 option 1, `network_owner` writes across regions. That is wider than ADR-001 rev 2's "full read" and needs negative tests.

## Open items for next session

1. Install the Node LTS so `node -v` works in a new terminal, then re-run the four checks.
2. Sifiso decides whether to renumber the docs to the plan's phase order. (A4 is decided.)
3. Ask Anita: who may sign a child out, Teen versus Campus Student at 18, when Scholar ends for teens.
4. Prompt B (hosting) in kereke-hub, then jcoc-hub.
