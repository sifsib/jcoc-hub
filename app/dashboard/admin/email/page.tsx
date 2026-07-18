"use client";

import { useEffect, useState } from "react";
import { db } from "../../../../lib/firebase";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { AdminGuard } from "../adminShared";

interface TenantOption {
  id: string;
  name: string;
  ownerEmail: string;
}

export default function AdminEmailPage() {
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allChurches, setAllChurches] = useState(false);
  const [subject, setSubject] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const snap = await getDocs(query(collection(db, "tenants"), orderBy("name", "asc")));
        setTenants(
          snap.docs.map((d) => ({
            id: d.id,
            name: d.data().name || "Unnamed Church",
            ownerEmail: d.data().ownerEmail || d.data().email || "",
          }))
        );
      } catch (err) {
        console.error("Tenants fetch error:", err);
      }
    }
    load();
  }, []);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const send = async () => {
    if (!subject.trim() || !messageBody.trim()) {
      setResult({ ok: false, text: "Subject and message are both required." });
      return;
    }
    if (!allChurches && selected.size === 0) {
      setResult({ ok: false, text: "Pick at least one church, or tick \"All churches\"." });
      return;
    }
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantIds: allChurches ? "all" : Array.from(selected),
          subject: subject.trim(),
          body: messageBody.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult({ ok: false, text: data?.error || "Failed to send." });
      } else {
        setResult({ ok: true, text: `Sent to ${data.sent} church${data.sent === 1 ? "" : "es"}.${data.failed?.length ? ` Failed: ${data.failed.join(", ")}` : ""}` });
        setSubject("");
        setMessageBody("");
        setSelected(new Set());
        setAllChurches(false);
      }
    } catch (err) {
      setResult({ ok: false, text: err instanceof Error ? err.message : "Failed to send." });
    } finally {
      setSending(false);
    }
  };

  return (
    <AdminGuard
      icon="✉️"
      title="Email Churches"
      subtitle="Send a message straight to one church, several, or everyone. Not tied to a support ticket."
    >
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 flex flex-col gap-5 max-w-2xl">
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Recipients</label>
          <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <input
              type="checkbox"
              checked={allChurches}
              onChange={(e) => setAllChurches(e.target.checked)}
            />
            All churches ({tenants.length})
          </label>
          {!allChurches && (
            <div className="border border-gray-200 rounded-lg max-h-56 overflow-y-auto divide-y divide-gray-100">
              {tenants.length === 0 ? (
                <p className="p-4 text-sm text-gray-400">No churches yet.</p>
              ) : (
                tenants.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.has(t.id)}
                      onChange={() => toggle(t.id)}
                      disabled={!t.ownerEmail}
                    />
                    <span className={t.ownerEmail ? "text-gray-800" : "text-gray-400"}>
                      {t.name} {!t.ownerEmail && "(no email on file)"}
                    </span>
                  </label>
                ))
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Subject</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-400"
            placeholder="e.g. New feature: Statement Import"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Message</label>
          <textarea
            value={messageBody}
            onChange={(e) => setMessageBody(e.target.value)}
            rows={8}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-400"
            placeholder="Write your message. It goes out as plain text inside our email template."
          />
        </div>

        {result && (
          <div className={`text-sm font-medium rounded-lg px-4 py-3 ${result.ok ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
            {result.text}
          </div>
        )}

        <button
          onClick={send}
          disabled={sending}
          className="self-start px-5 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition disabled:opacity-50"
        >
          {sending ? "Sending..." : "Send Email"}
        </button>
      </div>
    </AdminGuard>
  );
}
