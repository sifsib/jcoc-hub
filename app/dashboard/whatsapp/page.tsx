"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { auth, storage } from "../../../lib/firebase";
import { useAppUser } from "../../../lib/useAppUser";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { PLATFORM } from "../../../lib/whiteLabel";

// Every church sends through the shared Kereke Hub WhatsApp number, so the
// banner and signature are the only things telling a congregant who is writing
// to them. This page is where a church sets both.

interface Branding {
  churchName: string | null;
  signature: string | null;
  bannerUrl: string | null;
}

const MAX_BANNER_BYTES = 5 * 1024 * 1024; // Meta's limit for template images
const SIGNATURE_MAX = 120;
const CHURCH_NAME_MAX = 60;

async function authedFetch(path: string, init: RequestInit = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("Your session has expired. Please sign in again.");
  const token = await user.getIdToken();

  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export default function WhatsAppPage() {
  const { appUser, loading: userLoading } = useAppUser();
  const tenantId = appUser?.tenantId ?? null;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [churchName, setChurchName] = useState("");
  const [signature, setSignature] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [bannerMode, setBannerMode] = useState<"upload" | "url">("upload");
  const [urlInput, setUrlInput] = useState("");

  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const data = (await authedFetch("/api/whatsapp/branding")) as Branding;
      setChurchName(data.churchName ?? "");
      setSignature(data.signature ?? "");
      setBannerUrl(data.bannerUrl ?? "");
      setUrlInput(data.bannerUrl ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    load();
  }, [tenantId, load]);

  async function handleUpload(file: File) {
    if (!tenantId) return;
    setError("");
    setSuccess("");

    if (!file.type.startsWith("image/")) {
      setError("The banner must be an image (JPEG or PNG).");
      return;
    }
    if (file.size > MAX_BANNER_BYTES) {
      setError("That image is larger than 5MB. WhatsApp will not accept it — please use a smaller one.");
      return;
    }

    setUploading(true);
    try {
      // Stored under the tenant's own folder, matching storage.rules isolation.
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `tenants/${tenantId}/whatsapp-banners/banner-${Date.now()}.${ext}`;
      const fileRef = storageRef(storage, path);
      await uploadBytes(fileRef, file, { contentType: file.type });

      // getDownloadURL returns a token URL that is readable without a login.
      // That matters: Meta fetches the banner from its own servers, so a URL
      // that needs auth (or expires) would fail every send.
      const url = await getDownloadURL(fileRef);
      setBannerUrl(url);
      setUrlInput(url);
      setSuccess("Banner uploaded. Remember to save.");
    } catch (err) {
      console.error(err);
      setError("Could not upload the banner. Please try again.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function handleSave() {
    setError("");
    setSuccess("");

    const chosenBanner = bannerMode === "url" ? urlInput.trim() : bannerUrl.trim();

    if (chosenBanner && !/^https:\/\//i.test(chosenBanner)) {
      setError("The banner link must start with https:// — WhatsApp will not load an insecure image.");
      return;
    }

    setSaving(true);
    try {
      const data = (await authedFetch("/api/whatsapp/branding", {
        method: "PUT",
        body: JSON.stringify({
          churchName: churchName.trim(),
          signature: signature.trim(),
          bannerUrl: chosenBanner || null,
        }),
      })) as Branding;

      setChurchName(data.churchName ?? "");
      setSignature(data.signature ?? "");
      setBannerUrl(data.bannerUrl ?? "");
      setUrlInput(data.bannerUrl ?? "");
      setSuccess("Saved. Your next broadcast will use these details.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your settings.");
    } finally {
      setSaving(false);
    }
  }

  if (userLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="w-5 h-5 border-2 border-slate-600 border-t-emerald-400 rounded-full animate-spin" />
      </div>
    );
  }

  const previewBanner = bannerMode === "url" ? urlInput.trim() : bannerUrl.trim();
  const ready = Boolean(churchName.trim());

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-100">WhatsApp Identity</h1>
        <p className="text-slate-400 text-sm mt-1">
          Your church shares the {PLATFORM.name} WhatsApp number with other churches. Your banner and
          signature are what identify you to your congregation on every message.
        </p>
      </div>

      {/* Status */}
      <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5 flex items-start gap-3">
        <span
          className={`w-3 h-3 rounded-full mt-1 shrink-0 ${ready ? "bg-emerald-500" : "bg-amber-400"}`}
        />
        <div className="space-y-1">
          <p className="text-sm font-medium text-slate-200">
            {ready ? "Ready to send" : "Church name required"}
          </p>
          <p className="text-xs text-slate-400">
            {ready
              ? `No QR code or phone linking is needed — ${PLATFORM.name} manages the number for you.`
              : "Add your church name below before sending your first broadcast."}
          </p>
        </div>
      </div>

      {/* Identity */}
      <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-6 space-y-5">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-300">Church name</label>
          <input
            value={churchName}
            onChange={(e) => setChurchName(e.target.value.slice(0, CHURCH_NAME_MAX))}
            placeholder="Grace Family Church"
            className="w-full bg-slate-900/60 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition"
          />
          <p className="text-xs text-slate-500 text-right">
            {churchName.length}/{CHURCH_NAME_MAX}
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-300">Signature</label>
          <input
            value={signature}
            onChange={(e) => setSignature(e.target.value.slice(0, SIGNATURE_MAX))}
            placeholder="Pastor Thabo Mokoena | Grace Family Church | 011 555 0123"
            className="w-full bg-slate-900/60 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition"
          />
          <div className="flex justify-between">
            <p className="text-xs text-slate-500">Appears in italics at the bottom of every message.</p>
            <p className="text-xs text-slate-500">
              {signature.length}/{SIGNATURE_MAX}
            </p>
          </div>
        </div>

        {/* Banner */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-slate-300">Banner</label>

          <div className="flex gap-1 border-b border-slate-700/60">
            {(["upload", "url"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setBannerMode(mode)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  bannerMode === mode
                    ? "text-emerald-400 border-b-2 border-emerald-400"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {mode === "upload" ? "Upload an image" : "Use a link"}
              </button>
            ))}
          </div>

          {bannerMode === "upload" ? (
            <div className="space-y-2">
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(file);
                }}
                className="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-slate-700 file:text-slate-200 hover:file:bg-slate-600 file:cursor-pointer disabled:opacity-50"
              />
              {uploading && (
                <p className="text-xs text-slate-400 flex items-center gap-2">
                  <span className="w-3 h-3 border-2 border-slate-600 border-t-emerald-400 rounded-full animate-spin" />
                  Uploading…
                </p>
              )}
              <p className="text-xs text-slate-500">
                JPEG or PNG, up to 5MB. A wide image (roughly 1600×800) looks best.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://yourchurch.co.za/banner.jpg"
                className="w-full bg-slate-900/60 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition"
              />
              <p className="text-xs text-slate-500">
                Must be a public https link. WhatsApp loads the image from its own servers, so links
                that need a password or expire will not work.
              </p>
            </div>
          )}

          {previewBanner && (
            <div className="rounded-lg overflow-hidden border border-slate-700 bg-slate-900/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewBanner}
                alt="Church banner preview"
                className="w-full max-h-48 object-cover"
                onError={() => setError("That banner image could not be loaded. Check the link is public.")}
              />
            </div>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-2">
            {error}
          </p>
        )}
        {success && (
          <p className="text-sm text-emerald-400 bg-emerald-900/20 border border-emerald-700/40 rounded-lg px-4 py-2">
            {success}
          </p>
        )}

        <div className="flex items-center justify-between gap-3">
          <Link
            href="/dashboard/communications"
            className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            Go to broadcasts →
          </Link>
          <button
            onClick={handleSave}
            disabled={saving || uploading}
            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
          >
            {saving ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Saving…
              </>
            ) : (
              "Save"
            )}
          </button>
        </div>
      </div>

      {/* Live preview */}
      <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-6 space-y-3">
        <p className="text-sm font-medium text-slate-200">How your messages will look</p>
        <div className="bg-[#0b141a] rounded-xl p-4">
          <div className="bg-[#005c4b] rounded-lg overflow-hidden max-w-sm ml-auto">
            {previewBanner ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={previewBanner} alt="" className="w-full h-24 object-cover" />
            ) : (
              <div className="w-full h-24 bg-slate-700/60 flex items-center justify-center text-xs text-slate-400">
                No banner set
              </div>
            )}
            <div className="p-3 space-y-2">
              <p className="text-[13px] text-white leading-relaxed">
                📢 Announcement from <span className="font-bold">{churchName.trim() || "Your Church"}</span>
              </p>
              <p className="text-[13px] text-white/90 leading-relaxed">
                Sunday service moves to 9am from this weekend. Please arrive 15 minutes early for prayer.
              </p>
              <p className="text-[13px] text-white/70 italic leading-relaxed">
                {signature.trim() || churchName.trim() || "Your signature"}
              </p>
              <p className="text-[11px] text-white/50">Sent via {PLATFORM.name}</p>
            </div>
            <div className="border-t border-white/10 py-2 text-center text-[13px] text-[#53bdeb]">
              Stop messages
            </div>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          The <span className="text-slate-400">Stop messages</span> button is added automatically so
          congregants can opt out — this is required, and it protects delivery for every church on
          the shared number.
        </p>
      </div>
    </div>
  );
}
