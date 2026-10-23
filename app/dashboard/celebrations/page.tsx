"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "../../../lib/firebase";
import { useAppUser } from "../../../lib/useAppUser";
import DateInput from "../../../components/ui/DateInput";
import InfoTooltip from "../../components/InfoTooltip";
import { exportToCSV } from "../../../lib/csvExport";
import { formatSurnameFirst } from "../../../lib/nameFormat";
import {
  celebrationsAsText,
  defaultWeeklyWindow,
  displayNames,
  findCelebrations,
  formatShortDate,
  todayIn,
  windowLength,
  MAX_WINDOW_DAYS,
  type CelebrationPerson,
  type DateWindow,
} from "../../../lib/celebrations";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";

// Roles that can already see the member list. Scoping below mirrors the roster.
const ALLOWED_ROLES = ["owner", "admin", "member_manager", "member_viewer", "cell_leader", "branch_admin", "sector_leader", "family_group_leader", "super_admin"];

// The weekly members' email goes out on a Friday and covers Friday to the
// following Thursday. JavaScript weekday numbering: 5 is Friday.
const EMAIL_WEEKDAY = 5;
const DEFAULT_TIMEZONE = "Africa/Johannesburg";

const DAY_MS = 86400000;
const addDays = (iso: string, n: number) =>
  new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) + n * DAY_MS).toISOString().slice(0, 10);

export default function CelebrationsPage() {
  const { appUser, loading } = useAppUser();

  const [people, setPeople] = useState<CelebrationPerson[]>([]);
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [range, setRange] = useState<DateWindow>(() => defaultWeeklyWindow(todayIn(DEFAULT_TIMEZONE), EMAIL_WEEKDAY));
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const allowed = !!appUser && ALLOWED_ROLES.includes(appUser.role);

  useEffect(() => {
    if (!appUser?.tenantId || !allowed) return;
    (async () => {
      try {
        // Campuses outside South Africa need their own "today", so prefer the
        // church's time zone when one is set.
        const tenantSnap = await getDoc(doc(db, "tenants", appUser.tenantId));
        const tz = tenantSnap.data()?.timezone || DEFAULT_TIMEZONE;
        setTimezone(tz);
        setRange(defaultWeeklyWindow(todayIn(tz), EMAIL_WEEKDAY));

        // Same scoping as the roster: cell leaders see their cell, branch
        // admins their branch, everyone else the whole church.
        const base = [where("tenantId", "==", appUser.tenantId)];
        // Sector and family group leaders: their own people only; the rules
        // refuse the query without the filter (ADR-010).
        const q =
          appUser.role === "sector_leader"
            ? query(collection(db, "members"), ...base, where("sectorId", "==", appUser.sectorId))
            : appUser.role === "family_group_leader"
            ? query(collection(db, "members"), ...base, where("familyGroupId", "==", appUser.familyGroupId))
            : appUser.role === "cell_leader" && appUser.assignedCellRegion
            ? query(collection(db, "members"), ...base, where("cellRegion", "==", appUser.assignedCellRegion))
            : appUser.role === "branch_admin" && appUser.assignedBranch
            ? query(collection(db, "members"), ...base, where("branch", "==", appUser.assignedBranch))
            : query(collection(db, "members"), ...base);
        const snap = await getDocs(q);
        setPeople(
          snap.docs.map((d) => {
            const m = d.data();
            return {
              id: d.id,
              firstName: m.firstName,
              lastName: m.lastName,
              fullName: m.fullName,
              dob: m.dob,
              anniversaryDate: m.anniversaryDate,
              spouseId: m.spouseId,
              status: m.status,
            };
          })
        );
      } catch (err) {
        console.error("Failed to load members for celebrations", err);
        setErrorMsg("Could not load members. Please refresh and try again.");
      } finally {
        setLoadingMembers(false);
      }
    })();
  }, [appUser?.tenantId, appUser?.role, appUser?.assignedBranch, appUser?.assignedCellRegion, allowed]);

  const days = windowLength(range);
  const rangeError =
    days < 1 ? "The end date is before the start date." : days > MAX_WINDOW_DAYS ? "Pick a range of a year or less." : null;
  const list = useMemo(() => (rangeError ? [] : findCelebrations(people, range)), [people, range, rangeError]);
  const birthdays = list.filter((c) => c.kind === "birthday");
  const anniversaries = list.filter((c) => c.kind === "anniversary");
  const missingAnniversaries = people.filter((p) => p.status !== "suspended" && !p.anniversaryDate && p.spouseId).length;

  const today = todayIn(timezone);
  const presets: { label: string; range: DateWindow }[] = [
    { label: "This week (Fri to Thu)", range: defaultWeeklyWindow(today, EMAIL_WEEKDAY) },
    { label: "Next week (Fri to Thu)", range: defaultWeeklyWindow(addDays(defaultWeeklyWindow(today, EMAIL_WEEKDAY).start, 1), EMAIL_WEEKDAY) },
    { label: "Next 30 days", range: { start: today, end: addDays(today, 29) } },
  ];

  async function handleCopy() {
    const text = celebrationsAsText(list);
    setCopyError(null);
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      // The Clipboard API needs HTTPS and permission, which some browsers
      // and phones refuse. Fall back to the older copy command.
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      document.body.removeChild(ta);
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } else {
      setCopyError("Your browser blocked copying. Select the text below and copy it instead.");
    }
  }

  function handleExport() {
    exportToCSV(
      list.map((c) => ({
        date: c.date,
        type: c.kind === "birthday" ? "Birthday" : "Anniversary",
        name: c.people.map((p) => formatSurnameFirst(p)).join(" & "),
        years: c.years ?? "",
      })),
      `celebrations-${range.start}-to-${range.end}`,
      [
        { key: "date", label: "Date" },
        { key: "type", label: "Type" },
        { key: "name", label: "Name" },
        { key: "years", label: "Turning / Years married" },
      ]
    );
  }

  if (loading) return <div className="p-8 text-slate-500">Loading...</div>;
  if (!allowed) {
    return (
      <div className="max-w-2xl p-6 sm:p-8">
        <h1 className="text-2xl font-semibold text-slate-800">Birthdays and Anniversaries</h1>
        <p className="mt-2 text-sm text-slate-500">You do not have access to this page.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl p-6 sm:p-8">
      <h1 className="text-2xl font-semibold text-slate-800">Birthdays and Anniversaries</h1>
      <p className="mt-2 text-sm text-slate-500">
        Everyone celebrating in a date range, ready to copy into your weekly members&apos; email.
      </p>

      {/* Range */}
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => {
            const active = p.range.start === range.start && p.range.end === range.end;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => setRange(p.range)}
                className={`rounded-full border px-3 py-1 text-sm transition ${
                  active ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 text-slate-600 hover:border-emerald-500"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-4">
          <div>
            <label className="flex items-center gap-1 text-sm font-medium text-slate-700">
              From
              <InfoTooltip text="First day to include." why="The weekly email usually runs Friday to the following Thursday. Pick any range up to a year." />
            </label>
            <DateInput
              value={range.start}
              onChange={(v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && setRange((w) => ({ ...w, start: v }))}
              className="mt-1 w-40 rounded-lg border border-slate-300 px-3 py-2 text-slate-800 focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">To</label>
            <DateInput
              value={range.end}
              onChange={(v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && setRange((w) => ({ ...w, end: v }))}
              className="mt-1 w-40 rounded-lg border border-slate-300 px-3 py-2 text-slate-800 focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <p className="pb-2 text-sm text-slate-500">
            {formatShortDate(range.start)} to {formatShortDate(range.end)}
          </p>
        </div>
        {rangeError && <p className="mt-2 text-sm text-red-600">{rangeError}</p>}
      </div>

      {errorMsg && <p className="mt-4 text-sm text-red-600">{errorMsg}</p>}

      {loadingMembers ? (
        <p className="mt-6 text-sm text-slate-500">Loading members...</p>
      ) : (
        <>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            {[
              { title: "Birthdays", rows: birthdays, suffix: (y: number) => `turns ${y}` },
              { title: "Anniversaries", rows: anniversaries, suffix: (y: number) => `${y} ${y === 1 ? "year" : "years"}` },
            ].map((section) => (
              <div key={section.title} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="font-medium text-slate-800">
                  {section.title} <span className="text-sm font-normal text-slate-400">({section.rows.length})</span>
                </h2>
                {section.rows.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-400">None in this period.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-slate-100">
                    {section.rows.map((c) => (
                      <li key={`${c.kind}-${c.date}-${c.people.map((p) => p.id).join("-")}`} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                        <span className="w-24 shrink-0 text-slate-500">{formatShortDate(c.date)}</span>
                        <span className="flex-1 text-slate-800">{displayNames(c.people)}</span>
                        {c.years !== null && <span className="shrink-0 text-xs text-slate-400">{section.suffix(c.years)}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          {missingAnniversaries > 0 && (
            <p className="mt-4 text-xs text-slate-400">
              {missingAnniversaries} linked spouse {missingAnniversaries === 1 ? "record has" : "records have"}{" "}no wedding anniversary yet. Add it from the member&apos;s record in Membership Management.
            </p>
          )}

          <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-medium text-slate-800">For the email</h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  disabled={!!rangeError}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  {copied ? "Copied" : "Copy text"}
                </button>
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={list.length === 0}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-emerald-500 disabled:opacity-50"
                >
                  Export CSV
                </button>
              </div>
            </div>
            {copyError && <p className="mt-2 text-sm text-red-600">{copyError}</p>}
            <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-4 font-sans text-sm text-slate-700">
              {rangeError ? "" : celebrationsAsText(list)}
            </pre>
          </div>
        </>
      )}
    </div>
  );
}
