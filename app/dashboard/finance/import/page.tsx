'use client';

// hub: app/dashboard/finance/import/page.tsx
//
// Statement Import — PIECE ONE (CSV / Excel).
// Admin uploads a bank statement exported as CSV, XLS or XLSX.
// The reader parses it, auto-detects the Date / Amount / Reference columns
// (with manual override dropdowns), shows a preview, then saves each row to
// the `staged_transactions` collection as status:'pending' for review later.
//
// No AI and no API key needed for this file. PDF + AI extraction is a later piece.

import { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { db } from '../../../../lib/firebase';
import { useAppUser } from '../../../../lib/useAppUser';
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import Link from 'next/link';

// --- Types ---

type RawRow = Record<string, string | number>;

type StagedRow = {
  date: string;          // normalised YYYY-MM-DD
  amount: number;        // absolute value
  type: 'income' | 'expense';
  description: string;   // the bank reference / narrative
  duplicate: boolean;    // already exists in transactions or staging
  include: boolean;      // admin can untick rows before saving
};

// --- Helpers ---

const todayYear = new Date().getFullYear();

// Try hard to turn whatever the bank put in the date cell into YYYY-MM-DD.
// Handles 2024/01/15, 15/01/2024, 15-01-2024, 15 Jan 2024, Excel date numbers.
function normaliseDate(value: string | number): string {
  if (value === null || value === undefined || value === '') return '';

  // Excel sometimes hands us a serial number (days since 1899-12-30).
  if (typeof value === 'number' && value > 1000 && value < 100000) {
    const d = new Date(Math.round((value - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  }

  const s = String(value).trim();

  // Already ISO-ish: 2024-01-15 or 2024/01/15
  const iso = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY (South African default: day first)
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (dmy) {
    let year = dmy[3];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }

  // "15 Jan 2024" / "15 January 2024" and similar — let the browser try.
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 2000 && parsed.getFullYear() <= todayYear + 1) {
    return parsed.toISOString().split('T')[0];
  }

  return ''; // unparseable — admin will see a blank and can fix the file
}

// Pull a clean number out of "R 1,250.00", "1 250,00", "-450.00", "(450.00)" etc.
function normaliseAmount(value: string | number): number {
  if (typeof value === 'number') return value;
  if (!value) return NaN;
  let s = String(value).trim();

  // Brackets mean negative in many statements: (450.00) => -450.00
  const negative = /^\(.*\)$/.test(s) || s.includes('-');
  s = s.replace(/[()]/g, '');

  // Strip currency words/symbols and spaces
  s = s.replace(/[rR]\s?|ZAR|\s/g, '');

  // Handle both 1,250.00 and 1.250,00 styles
  if (s.includes(',') && s.includes('.')) {
    // Whichever comes last is the decimal separator
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (s.includes(',')) {
    // Only commas: treat as thousands unless it looks like decimals (1 or 2 digits after)
    s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  }

  s = s.replace(/[^0-9.-]/g, '');
  const n = parseFloat(s);
  if (isNaN(n)) return NaN;
  return negative && n > 0 ? -n : n;
}

// Find which header best matches a set of keywords.
function findHeader(headers: string[], keywords: string[]): string {
  const lower = headers.map((h) => h.toLowerCase());
  for (const kw of keywords) {
    const idx = lower.findIndex((h) => h.includes(kw));
    if (idx !== -1) return headers[idx];
  }
  return '';
}

const NONE = '(none)';

// --- Component ---

export default function StatementImportPage() {
  const { appUser, loading: userLoading } = useAppUser();
  const tenantId = appUser?.tenantId || '';

  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [error, setError] = useState('');
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  // Column mapping (auto-detected, admin can override)
  const [dateCol, setDateCol] = useState('');
  const [refCol, setRefCol] = useState('');
  const [amountCol, setAmountCol] = useState('');      // single signed column
  const [debitCol, setDebitCol] = useState(NONE);      // optional separate money-out
  const [creditCol, setCreditCol] = useState(NONE);    // optional separate money-in

  // Keep the rows the admin has reviewed/ticked
  const [rows, setRows] = useState<StagedRow[]>([]);

  // ---- Step 1: read + parse the uploaded file ----
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setSavedCount(null);
    setRows([]);
    setParsing(true);
    setFileName(file.name);

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: false });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const matrix: (string | number)[][] = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        blankrows: false,
        defval: '',
      });

      if (!matrix.length) {
        setError('That file looks empty. Make sure you exported transactions, not a blank sheet.');
        setParsing(false);
        return;
      }

      // Bank statements often have a few preamble rows before the real header.
      // Find the first row that contains a "date" cell AND an amount/description cell.
      let headerIdx = 0;
      for (let i = 0; i < Math.min(matrix.length, 20); i++) {
        const cells = matrix[i].map((c) => String(c).toLowerCase());
        const hasDate = cells.some((c) => c.includes('date'));
        const hasMoney = cells.some(
          (c) =>
            c.includes('amount') ||
            c.includes('debit') ||
            c.includes('credit') ||
            c.includes('description') ||
            c.includes('reference') ||
            c.includes('narrative'),
        );
        if (hasDate && hasMoney) {
          headerIdx = i;
          break;
        }
      }

      const hdr = matrix[headerIdx].map((c) => String(c).trim() || `Column ${matrix[headerIdx].indexOf(c) + 1}`);
      const dataRows = matrix.slice(headerIdx + 1).filter((r) => r.some((c) => String(c).trim() !== ''));

      const objRows: RawRow[] = dataRows.map((r) => {
        const obj: RawRow = {};
        hdr.forEach((h, i) => {
          obj[h] = r[i] ?? '';
        });
        return obj;
      });

      setHeaders(hdr);
      setRawRows(objRows);

      // Auto-detect the three columns we care about.
      setDateCol(findHeader(hdr, ['date', 'posting', 'transaction date']));
      setRefCol(findHeader(hdr, ['description', 'reference', 'narrative', 'detail', 'memo', 'payee']));

      const single = findHeader(hdr, ['amount', 'value']);
      const debit = findHeader(hdr, ['debit', 'money out', 'withdrawal', 'paid out']);
      const credit = findHeader(hdr, ['credit', 'money in', 'deposit', 'paid in']);

      if (single) {
        setAmountCol(single);
        setDebitCol(NONE);
        setCreditCol(NONE);
      } else {
        setAmountCol('');
        setDebitCol(debit || NONE);
        setCreditCol(credit || NONE);
      }
    } catch (err) {
      console.error('Parse error:', err);
      setError('Could not read that file. Please upload a CSV, XLS or XLSX exported from your bank.');
    } finally {
      setParsing(false);
    }
  }

  // ---- Step 2: build the preview whenever mapping changes ----
  // (We compute it on demand via a button so the admin sets the columns first.)
  async function buildPreview() {
    if (!dateCol) {
      setError('Please choose which column holds the Date.');
      return;
    }
    if (!amountCol && debitCol === NONE && creditCol === NONE) {
      setError('Please choose the Amount column, or the Debit and Credit columns.');
      return;
    }
    setError('');

    // Pull existing transactions + already-staged rows so we can flag duplicates.
    const existingKeys = new Set<string>();
    try {
      const [txSnap, stSnap] = await Promise.all([
        getDocs(query(collection(db, 'transactions'), where('tenantId', '==', tenantId))),
        getDocs(query(collection(db, 'staged_transactions'), where('tenantId', '==', tenantId))),
      ]);
      [...txSnap.docs, ...stSnap.docs].forEach((d) => {
        const t = d.data() as { date?: string; amount?: number; description?: string };
        existingKeys.add(`${t.date}|${t.amount}|${(t.description || '').toLowerCase().trim()}`);
      });
    } catch (err) {
      console.error('Duplicate check failed (continuing without it):', err);
    }

    const built: StagedRow[] = [];
    for (const r of rawRows) {
      const date = normaliseDate(r[dateCol]);

      // Work out the signed amount.
      let signed: number;
      if (amountCol) {
        signed = normaliseAmount(r[amountCol]);
      } else {
        const out = debitCol !== NONE ? Math.abs(normaliseAmount(r[debitCol]) || 0) : 0;
        const inn = creditCol !== NONE ? Math.abs(normaliseAmount(r[creditCol]) || 0) : 0;
        signed = inn - out; // money in positive, money out negative
      }

      if (isNaN(signed) || signed === 0) continue; // skip balance/blank lines

      const description = refCol ? String(r[refCol] ?? '').trim() : '';
      const amount = Math.abs(signed);
      const type: 'income' | 'expense' = signed >= 0 ? 'income' : 'expense';
      const key = `${date}|${amount}|${description.toLowerCase()}`;

      built.push({
        date,
        amount,
        type,
        description,
        duplicate: existingKeys.has(key),
        include: !existingKeys.has(key), // untick duplicates by default
      });
    }

    if (!built.length) {
      setError('No usable transaction rows were found with the columns you picked. Try different columns.');
      return;
    }
    setRows(built);
  }

  // ---- Step 3: save ticked rows to staged_transactions ----
  async function saveToStaging() {
    if (!tenantId) {
      setError('No church (tenant) found on your account. Please log in again.');
      return;
    }
    const toSave = rows.filter((r) => r.include && r.date && r.amount > 0);
    if (!toSave.length) {
      setError('No rows are ticked to import.');
      return;
    }
    setSaving(true);
    setError('');
    const batchId = `import_${Date.now()}`;

    try {
      await Promise.all(
        toSave.map((r) =>
          addDoc(collection(db, 'staged_transactions'), {
            tenantId,
            status: 'pending',          // becomes 'confirmed' after review (piece two)
            type: r.type,               // income | expense
            date: r.date,               // YYYY-MM-DD
            amount: r.amount,           // positive number
            description: r.description, // bank reference
            category: '',               // admin allocates in review
            memberId: '',               // admin allocates (income only) in review
            memberName: '',
            source: fileName.toLowerCase().endsWith('.csv') ? 'csv' : 'excel',
            batchId,
            uploadedBy: appUser?.uid || '',
            createdAt: serverTimestamp(),
          }),
        ),
      );
      setSavedCount(toSave.length);
      setRows([]);
      setRawRows([]);
      setHeaders([]);
      setFileName('');
    } catch (err) {
      console.error('Save error:', err);
      setError('Could not save the rows. Check your connection and that you have finance permissions.');
    } finally {
      setSaving(false);
    }
  }

  const includedCount = useMemo(() => rows.filter((r) => r.include).length, [rows]);

  // --- Render ---

  if (userLoading) {
    return <div className="p-6 text-gray-500">Loading…</div>;
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="mb-6">
        <Link href="/dashboard/finance" className="text-sm text-emerald-700 hover:underline">
          ← Back to Finance
        </Link>
        <h1 className="text-2xl font-semibold text-slate-800 mt-2">Import a Bank Statement</h1>
        <p className="text-slate-500 text-sm mt-1">
          Upload a statement exported as CSV, XLS or XLSX. We will read the Date, Amount and Reference,
          then you allocate the category and member in the review step.
        </p>
      </div>

      {/* Step 1: file picker */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-5">
        <label className="block text-sm font-medium text-slate-700 mb-2">1. Choose your statement file</label>
        <input
          type="file"
          accept=".csv,.xls,.xlsx"
          onChange={handleFile}
          className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-emerald-600 file:text-white hover:file:bg-emerald-700 cursor-pointer"
        />
        {fileName && <p className="text-xs text-slate-500 mt-2">Loaded: {fileName}</p>}
        {parsing && <p className="text-sm text-emerald-700 mt-2">Reading file…</p>}
      </div>

      {/* Step 2: column mapping */}
      {headers.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-5">
          <label className="block text-sm font-medium text-slate-700 mb-3">
            2. Confirm which columns to use{' '}
            <span className="font-normal text-slate-400">(we guessed, change if wrong)</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Mapper label="Date column" value={dateCol} onChange={setDateCol} options={headers} />
            <Mapper label="Reference / Description column" value={refCol} onChange={setRefCol} options={headers} allowNone />
            <Mapper label="Amount column (single signed column)" value={amountCol} onChange={setAmountCol} options={headers} allowNone />
            <div className="grid grid-cols-2 gap-3">
              <Mapper label="Money out (Debit)" value={debitCol} onChange={setDebitCol} options={headers} allowNone />
              <Mapper label="Money in (Credit)" value={creditCol} onChange={setCreditCol} options={headers} allowNone />
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-3">
            Use the single Amount column if your bank gives one column with positive and negative numbers.
            Use Money out / Money in if your bank splits them into two columns.
          </p>
          <button
            onClick={buildPreview}
            className="mt-4 bg-slate-800 text-white text-sm px-4 py-2 rounded-lg hover:bg-slate-900"
          >
            Preview rows
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-5">{error}</div>
      )}

      {savedCount !== null && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg p-4 mb-5">
          Saved {savedCount} transaction{savedCount === 1 ? '' : 's'} for review. The next step (allocating
          category and member) is coming in the review screen.
        </div>
      )}

      {/* Step 3: preview + save */}
      {rows.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-slate-700">
              3. Review and import{' '}
              <span className="font-normal text-slate-400">
                ({includedCount} of {rows.length} ticked)
              </span>
            </label>
            <button
              onClick={saveToStaging}
              disabled={saving || includedCount === 0}
              className="bg-emerald-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : `Import ${includedCount} rows`}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-2"></th>
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Reference</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4 text-right">Amount</th>
                  <th className="py-2 pr-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={`border-b border-slate-100 ${!r.include ? 'opacity-40' : ''}`}>
                    <td className="py-2 pr-2">
                      <input
                        type="checkbox"
                        checked={r.include}
                        onChange={() =>
                          setRows((prev) => prev.map((row, j) => (j === i ? { ...row, include: !row.include } : row)))
                        }
                      />
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap">{r.date || <span className="text-red-500">no date</span>}</td>
                    <td className="py-2 pr-4 max-w-xs truncate" title={r.description}>{r.description || '—'}</td>
                    <td className="py-2 pr-4">
                      <span className={r.type === 'income' ? 'text-emerald-700' : 'text-slate-600'}>
                        {r.type}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-right whitespace-nowrap">
                      R {r.amount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2 pr-2">
                      {r.duplicate && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">possible duplicate</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// Small reusable dropdown for column mapping.
function Mapper({
  label,
  value,
  onChange,
  options,
  allowNone = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  allowNone?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs text-slate-500 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
      >
        <option value="">— select —</option>
        {allowNone && <option value="(none)">(none)</option>}
        {options.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
    </div>
  );
}
