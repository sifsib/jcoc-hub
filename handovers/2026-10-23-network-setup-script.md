# Handover, one-off network setup script

**Date:** 2026-10-23
**Phase:** Phase 1 go-live support (open question U1)
**Session:** continues the Phase 2–5 session

## Context correction, if any

None. There was no screen and no route that creates churches or gives network roles. The regions route also needs a network owner, so a new project could not be set up from the app at all. U1 said this needed a one-off script.

## What I built

`scripts/setup-network.mjs` sets up a network on a Firebase project from a small setup file. It creates the organisation and its churches. It creates regions, or attaches an existing region, such as the one made when Sifiso signs up. It also gives named people a network role (`network_owner` or `network_viewer`).

- **Dry run by default.** It reads Firestore, prints the list of changes, and writes nothing. With `--apply` it writes them all at once (one batch: all or nothing), with an `admin_audit` entry for each change.
- **Safe to run again.** Anything already set up is left alone; a second run says "Nothing to do".
- **Refuses, and writes nothing, if:**
  - a region belongs to another network;
  - a region id is not found;
  - a church is unknown;
  - a name is duplicated;
  - the organisation id is bad;
  - a person has not signed in yet, or belongs to another network;
  - any role other than `network_owner` or `network_viewer` is asked for (never `super_admin`).
- **Warns** when a network person is working in a region outside the network.
- **Project guards:**
  - It will not run against `kereke-hub`.
  - The key file must be for the project named with `--project`.
  - With the emulators running, it only accepts `demo-` projects.
- **It never changes a person's region role,** only `orgId` and `networkRole`.

## Files added and changed

**New:**
- `scripts/networkSetupPlan.mjs`: the pure planning rules, in plain JavaScript so the script runs with plain Node.
- `scripts/setup-network.mjs`: reads Firestore and Auth, prints the plan, and applies it.
- `scripts/network-setup.example.json`: the shape of the setup file, with placeholder emails.
- `tests/unit/networkSetup.test.ts`: 10 tests, written first and run failing (the module did not exist).

**Changed:**
- `package.json`: `npm run setup:network`.
- `.gitignore`: `network-setup.json`, because the real file names real people.
- `docs/06_OPEN_QUESTIONS.md`: U1.

## Data shapes introduced

None new. The script writes the same shapes the seed and `/api/regions` use:
- `organizations/{orgId}`;
- `churches/{orgId}-{name}`;
- `tenants/{orgId}-{name}` (or the attached id) with `orgId`, `churchId`, `orgRole: "region"`;
- `users/{uid}.orgId` and `.networkRole`.

## How Sifiso runs it on the JCOC project (jcoc-d6322)

1. Deploy the app and rules (see the deployment steps), then sign up at `/signup`. That makes your first region.
2. Find your region id: Firebase console, Firestore, `tenants`. It is the document whose `name` is the church name you signed up with; it equals your user id.
3. Invite Anita and Baba D from Team Members, and wait until they have signed in once.
4. Copy `scripts/network-setup.example.json` to a file outside the repository, for example on your Desktop.
   - Fill in the churches and regions.
   - Paste your region id into the region that should be yours.
   - Use the real email addresses.
5. Dry run, then check the list it prints:

   `node scripts/setup-network.mjs --config ~/Desktop/network-setup.json --project jcoc-d6322 --key ~/path/to/service-account.json`

6. If the list is right, run the same command with `--apply` on the end.
7. Run it once more; it should say "Nothing to do".

## Verification done

- **Unit tests:** 175 pass, 10 of them new. `tsc` is clean.
- **On the emulators**, with a pretend sign-up region and invented people:
  - A file with three problems (person not found, person in another network, `super_admin` asked for) stopped with all three listed and exit code 1.
  - A dry run listed 7 changes and wrote nothing; the organisation document was still missing afterwards.
  - `--apply` wrote the 7 changes. A second run said "Nothing to do".
  - Without a key for a real project, the script refused. With the emulators running, it refused a non-`demo-` project. It refused `kereke-hub`.
  - Signed in as the new network owner: the region switcher showed the three new regions, the church filter showed the two churches, and nothing from the other test network appeared.

## What I did NOT verify

- A run against the real `jcoc-hub` project with a real service account key.
- A setup file with sister churches outside South Africa (only the timezone field is offered).

## Gotchas

- People must have signed in at least once before they can be given a network role. Until then, the script stops and says so.
- The service account key is a full-access secret. Keep it outside the repository, and delete it once setup is done if you don't need it.

## Open items for next session

1. Run it on `jcoc-hub` once the project and app are deployed.
2. U1 stays a Kereke Hub staff task. There is no screen on purpose.
