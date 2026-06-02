"use client";

// ─────────────────────────────────────────────────────────────
// kereke-marketing: app/contact/page.tsx
// Replace your existing contact page with this file.
// ─────────────────────────────────────────────────────────────

import { useState } from "react";

type Category = "billing" | "technical" | "general" | "feature_request" | "other";
type Priority = "normal" | "urgent";

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "general", label: "General Enquiry" },
  { value: "technical", label: "Technical Issue" },
  { value: "billing", label: "Billing & Payments" },
  { value: "feature_request", label: "Feature Request" },
  { value: "other", label: "Other" },
];

const emptyForm = () => ({
  name: "",
  email: "",
  phone: "",
  subject: "",
  message: "",
  category: "general" as Category,
  priority: "normal" as Priority,
});

export default function ContactPage() {
  const [form, setForm] = useState(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [ticketRef, setTicketRef] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!form.name.trim() || !form.email.trim() || !form.subject.trim() || !form.message.trim()) {
      setError("Please fill in all required fields.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }

      setTicketRef(data.ticketRef || "");
      setForm(emptyForm());
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Success state ──
  if (ticketRef) {
    return (
      <main className="min-h-screen bg-slate-900 flex items-center justify-center px-4 py-20">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 bg-emerald-900/40 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Message received</h1>
          <p className="text-slate-400 mb-6">
            Your ticket reference is{" "}
            <span className="font-mono text-emerald-400 font-bold">{ticketRef}</span>. We will follow
            up by email, usually within one business day.
          </p>
          <button
            onClick={() => setTicketRef("")}
            className="text-sm text-emerald-400 hover:text-emerald-300 underline underline-offset-4"
          >
            Submit another request
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-900 py-20 px-4">
      <div className="max-w-2xl mx-auto">

        {/* Heading */}
        <div className="mb-10 text-center">
          <h1 className="text-4xl font-bold text-white mb-3">Contact Us</h1>
          <p className="text-slate-400">
            Got a question or running into something? Send us a message and we will get back to
            you as soon as possible.
          </p>
        </div>

        {/* Contact card */}
        <div className="bg-slate-800/50 border border-slate-700/60 rounded-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Name + Email row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Full Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Your name"
                  className="w-full bg-slate-900/60 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Email Address <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="you@church.org"
                  className="w-full bg-slate-900/60 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Phone <span className="text-slate-500 font-normal">(optional)</span>
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+27 ..."
                className="w-full bg-slate-900/60 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            {/* Category + Priority row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Category</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value as Category })}
                  className="w-full bg-slate-900/60 border border-slate-600 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Priority</label>
                <select
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}
                  className="w-full bg-slate-900/60 border border-slate-600 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="normal">Normal</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>

            {/* Subject */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Subject <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder="Brief summary of your request"
                className="w-full bg-slate-900/60 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            {/* Message */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Message <span className="text-red-400">*</span>
              </label>
              <textarea
                rows={5}
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                placeholder="Describe your question or issue in detail..."
                className="w-full bg-slate-900/60 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 resize-none"
              />
            </div>

            {/* Error */}
            {error && (
              <p className="text-sm text-red-400 bg-red-900/20 px-4 py-2.5 rounded-lg">{error}</p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl text-sm transition-colors"
            >
              {submitting ? "Sending..." : "Send Message"}
            </button>

            <p className="text-xs text-slate-500 text-center">
              You will receive a confirmation email with your ticket reference.
            </p>
          </form>
        </div>

        {/* Info cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8">
          <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-5">
            <p className="text-emerald-400 font-semibold text-sm mb-1">Email Us Directly</p>
            <p className="text-slate-300 text-sm">support@kerekehub.co.za</p>
          </div>
          <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-5">
            <p className="text-emerald-400 font-semibold text-sm mb-1">Response Time</p>
            <p className="text-slate-300 text-sm">Usually within 1 business day</p>
          </div>
        </div>
      </div>
    </main>
  );
}
