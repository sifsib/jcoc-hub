# Porting Log

The purpose of this file is to stop 69 days of reusable work getting stranded in a fork.

This build is a hard fork of Kereke Hub. Forks diverge. The mitigation is not to fight that, it is to know precisely which pieces are worth bringing back, and to have built those pieces so they *can* be brought back.

**Fill this in during the build.** Not at the end. The end never comes, and by then nobody remembers which of forty commits touched the roll-over engine.

---

## The five features that must stay portable

These were scoped for JCOC but are product features. Other South African churches would pay for every one. AFM Gauteng has already asked for the first.

| Feature | Phase | Days | Why it is product, not client-specific |
|---|---|---|---|
| Organisation, region and campus layer | 1 | 21 | Any denomination or multi-site church. AFM Gauteng asked for this by name |
| Life phases and annual roll-over | 2 | 14 | Any church running life-stage ministry. The manual version is a week of somebody's year |
| Event registration with proof of payment | 3 | 17 | The strongest of the five. SA churches run on EFT and POP screenshots in WhatsApp groups. No international CHMS handles it because American churches do not have this problem |
| Children's check-in and check-out | 4 | 8 | Every church with a kids ministry. Safeguarding is not optional anywhere |
| Communications segment builder | 4 | 5 | Every church above about a hundred people |

**Not portable, and that is fine:** discovery, JCOC data migration, their training material, white-label configuration for their brand. Roughly 17 days.

---

## What "portable" means in practice

A feature is portable if it can be lifted as a folder, a rules block, and a migration. Concretely:

- Its pages live under their own route folder rather than being bolted into existing pages.
- Its Firestore collections are new, not extra fields smeared across `members`. Where a new field on an existing collection is unavoidable, it is additive and optional, never a rename.
- Its rules sit in a clearly delimited block in `firestore.rules`, with a comment marking the start and end.
- It reads tenant and role through `useAppUser()` rather than reimplementing them.
- Anything JCOC-specific in it comes from config, not from a hardcoded string.
- Pure logic sits in its own file, separate from the framework wrapper, so it can be tested in isolation. `functions/src/summaryFormat.ts` in the base repo is the pattern.

If a feature fails two or more of those, it will be rebuilt from scratch rather than ported, and the fork will have cost double.

---

## Log

One row per merged piece of work. Add the row when the branch merges, while it is still fresh.

| Date | Feature | Branch or commit | Portable | Files and collections touched | Notes for the port back |
|---|---|---|---|---|---|
| 2026-10-22 | Birthday and anniversary pull (quick win, not one of the five) | `feature/qw-birthday-anniversary-pull` | yes | `lib/celebrations.ts`, `app/dashboard/celebrations/page.tsx`, `tests/unit/`, small additive edits to `app/dashboard/roster/page.tsx` and `app/dashboard/layout.tsx`; field `members.anniversaryDate` | Lifts as is. The Friday default is a page constant; make it a setting if another church sends its email on a different day. Not merged yet, so this row is early |
| 2026-10-23 | Member self-service edits with approval (quick win, not one of the five) | `feature/qw-member-self-edit` | yes | `lib/memberSelfService.ts`, `app/dashboard/member-updates/`, `app/member/[slug]/profile/page.tsx` (rewritten), rules block `MEMBER SELF-SERVICE` plus the `tenants/{id}/settings` block, index on `member_change_requests`, `tests/rules/memberSelfService.test.ts`, `tests/unit/memberSelfService.test.ts` | **Port the rules first and urgently**: upstream still lets members write their own member record and has no settings rule. The feature itself lifts cleanly. Not merged yet, so this row is early |

**Portable column:** `yes`, `no`, or `partial`. If `partial`, say in the notes exactly what would need untangling, because that sentence is the entire value of this row.

---

## Known coupling to untangle before porting

Record anything that will make a port harder as you discover it. Better to write it down now than to rediscover it in a year.

| Item | Why it complicates a port |
|---|---|
| White-label config in `lib/whiteLabel.ts` | Kereke Hub has no equivalent yet. Porting a feature that reads from it needs either the config file ported first, or defaults added |
| `branch` string migrated to the `campuses` entity | Base Kereke Hub still uses the loose `branch` string. Any ported feature assuming campuses exist will need a compatibility path or the migration ported first |
| Org-level tier resolution (ADR-009) | Base resolves tier per tenant. A ported feature checking org-level tier will need the base's `lib/tier.ts` updated first |

---

## When to actually port

Do not port continuously. That is just maintaining two repos with extra steps.

Port when there is a reason: a second multi-site client signs, or a Kereke Hub customer asks for one of these five. Then take the feature from this fork, using `git diff fork-point` to see the true extent of the change, and bring it across as its own piece of work with its own testing.

The porting log is what makes that a two-day job instead of a two-week archaeology exercise.
