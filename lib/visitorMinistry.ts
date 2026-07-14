"use client";

// Helpers for the "Visitor Ministry" group: the subset of team members who are
// allowed to be assigned to visitors and follow-up workflows.
//
// A person is in the ministry when their user doc has visitorMinistry === true
// (toggled on the Team page). These helpers are used to (a) lock assignee
// dropdowns and (b) auto-pick a responsible person (DRI) on auto-started
// workflows, spreading the load evenly.

import { db } from "./firebase";
import { collection, getDocs, query, where } from "firebase/firestore";

export interface MinistryUser {
  uid: string;
  name: string;
  email: string;
}

// Load active users flagged as visitor ministry for a tenant.
export async function getVisitorMinistryUsers(tenantId: string): Promise<MinistryUser[]> {
  const snap = await getDocs(
    query(
      collection(db, "users"),
      where("tenantId", "==", tenantId),
      where("visitorMinistry", "==", true)
    )
  );
  return snap.docs
    .filter((d) => (d.data().status || "active") !== "inactive")
    .map((d) => {
      const x = d.data();
      return { uid: d.id, name: x.displayName || x.email || "Unnamed", email: x.email || "" };
    });
}

// Pick the ministry member currently carrying the fewest active workflow
// instances, so auto-assignment rotates fairly. Returns null if nobody is in
// the ministry yet (caller should then leave the item unassigned).
export async function pickLeastLoadedAssignee(
  tenantId: string,
  users: MinistryUser[]
): Promise<MinistryUser | null> {
  if (users.length === 0) return null;
  if (users.length === 1) return users[0];

  const snap = await getDocs(
    query(
      collection(db, "workflow_instances"),
      where("tenantId", "==", tenantId),
      where("status", "==", "active")
    )
  );

  const load: Record<string, number> = {};
  users.forEach((u) => (load[u.uid] = 0));
  snap.docs.forEach((d) => {
    const uid = d.data().assignedToUid;
    if (uid && uid in load) load[uid] += 1;
  });

  return users.reduce((best, u) => (load[u.uid] < load[best.uid] ? u : best), users[0]);
}

// Fire-and-forget email to the assignee. Never throws; assignment must succeed
// even if the email can't be sent (e.g. Brevo not connected).
export async function notifyAssignee(payload: {
  assigneeUid: string;
  subjectName: string;
  subjectPhone?: string;
  kind?: "visitor" | "member" | "workflow";
  reason?: string;
  note?: string;
}): Promise<void> {
  try {
    await fetch("/api/notify-assignee", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // swallow — notification is best-effort
  }
}
