// Pure planning for the one-off network setup (open question U1), kept apart
// from scripts/setup-network.mjs so it can be tested without Firebase
// (tests/unit/networkSetup.test.ts). Plain JavaScript so the script runs with
// plain Node.
//
// Given the setup file and what is already in Firestore, works out the writes:
// the organisation, its churches, its regions (new ones, or an existing region
// such as the one made at sign-up) and network roles for named people. Anything
// unsafe is an error and nothing is written. Running it twice changes nothing.

export const NETWORK_ROLES = ["network_owner", "network_viewer"];
export const DEFAULT_TIMEZONE = "Africa/Johannesburg";

const key = (s) => String(s ?? "").trim().toLocaleLowerCase("en-ZA");
const slug = (s) => key(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/**
 * @param {object} config  The setup file: orgId, orgName, churches [{name}],
 *   regions [{name, church, tenantId?, timezone?}], networkPeople [{email, role}].
 * @param {object} state   What is in Firestore now: org {id, name} or null,
 *   churches [{id, name, orgId, archived}], tenants [{id, name, orgId, orgRole,
 *   churchId, archived}] (the org's regions plus any named by tenantId), people
 *   [{email, uid, user}] (user is the users/{uid} document, or null).
 * @param {string} now     ISO time stamped on new and changed records.
 * @returns {{ errors: string[], warnings: string[], actions: {kind: "create"|"update", path: string, data: object, summary: string}[] }}
 */
export function planNetworkSetup(config, state, now) {
  const errors = [];
  const warnings = [];
  const actions = [];
  const orgId = String(config?.orgId ?? "");
  const orgName = String(config?.orgName ?? "").trim();

  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(orgId)) {
    errors.push(`The organisation id "${orgId}" must be 3 to 40 lower-case letters, numbers or dashes.`);
  }
  if (!orgName) errors.push("Give the organisation name.");

  const dupes = (list, what) => {
    const seen = new Set();
    for (const item of list) {
      const k = key(item?.name);
      if (!k) errors.push(`Every ${what} needs a name.`);
      else if (seen.has(k)) errors.push(`The ${what} "${String(item.name).trim()}" is listed twice.`);
      seen.add(k);
    }
  };
  const churches = Array.isArray(config?.churches) ? config.churches : [];
  const regions = Array.isArray(config?.regions) ? config.regions : [];
  const people = Array.isArray(config?.networkPeople) ? config.networkPeople : [];
  dupes(churches, "church");
  dupes(regions, "region");
  if (errors.length) return { errors, warnings, actions: [] };

  // Organisation
  if (!state.org) {
    actions.push({ kind: "create", path: `organizations/${orgId}`, data: { name: orgName, createdAt: now }, summary: `Create the organisation "${orgName}" (${orgId})` });
  } else if (state.org.name !== orgName) {
    actions.push({ kind: "update", path: `organizations/${orgId}`, data: { name: orgName }, summary: `Rename the organisation to "${orgName}"` });
  }

  // Churches: found by name within the organisation, else created.
  const churchIdByName = new Map();
  for (const c of churches) {
    const name = String(c.name).trim();
    const found = state.churches.find((x) => x.orgId === orgId && key(x.name) === key(name));
    if (found) {
      churchIdByName.set(key(name), found.id);
      continue;
    }
    const id = `${orgId}-${slug(name)}`;
    if (state.churches.some((x) => x.id === id)) {
      errors.push(`A church with the id ${id} already exists under another name. Rename one first.`);
      continue;
    }
    churchIdByName.set(key(name), id);
    actions.push({ kind: "create", path: `churches/${id}`, data: { orgId, name, archived: false, createdAt: now }, summary: `Create the church "${name}"` });
  }

  // Regions
  const regionIds = new Set(state.tenants.filter((t) => t.orgId === orgId && t.orgRole === "region").map((t) => t.id));
  for (const r of regions) {
    const name = String(r.name).trim();
    const churchId = churchIdByName.get(key(r.church));
    if (!churchId) {
      errors.push(`The region "${name}" names the church "${r.church ?? ""}", which is not in the churches list.`);
      continue;
    }
    if (r.tenantId) {
      const t = state.tenants.find((x) => x.id === r.tenantId);
      if (!t) {
        errors.push(`The region "${name}" points at ${r.tenantId}, which was not found.`);
        continue;
      }
      if (t.orgId && t.orgId !== orgId) {
        errors.push(`${r.tenantId} ("${t.name}") already belongs to another network (${t.orgId}).`);
        continue;
      }
      regionIds.add(t.id);
      const wanted = { name, orgId, orgRole: "region", churchId, archived: false };
      if (Object.entries(wanted).some(([k, v]) => t[k] !== v)) {
        actions.push({ kind: "update", path: `tenants/${t.id}`, data: { ...wanted, updatedAt: now }, summary: `Make "${t.name}" (${t.id}) the region "${name}" under ${r.church}` });
      }
      continue;
    }
    const found = state.tenants.find((x) => x.orgId === orgId && x.orgRole === "region" && key(x.name) === key(name));
    if (found) {
      if (found.churchId !== churchId) {
        actions.push({ kind: "update", path: `tenants/${found.id}`, data: { churchId, updatedAt: now }, summary: `Move the region "${name}" under ${r.church}` });
      }
      continue;
    }
    const id = `${orgId}-${slug(name)}`;
    if (state.tenants.some((x) => x.id === id)) {
      errors.push(`A region with the id ${id} already exists under another name. Rename one first.`);
      continue;
    }
    regionIds.add(id);
    actions.push({
      kind: "create",
      path: `tenants/${id}`,
      data: {
        name, orgId, churchId, orgRole: "region", accountType: "standard", status: "active", archived: false,
        signupSource: "setup_script", timezone: String(r.timezone || DEFAULT_TIMEZONE), createdAt: now, updatedAt: now,
      },
      summary: `Create the region "${name}" under ${r.church}`,
    });
  }

  // Network people: an organisation and a network role on their user document,
  // nothing else. Never the platform super_admin role (CLAUDE.md).
  for (const p of people) {
    const email = String(p?.email ?? "").trim();
    if (!NETWORK_ROLES.includes(p?.role)) {
      errors.push(`${email || "A person"}: the role must be network_owner or network_viewer.`);
      continue;
    }
    const found = state.people.find((x) => key(x.email) === key(email));
    if (!found?.uid || !found.user) {
      errors.push(`${email} was not found. Invite them from Team Members and wait until they have signed in, then run this again.`);
      continue;
    }
    if (found.user.orgId && found.user.orgId !== orgId) {
      errors.push(`${email} already belongs to another network (${found.user.orgId}).`);
      continue;
    }
    if (!regionIds.has(found.user.tenantId)) {
      warnings.push(`${email} is working in ${found.user.tenantId || "no region"}, which is not a region of this network, so they will see nothing until they switch to one.`);
    }
    if (found.user.orgId !== orgId || found.user.networkRole !== p.role) {
      actions.push({ kind: "update", path: `users/${found.uid}`, data: { orgId, networkRole: p.role }, summary: `Give ${email} the role ${p.role}` });
    }
  }

  return errors.length ? { errors, warnings, actions: [] } : { errors, warnings, actions };
}
