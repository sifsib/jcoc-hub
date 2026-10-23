"use client";

// Life phases on a member's record (ADR-011). The phases are worked out by the
// server from age, marital status, wedding date and family; this panel shows
// them and lets an admin switch an automatic phase off, add one by hand, and
// set a child's grade adjustment. Those choices are saved with the member and
// survive every recalculation, including the 1 January review.

import {
  LIFE_PHASES,
  ageThisYear,
  gradeLabel,
  gradeThisYear,
  phaseLabel,
  yearIn,
} from "../../../lib/lifePhases";

export interface LifePhaseInputs {
  dob: string;
  gradeAdjust: number;
  lifePhasesAdded: string[];
  lifePhasesRemoved: string[];
}

const GRADE_OPTIONS = [
  { value: 2, label: "Two years ahead" },
  { value: 1, label: "A year ahead (started early)" },
  { value: 0, label: "On track" },
  { value: -1, label: "A year behind (repeated)" },
  { value: -2, label: "Two years behind" },
];

const chip = "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium";

export default function LifePhasePanel({
  data,
  set,
  stored,
  year = yearIn("Africa/Johannesburg"),
}: {
  data: LifePhaseInputs;
  set: (k: keyof LifePhaseInputs, v: unknown) => void;
  /** What the server last worked out for this member. */
  stored: { lifePhases?: string[]; lifePhasesAuto?: string[] };
  year?: number;
}) {
  const auto = stored.lifePhasesAuto ?? [];
  const removed = new Set(data.lifePhasesRemoved);
  const added = data.lifePhasesAdded;
  const shown = new Set([...auto.filter((p) => !removed.has(p)), ...added]);
  const addable = LIFE_PHASES.filter((p) => !shown.has(p.id));
  const age = ageThisYear(data.dob, year);
  const showGrade = age !== null && age >= 2 && age <= 17;
  const grade = gradeThisYear(data.dob, year, data.gradeAdjust);

  const toggleAuto = (id: string) =>
    set("lifePhasesRemoved", removed.has(id) ? data.lifePhasesRemoved.filter((p) => p !== id) : [...data.lifePhasesRemoved, id]);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-gray-500">
        Worked out from age this year, marital status, wedding date and family links. Changes here, and to those
        details, show a few seconds after saving.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {(stored.lifePhases ?? []).length === 0 && <span className="text-xs italic text-gray-400">No life phases yet.</span>}
        {(stored.lifePhases ?? []).map((p) => (
          <span key={p} className={`${chip} border-emerald-200 bg-emerald-50 text-emerald-700`}>{phaseLabel(p)}</span>
        ))}
      </div>

      {auto.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Automatic</p>
          <div className="mt-1 flex flex-wrap gap-3">
            {auto.map((p) => (
              <label key={p} className="flex items-center gap-1.5 text-sm text-gray-700">
                <input type="checkbox" aria-label={`Keep ${phaseLabel(p)}`} checked={!removed.has(p)} onChange={() => toggleAuto(p)} />
                {phaseLabel(p)}
              </label>
            ))}
          </div>
          {removed.size > 0 && <p className="mt-1 text-xs text-amber-700">Unticked phases stay off, even after the yearly update.</p>}
        </div>
      )}

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Added by hand</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {added.map((p) => (
            <span key={p} className={`${chip} border-indigo-200 bg-indigo-50 text-indigo-700`}>
              {phaseLabel(p)}
              <button type="button" aria-label={`Remove ${phaseLabel(p)}`} onClick={() => set("lifePhasesAdded", added.filter((x) => x !== p))}
                className="text-indigo-400 hover:text-indigo-700">×</button>
            </span>
          ))}
          <select
            value=""
            onChange={(e) => e.target.value && set("lifePhasesAdded", [...added, e.target.value])}
            className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600"
            aria-label="Add a life phase"
          >
            <option value="">+ Add a phase</option>
            {addable.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
      </div>

      {showGrade && (
        <label className="text-sm text-gray-700">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">School grade this year: </span>
          <span className="font-medium">{gradeLabel(grade) || (grade !== null && grade > 12 ? "Finished school" : "Not at school yet")}</span>
          <select
            value={data.gradeAdjust}
            onChange={(e) => set("gradeAdjust", Number(e.target.value))}
            className="ml-2 rounded border border-gray-300 px-2 py-1 text-xs text-gray-600"
            aria-label="Grade adjustment"
          >
            {GRADE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}
