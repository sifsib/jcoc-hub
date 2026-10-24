# Handover, first deploy to the JCOC Firebase project (in progress)

**Date:** 2026-10-23, late evening
**Phase:** Phase 1, hosting
**Session:** continues the Phase 2–5 session. Parked here for the night at Sifiso's request.

## Context correction, if any

**The Firebase project ID is `jcoc-d6322`** (display name "JCOC"), not `jcoc-hub`. The plan and older handovers say `jcoc-hub`.
- `.firebaserc` now points at `jcoc-d6322` (commit 97dd9cd).
- Use `--project jcoc-d6322` in every command.
- The GitHub repository and the Vercel project are still called `jcoc-hub`.

## Where we are

Following the step-by-step deploy guide given in this session:

| Step | State |
|---|---|
| Vercel upgraded to Pro | Done (Sifiso) |
| Part B: push `feature/p5-event-registration` | **Done.** It holds everything: Phase 0, both quick wins, Phases 2 to 5 and the later fixes. Later commits are not pushed yet: the `jcoc-d6322` change, the network setup script and this handover |
| Part A: Blaze plan | Appears done: the functions deploy got as far as enabling Google services |
| Part A: Auth, Firestore | Not confirmed. Check Email/Password is on, and Firestore exists in africa-south1 |
| Part A: Storage | **Blocked.** "Get Started" shows "An unknown error occurred. Please refresh the page and try again." |
| Part C: rules and indexes deploy | Failed: needs Storage set up first |
| Part C: functions deploy | Failed: Secret Manager API not enabled |
| Parts D to G: Vercel, domain, first sign-in, setup script, testing | Not started |

## Terminal setup each time

Node is not installed system-wide on this Mac. In each new Terminal window, run these first:

```
export PATH="$HOME/tools/node-v20.20.2-darwin-arm64/bin:$PATH"
cd ~/Projects/jcoc-hub
```

Firebase CLI login is done, as sifisosibuyane@gmail.com.

## Next steps, in order

1. **Storage "unknown error".** Things to try:
   - Refresh, or use a private or incognito window, or another browser. The console sometimes fails just after a Blaze upgrade while billing finishes linking; waiting an hour or so often fixes it.
   - Check Billing in the Google Cloud console shows the account as linked to `jcoc-d6322`.
   - **Location.** If the error only happens with africa-south1 selected, note which locations are offered and decide with Claude. JCOC's data should stay in South Africa for POPIA, so don't just pick a US location to get past it.
2. Re-run the rules deploy: `npx firebase-tools@14 deploy --only firestore:rules,firestore:indexes,storage --project jcoc-d6322`
3. **Enable the Secret Manager API** at https://console.developers.google.com/apis/api/secretmanager.googleapis.com/overview?project=jcoc-d6322, wait a few minutes, then re-run the functions deploy. Use the list of seven functions in the deploy guide, with `--project jcoc-d6322`.
   - If asked for `SYSTEM_GMAIL_USER` or `SYSTEM_GMAIL_APP_PASSWORD`, enter `not-set`. Only the base product's email functions use them, and they are not deployed.
4. **Before 30 October 2026:** move the Cloud Functions to a newer Node version and update `firebase-functions` (currently 4.9.0).
   - The deploy warned that Node 20 functions are decommissioned on 30 October 2026. After that, functions cannot be deployed or changed until this is done.
   - This is development work for Claude: tests, a build, and a check against the emulators.
5. Push the later commits, then carry on with Part D (Vercel). Use `NEXT_PUBLIC_FIREBASE_PROJECT_ID = jcoc-d6322`.

## Not verified

- Whether Auth (Email/Password) and Firestore are set up on `jcoc-d6322`.
- Firestore's location.
- Nothing has been deployed successfully to `jcoc-d6322` yet.

## Update 2026-10-24

- **Rules, Storage rules and indexes deployed** to `jcoc-d6322` ("Deploy complete!"). Storage was set up in the console, and the cross-service rules role was granted.
- **Firestore is in africa-south1.** The deploy errors showed the Firestore triggers there.
- **First functions deploy:**
  - Placeholder secrets were stored: `SYSTEM_GMAIL_USER`, `SYSTEM_GMAIL_APP_PASSWORD`, `WHATSAPP_SERVICE_URL` and `WHATSAPP_SERVICE_KEY` all hold `not-set`.
  - Only `kidsRetention` was created, and it went to **us-central1**. Five failed on the first-use Eventarc delay, and `lifePhaseNewYear` failed with a build error.
  - The container image clean-up was set to 1 day.
- **Sifiso agreed to move the functions to Johannesburg.** `functions/src/index.ts` now sets `setGlobalOptions({ region: "africa-south1" })`, so members' data is processed in South Africa, next to the database. In the emulator, all 20 functions loaded in africa-south1.
- **Next:**
  1. Re-run the seven-function deploy.
  2. Delete the stray us-central1 copy: `npx firebase-tools@14 functions:delete kidsRetention --region us-central1 --project jcoc-d6322`
  3. Before 30 October: move the functions to a newer Node version and update `firebase-functions`.
