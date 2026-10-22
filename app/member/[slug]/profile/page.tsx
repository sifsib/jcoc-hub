"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "../../../../lib/firebase";
import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, where, type Timestamp } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import {
  EMPTY_ADDRESS,
  SELF_EDITABLE_FIELDS,
  SETTINGS_DOC_ID,
  diffChanges,
  formatValue,
  normaliseAddress,
  resolveEditableFields,
  validate,
  type Address,
  type ChangeSet,
  type FieldChange,
  type SelfEditableField,
} from "../../../../lib/memberSelfService";

// Members never write their own record (ADR-007). This page sends a change
// request for the fields the church allows; an administrator approves it in
// Dashboard > Member Updates.

interface OwnRequest {
  id: string;
  status: "pending" | "approved" | "rejected";
  changes: ChangeSet;
  createdAt?: Timestamp;
  reviewedAt?: Timestamp;
  rejectReason?: string;
}

const fieldLabel = (key: string) => SELF_EDITABLE_FIELDS.find((f) => f.key === key)?.label ?? key;
const millis = (t?: Timestamp) => t?.toMillis() ?? 0;

const inputCls =
  "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition disabled:bg-gray-50 disabled:text-gray-500";

export default function MemberProfileSlugPage() {
  const router = useRouter();

  const [uid, setUid] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [churchName, setChurchName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#1A5C38");
  const [fullName, setFullName] = useState("");
  const [record, setRecord] = useState<{ phone: string; email: string; address: Address }>({
    phone: "",
    email: "",
    address: EMPTY_ADDRESS,
  });
  const [form, setForm] = useState(record);
  const [editable, setEditable] = useState<SelfEditableField[]>([]);
  const [requests, setRequests] = useState<OwnRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/member/login");
        return;
      }
      setUid(user.uid);

      try {
        const userData = (await getDoc(doc(db, "users", user.uid))).data() || {};
        const tid = userData.tenantId || "";
        const mid = userData.memberId || "";
        setTenantId(tid);
        setMemberId(mid);

        const [tenantSnap, settingsSnap] = await Promise.all([
          getDoc(doc(db, "tenants", tid)),
          getDoc(doc(db, "tenants", tid, "settings", SETTINGS_DOC_ID)),
        ]);
        const tenantData = tenantSnap.data() || {};
        setChurchName(tenantData.name || "My Church");
        setPrimaryColor(tenantData.primaryColor || "#1A5C38");
        setEditable(resolveEditableFields(settingsSnap.exists() ? settingsSnap.data().editableFields : undefined));

        if (mid) {
          const md = (await getDoc(doc(db, "members", mid))).data() || {};
          setFullName(md.fullName || [md.firstName, md.lastName].filter(Boolean).join(" ") || user.displayName || "");
          const current = { phone: md.phone || "", email: md.email || "", address: normaliseAddress(md.address) };
          setRecord(current);
          setForm(current);
          await loadRequests(user.uid, mid);
        } else {
          setFullName(user.displayName || "");
        }
      } catch (err) {
        console.error("Failed to load member profile:", err);
        setError("Could not load your details. Please refresh and try again.");
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [router]);

  async function loadRequests(forUid: string, forMember: string) {
    // The rules only let a member list requests they made themselves, so the
    // query must filter on requestedByUid.
    const snap = await getDocs(query(collection(db, "member_change_requests"), where("requestedByUid", "==", forUid)));
    setRequests(
      snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as OwnRequest & { memberId?: string })
        .filter((r) => r.memberId === forMember)
        .sort((a, b) => millis(b.createdAt) - millis(a.createdAt))
    );
  }

  const pending = requests.find((r) => r.status === "pending");
  const lastReviewed = requests.find((r) => r.status !== "pending");
  const showRejection = !pending && lastReviewed?.status === "rejected";

  async function handleSubmit() {
    setError("");
    setSent(false);
    if (!memberId) {
      setError("No member record is linked to your account. Please contact your church office.");
      return;
    }
    const proposed = Object.fromEntries(editable.map((f) => [f, form[f]])) as Partial<Record<SelfEditableField, unknown>>;
    const problems = validate(proposed);
    if (problems.length) {
      setError(problems.map((p) => p.message).join(" "));
      return;
    }
    const changes = diffChanges(record, proposed, editable);
    if (Object.keys(changes).length === 0) {
      setError("Nothing has changed yet.");
      return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, "member_change_requests"), {
        tenantId,
        memberId,
        requestedByUid: uid,
        memberName: fullName,
        status: "pending",
        changes,
        createdAt: serverTimestamp(),
      });
      setSent(true);
      await loadRequests(uid, memberId);
    } catch (err) {
      console.error("Change request failed:", err);
      setError("Could not send your changes. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const handleLogout = async () => {
    await auth.signOut();
    await fetch("/api/logout", { method: "POST" }).catch(() => {});
    router.push("/member/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const locked = !!pending;
  const setAddress = (k: keyof Address, v: string) => setForm((p) => ({ ...p, address: { ...p.address, [k]: v } }));

  return (
    <div className="min-h-screen bg-gray-50">
      <header style={{ backgroundColor: primaryColor }} className="px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-white/70 hover:text-white text-sm font-medium mr-1">
          ← Back
        </button>
        <div className="flex-1">
          <p className="text-white font-bold text-base">{churchName}</p>
          <p className="text-white/70 text-xs">My Profile</p>
        </div>
        <button onClick={handleLogout} className="text-white/70 hover:text-white text-xs font-medium">
          Sign Out
        </button>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 flex flex-col gap-5">
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm flex items-center gap-4">
          <div
            style={{ backgroundColor: primaryColor }}
            className="w-14 h-14 rounded-full flex items-center justify-center text-white text-2xl font-bold shrink-0"
          >
            {fullName?.charAt(0)?.toUpperCase() || "?"}
          </div>
          <div>
            <p className="text-base font-bold text-gray-900">{fullName || "Unknown"}</p>
            <p className="text-sm text-gray-500">{record.email}</p>
            <span className="inline-block mt-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2.5 py-0.5 font-semibold">
              Member
            </span>
          </div>
        </div>

        {pending && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">Waiting for approval</p>
            <p className="mt-1 text-amber-800">
              Your church office will update your details once they approve these changes:
            </p>
            <ul className="mt-2 space-y-1">
              {(Object.entries(pending.changes) as [SelfEditableField, FieldChange][]).map(([f, c]) => (
                <li key={f}>
                  <span className="font-medium">{fieldLabel(f)}:</span> {formatValue(c.to)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {showRejection && lastReviewed && (
          <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
            <p className="font-semibold">Your last change was not approved.</p>
            {lastReviewed.rejectReason && <p className="mt-1 text-gray-500">{lastReviewed.rejectReason}</p>}
          </div>
        )}

        {editable.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm text-sm text-gray-500">
            To change any of your details, please contact your church office.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm flex flex-col gap-4">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">My Contact Details</h2>
            <p className="text-xs text-gray-400 -mt-2">
              Changes are sent to your church office for approval. Your name and other details are managed by the office.
            </p>

            {editable.includes("phone") && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">{fieldLabel("phone")}</label>
                <input
                  type="tel"
                  value={form.phone}
                  disabled={locked}
                  onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="e.g. 0821234567"
                  className={inputCls}
                />
              </div>
            )}

            {editable.includes("email") && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">{fieldLabel("email")}</label>
                <input
                  type="email"
                  value={form.email}
                  disabled={locked}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  placeholder="e.g. name@example.com"
                  className={inputCls}
                />
                <p className="mt-1 text-xs text-gray-400">This does not change the email you sign in with.</p>
              </div>
            )}

            {editable.includes("address") && (
              <div className="flex flex-col gap-2">
                <label className="block text-xs font-semibold text-gray-500">{fieldLabel("address")}</label>
                <input value={form.address.line1} disabled={locked} onChange={(e) => setAddress("line1", e.target.value)} placeholder="Street address" className={inputCls} />
                <input value={form.address.line2} disabled={locked} onChange={(e) => setAddress("line2", e.target.value)} placeholder="Line 2 (optional)" className={inputCls} />
                <div className="grid grid-cols-3 gap-2">
                  <input value={form.address.suburb} disabled={locked} onChange={(e) => setAddress("suburb", e.target.value)} placeholder="Suburb" className={inputCls} />
                  <input value={form.address.town} disabled={locked} onChange={(e) => setAddress("town", e.target.value)} placeholder="Town / City" className={inputCls} />
                  <input value={form.address.postalCode} disabled={locked} onChange={(e) => setAddress("postalCode", e.target.value)} placeholder="Postal code" className={inputCls} />
                </div>
              </div>
            )}
          </div>
        )}

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>}
        {sent && (
          <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            Thank you. Your changes have been sent to your church office for approval.
          </p>
        )}

        {editable.length > 0 && (
          <button
            onClick={handleSubmit}
            disabled={saving || locked}
            style={{ backgroundColor: primaryColor }}
            className="w-full py-3 rounded-xl text-white font-bold text-sm hover:opacity-90 transition disabled:opacity-50"
          >
            {saving ? "Sending..." : locked ? "Waiting for approval" : "Send for approval"}
          </button>
        )}

        <p className="text-center text-xs text-gray-300 pb-4">Powered by Kereke Hub</p>
      </div>
    </div>
  );
}
