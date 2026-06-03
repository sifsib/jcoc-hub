"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { db } from "../../../lib/firebase";
import { doc, getDoc } from "firebase/firestore";

interface ChurchEvent {
  tenantId: string;
  title: string;
  type: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  capacity: number;
  rsvpCount: number;
  active: boolean;
}

interface TenantInfo {
  name: string;
  primaryColor?: string;
}

type RsvpStatus = "attending" | "maybe" | "declined";

const STATUS_OPTIONS: { value: RsvpStatus; label: string; emoji: string }[] = [
  { value: "attending", label: "Yes, I’ll be there", emoji: "✅" },
  { value: "maybe", label: "Maybe", emoji: "🤔" },
  { value: "declined", label: "Can’t make it", emoji: "❌" },
];

function formatEventDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-ZA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function PublicRsvpPage() {
  const { eventId } = useParams<{ eventId: string }>();

  const [event, setEvent] = useState<ChurchEvent | null>(null);
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<RsvpStatus>("attending");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    if (!eventId) return;

    getDoc(doc(db, "events", eventId)).then(async (snap) => {
      if (!snap.exists()) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const eventData = snap.data() as ChurchEvent;
      setEvent(eventData);

      if (eventData.tenantId) {
        const tenantSnap = await getDoc(doc(db, "tenants", eventData.tenantId));
        if (tenantSnap.exists()) {
          const t = tenantSnap.data();
          setTenant({ name: t.name || "KerekeHub", primaryColor: t.primaryColor });
        }
      }

      setLoading(false);
    });
  }, [eventId]);

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = "Please enter your name.";
    if (!phone.trim() && !email.trim()) newErrors.contact = "Please provide a phone number or email.";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate() || !event || !eventId) return;

    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch("/api/rsvp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          name,
          phone,
          email,
          status,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Something went wrong. Please try again.");
      }

      if (typeof data.rsvpCount === "number") {
        setEvent({ ...event, rsvpCount: data.rsvpCount });
      }

      setSubmitted(true);
    } catch (err) {
      console.error("RSVP submit error:", err);
      setSubmitError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const primaryColor = tenant?.primaryColor || "#059669";

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div
          className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: primaryColor, borderTopColor: "transparent" }}
        />
      </div>
    );
  }

  if (notFound || !event) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="text-5xl mb-4">🔍</div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">Event not found</h1>
          <p className="text-gray-500 text-sm">This event may have been removed or the link is incorrect.</p>
        </div>
      </div>
    );
  }

  if (!event.active) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="text-5xl mb-4">🔒</div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">RSVPs are closed</h1>
          <p className="text-gray-500 text-sm">This event is no longer accepting RSVPs.</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="text-5xl mb-4">🎉</div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">
            {status === "attending" ? "See you there!" : status === "maybe" ? "Thanks for letting us know!" : "Thanks for responding!"}
          </h1>
          <p className="text-gray-500 text-sm mt-1">Your RSVP has been recorded for <strong>{event.title}</strong>.</p>
          {event.date && (
            <p className="text-gray-400 text-xs mt-3">{formatEventDate(event.date)}</p>
          )}
          {tenant?.name && (
            <p className="text-gray-400 text-xs mt-4">{tenant.name}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-lg mx-auto">
        {tenant?.name && (
          <div className="mb-6 text-center">
            <p className="text-sm font-semibold" style={{ color: primaryColor }}>
              {tenant.name}
            </p>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="h-2" style={{ backgroundColor: primaryColor }} />

          <div className="p-6 md:p-8">
            {/* Event details */}
            <div className="mb-6 pb-6 border-b border-gray-100">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">{event.title}</h1>
              <div className="flex flex-col gap-1.5 text-sm text-gray-500">
                {event.date && (
                  <span className="flex items-center gap-2">
                    <span>📅</span> {formatEventDate(event.date)}
                    {event.startTime && ` at ${event.startTime}`}
                    {event.endTime && ` – ${event.endTime}`}
                  </span>
                )}
                {event.location && (
                  <span className="flex items-center gap-2">
                    <span>📍</span> {event.location}
                  </span>
                )}
              </div>
              {event.description && (
                <p className="text-sm text-gray-500 mt-3">{event.description}</p>
              )}
            </div>

            {/* RSVP form */}
            <h2 className="text-base font-semibold text-gray-800 mb-4">Your RSVP</h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                    errors.name ? "border-red-400 focus:ring-red-400" : "border-gray-300 focus:ring-emerald-500"
                  }`}
                />
                {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 071 234 5678"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                {errors.contact && <p className="text-xs text-red-500 mt-1">{errors.contact}</p>}
              </div>

              {/* Status selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Will you attend?</label>
                <div className="grid grid-cols-3 gap-2">
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setStatus(opt.value)}
                      className={`flex flex-col items-center gap-1 py-3 rounded-xl border text-sm font-medium transition-all ${
                        status === opt.value
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                          : "border-gray-200 text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      <span className="text-xl">{opt.emoji}</span>
                      <span className="text-xs leading-tight text-center">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {submitError && (
                <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {submitError}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                style={{ backgroundColor: primaryColor }}
                className="w-full text-white font-semibold py-3 rounded-lg text-sm transition-opacity hover:opacity-90 disabled:opacity-60 mt-2"
              >
                {submitting ? "Submitting..." : "Submit RSVP"}
              </button>
            </form>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">Powered by KerekeHub</p>
      </div>
    </div>
  );
}
