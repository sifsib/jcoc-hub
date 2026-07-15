"use client";

import { useEffect, useState, useCallback } from "react";
import { db } from "../../../lib/firebase";
import { useAppUser } from "../../../lib/useAppUser";
import { useTenantTier } from "../../../lib/useTenantTier";
import { isPaidTier } from "../../../lib/tier";
import PaidFeatureLock from "../../components/PaidFeatureLock";
import InfoTooltip from "../../components/InfoTooltip";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WaBroadcast {
  id: string;
  type: "whatsapp_broadcast";
  message: string;
  sentBy: string;
  sentByName: string;
  tenantId: string;
  createdAt: { seconds: number } | null;
}

interface EmailBroadcast {
  id: string;
  type: "email_broadcast";
  subject: string;
  sentBy: string;
  tenantId: string;
  recipientCount: number;
  failedCount: number;
  createdAt: string | { seconds: number } | null;
}

interface BrevoStatus {
  connected: boolean;
  senderEmail: string;
  senderName: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(ts: { seconds: number } | string | null) {
  if (!ts) return "—";
  const date =
    typeof ts === "string"
      ? new Date(ts)
      : new Date((ts as { seconds: number }).seconds * 1000);
  return date.toLocaleString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildWaLink(message: string) {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

// Plain text → minimal HTML for Brevo
function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<p style="font-family:Arial,sans-serif;font-size:15px;line-height:1.7;color:#222;">${escaped
    .split(/\n\n+/)
    .join('</p><p style="font-family:Arial,sans-serif;font-size:15px;line-height:1.7;color:#222;">')
    .replace(/\n/g, "<br>")}</p>`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CommunicationsPage() {
  const { appUser, loading: userLoading } = useAppUser();
  const { tier, loading: tierLoading } = useTenantTier();
  const tenantId = appUser?.tenantId ?? null;

  // ── Channel ──
  const [channel, setChannel] = useState<"whatsapp" | "email" | "sms" | "mailing">("whatsapp");

  // ── SMS (BulkSMS) state ──
  const [smsStatus, setSmsStatus] = useState<{ connected: boolean; senderId: string; oneTimeSmsEnabled: boolean; oneTimeSmsMessage: string } | null>(null);
  const [smsLoading, setSmsLoading] = useState(false);
  const [smsTokenId, setSmsTokenId] = useState("");
  const [smsTokenSecret, setSmsTokenSecret] = useState("");
  const [smsSenderId, setSmsSenderId] = useState("");
  const [smsOneTimeEnabled, setSmsOneTimeEnabled] = useState(false);
  const [smsOneTimeMessage, setSmsOneTimeMessage] = useState("");
  const [savingSms, setSavingSms] = useState(false);
  const [smsError, setSmsError] = useState("");
  const [smsSuccess, setSmsSuccess] = useState("");
  // Birthday auto-SMS settings
  const [smsBirthdayEnabled, setSmsBirthdayEnabled] = useState(false);
  const [smsBirthdayMessage, setSmsBirthdayMessage] = useState("");
  // SMS composer
  const [smsTab, setSmsTab] = useState<"compose" | "setup">("compose");
  const [smsAudience, setSmsAudience] = useState<"all" | "group" | "individuals">("all");
  const [smsMessage, setSmsMessage] = useState("");
  const [smsGroups, setSmsGroups] = useState<{ id: string; name: string }[]>([]);
  const [smsGroupId, setSmsGroupId] = useState("");
  const [smsAllMembers, setSmsAllMembers] = useState<{ id: string; name: string; phone: string }[]>([]);
  const [smsMemberSearch, setSmsMemberSearch] = useState("");
  const [smsSelectedIds, setSmsSelectedIds] = useState<string[]>([]);
  const [smsAllCount, setSmsAllCount] = useState<number | null>(null);
  const [smsSending, setSmsSending] = useState(false);
  const [smsSendError, setSmsSendError] = useState("");
  const [smsSendSuccess, setSmsSendSuccess] = useState("");

  // ── WhatsApp state ──
  const [waTab, setWaTab] = useState<"compose" | "history">("compose");
  const [waBroadcasts, setWaBroadcasts] = useState<WaBroadcast[]>([]);
  const [waHistoryLoading, setWaHistoryLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [waSubmitting, setWaSubmitting] = useState(false);
  const [waError, setWaError] = useState("");
  const [waSuccessId, setWaSuccessId] = useState("");

  // ── Email state ──
  const [emailTab, setEmailTab] = useState<"compose" | "history" | "setup">("compose");
  const [brevoStatus, setBrevoStatus] = useState<BrevoStatus | null>(null);
  const [brevoLoading, setBrevoLoading] = useState(false);
  // Setup form
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [senderEmailInput, setSenderEmailInput] = useState("");
  const [senderNameInput, setSenderNameInput] = useState("");
  const [savingBrevo, setSavingBrevo] = useState(false);
  const [brevoSaveError, setBrevoSaveError] = useState("");
  // Compose
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [emailSuccess, setEmailSuccess] = useState("");
  const [memberEmailCount, setMemberEmailCount] = useState<number | null>(null);
  // History
  const [emailHistory, setEmailHistory] = useState<EmailBroadcast[]>([]);
  const [emailHistoryLoading, setEmailHistoryLoading] = useState(false);


  // ── Mailing list state ──
  interface BrevoList { id: number; name: string; totalSubscribers: number }
  const [mailingSettings, setMailingSettings] = useState<{
    brevoMailingListId: number | null;
    brevoMailingListName: string;
    brevoWelcomeTemplateId: string;
    brevoBirthdayTemplateId: string;
  } | null>(null);
  const [mailingLists, setMailingLists] = useState<BrevoList[]>([]);
  const [mailingLoading, setMailingLoading] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [creatingList, setCreatingList] = useState(false);
  const [createListError, setCreateListError] = useState("");
  const [createListSuccess, setCreateListSuccess] = useState("");
  const [welcomeTemplateId, setWelcomeTemplateId] = useState("");
  const [birthdayTemplateId, setBirthdayTemplateId] = useState("");
  const [savingTemplates, setSavingTemplates] = useState(false);
  const [templateSaveMsg, setTemplateSaveMsg] = useState("");

  // ── Load WhatsApp history ──
  useEffect(() => {
    if (!tenantId || channel !== "whatsapp") return;
    setWaHistoryLoading(true);
    getDocs(
      query(
        collection(db, "communications"),
        where("tenantId", "==", tenantId),
        where("type", "==", "whatsapp_broadcast"),
        orderBy("createdAt", "desc")
      )
    )
      .then((snap) =>
        setWaBroadcasts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as WaBroadcast)))
      )
      .catch(console.error)
      .finally(() => setWaHistoryLoading(false));
  }, [tenantId, channel, waSuccessId]);

  // ── Load Brevo status + member count when Email channel opens ──
  const loadBrevoStatus = useCallback(async () => {
    if (!tenantId) return;
    setBrevoLoading(true);
    try {
      const res = await fetch("/api/tenant/brevo");
      if (res.ok) {
        const data: BrevoStatus = await res.json();
        setBrevoStatus(data);
        if (data.connected) {
          setSenderEmailInput(data.senderEmail);
          setSenderNameInput(data.senderName);
        }
      }
    } catch (err) {
      console.error("Failed to load Brevo status:", err);
    } finally {
      setBrevoLoading(false);
    }
  }, [tenantId]);

  const loadMemberEmailCount = useCallback(async () => {
    if (!tenantId) return;
    try {
      const snap = await getDocs(
        query(
          collection(db, "members"),
          where("tenantId", "==", tenantId),
          where("status", "==", "active")
        )
      );
      const withEmail = snap.docs.filter((d) => !!d.data().email?.trim()).length;
      setMemberEmailCount(withEmail);
    } catch {
      setMemberEmailCount(null);
    }
  }, [tenantId]);

  useEffect(() => {
    if (channel === "email" && !brevoStatus) {
      loadBrevoStatus();
      loadMemberEmailCount();
    }
  }, [channel, brevoStatus, loadBrevoStatus, loadMemberEmailCount]);

  // ── Load BulkSMS status when SMS channel opens ──
  useEffect(() => {
    if (channel !== "sms" || smsStatus !== null || !tenantId) return;
    setSmsLoading(true);
    fetch("/api/tenant/bulksms")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setSmsStatus(d);
          setSmsSenderId(d.senderId || "");
          setSmsOneTimeEnabled(!!d.oneTimeSmsEnabled);
          setSmsOneTimeMessage(d.oneTimeSmsMessage || "");
          setSmsBirthdayEnabled(!!d.birthdaySmsEnabled);
          setSmsBirthdayMessage(d.birthdaySmsMessage || "");
        }
      })
      .catch(console.error)
      .finally(() => setSmsLoading(false));
  }, [channel, smsStatus, tenantId]);

  // Load groups + members once for the SMS composer.
  useEffect(() => {
    if (channel !== "sms" || !tenantId || smsAllCount !== null) return;
    (async () => {
      try {
        const [gSnap, mSnap] = await Promise.all([
          getDocs(query(collection(db, "groups"), where("tenantId", "==", tenantId))),
          getDocs(query(collection(db, "members"), where("tenantId", "==", tenantId), where("status", "==", "active"))),
        ]);
        setSmsGroups(gSnap.docs.map((d) => ({ id: d.id, name: d.data().name || "Unnamed group" })));
        const members = mSnap.docs
          .map((d) => {
            const x = d.data();
            return {
              id: d.id,
              name: x.fullName || [x.firstName, x.lastName].filter(Boolean).join(" ") || "Unnamed",
              phone: x.phone || x.cellphone || "",
            };
          })
          .filter((m) => m.phone);
        setSmsAllMembers(members);
        setSmsAllCount(members.length);
      } catch (e) {
        console.error("SMS composer load failed:", e);
        setSmsAllCount(0);
      }
    })();
  }, [channel, tenantId, smsAllCount]);

  async function handleSmsSend(e: React.FormEvent) {
    e.preventDefault();
    setSmsSendError("");
    setSmsSendSuccess("");
    if (!smsMessage.trim()) { setSmsSendError("Please type a message."); return; }
    if (smsAudience === "group" && !smsGroupId) { setSmsSendError("Please choose a group."); return; }
    if (smsAudience === "individuals" && smsSelectedIds.length === 0) { setSmsSendError("Please pick at least one person."); return; }
    setSmsSending(true);
    try {
      const res = await fetch("/api/communications/sms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: smsMessage.trim(),
          audience: smsAudience,
          groupId: smsAudience === "group" ? smsGroupId : undefined,
          memberIds: smsAudience === "individuals" ? smsSelectedIds : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setSmsSendError(data.error || "Something went wrong."); return; }
      setSmsSendSuccess(`Sent to ${data.sent} recipient${data.sent !== 1 ? "s" : ""}${data.failed > 0 ? ` (${data.failed} failed)` : ""}.`);
      setSmsMessage("");
      setSmsSelectedIds([]);
    } catch {
      setSmsSendError("Could not reach the server. Please try again.");
    } finally {
      setSmsSending(false);
    }
  }

  // Recipient count preview for the composer (group count is resolved server-side).
  const smsRecipientLabel =
    smsAudience === "all"
      ? `${smsAllCount ?? 0} member${(smsAllCount ?? 0) !== 1 ? "s" : ""} with a phone number`
      : smsAudience === "individuals"
      ? `${smsSelectedIds.length} selected`
      : smsGroupId
      ? `Group: ${smsGroups.find((g) => g.id === smsGroupId)?.name || ""}`
      : "No group chosen yet";

  async function handleSmsSave(e: React.FormEvent) {
    e.preventDefault();
    setSmsError("");
    setSmsSuccess("");
    setSavingSms(true);
    try {
      const res = await fetch("/api/tenant/bulksms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tokenId: smsTokenId,
          tokenSecret: smsTokenSecret,
          senderId: smsSenderId,
          oneTimeSmsEnabled: smsOneTimeEnabled,
          oneTimeSmsMessage: smsOneTimeMessage,
          birthdaySmsEnabled: smsBirthdayEnabled,
          birthdaySmsMessage: smsBirthdayMessage,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setSmsError(data.error || "Something went wrong."); return; }
      setSmsStatus({
        connected: smsStatus?.connected || (!!smsTokenId.trim() && !!smsTokenSecret.trim()),
        senderId: smsSenderId,
        oneTimeSmsEnabled: smsOneTimeEnabled,
        oneTimeSmsMessage: smsOneTimeMessage,
      });
      setSmsTokenId("");
      setSmsTokenSecret("");
      setSmsSuccess("Saved.");
      setTimeout(() => setSmsSuccess(""), 3000);
    } catch {
      setSmsError("Could not reach the server. Please try again.");
    } finally {
      setSavingSms(false);
    }
  }

  // ── Load email history ──
  useEffect(() => {
    if (channel !== "email" || emailTab !== "history" || !tenantId) return;
    setEmailHistoryLoading(true);
    getDocs(
      query(
        collection(db, "communications"),
        where("tenantId", "==", tenantId),
        where("type", "==", "email_broadcast"),
        orderBy("createdAt", "desc")
      )
    )
      .then((snap) =>
        setEmailHistory(snap.docs.map((d) => ({ id: d.id, ...d.data() } as EmailBroadcast)))
      )
      .catch(console.error)
      .finally(() => setEmailHistoryLoading(false));
  }, [channel, emailTab, tenantId, emailSuccess]);


  // ── Load mailing settings + lists when Mailing channel opens ──
  useEffect(() => {
    if (channel !== "mailing" || mailingSettings !== null) return;
    setMailingLoading(true);
    Promise.all([
      fetch("/api/brevo/settings").then((r) => r.json()).catch(() => null),
      fetch("/api/brevo/lists").then((r) => r.json()).catch(() => ({ lists: [] })),
    ]).then(([settings, listsData]) => {
      if (settings && !settings.error) {
        setMailingSettings(settings);
        setWelcomeTemplateId(settings.brevoWelcomeTemplateId || "");
        setBirthdayTemplateId(settings.brevoBirthdayTemplateId || "");
      }
      setMailingLists(listsData?.lists || []);
    }).finally(() => setMailingLoading(false));
  }, [channel, mailingSettings]);

  // ── WhatsApp send ──
  async function handleWaSend(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) { setWaError("Please type a message before sending."); return; }
    if (!tenantId || !appUser) { setWaError("Session error. Please refresh and try again."); return; }
    setWaSubmitting(true);
    setWaError("");
    setWaSuccessId("");
    try {
      const docRef = await addDoc(collection(db, "communications"), {
        type: "whatsapp_broadcast",
        message: message.trim(),
        sentBy: appUser.uid,
        sentByName: appUser.email || "Unknown",
        tenantId,
        createdAt: serverTimestamp(),
      });
      window.open(buildWaLink(message.trim()), "_blank", "noopener,noreferrer");
      setWaSuccessId(docRef.id);
      setMessage("");
      setWaTab("history");
    } catch {
      setWaError("Something went wrong. Please try again.");
    } finally {
      setWaSubmitting(false);
    }
  }

  // ── Brevo save ──
  async function handleBrevoSave(e: React.FormEvent) {
    e.preventDefault();
    setBrevoSaveError("");
    setSavingBrevo(true);
    try {
      const res = await fetch("/api/tenant/brevo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          apiKey: apiKeyInput,
          senderEmail: senderEmailInput,
          senderName: senderNameInput,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setBrevoSaveError(data.error || "Something went wrong."); return; }
      setBrevoStatus({ connected: true, senderEmail: senderEmailInput, senderName: senderNameInput });
      setApiKeyInput(""); // clear after save
      setEmailTab("compose");
    } catch {
      setBrevoSaveError("Could not reach the server. Please try again.");
    } finally {
      setSavingBrevo(false);
    }
  }

  // ── Email send ──
  async function handleEmailSend(e: React.FormEvent) {
    e.preventDefault();
    if (!emailSubject.trim()) { setEmailError("Subject line is required."); return; }
    if (!emailBody.trim()) { setEmailError("Email body is required."); return; }
    setEmailSending(true);
    setEmailError("");
    setEmailSuccess("");
    try {
      const res = await fetch("/api/communications/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject: emailSubject.trim(),
          htmlContent: textToHtml(emailBody),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setEmailError(data.error || "Something went wrong."); return; }
      setEmailSuccess(`Sent to ${data.sent} member${data.sent !== 1 ? "s" : ""}${data.failed > 0 ? ` (${data.failed} failed)` : ""}.`);
      setEmailSubject("");
      setEmailBody("");
    } catch {
      setEmailError("Could not reach the server. Please try again.");
    } finally {
      setEmailSending(false);
    }
  }


  // ── Create mailing list ──
  async function handleCreateList(e: React.FormEvent) {
    e.preventDefault();
    if (!newListName.trim()) { setCreateListError("List name is required."); return; }
    setCreatingList(true);
    setCreateListError("");
    setCreateListSuccess("");
    try {
      const res = await fetch("/api/brevo/lists", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ listName: newListName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setCreateListError(data.error || "Something went wrong."); return; }
      setCreateListSuccess(
        `List "${data.listName}" created and ${data.syncedCount} member${data.syncedCount !== 1 ? "s" : ""} synced to Brevo.`
      );
      setMailingSettings((prev) => prev ? { ...prev, brevoMailingListId: data.listId, brevoMailingListName: data.listName } : prev);
      setMailingLists((prev) => [{ id: data.listId, name: data.listName, totalSubscribers: data.syncedCount }, ...prev]);
      setNewListName("");
    } catch {
      setCreateListError("Could not reach the server.");
    } finally {
      setCreatingList(false);
    }
  }

  // ── Save template IDs ──
  async function handleSaveTemplates(e: React.FormEvent) {
    e.preventDefault();
    setSavingTemplates(true);
    setTemplateSaveMsg("");
    try {
      await fetch("/api/brevo/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brevoWelcomeTemplateId: welcomeTemplateId, brevoBirthdayTemplateId: birthdayTemplateId }),
      });
      setTemplateSaveMsg("Saved!");
      setTimeout(() => setTemplateSaveMsg(""), 3000);
    } catch {
      setTemplateSaveMsg("Error saving. Please try again.");
    } finally {
      setSavingTemplates(false);
    }
  }

  // ── Set active list ──
  async function handleSetActiveList(list: { id: number; name: string }) {
    await fetch("/api/brevo/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ brevoMailingListId: list.id, brevoMailingListName: list.name }),
    });
    setMailingSettings((prev) => prev ? { ...prev, brevoMailingListId: list.id, brevoMailingListName: list.name } : prev);
  }

  if (userLoading || tierLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-400 text-sm">Loading...</p>
      </div>
    );
  }

  if (!isPaidTier(tier)) {
    return <PaidFeatureLock feature="Bulk email and SMS" />;
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-white">Communications</h1>
        <p className="text-slate-400 text-sm mt-1">
          Send messages to your congregation via WhatsApp, Email, or SMS.
        </p>
      </div>

      {/* ── Channel tabs ── */}
      <div className="flex gap-1 border-b border-slate-700">
        {(["whatsapp", "email", "sms", "mailing"] as const).map((ch) => (
          <button
            key={ch}
            onClick={() => setChannel(ch)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium capitalize transition-colors ${
              channel === ch
                ? "text-emerald-400 border-b-2 border-emerald-400"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {ch === "whatsapp" ? (
              <>
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.532 5.858L.057 23.5a.5.5 0 0 0 .623.606l5.765-1.51A11.943 11.943 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.947 0-3.766-.527-5.323-1.445l-.378-.224-3.92 1.026 1.046-3.81-.247-.393A9.956 9.956 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                </svg>
                WhatsApp
              </>
            ) : ch === "email" ? (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
                Email
              </>
            ) : ch === "sms" ? (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                SMS
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <path d="M19 11H5m14 0l-4-4m4 4l-4 4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Mailing Lists
              </>
            )}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          WHATSAPP CHANNEL
      ══════════════════════════════════════════════════════════════════════ */}
      {channel === "whatsapp" && (
        <>
          {/* Sub-tabs */}
          <div className="flex gap-1 border-b border-slate-700/60">
            {(["compose", "history"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setWaTab(tab)}
                className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
                  waTab === tab
                    ? "text-emerald-400 border-b-2 border-emerald-400"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {tab === "compose" ? "New Broadcast" : "History"}
              </button>
            ))}
          </div>

          {/* Compose */}
          {waTab === "compose" && (
            <form onSubmit={handleWaSend} className="space-y-5">
              <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 bg-emerald-900/40 text-emerald-400 text-xs font-medium px-3 py-1 rounded-full border border-emerald-700/40">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.532 5.858L.057 23.5a.5.5 0 0 0 .623.606l5.765-1.51A11.943 11.943 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.947 0-3.766-.527-5.323-1.445l-.378-.224-3.92 1.026 1.046-3.81-.247-.393A9.956 9.956 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                    </svg>
                    WhatsApp Broadcast
                  </span>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-300">Message</label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={6}
                    placeholder="Type your broadcast message here..."
                    className="w-full bg-slate-900/60 border border-slate-600 rounded-lg px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 resize-none transition"
                  />
                  <p className="text-xs text-slate-500 text-right">{message.length} characters</p>
                </div>
                <div className="bg-slate-900/40 border border-slate-700/50 rounded-lg px-4 py-3 text-xs text-slate-400">
                  Clicking <span className="text-slate-200 font-medium">Send Broadcast</span> will log this message and open WhatsApp with the text pre-filled so you can share it to your groups or contacts.
                </div>
                {waError && (
                  <p className="text-sm text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-2">{waError}</p>
                )}
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={waSubmitting || !message.trim()}
                    className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
                  >
                    {waSubmitting ? (
                      <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Sending...</>
                    ) : (
                      <><svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>Send Broadcast</>
                    )}
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* WhatsApp History */}
          {waTab === "history" && (
            <div className="space-y-3">
              {waSuccessId && (
                <div className="bg-emerald-900/30 border border-emerald-700/50 rounded-lg px-4 py-3 text-sm text-emerald-400">
                  Broadcast sent and logged successfully.
                </div>
              )}
              {waHistoryLoading ? (
                <div className="flex items-center justify-center py-12">
                  <span className="w-5 h-5 border-2 border-slate-600 border-t-emerald-400 rounded-full animate-spin" />
                </div>
              ) : waBroadcasts.length === 0 ? (
                <div className="text-center py-16 text-slate-500 text-sm">No WhatsApp broadcasts sent yet.</div>
              ) : (
                waBroadcasts.map((b) => (
                  <div key={b.id} className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between gap-4">
                      <span className="inline-flex items-center gap-1.5 text-emerald-400 text-xs font-medium">
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.532 5.858L.057 23.5a.5.5 0 0 0 .623.606l5.765-1.51A11.943 11.943 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.947 0-3.766-.527-5.323-1.445l-.378-.224-3.92 1.026 1.046-3.81-.247-.393A9.956 9.956 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
                        WhatsApp Broadcast
                      </span>
                      <span className="text-xs text-slate-500">{formatDate(b.createdAt)}</span>
                    </div>
                    <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{b.message}</p>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs text-slate-500">Sent by {b.sentByName}</span>
                      <a href={buildWaLink(b.message)} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
                        Resend via WhatsApp
                      </a>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          EMAIL CHANNEL
      ══════════════════════════════════════════════════════════════════════ */}
      {channel === "email" && (
        <>
          {/* Sub-tabs */}
          <div className="flex gap-1 border-b border-slate-700/60">
            {(["compose", "history", "setup"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setEmailTab(tab)}
                className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
                  emailTab === tab
                    ? "text-emerald-400 border-b-2 border-emerald-400"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {tab === "setup" ? (
                  <span className="flex items-center gap-1.5">
                    Setup
                    {!brevoLoading && (
                      <span className={`w-2 h-2 rounded-full ${brevoStatus?.connected ? "bg-emerald-400" : "bg-amber-400"}`} />
                    )}
                  </span>
                ) : tab === "compose" ? "New Email" : "History"}
              </button>
            ))}
          </div>

          {brevoLoading && (
            <div className="flex items-center justify-center py-12">
              <span className="w-5 h-5 border-2 border-slate-600 border-t-emerald-400 rounded-full animate-spin" />
            </div>
          )}

          {/* ── Setup Tab ── */}
          {!brevoLoading && emailTab === "setup" && (
            <div className="space-y-5">
              {/* Status badge */}
              <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
                brevoStatus?.connected
                  ? "bg-emerald-900/20 border-emerald-700/50 text-emerald-400"
                  : "bg-amber-900/20 border-amber-700/50 text-amber-400"
              }`}>
                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${brevoStatus?.connected ? "bg-emerald-400" : "bg-amber-400"}`} />
                <div>
                  <p className="text-sm font-medium">
                    {brevoStatus?.connected ? "Brevo connected" : "Brevo not connected"}
                  </p>
                  {brevoStatus?.connected && (
                    <p className="text-xs mt-0.5 text-emerald-500">
                      Sending as {brevoStatus.senderName} &lt;{brevoStatus.senderEmail}&gt;
                    </p>
                  )}
                </div>
              </div>

              {/* What is Brevo + steps */}
              <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    {brevoStatus?.connected ? "Update your Brevo connection" : "Connect your Brevo account"}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Brevo is a free email service. Your church gets its own Brevo account and sends emails directly to your members.
                    The free plan covers up to 300 emails per day, which is enough for most churches.
                  </p>
                </div>

                {/* Steps */}
                <ol className="space-y-3 text-sm">
                  {[
                    {
                      n: 1,
                      label: "Create a free Brevo account",
                      detail: (
                        <span>
                          Go to{" "}
                          <a href="https://www.brevo.com" target="_blank" rel="noopener noreferrer" className="text-emerald-400 underline hover:text-emerald-300">
                            brevo.com
                          </a>{" "}
                          and sign up. Use your church email address.
                        </span>
                      ),
                    },
                    {
                      n: 2,
                      label: "Verify your sender email",
                      detail: "In Brevo: click your name (top right) > Senders & Dedicated IPs > Senders. Add your church email address and verify it. This is the address your emails will come from.",
                    },
                    {
                      n: 3,
                      label: "Get your API key",
                      detail: "In Brevo: click your name > SMTP & API > API Keys. Create a new key. Copy it and paste it below.",
                    },
                  ].map(({ n, label, detail }) => (
                    <li key={n} className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-900/50 border border-emerald-700/50 text-emerald-400 text-xs font-bold flex items-center justify-center">
                        {n}
                      </span>
                      <div>
                        <p className="font-medium text-slate-200">{label}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{detail}</p>
                      </div>
                    </li>
                  ))}
                </ol>

                {/* Form */}
                <form onSubmit={handleBrevoSave} className="space-y-3 pt-2 border-t border-slate-700/50">
                  <div className="space-y-1">
                    <label className="flex items-center gap-1 text-xs font-medium text-slate-300">
                      Brevo API Key
                      <InfoTooltip text="A secret key from your Brevo account that lets the hub send emails on your behalf." why="Brevo is the email service behind the scenes. Copy the key from your Brevo dashboard under SMTP and API. Without it, emails will not send. Treat it like a password." />
                    </label>
                    <input
                      type="password"
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      placeholder={brevoStatus?.connected ? "Enter new key to update" : "Paste your Brevo API key"}
                      className="w-full bg-slate-900/60 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="flex items-center gap-1 text-xs font-medium text-slate-300">
                      Sender Email
                      <InfoTooltip text="The email address your members will see messages coming from." why="Use a real church address you own and have verified in Brevo. A random or unverified address makes emails bounce or land in spam." />
                    </label>
                    <input
                      type="email"
                      value={senderEmailInput}
                      onChange={(e) => setSenderEmailInput(e.target.value)}
                      placeholder="e.g. pastor@gracechurch.co.za"
                      className="w-full bg-slate-900/60 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition"
                    />
                    <p className="text-xs text-slate-500">Must be verified in your Brevo account (Step 2 above).</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-300">Sender Name</label>
                    <input
                      type="text"
                      value={senderNameInput}
                      onChange={(e) => setSenderNameInput(e.target.value)}
                      placeholder="e.g. Grace Church"
                      className="w-full bg-slate-900/60 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition"
                    />
                    <p className="text-xs text-slate-500">This is what members see as the sender in their inbox.</p>
                  </div>

                  {brevoSaveError && (
                    <p className="text-sm text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">{brevoSaveError}</p>
                  )}

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={savingBrevo || !apiKeyInput.trim() || !senderEmailInput.trim() || !senderNameInput.trim()}
                      className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
                    >
                      {savingBrevo ? (
                        <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Verifying...</>
                      ) : brevoStatus?.connected ? "Update Connection" : "Connect Brevo"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ── Compose Tab ── */}
          {!brevoLoading && emailTab === "compose" && (
            <>
              {!brevoStatus?.connected ? (
                <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-8 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-slate-700/60 flex items-center justify-center mx-auto">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6 text-slate-400">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                      <polyline points="22,6 12,13 2,6"/>
                    </svg>
                  </div>
                  <p className="text-slate-300 text-sm font-medium">Email not connected</p>
                  <p className="text-slate-500 text-xs">Connect your free Brevo account first to start sending emails to your congregation.</p>
                  <button
                    onClick={() => setEmailTab("setup")}
                    className="mt-2 inline-flex items-center gap-1.5 text-emerald-400 text-sm font-medium hover:text-emerald-300 transition-colors"
                  >
                    Go to Setup
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                  </button>
                </div>
              ) : (
                <form onSubmit={handleEmailSend} className="space-y-5">
                  <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5 space-y-4">

                    {/* Channel badge + recipient count */}
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="inline-flex items-center gap-1.5 bg-blue-900/30 text-blue-400 text-xs font-medium px-3 py-1 rounded-full border border-blue-700/40">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                          <polyline points="22,6 12,13 2,6"/>
                        </svg>
                        Email Broadcast
                      </span>
                      <span className="text-xs text-slate-400">
                        {memberEmailCount === null
                          ? "Loading recipients..."
                          : memberEmailCount === 0
                          ? "No members with email addresses yet"
                          : `${memberEmailCount} member${memberEmailCount !== 1 ? "s" : ""} will receive this`}
                      </span>
                    </div>

                    {/* Subject */}
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-300">Subject</label>
                      <input
                        type="text"
                        value={emailSubject}
                        onChange={(e) => setEmailSubject(e.target.value)}
                        placeholder="e.g. Sunday Service this week"
                        className="w-full bg-slate-900/60 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition"
                      />
                    </div>

                    {/* Body */}
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-300">Message</label>
                      <textarea
                        value={emailBody}
                        onChange={(e) => setEmailBody(e.target.value)}
                        rows={8}
                        placeholder="Type your email message here. Blank lines create paragraph breaks."
                        className="w-full bg-slate-900/60 border border-slate-600 rounded-lg px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 resize-none transition"
                      />
                      <p className="text-xs text-slate-500 text-right">{emailBody.length} characters</p>
                    </div>

                    {/* Info note */}
                    <div className="bg-slate-900/40 border border-slate-700/50 rounded-lg px-4 py-3 text-xs text-slate-400 space-y-1">
                      <p>Emails will be sent individually to each active member who has an email address in their roster profile.</p>
                      <p>Brevo free plan: 300 emails per day. Upgrade your Brevo account for larger congregations.</p>
                    </div>

                    {emailError && (
                      <p className="text-sm text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-2">{emailError}</p>
                    )}
                    {emailSuccess && (
                      <p className="text-sm text-emerald-400 bg-emerald-900/20 border border-emerald-800/40 rounded-lg px-4 py-2">{emailSuccess}</p>
                    )}

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={emailSending || !emailSubject.trim() || !emailBody.trim() || memberEmailCount === 0}
                        className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
                      >
                        {emailSending ? (
                          <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Sending...</>
                        ) : (
                          <><svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>Send Email</>
                        )}
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </>
          )}

          {/* ── Email History Tab ── */}
          {!brevoLoading && emailTab === "history" && (
            <div className="space-y-3">
              {emailHistoryLoading ? (
                <div className="flex items-center justify-center py-12">
                  <span className="w-5 h-5 border-2 border-slate-600 border-t-emerald-400 rounded-full animate-spin" />
                </div>
              ) : emailHistory.length === 0 ? (
                <div className="text-center py-16 text-slate-500 text-sm">No email broadcasts sent yet.</div>
              ) : (
                emailHistory.map((e) => (
                  <div key={e.id} className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <span className="inline-flex items-center gap-1.5 text-blue-400 text-xs font-medium">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                          <polyline points="22,6 12,13 2,6"/>
                        </svg>
                        Email Broadcast
                      </span>
                      <span className="text-xs text-slate-500">{formatDate(e.createdAt)}</span>
                    </div>
                    <p className="text-sm text-slate-200 font-medium">{e.subject}</p>
                    <div className="flex items-center gap-4 pt-1">
                      <span className="text-xs text-emerald-400">{e.recipientCount} sent</span>
                      {e.failedCount > 0 && (
                        <span className="text-xs text-red-400">{e.failedCount} failed</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}


      {/* ══════════════════════════════════════════════════════════════════════
          SMS CHANNEL (BulkSMS)
      ══════════════════════════════════════════════════════════════════════ */}
      {channel === "sms" && (
        <div className="space-y-5">
          {smsLoading ? (
            <div className="flex items-center justify-center py-12">
              <span className="w-5 h-5 border-2 border-slate-600 border-t-emerald-400 rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Status */}
              <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
                smsStatus?.connected
                  ? "bg-emerald-900/20 border-emerald-700/50 text-emerald-400"
                  : "bg-amber-900/20 border-amber-700/50 text-amber-400"
              }`}>
                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${smsStatus?.connected ? "bg-emerald-400" : "bg-amber-400"}`} />
                <p className="text-sm font-medium">{smsStatus?.connected ? "BulkSMS connected" : "BulkSMS not connected"}</p>
              </div>

              {/* Sub-tabs */}
              <div className="flex gap-1 border-b border-slate-700/60">
                {(["compose", "setup"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setSmsTab(tab)}
                    className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
                      smsTab === tab ? "text-emerald-400 border-b-2 border-emerald-400" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {tab === "compose" ? "New SMS" : "Setup"}
                  </button>
                ))}
              </div>

              {/* ── Compose Tab ── */}
              {smsTab === "compose" && (
                !smsStatus?.connected ? (
                  <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-8 text-center space-y-3">
                    <p className="text-slate-300 text-sm font-medium">SMS not connected</p>
                    <p className="text-slate-500 text-xs">Add your BulkSMS credentials under Setup to start sending.</p>
                    <button onClick={() => setSmsTab("setup")} className="mt-2 inline-flex items-center gap-1.5 text-emerald-400 text-sm font-medium hover:text-emerald-300 transition-colors">Go to Setup</button>
                  </div>
                ) : (
                  <form onSubmit={handleSmsSend} className="bg-slate-800/60 border border-slate-700 rounded-xl p-5 space-y-4">
                    {/* Audience */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-slate-300">Send to</label>
                      <div className="flex gap-2 flex-wrap">
                        {([["all", "Everyone"], ["group", "A group"], ["individuals", "Individuals"]] as const).map(([val, label]) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setSmsAudience(val)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                              smsAudience === val
                                ? "border-emerald-500 bg-emerald-900/30 text-emerald-300"
                                : "border-slate-600 text-slate-300 hover:border-slate-500"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Group picker */}
                    {smsAudience === "group" && (
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-slate-300">Group</label>
                        <select
                          value={smsGroupId}
                          onChange={(e) => setSmsGroupId(e.target.value)}
                          className="w-full bg-slate-900/60 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition"
                        >
                          <option value="">Choose a group...</option>
                          {smsGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                        {smsGroups.length === 0 && <p className="text-xs text-slate-500">No groups found. Create one under Groups first.</p>}
                      </div>
                    )}

                    {/* Individuals picker */}
                    {smsAudience === "individuals" && (
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-slate-300">People</label>
                        {smsSelectedIds.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {smsSelectedIds.map((id) => {
                              const m = smsAllMembers.find((x) => x.id === id);
                              return (
                                <span key={id} className="inline-flex items-center gap-1 bg-emerald-900/40 border border-emerald-700/40 text-emerald-300 text-xs px-2 py-1 rounded-full">
                                  {m?.name || id}
                                  <button type="button" onClick={() => setSmsSelectedIds((prev) => prev.filter((x) => x !== id))} className="hover:text-white">✕</button>
                                </span>
                              );
                            })}
                          </div>
                        )}
                        <input
                          type="text"
                          value={smsMemberSearch}
                          onChange={(e) => setSmsMemberSearch(e.target.value)}
                          placeholder="Search members by name..."
                          className="w-full bg-slate-900/60 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition"
                        />
                        {smsMemberSearch.trim() && (
                          <div className="max-h-40 overflow-y-auto border border-slate-700/60 rounded-lg divide-y divide-slate-700/40">
                            {smsAllMembers
                              .filter((m) => m.name.toLowerCase().includes(smsMemberSearch.toLowerCase()) && !smsSelectedIds.includes(m.id))
                              .slice(0, 12)
                              .map((m) => (
                                <button
                                  key={m.id}
                                  type="button"
                                  onClick={() => { setSmsSelectedIds((prev) => [...prev, m.id]); setSmsMemberSearch(""); }}
                                  className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-slate-700/40 flex items-center justify-between"
                                >
                                  <span>{m.name}</span>
                                  <span className="text-xs text-slate-500">{m.phone}</span>
                                </button>
                              ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Message */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="block text-sm font-medium text-slate-300">Message</label>
                        <button
                          type="button"
                          onClick={() => setSmsMessage((prev) => prev + "[First Name]")}
                          className="text-xs text-emerald-400 hover:text-emerald-300 font-medium"
                        >
                          + Insert [First Name]
                        </button>
                      </div>
                      <textarea
                        value={smsMessage}
                        onChange={(e) => setSmsMessage(e.target.value)}
                        rows={5}
                        placeholder="Hi [First Name], join us this Sunday at 9am!"
                        className="w-full bg-slate-900/60 border border-slate-600 rounded-lg px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 resize-none transition"
                      />
                      <p className="text-xs text-slate-500 flex items-center justify-between">
                        <span>Tip: <code className="text-emerald-400">[First Name]</code> is replaced with each person's name.</span>
                        <span>{smsMessage.length} characters</span>
                      </p>
                    </div>

                    <div className="bg-slate-900/40 border border-slate-700/50 rounded-lg px-4 py-2.5 text-xs text-slate-400">
                      Recipients: <span className="text-slate-200 font-medium">{smsRecipientLabel}</span>
                    </div>

                    {smsSendError && <p className="text-sm text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-2">{smsSendError}</p>}
                    {smsSendSuccess && <p className="text-sm text-emerald-400 bg-emerald-900/20 border border-emerald-800/40 rounded-lg px-4 py-2">{smsSendSuccess}</p>}

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={smsSending || !smsMessage.trim()}
                        className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
                      >
                        {smsSending ? (
                          <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Sending...</>
                        ) : (
                          <><svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>Send SMS</>
                        )}
                      </button>
                    </div>
                  </form>
                )
              )}

              {/* ── Setup Tab ── */}
              {smsTab === "setup" && (
              <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-white">Connect BulkSMS</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    BulkSMS sends text messages to your visitors. Create an API token in your BulkSMS portal
                    under Settings {'>'} API tokens, then paste the Token ID and Secret below.
                    Get an account at <a href="https://www.bulksms.com" target="_blank" rel="noopener noreferrer" className="text-emerald-400 underline hover:text-emerald-300">bulksms.com</a>.
                  </p>
                </div>

                <form onSubmit={handleSmsSave} className="space-y-3">
                  <div className="space-y-1">
                    <label className="flex items-center gap-1 text-xs font-medium text-slate-300">
                      Token ID
                      <InfoTooltip text="Part of your BulkSMS login that lets the hub send text messages." why="You generate a Token ID and Token Secret inside your BulkSMS account. They work as a pair, so copy both carefully. This is safer than putting your actual password in here." />
                    </label>
                    <input
                      type="text"
                      value={smsTokenId}
                      onChange={(e) => setSmsTokenId(e.target.value)}
                      placeholder={smsStatus?.connected ? "Enter new Token ID to update" : "Paste your BulkSMS Token ID"}
                      className="w-full bg-slate-900/60 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-300">Token Secret</label>
                    <input
                      type="password"
                      value={smsTokenSecret}
                      onChange={(e) => setSmsTokenSecret(e.target.value)}
                      placeholder={smsStatus?.connected ? "Enter new Secret to update" : "Paste your BulkSMS Token Secret"}
                      className="w-full bg-slate-900/60 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition font-mono"
                    />
                    <p className="text-xs text-slate-500">Leave both blank to keep your saved credentials and only change the settings below.</p>
                  </div>
                  <div className="space-y-1">
                    <label className="flex items-center gap-1 text-xs font-medium text-slate-300">
                      Sender ID <span className="text-slate-500">(optional)</span>
                      <InfoTooltip text="The name that shows as the sender on a member's phone instead of a number." why="For example members could see the SMS is from GRACECITY rather than a random number. It usually needs to be pre-registered with BulkSMS, and some networks ignore it, so leave it blank if you are unsure." />
                    </label>
                    <input
                      type="text"
                      value={smsSenderId}
                      onChange={(e) => setSmsSenderId(e.target.value)}
                      placeholder="e.g. GraceChurch"
                      className="w-full bg-slate-900/60 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition"
                    />
                    <p className="text-xs text-slate-500">A short name shown as the sender. Must be pre-registered with BulkSMS, otherwise leave blank.</p>
                  </div>

                  {/* One-time visitor auto-SMS */}
                  <div className="pt-3 border-t border-slate-700/50 space-y-3">
                    <label className="flex items-start gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={smsOneTimeEnabled}
                        onChange={(e) => setSmsOneTimeEnabled(e.target.checked)}
                        className="mt-0.5 w-4 h-4 rounded border-slate-500 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                      />
                      <span>
                        <span className="block text-sm font-medium text-slate-200">Auto-thank one-time visitors by SMS</span>
                        <span className="block text-xs text-slate-400 mt-0.5">
                          When a guest is captured as "Just visiting", automatically send them this thank-you SMS.
                        </span>
                      </span>
                    </label>
                    <div className="space-y-1">
                      <label className="flex items-center gap-1 text-xs font-medium text-slate-300">
                        One-time visitor message
                        <InfoTooltip text="A single automatic welcome text sent to a first-time visitor after you capture them." why="It goes out once, not on repeat, so keep it warm and short. Think of it as the digital version of a friendly hello after their first Sunday." />
                      </label>
                      <textarea
                        value={smsOneTimeMessage}
                        onChange={(e) => setSmsOneTimeMessage(e.target.value)}
                        rows={3}
                        placeholder="Thank you for visiting us today. We hope to see you again soon."
                        className="w-full bg-slate-900/60 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 resize-none transition"
                      />
                      <p className="text-xs text-slate-500 text-right">{smsOneTimeMessage.length} characters</p>
                    </div>
                  </div>

                  {/* Birthday auto-SMS */}
                  <div className="pt-3 border-t border-slate-700/50 space-y-3">
                    <label className="flex items-start gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={smsBirthdayEnabled}
                        onChange={(e) => setSmsBirthdayEnabled(e.target.checked)}
                        className="mt-0.5 w-4 h-4 rounded border-slate-500 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                      />
                      <span>
                        <span className="block text-sm font-medium text-slate-200">Wish members happy birthday by SMS</span>
                        <span className="block text-xs text-slate-400 mt-0.5">
                          Each morning, members whose birthday is today automatically get this SMS. Uses [First Name].
                        </span>
                      </span>
                    </label>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-300">Birthday message</label>
                      <textarea
                        value={smsBirthdayMessage}
                        onChange={(e) => setSmsBirthdayMessage(e.target.value)}
                        rows={3}
                        placeholder="Happy birthday [First Name]! We thank God for your life."
                        className="w-full bg-slate-900/60 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 resize-none transition"
                      />
                      <p className="text-xs text-slate-500 text-right">{smsBirthdayMessage.length} characters</p>
                    </div>
                  </div>

                  {smsError && (
                    <p className="text-sm text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">{smsError}</p>
                  )}

                  <div className="flex justify-end items-center gap-3">
                    {smsSuccess && <span className="text-sm text-emerald-400">{smsSuccess}</span>}
                    <button
                      type="submit"
                      disabled={savingSms}
                      className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
                    >
                      {savingSms ? (
                        <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving...</>
                      ) : "Save SMS Settings"}
                    </button>
                  </div>
                </form>
              </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MAILING LISTS CHANNEL
      ══════════════════════════════════════════════════════════════════════ */}
      {channel === "mailing" && (
        <div className="space-y-6">
          {/* ── Selling point banner ── */}
          <div className="bg-gradient-to-r from-emerald-900/40 to-slate-800/60 border border-emerald-700/50 rounded-xl p-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-emerald-800/60 border border-emerald-700/40 flex items-center justify-center flex-shrink-0">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5 text-emerald-400">
                  <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Connect your church to Brevo</h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  When Brevo is connected, Kereke Hub automatically: adds new members to your mailing list the moment they are registered, sends them your custom welcome email using a template you designed in Brevo, and wishes members happy birthday on their special day without you lifting a finger.
                </p>
                <p className="text-xs text-emerald-400 mt-2 font-medium">
                  Need help setting this up? Contact{" "}
                  <a href="mailto:sifiso@kerekehub.co.za" className="underline hover:text-emerald-300">sifiso@kerekehub.co.za</a>
                </p>
              </div>
            </div>
          </div>

          {/* ── How-to steps ── */}
          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white">How it works</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                {
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5 text-emerald-400">
                      <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ),
                  title: "1. Connect Brevo",
                  desc: "Go to Email > Setup and paste your Brevo API key. Takes 60 seconds.",
                },
                {
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5 text-emerald-400">
                      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ),
                  title: "2. Create a list",
                  desc: "Create a mailing list below. All current members with emails are synced to it automatically.",
                },
                {
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5 text-emerald-400">
                      <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ),
                  title: "3. Set templates",
                  desc: "Design your welcome and birthday emails in Brevo, then paste the template ID below.",
                },
              ].map((step) => (
                <div key={step.title} className="bg-slate-900/40 border border-slate-700/50 rounded-lg p-4 space-y-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-900/40 border border-emerald-700/30 flex items-center justify-center">
                    {step.icon}
                  </div>
                  <p className="text-xs font-semibold text-slate-200">{step.title}</p>
                  <p className="text-xs text-slate-400 leading-relaxed">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {mailingLoading ? (
            <div className="flex items-center justify-center py-12">
              <span className="w-5 h-5 border-2 border-slate-600 border-t-emerald-400 rounded-full animate-spin" />
            </div>
          ) : !brevoStatus?.connected ? (
            <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-8 text-center space-y-3">
              <p className="text-slate-300 text-sm font-medium">Brevo not connected</p>
              <p className="text-slate-500 text-xs">Connect your Brevo account under Email {'>'} Setup first.</p>
              <button
                onClick={() => { setChannel("email"); setEmailTab("setup"); }}
                className="mt-2 inline-flex items-center gap-1.5 text-emerald-400 text-sm font-medium hover:text-emerald-300 transition-colors"
              >
                Go to Email Setup
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Active list status */}
              <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
                mailingSettings?.brevoMailingListId
                  ? "bg-emerald-900/20 border-emerald-700/50"
                  : "bg-slate-800/60 border-slate-700"
              }`}>
                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${mailingSettings?.brevoMailingListId ? "bg-emerald-400" : "bg-slate-500"}`} />
                <div>
                  <p className="text-sm font-medium text-white">
                    {mailingSettings?.brevoMailingListId
                      ? `Active list: ${mailingSettings.brevoMailingListName}`
                      : "No active mailing list"}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {mailingSettings?.brevoMailingListId
                      ? "New members are auto-added to this list when they are registered."
                      : "Create a list below or select an existing one to enable auto-add."}
                  </p>
                </div>
              </div>

              {/* Create new list */}
              <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-semibold text-white">Create a new mailing list</h3>
                <p className="text-xs text-slate-400">
                  This creates the list in Brevo and exports all current active members to it instantly.
                  Future members are added automatically when they are registered.
                </p>
                <form onSubmit={handleCreateList} className="flex gap-3">
                  <input
                    type="text"
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    placeholder={`e.g. ${brevoStatus?.senderName || "Church"} Members`}
                    className="flex-1 bg-slate-900/60 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition"
                  />
                  <button
                    type="submit"
                    disabled={creatingList || !newListName.trim()}
                    className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
                  >
                    {creatingList ? (
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                        <path d="M12 5v14M5 12h14" strokeLinecap="round"/>
                      </svg>
                    )}
                    {creatingList ? "Creating..." : "Create + Export"}
                  </button>
                </form>
                {createListError && (
                  <p className="text-sm text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">{createListError}</p>
                )}
                {createListSuccess && (
                  <p className="text-sm text-emerald-400 bg-emerald-900/20 border border-emerald-800/40 rounded-lg px-3 py-2">{createListSuccess}</p>
                )}
              </div>

              {/* Existing lists */}
              {mailingLists.length > 0 && (
                <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-white">Your Brevo lists</h3>
                  <div className="space-y-2">
                    {mailingLists.map((list) => {
                      const isActive = list.id === mailingSettings?.brevoMailingListId;
                      return (
                        <div key={list.id} className={`flex items-center justify-between gap-4 px-4 py-3 rounded-lg border ${isActive ? "bg-emerald-900/20 border-emerald-700/50" : "bg-slate-900/40 border-slate-700/50"}`}>
                          <div>
                            <p className={`text-sm font-medium ${isActive ? "text-emerald-300" : "text-slate-200"}`}>{list.name}</p>
                            <p className="text-xs text-slate-500">{list.totalSubscribers} subscriber{list.totalSubscribers !== 1 ? "s" : ""}</p>
                          </div>
                          {isActive ? (
                            <span className="text-xs text-emerald-400 font-medium px-2.5 py-1 rounded-full bg-emerald-900/40 border border-emerald-700/40">Active</span>
                          ) : (
                            <button
                              onClick={() => handleSetActiveList(list)}
                              className="text-xs text-slate-400 hover:text-emerald-400 font-medium transition-colors"
                            >
                              Set as active
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Template ID settings */}
              <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-white">Automation templates</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Design these emails in your Brevo account under <span className="text-slate-300">Email Campaigns {'>'} Templates</span>. Copy the template ID (the number in the URL) and paste it here.
                  </p>
                </div>
                <form onSubmit={handleSaveTemplates} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5 text-emerald-400">
                        <path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Welcome email template ID
                    </label>
                    <input
                      type="text"
                      value={welcomeTemplateId}
                      onChange={(e) => setWelcomeTemplateId(e.target.value)}
                      placeholder="e.g. 42"
                      className="w-full bg-slate-900/60 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition font-mono"
                    />
                    <p className="text-xs text-slate-500">Sent automatically when a new member is added to the roster.</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5 text-emerald-400">
                        <path d="M21 15.546c-.523 0-1.046.151-1.5.454a2.704 2.704 0 01-3 0 2.704 2.704 0 00-3 0 2.704 2.704 0 01-3 0 2.704 2.704 0 00-3 0 2.704 2.704 0 01-1.5-.454M9 6l3 3m0 0l3-3m-3 3V2m0 16l3 3m-3-3l-3 3" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Birthday email template ID
                    </label>
                    <input
                      type="text"
                      value={birthdayTemplateId}
                      onChange={(e) => setBirthdayTemplateId(e.target.value)}
                      placeholder="e.g. 57"
                      className="w-full bg-slate-900/60 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition font-mono"
                    />
                    <p className="text-xs text-slate-500">Sent automatically on each member's birthday at 8am SAST.</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-500">
                      Both templates can use <code className="text-emerald-400 bg-slate-900/60 px-1 rounded">{"{{params.FIRSTNAME}}"}</code> and <code className="text-emerald-400 bg-slate-900/60 px-1 rounded">{"{{params.LASTNAME}}"}</code> as merge tags.
                    </p>
                    <button
                      type="submit"
                      disabled={savingTemplates}
                      className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                    >
                      {savingTemplates ? (
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : null}
                      {templateSaveMsg || (savingTemplates ? "Saving..." : "Save")}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
