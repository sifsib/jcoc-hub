// Nightly jobs as private HTTPS functions in africa-south1. Google's Cloud
// Scheduler cannot run in africa-south1, so onSchedule functions fail there.
// Instead each job is a private function in Johannesburg (where the member
// data is processed, for POPIA), and a Cloud Scheduler job in europe-west1
// only calls it on time. The call carries no member data.
//
// "private" means Google refuses every request that is not signed by a
// service account allowed to invoke the function; the Scheduler job signs its
// calls with an OIDC token from the project's default compute service
// account. Nobody on the internet can start these jobs.
//
// The Scheduler jobs are created by hand in the Google Cloud console (see
// handovers/2026-10-23-first-deploy-in-progress.md).
import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";

export function privateTask(name: string, run: () => Promise<string>) {
  return onRequest({ invoker: "private", timeoutSeconds: 540 }, async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Use POST.");
      return;
    }
    try {
      const summary = await run();
      logger.info(`[${name}] ${summary}`);
      res.status(200).send(summary);
    } catch (err) {
      logger.error(`[${name}]`, err);
      res.status(500).send("Failed; see the function logs.");
    }
  });
}
