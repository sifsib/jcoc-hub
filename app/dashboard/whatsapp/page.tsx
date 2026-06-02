"use client";

import { useEffect, useState, useCallback } from "react";
import { db } from "../../../lib/firebase";
import { useAppUser } from "../../../lib/useAppUser";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

interface WhatsAppSettings {
  instanceName: string;
  status: "disconnected" | "connecting" | "connected";
  connectedAt?: { seconds: number } | null;
}

export default function WhatsAppPage() {
  const { appUser, loading: userLoading } = useAppUser();
  const tenantId = appUser?.tenantId ?? null;

  const [settings, setSettings] = useState<WhatsAppSettings | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState("");
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    async function loadSettings() {
      const snap = await getDoc(doc(db, "tenants", tenantId!, "settings", "whatsapp"));
      if (snap.exists()) setSettings(snap.data() as WhatsAppSettings);
      setPageLoading(false);
    }
    loadSettings();
  }, [tenantId]);

  async function handleConnect() {
    if (!tenantId) return;
    setConnecting(true);
    setError("");
    setQrCode(null);
    try {
      const instanceName = `tenant_${tenantId}`;
      const createRes = await fetch("/api/whatsapp/create-instance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceName }),
      });
      await createRes.json(); // proceed even if instance already exists

      const qrRes = await fetch(`/api/whatsapp/qr-code?instanceName=${instanceName}`);
      const qrData = await qrRes.json();
      const base64 = qrData.qrcode?.base64 ?? qrData.base64;
      if (!base64) throw new Error("Could not load QR code. Please try again.");
      setQrCode(base64);

      await setDoc(doc(db, "tenants", tenantId, "settings", "whatsapp"), {
        instanceName,
        status: "connecting",
        updatedAt: serverTimestamp(),
      });
      setSettings({ instanceName, status: "connecting" });
      setPolling(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setConnecting(false);
    }
  }

  const checkStatus = useCallback(async () => {
    if (!tenantId || !settings?.instanceName) return;
    try {
      const res = await fetch(`/api/whatsapp/status?instanceName=${settings.instanceName}`);
      const data = await res.json();
      const state = data?.instance?.state ?? data?.state;
      if (state === "open") {
        await setDoc(doc(db, "tenants", tenantId, "settings", "whatsapp"), {
          instanceName: settings.instanceName,
          status: "connected",
          connectedAt: serverTimestamp(),
        }, { merge: true });
        setSettings({ instanceName: settings.instanceName, status: "connected" });
        setQrCode(null);
        setPolling(false);
      }
    } catch { /* silent */ }
  }, [tenantId, settings?.instanceName]);

  useEffect(() => {
    if (!polling) return;
    const interval = setInterval(checkStatus, 4000);
    return () => clearInterval(interval);
  }, [polling, checkStatus]);

  async function handleDisconnect() {
    if (!tenantId || !settings?.instanceName) return;
    setDisconnecting(true);
    try {
      await fetch("/api/whatsapp/delete-instance", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceName: settings.instanceName }),
      });
      await setDoc(doc(db, "tenants", tenantId, "settings", "whatsapp"), {
        instanceName: settings.instanceName,
        status: "disconnected",
        updatedAt: serverTimestamp(),
      });
      setSettings({ instanceName: settings.instanceName, status: "disconnected" });
      setQrCode(null);
    } catch {
      setError("Failed to disconnect. Please try again.");
    } finally {
      setDisconnecting(false);
    }
  }

  if (userLoading || pageLoading) {
    return <div className="flex items-center justify-center h-64"><p className="text-slate-400 text-sm">Loading...</p></div>;
  }

  const isConnected = settings?.status === "connected";
  const isConnecting = settings?.status === "connecting";

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">WhatsApp</h1>
        <p className="text-slate-400 text-sm mt-1">
          Connect your church WhatsApp number to send automated messages directly from KerekeHub.
        </p>
      </div>

      <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-6 space-y-5">
        <div className="flex items-center gap-3">
          <span className={`w-3 h-3 rounded-full ${isConnected ? "bg-emerald-400" : isConnecting ? "bg-yellow-400 animate-pulse" : "bg-slate-500"}`} />
          <span className="text-sm font-medium text-slate-200">
            {isConnected ? "Connected" : isConnecting ? "Waiting for QR scan..." : "Not connected"}
          </span>
        </div>

        {qrCode && (
          <div className="space-y-3">
            <p className="text-sm text-slate-300">
              Open <span className="font-medium text-white">WhatsApp Business</span> on your phone, go to{" "}
              <span className="font-medium text-white">Linked Devices</span>, tap{" "}
              <span className="font-medium text-white">Link a Device</span>, and scan this code.
            </p>
            <div className="flex justify-center bg-white rounded-xl p-4 w-fit">
              <img
                src={qrCode.startsWith("data:") ? qrCode : `data:image/png;base64,${qrCode}`}
                alt="WhatsApp QR Code"
                className="w-56 h-56"
              />
            </div>
            <p className="text-xs text-slate-500">This QR code expires in 60 seconds. If it expires, click Connect again.</p>
          </div>
        )}

        {isConnected && (
          <div className="bg-emerald-900/20 border border-emerald-700/40 rounded-lg px-4 py-3 text-sm text-emerald-300">
            Your WhatsApp number is connected. Automated messages and broadcasts will be sent through it.
          </div>
        )}

        {error && (
          <p className="text-sm text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-2">{error}</p>
        )}

        <div className="flex gap-3">
          {!isConnected && (
            <button onClick={handleConnect} disabled={connecting}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors">
              {connecting ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Connecting...</> : "Connect WhatsApp"}
            </button>
          )}
          {(isConnected || isConnecting) && (
            <button onClick={handleDisconnect} disabled={disconnecting}
              className="inline-flex items-center gap-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 text-sm font-medium px-5 py-2.5 rounded-lg transition-colors">
              {disconnecting ? "Disconnecting..." : "Disconnect"}
            </button>
          )}
        </div>
      </div>

      <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5 space-y-2">
        <p className="text-sm font-medium text-slate-300">How it works</p>
        <ul className="text-sm text-slate-400 space-y-1.5 list-disc list-inside">
          <li>Connect your WhatsApp Business number by scanning the QR code</li>
          <li>KerekeHub will use it to send birthday wishes, event reminders, and broadcasts</li>
          <li>Messages appear to come directly from your church number</li>
          <li>You can disconnect at any time from this page</li>
        </ul>
      </div>
    </div>
  );
}
