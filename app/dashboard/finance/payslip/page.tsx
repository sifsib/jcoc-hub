'use client';

// hub: app/dashboard/finance/payslip/page.tsx
// Payslip generator — v2:
//   Staff picker (auto-fills from staff_members)
//   "Save for next time" persists church details to tenant doc
//   History tab with reprint and delete

import { useState, useEffect } from 'react';
import { db } from '../../../../lib/firebase';
import { useAppUser } from '../../../../lib/useAppUser';
import {
  doc, getDoc, updateDoc,
  collection, addDoc, getDocs, deleteDoc,
  query, where, orderBy, serverTimestamp,
} from 'firebase/firestore';
import Link from 'next/link';
import { BRAND } from "../../../../lib/whiteLabel";

// ── Types ──────────────────────────────────────────────────────────────────────

type Earning = { label: string; amount: string };
type Deduction = { label: string; amount: string };
type PageTab = 'generate' | 'history';

type StaffMember = {
  id: string;
  name: string;
  idNumber: string;
  position: string;
  taxRef: string;
  bank: string;
  bankAccount: string;
  earnings: Earning[];
  deductions: Deduction[];
};

type Snapshot = {
  churchName: string; churchAddress: string; churchPhone: string;
  churchEmail: string; churchReg: string;
  payMonth: number; payYear: number;
  empName: string; empIdNumber: string; empPosition: string;
  empTaxRef: string; empBank: string; empBankAcc: string;
  earnings: Earning[]; deductions: Deduction[]; notes: string;
};

type PayslipRecord = {
  id: string;
  staffName: string;
  periodLabel: string;
  grossEarnings: number;
  netPay: number;
  createdAt: unknown;
  snapshot: Snapshot;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const fmt = (n: number) =>
  `R ${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const toNum = (s: string) => {
  const n = parseFloat(String(s).replace(/[^0-9.]/g, ''));
  return isNaN(n) ? 0 : n;
};

const tsToDate = (val: unknown): string => {
  if (!val) return '-';
  if (typeof val === 'object' && val !== null && 'toDate' in val) {
    return (val as { toDate: () => Date }).toDate()
      .toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  return '-';
};

const now = new Date();
const currentMonth = now.getMonth();
const currentYear = now.getFullYear();

// ── Component ──────────────────────────────────────────────────────────────────

export default function PayslipPage() {
  const { appUser, loading: userLoading } = useAppUser();
  const [pageTab, setPageTab] = useState<PageTab>('generate');

  // Church details
  const [logoUrl, setLogoUrl] = useState('');
  const [churchName, setChurchName] = useState('');
  const [churchAddress, setChurchAddress] = useState('');
  const [churchPhone, setChurchPhone] = useState('');
  const [churchEmail, setChurchEmail] = useState('');
  const [churchReg, setChurchReg] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsSaved, setDetailsSaved] = useState(false);

  // Pay period
  const [payMonth, setPayMonth] = useState(currentMonth);
  const [payYear, setPayYear] = useState(currentYear);

  // Staff
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState('');

  // Employee fields
  const [empName, setEmpName] = useState('');
  const [empIdNumber, setEmpIdNumber] = useState('');
  const [empPosition, setEmpPosition] = useState('');
  const [empTaxRef, setEmpTaxRef] = useState('');
  const [empBank, setEmpBank] = useState('');
  const [empBankAcc, setEmpBankAcc] = useState('');

  // Earnings / Deductions
  const [earnings, setEarnings] = useState<Earning[]>([
    { label: 'Basic Salary', amount: '' },
    { label: 'Housing Allowance', amount: '' },
    { label: 'Transport Allowance', amount: '' },
  ]);
  const [deductions, setDeductions] = useState<Deduction[]>([
    { label: 'PAYE', amount: '' },
    { label: 'UIF', amount: '' },
  ]);
  const [notes, setNotes] = useState('');

  // History
  const [history, setHistory] = useState<PayslipRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  // ── Load tenant + staff ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!appUser?.tenantId) return;
    const tenantId = appUser.tenantId;

    getDoc(doc(db, 'tenants', tenantId)).then((snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      setLogoUrl(d.logoUrl || '');
      setChurchName(d.name || d.churchName || '');
      setChurchAddress(d.address || d.physicalAddress || '');
      setChurchPhone(d.phone || d.contactPhone || '');
      setChurchEmail(d.email || d.contactEmail || '');
      setChurchReg(d.registrationNumber || d.regNumber || '');
    }).catch(console.error);

    getDocs(
      query(collection(db, 'staff_members'), where('tenantId', '==', tenantId), orderBy('name', 'asc')),
    ).then((snap) => {
      setStaffList(snap.docs.map((d) => ({ id: d.id, ...d.data() } as StaffMember)));
    }).catch(console.error);
  }, [appUser]);

  // ── Load history on tab switch ────────────────────────────────────────────────

  useEffect(() => {
    if (pageTab !== 'history' || !appUser?.tenantId) return;
    setHistoryLoading(true);
    getDocs(
      query(
        collection(db, 'payslip_records'),
        where('tenantId', '==', appUser.tenantId),
        orderBy('createdAt', 'desc'),
      ),
    ).then((snap) => {
      setHistory(snap.docs.map((d) => ({ id: d.id, ...d.data() } as PayslipRecord)));
    }).catch(console.error)
      .finally(() => setHistoryLoading(false));
  }, [pageTab, appUser]);

  // ── Staff picker ──────────────────────────────────────────────────────────────

  const selectStaff = (id: string) => {
    setSelectedStaffId(id);
    if (!id) return;
    const m = staffList.find((s) => s.id === id);
    if (!m) return;
    setEmpName(m.name);
    setEmpIdNumber(m.idNumber || '');
    setEmpPosition(m.position || '');
    setEmpTaxRef(m.taxRef || '');
    setEmpBank(m.bank || '');
    setEmpBankAcc(m.bankAccount || '');
    if (m.earnings?.length) setEarnings(m.earnings.map((e) => ({ ...e })));
    if (m.deductions?.length) setDeductions(m.deductions.map((d) => ({ ...d })));
  };

  // ── Save church details ───────────────────────────────────────────────────────

  const saveChurchDetails = async () => {
    if (!appUser?.tenantId) return;
    setSavingDetails(true);
    try {
      await updateDoc(doc(db, 'tenants', appUser.tenantId), {
        address: churchAddress,
        phone: churchPhone,
        email: churchEmail,
        registrationNumber: churchReg,
      });
      setDetailsSaved(true);
      setTimeout(() => setDetailsSaved(false), 3000);
    } catch (err) {
      console.error('Failed to save church details:', err);
    } finally {
      setSavingDetails(false);
    }
  };

  // ── Calculations ──────────────────────────────────────────────────────────────

  const grossEarnings = earnings.reduce((s, e) => s + toNum(e.amount), 0);
  const totalDeductions = deductions.reduce((s, d) => s + toNum(d.amount), 0);
  const netPay = grossEarnings - totalDeductions;
  const periodLabel = `${MONTHS[payMonth]} ${payYear}`;

  // Earnings helpers
  const updateEarning = (i: number, f: keyof Earning, v: string) =>
    setEarnings((p) => p.map((e, idx) => idx === i ? { ...e, [f]: v } : e));
  const addEarning = () => setEarnings((p) => [...p, { label: '', amount: '' }]);
  const removeEarning = (i: number) => setEarnings((p) => p.filter((_, idx) => idx !== i));

  const updateDeduction = (i: number, f: keyof Deduction, v: string) =>
    setDeductions((p) => p.map((d, idx) => idx === i ? { ...d, [f]: v } : d));
  const addDeduction = () => setDeductions((p) => [...p, { label: '', amount: '' }]);
  const removeDeduction = (i: number) => setDeductions((p) => p.filter((_, idx) => idx !== i));

  // ── Generate + save record ────────────────────────────────────────────────────

  const handlePrint = async () => {
    if (!appUser?.tenantId) return;
    setGenerating(true);
    try {
      const snapshot: Snapshot = {
        churchName, churchAddress, churchPhone, churchEmail, churchReg,
        payMonth, payYear, empName, empIdNumber, empPosition,
        empTaxRef, empBank, empBankAcc,
        earnings: earnings.map((e) => ({ ...e })),
        deductions: deductions.map((d) => ({ ...d })),
        notes,
      };
      await addDoc(collection(db, 'payslip_records'), {
        tenantId: appUser.tenantId,
        staffId: selectedStaffId || '',
        staffName: empName,
        period: `${payYear}-${String(payMonth + 1).padStart(2, '0')}`,
        periodLabel,
        grossEarnings,
        totalDeductions,
        netPay,
        snapshot,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('Failed to save payslip record:', err);
    } finally {
      setGenerating(false);
      window.print();
    }
  };

  // ── Reprint from history ──────────────────────────────────────────────────────

  const reprint = (record: PayslipRecord) => {
    const s = record.snapshot;
    setChurchName(s.churchName); setChurchAddress(s.churchAddress);
    setChurchPhone(s.churchPhone); setChurchEmail(s.churchEmail); setChurchReg(s.churchReg);
    setPayMonth(s.payMonth); setPayYear(s.payYear);
    setEmpName(s.empName); setEmpIdNumber(s.empIdNumber); setEmpPosition(s.empPosition);
    setEmpTaxRef(s.empTaxRef); setEmpBank(s.empBank); setEmpBankAcc(s.empBankAcc);
    setEarnings(s.earnings.map((e) => ({ ...e })));
    setDeductions(s.deductions.map((d) => ({ ...d })));
    setNotes(s.notes);
    setSelectedStaffId('');
    setPageTab('generate');
  };

  const deleteRecord = async (id: string) => {
    if (!confirm('Delete this payslip record?')) return;
    try {
      await deleteDoc(doc(db, 'payslip_records', id));
      setHistory((prev) => prev.filter((r) => r.id !== id));
    } catch (err) { console.error(err); }
  };

  if (userLoading) {
    return (
      <div className="p-10 flex items-center gap-2">
        <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const docProps = {
    logoUrl, churchName, churchAddress, churchPhone, churchEmail, churchReg,
    periodLabel, empName, empIdNumber, empPosition, empTaxRef, empBank, empBankAcc,
    earnings, deductions, grossEarnings, totalDeductions, netPay, notes, fmt,
  };

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #payslip-print, #payslip-print * { visibility: visible !important; }
          #payslip-print { position: fixed; inset: 0; background: white; padding: 32px; }
          @page { size: A4 portrait; margin: 16mm; }
        }
      `}</style>

      <div className="p-6 max-w-4xl mx-auto">

        {/* Page header */}
        <div className="mb-6 flex items-center gap-4">
          <Link href="/dashboard/finance" className="text-sm text-gray-400 hover:text-gray-700 transition">
            ← Finance
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Payslip Generator</h1>
            <p className="text-sm text-gray-500 mt-0.5">Fill in the details below, then print or save as PDF.</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-end gap-1 mb-6 border-b border-gray-200">
          {(['generate', 'history'] as PageTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setPageTab(t)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition capitalize ${
                t === pageTab
                  ? 'bg-white border border-b-white border-gray-200 text-emerald-700 -mb-px'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'generate' ? 'Generate' : `History (${history.length || ''})`}
            </button>
          ))}
          <Link
            href="/dashboard/finance/staff"
            className="ml-auto text-xs font-semibold text-gray-400 hover:text-emerald-700 pb-2 transition"
          >
            Manage Staff Register →
          </Link>
        </div>

        {/* ── Generate Tab ── */}
        {pageTab === 'generate' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-5">

              {/* Staff picker */}
              {staffList.length > 0 && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-2">
                  <h2 className="text-xs font-bold text-emerald-700 uppercase tracking-wide">
                    Quick Fill from Staff Register
                  </h2>
                  <select
                    value={selectedStaffId}
                    onChange={(e) => selectStaff(e.target.value)}
                    className="w-full border border-emerald-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    <option value="">Select a staff member...</option>
                    {staffList.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}{s.position ? ` — ${s.position}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Church Details */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Church Details</h2>
                  <button
                    onClick={saveChurchDetails}
                    disabled={savingDetails}
                    className="text-xs font-semibold text-emerald-600 hover:text-emerald-800 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 px-3 py-1 rounded-lg transition disabled:opacity-50"
                  >
                    {savingDetails ? 'Saving...' : detailsSaved ? '✓ Saved!' : 'Save for next time'}
                  </button>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Church Name</label>
                  <input value={churchName} onChange={(e) => setChurchName(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Address</label>
                  <input value={churchAddress} onChange={(e) => setChurchAddress(e.target.value)} placeholder="123 Church Street, Pretoria" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Phone</label>
                    <input value={churchPhone} onChange={(e) => setChurchPhone(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Email</label>
                    <input value={churchEmail} onChange={(e) => setChurchEmail(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Registration Number (optional)</label>
                  <input value={churchReg} onChange={(e) => setChurchReg(e.target.value)} placeholder="NPO 123-456" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
              </div>

              {/* Pay Period */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Pay Period</h2>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Month</label>
                    <select value={payMonth} onChange={(e) => setPayMonth(Number(e.target.value))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                      {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Year</label>
                    <select value={payYear} onChange={(e) => setPayYear(Number(e.target.value))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                      {[currentYear - 1, currentYear, currentYear + 1].map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Employee Details */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Employee Details</h2>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Full Name</label>
                    <input value={empName} onChange={(e) => setEmpName(e.target.value)} placeholder="John Dlamini" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">ID Number</label>
                    <input value={empIdNumber} onChange={(e) => setEmpIdNumber(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Position</label>
                    <input value={empPosition} onChange={(e) => setEmpPosition(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Tax Reference</label>
                    <input value={empTaxRef} onChange={(e) => setEmpTaxRef(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Bank</label>
                    <input value={empBank} onChange={(e) => setEmpBank(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Account Number</label>
                    <input value={empBankAcc} onChange={(e) => setEmpBankAcc(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                </div>
              </div>

              {/* Earnings */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Earnings</h2>
                {earnings.map((e, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input value={e.label} onChange={(ev) => updateEarning(i, 'label', ev.target.value)} placeholder="Label" className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                    <input type="number" value={e.amount} onChange={(ev) => updateEarning(i, 'amount', ev.target.value)} placeholder="0.00" min="0" step="0.01" className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                    <button type="button" onClick={() => removeEarning(i)} className="text-gray-300 hover:text-red-400 text-xl">×</button>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-1">
                  <button type="button" onClick={addEarning} className="text-xs font-semibold text-emerald-600 hover:text-emerald-800">+ Add Earning</button>
                  <span className="text-sm font-bold text-gray-700">Gross: {fmt(grossEarnings)}</span>
                </div>
              </div>

              {/* Deductions */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Deductions</h2>
                {deductions.map((d, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input value={d.label} onChange={(ev) => updateDeduction(i, 'label', ev.target.value)} placeholder="Label" className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                    <input type="number" value={d.amount} onChange={(ev) => updateDeduction(i, 'amount', ev.target.value)} placeholder="0.00" min="0" step="0.01" className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                    <button type="button" onClick={() => removeDeduction(i)} className="text-gray-300 hover:text-red-400 text-xl">×</button>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-1">
                  <button type="button" onClick={addDeduction} className="text-xs font-semibold text-red-500 hover:text-red-700">+ Add Deduction</button>
                  <span className="text-sm font-bold text-red-600">Total: {fmt(totalDeductions)}</span>
                </div>
              </div>

              {/* Notes */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-2">
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Notes (optional)</h2>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="e.g. Payment made via EFT on 25 June 2026" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
              </div>

              <button
                onClick={handlePrint}
                disabled={generating}
                className="w-full py-3 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition shadow-sm disabled:opacity-60"
              >
                {generating ? 'Saving record...' : 'Generate Payslip (Print / PDF)'}
              </button>
            </div>

            {/* Live Preview */}
            <div className="hidden lg:block">
              <div className="sticky top-6">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Live Preview</p>
                <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm scale-90 origin-top-left" style={{ width: '111%' }}>
                  <PayslipDocument {...docProps} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── History Tab ── */}
        {pageTab === 'history' && (
          <div>
            {historyLoading ? (
              <div className="flex items-center gap-2 p-8">
                <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-gray-500">Loading history...</p>
              </div>
            ) : history.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-14 text-center">
                <p className="text-3xl mb-3">📄</p>
                <p className="text-sm font-semibold text-gray-700">No payslips generated yet</p>
                <p className="text-xs text-gray-400 mt-1">Generated payslips appear here. You can reprint any of them.</p>
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Employee</th>
                      <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Period</th>
                      <th className="text-right px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide hidden md:table-cell">Gross</th>
                      <th className="text-right px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Net Pay</th>
                      <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Generated</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {history.map((record) => (
                      <tr key={record.id} className="hover:bg-gray-50 transition">
                        <td className="px-5 py-3.5 font-semibold text-gray-900">{record.staffName || '-'}</td>
                        <td className="px-5 py-3.5 text-gray-600">{record.periodLabel}</td>
                        <td className="px-5 py-3.5 text-right text-gray-600 hidden md:table-cell">{fmt(record.grossEarnings)}</td>
                        <td className="px-5 py-3.5 text-right font-bold text-emerald-700">{fmt(record.netPay)}</td>
                        <td className="px-5 py-3.5 text-gray-400 text-xs hidden lg:table-cell">{tsToDate(record.createdAt)}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-3">
                            <button onClick={() => reprint(record)} className="text-xs font-semibold text-emerald-600 hover:text-emerald-800 transition">Reprint</button>
                            <button onClick={() => deleteRecord(record.id)} className="text-xs font-semibold text-gray-300 hover:text-red-500 transition">Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hidden print target */}
      <div id="payslip-print" className="hidden print:block bg-white">
        <PayslipDocument {...docProps} />
      </div>
    </>
  );
}

// ── PayslipDocument ────────────────────────────────────────────────────────────

type PayslipDocProps = {
  logoUrl: string; churchName: string; churchAddress: string;
  churchPhone: string; churchEmail: string; churchReg: string;
  periodLabel: string; empName: string; empIdNumber: string;
  empPosition: string; empTaxRef: string; empBank: string; empBankAcc: string;
  earnings: Earning[]; deductions: Deduction[];
  grossEarnings: number; totalDeductions: number; netPay: number;
  notes: string; fmt: (n: number) => string;
};

function PayslipDocument({
  logoUrl, churchName, churchAddress, churchPhone, churchEmail, churchReg,
  periodLabel, empName, empIdNumber, empPosition, empTaxRef, empBank, empBankAcc,
  earnings, deductions, grossEarnings, totalDeductions, netPay, notes, fmt,
}: PayslipDocProps) {
  const n = (s: string) => { const v = parseFloat(s); return isNaN(v) ? 0 : v; };
  return (
    <div className="bg-white p-8 font-sans text-gray-900 text-sm leading-relaxed min-h-[297mm]">
      <div className="flex items-start justify-between mb-6 pb-4 border-b-2 border-emerald-700">
        <div className="flex items-center gap-4">
          {logoUrl && <img src={logoUrl} alt="Logo" className="h-14 w-auto object-contain" />}
          <div>
            <h1 className="text-lg font-black text-emerald-800">{churchName || 'Church Name'}</h1>
            {churchAddress && <p className="text-xs text-gray-500 mt-0.5">{churchAddress}</p>}
            {(churchPhone || churchEmail) && <p className="text-xs text-gray-400">{[churchPhone, churchEmail].filter(Boolean).join(' | ')}</p>}
            {churchReg && <p className="text-xs text-gray-400">Reg: {churchReg}</p>}
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold text-emerald-700 uppercase tracking-widest">Pay Slip</p>
          <p className="text-xs text-gray-500 mt-1">Period: {periodLabel}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 mb-6 bg-gray-50 rounded-lg p-4">
        {([['Employee Name', empName], ['Position', empPosition], ['ID Number', empIdNumber], ['Tax Reference', empTaxRef], ['Bank', empBank], ['Account Number', empBankAcc]] as [string, string][])
          .filter(([, val]) => val)
          .map(([label, val]) => (
            <div key={label} className="flex gap-2">
              <span className="text-xs text-gray-400 font-semibold w-32 shrink-0">{label}:</span>
              <span className="text-xs text-gray-800 font-medium">{val}</span>
            </div>
          ))}
      </div>

      <table className="w-full mb-4 text-xs border-collapse">
        <thead>
          <tr className="bg-emerald-700 text-white">
            <th className="text-left px-3 py-2 font-semibold">Earnings</th>
            <th className="text-right px-3 py-2 font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {earnings.filter((e) => e.label || n(e.amount) > 0).map((e, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              <td className="px-3 py-1.5 text-gray-700">{e.label || 'Earning'}</td>
              <td className="px-3 py-1.5 text-right font-medium">{fmt(n(e.amount))}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-emerald-700 bg-emerald-50">
            <td className="px-3 py-2 font-bold text-emerald-800">Gross Earnings</td>
            <td className="px-3 py-2 text-right font-bold text-emerald-800">{fmt(grossEarnings)}</td>
          </tr>
        </tbody>
      </table>

      <table className="w-full mb-6 text-xs border-collapse">
        <thead>
          <tr className="bg-red-600 text-white">
            <th className="text-left px-3 py-2 font-semibold">Deductions</th>
            <th className="text-right px-3 py-2 font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {deductions.filter((d) => d.label || n(d.amount) > 0).map((d, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              <td className="px-3 py-1.5 text-gray-700">{d.label || 'Deduction'}</td>
              <td className="px-3 py-1.5 text-right font-medium">{fmt(n(d.amount))}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-red-600 bg-red-50">
            <td className="px-3 py-2 font-bold text-red-700">Total Deductions</td>
            <td className="px-3 py-2 text-right font-bold text-red-700">{fmt(totalDeductions)}</td>
          </tr>
        </tbody>
      </table>

      <div className="bg-emerald-700 text-white rounded-lg px-5 py-4 flex items-center justify-between mb-6">
        <span className="text-sm font-bold uppercase tracking-wide">Net Pay for {periodLabel}</span>
        <span className="text-2xl font-black">{fmt(netPay)}</span>
      </div>

      {notes && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-6">
          <p className="text-xs text-amber-800">{notes}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-12 mt-10">
        <div><div className="border-t border-gray-300 pt-2"><p className="text-xs text-gray-500">Authorised Signature</p></div></div>
        <div><div className="border-t border-gray-300 pt-2"><p className="text-xs text-gray-500">Employee Signature</p></div></div>
      </div>
      <p className="text-center text-xs text-gray-300 mt-10">Generated by {BRAND.productName}</p>
    </div>
  );
}
