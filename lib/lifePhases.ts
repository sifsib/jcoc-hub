/**
 * lifePhases.ts
 * Life phase rules (ADR-011) for the app. The rules themselves live in
 * functions/src/lifePhasesEngine.ts, so the Cloud Functions and the app run
 * exactly the same code; this file only passes them through.
 */

export * from "../functions/src/lifePhasesEngine";

/** Fields only the server writes; the rules refuse them from the browser. */
export const SERVER_ONLY_PHASE_FIELDS = ["lifePhases", "lifePhasesAuto", "lifePhasesYear"] as const;
