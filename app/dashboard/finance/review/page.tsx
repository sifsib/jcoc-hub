'use client';

// hub: app/dashboard/finance/review/page.tsx
//
// Statement Review — PIECE TWO.
// Loads the pending rows created by the import page (staged_transactions),
// lets the admin allocate a Category (and, for income, a Member) using dropdowns,
// then confirms each row into the real `transactions` collection and removes it
// from staging. Works for CSV/Excel imports now and PDF imports later (same screen).

import { useState, useEffect, useMemo } from 'react';
import { db } from '../../../../lib/firebase';
import { useAppUser } from '../../../../lib/useAppUser';
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  query,
  where,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import Link from 'next/link';

// Same defaults the main finance page falls back to.
const DEFAULT_INCOME_CATEGORIES = ['Tithes', 'Offerings', 'Building Fund', 'Other'];
const DEFAULT_EXPENSE_CATEGORIES = [
  'Allowance', 'Electricity', 'Petrol', 'Catering', 'Welfare', 'Land Purchase Payment',
  'Bank Charges', 'Evangelism', "Pastor's Travel", 'Bereavement', 'Donations/Offering',
  'Church Maintenance', 'Conferences', 'Debt Repayment', 'Stock Purchases',
  'Memberships/Subscriptions', 'Miscellaneous',
];

type StagedDoc = {
  id: string;
  type: 'income' | 'expense';
  date: string;
  amount: number;
  description: string;
  category: string;   // local edit
  memberId: string;   // local edit
  memberName: string; // local edit
  saving?: boolean;
};

type Member = { id: string; name: string };

const fmt = (n: number) => `R ${n.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;

const formatDate = (val: string) => {
  if (!val) return '—';
  const d = new Date(val);
  return isNaN(d.getTime()) ? val : d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
};

export default function StatementReviewPage() {
  const { appUser, loading: userLoading } = useAppUser();
  const tenantId = appUser?.tenantId || '';

  const [rows, setRows] = useState<StagedDoc[]>([]);
  const [incomeCats, setIncomeCats] = useState<string[]>(DEFAULT_INCOME_CATEGORIES);
  const [expenseCats, setExpenseCats] = useState<string[]>(DEFAULT_EXPENSE_CATEGORIES);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (userLoading || !appUser) return;
    loadEverything(appUser.tenantId);
  }, [appUser, userLoading]);

  async function loadEverything(tid: string) {
    setLoading(true);
    setError('');
    try {
      // Pending staged rows. Two equality filters only (no composite index needed);
      // we sort by date in the browser.
      const stagedSnap = await getDocs(
        query(
          collection(db, 'staged_transactions'),
          where('tenantId', '==', tid),
          where('status', '==', 'pending'),
        ),
      );
      const staged: StagedDoc[] = stagedSnap.docs
        .map((d) => {
          const x = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            type: (x.type as 'income' | 'expense') || 'income',
            date: (x.date as string) || '',
            amount: Number(x.amount) || 0,
            description: (x.description as string) || '',
            category: (x.category as string) || '',
            memberId: (x.memberId as string) || '',
            memberName: (x.memberName as string) || '',
          };
        })
        .sort((a, b) => a.date.localeCompare(b.date));
      setRows(staged);

      // Categories (custom from Firestore, fall back to defaults).
      const [incSnap, expSnap, memSnap] = await Promise.all([
        getDocs(query(collection(db, 'finance_categories'), where('tenantId', '==', tid), where('type', '==', 'income'))),
        getDocs(query(collection(db, 'finance_categories'), where('tenantId', '==', tid), where('type', '==', 'expense'))),
        getDocs(query(collection(db, 'members'), where('tenantId', '==', tid))),
      ]);

      const inc = incSnap.docs
        .map((d) => ({ name: d.data().name as string, order: (d.data().order as number) ?? 0 }))
        .sort((a, b) => a.order - b.order)
        .map((c) => c.name)
        .filter(Boolean);
      const exp = expSnap.docs
        .map((d) => ({ name: d.data().name as string, order: (d.data().order as number) ?? 0 }))
        .sort((a, b) => a.order - b.order)
        .map((c) => c.name)
        .filter(Boolean);
      setIncomeCats(inc.length ? inc : DEFAULT_INCOME_CATEGORIES);
      setExpenseCats(exp.length ? exp : DEFAULT_EXPENSE_CATEGORIES);

      const mem = memSnap.docs
        .map((d) => {
          const data = d.data();
          const name = data.fullName || `${data.firstName || ''} ${data.lastName || ''}`.trim();
          return { id: d.id, name };
        })
        .filter((m) => m.name)
        .sort((a, b) => a.name.localeCompare(b.name));
      setMembers(mem);
    } catch (err) {
      console.error('Load error:', err);
      setError('Could not load rows for review. Check your connection and finance permissions.');
    } finally {
      setLoading(false);
    }
  }

  function updateRow(id: string, patch: Partial<StagedDoc>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  // Confirm one row: write a real transaction, then remove the staged doc.
  async function confirmRow(row: StagedDoc) {
    if (!row.category) {
      setError('Pick a category for that row first.');
      return;
    }
    if (!row.date || row.amount <= 0) {
      setError('That row has a bad date or amount. Discard it and fix the file.');
      return;
    }
    setError('');
    updateRow(row.id, { saving: true });

    try {
      await addDoc(collection(db, 'transactions'), {
        tenantId,
        type: row.type,
        date: row.date,
        description: row.description.trim(),
        amount: row.amount,
        category: row.category,
        ...(row.type === 'income' && row.memberId && { memberId: row.memberId, memberName: row.memberName }),
        source: 'statement-import',
        createdAt: serverTimestamp(),
      });
      await deleteDoc(doc(db, 'staged_transactions', row.id));
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      flash('Transaction confirmed.');
    } catch (err) {
      console.error('Confirm error:', err);
      setError('Could not confirm that row. Please try again.');
      updateRow(row.id, { saving: false });
    }
  }

  // Confirm every row that already has a category chosen.
  async function confirmAllReady() {
    const ready = rows.filter((r) => r.category && r.date && r.amount > 0);
    for (const row of ready) {
      // sequential keeps it simple and avoids hammering Firestore
      // eslint-disable-next-line no-await-in-loop
      await confirmRow(row);
    }
  }

  async function discardRow(id: string) {
    try {
      await deleteDoc(doc(db, 'staged_transactions', id));
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      console.error('Discard error:', err);
      setError('Could not discard that row.');
    }
  }

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(''), 3000);
  }

  const readyCount = useMemo(() => rows.filter((r) => r.category).length, [rows]);

  if (userLoading || loading) {
    return <div className="p-6 text-slate-500">Loading rows for review…</div>;
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6">
        <Link href="/dashboard/finance" className="text-sm text-emerald-700 hover:underline">
          ← Back to Finance
        </Link>
        <div className="flex items-center justify-between mt-2">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">Review Imported Transactions</h1>
            <p className="text-slate-500 text-sm mt-1">
              Allocate a category to each row, and a member for income where there is one. Confirmed rows
              move into your finance records.
            </p>
          </div>
          <Link
            href="/dashboard/finance/import"
            className="text-sm border border-slate-300 px-3 py-2 rounded-lg hover:bg-slate-50"
          >
            + Import statement
          </Link>
        </div>
      </div>

      {msg && <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg p-3 mb-4">{msg}</div>}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">{error}</div>}

      {rows.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <p className="text-slate-500 mb-2">Nothing waiting for review.</p>
          <p className="text-slate-400 text-sm">
            Import a statement to bring transactions here.{' '}
            <Link href="/dashboard/finance/import" className="text-emerald-700 hover:underline">Import now</Link>
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-slate-500">
              {rows.length} pending · {readyCount} ready to confirm
            </p>
            <button
              onClick={confirmAllReady}
              disabled={readyCount === 0}
              className="bg-emerald-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              Confirm all ready ({readyCount})
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Reference</th>
                  <th className="py-2 pr-4 text-right">Amount</th>
                  <th className="py-2 pr-4">Category</th>
                  <th className="py-2 pr-4">Member (income)</th>
                  <th className="py-2 pr-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 align-top">
                    <td className="py-3 pr-4 whitespace-nowrap text-slate-700">{formatDate(r.date)}</td>
                    <td className="py-3 pr-4 max-w-xs">
                      <span className="text-slate-700" title={r.description}>{r.description || '—'}</span>
                      <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${r.type === 'income' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {r.type}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-right whitespace-nowrap text-slate-800">{fmt(r.amount)}</td>
                    <td className="py-3 pr-4">
                      <select
                        value={r.category}
                        onChange={(e) => updateRow(r.id, { category: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg px-2 py-1.5 bg-white"
                      >
                        <option value="">— choose —</option>
                        {(r.type === 'income' ? incomeCats : expenseCats).map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 pr-4">
                      {r.type === 'income' ? (
                        <select
                          value={r.memberId}
                          onChange={(e) => {
                            const m = members.find((x) => x.id === e.target.value);
                            updateRow(r.id, { memberId: e.target.value, memberName: m?.name || '' });
                          }}
                          className="w-full border border-slate-300 rounded-lg px-2 py-1.5 bg-white"
                        >
                          <option value="">— none —</option>
                          {members.map((m) => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-slate-300 text-xs">n/a</span>
                      )}
                    </td>
                    <td className="py-3 pr-2 whitespace-nowrap">
                      <button
                        onClick={() => confirmRow(r)}
                        disabled={r.saving || !r.category}
                        className="text-emerald-700 hover:underline disabled:text-slate-300 mr-3"
                      >
                        {r.saving ? 'Saving…' : 'Confirm'}
                      </button>
                      <button
                        onClick={() => discardRow(r.id)}
                        disabled={r.saving}
                        className="text-red-600 hover:underline"
                      >
                        Discard
                      </button>
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
