import { redirect } from "next/navigation";

// The old single-page admin panel has been split into standalone pages under
// /dashboard/admin/*. Anyone landing on the old URL is sent to Tenants.
export default function AdminSettingsRedirect() {
  redirect("/dashboard/admin/tenants");
}
