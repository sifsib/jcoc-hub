'use client';

// hub: app/dashboard/finance/payslip/page.tsx
// Payslip generator — captures church + employee details and renders a
// print-ready payslip. Church logo is pulled from the tenant's branding doc.

import { useState, useEffect, useRef } from 'react';
import { db } from '../../../../lib/firebase';
import { useAppUser } from '../../../../lib/useAppUser';
import { doc, getDoc } from 'firebase/firestore';
import Link from 'next/link';

// ── Types ──────────────────────────────────────────────────────────────────────

type Earning = { label: string; amount: string };
type Deduction = { label: string; amount: string };

// ── Helpers ────────────────────────────────────────────────────────────────────

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const fmt = (n: number) =>
  `R ${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const toNum = (s: string) => {
  const n = parseFloat(s.replace(/[^0-9.]/g, ''));
  return isNaN(n) ? 0 : n;
};

const currentMonth = new Date().getMonth();
const currentYear = new Date().getFullYear();

// ── Component ──────────────────────────────────────────────────────────────────

export default function PayslipPage() {
  const { appUser, loading: userLoading } = useAppUser();

  // Church details (from tenant branding doc)
  const [logoUrl, setLogoUrl] = useState('');
  const [churchName, setChurchName] = useState('');
  const [churchAddress, setChurchAddress] = useState('');
  const [churchPhone, setChurchPhone] = useState('');
  const [churchEmail, setChurchEmail] = useState('');
  const [churchReg, setChurchReg] = useState('');

  // Pay period
  const [payMonth, setPayMonth] = useState(currentMonth);
  const [payYear, setPayYear] = useState(currentYear);

  // Employee details
  const [empName, setEmpName] = useState('');
  const [empIdNumber, setEmpIdNumber] = useState('');
  const [empPosition, setEmpPosition] = useState('');
  const [empTaxRef, setEmpTaxRef] = useState('');
  const [empBank, setEmpBank] = useState('');
  const [empBankAcc, setEmpBankAcc] = useState('');

  // Earnings rows
  const [earnings, setEarnings] = useState<Earning[]>([
    { label: 'Basic Salary', amount: '' },
    { label: 'Housing Allowance', amount: '' },
    { label: 'Transport Allowance', amount: '' },
  ]);

  // Deduction rows
  const [deductions, setDeductions] = useState<Deduction[]>([
    { label: 'PAYE', amount: '' },
    { label: 'UIF', amount: '' },
  ]);

  const [notes, setNotes] = useState('');
  const [preview, setPreview] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  // Load tenant branding
  useEffect(() => {
    if (!appUser?.tenantId) return;
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, 'tenants', appUser.tenantId));
        if (snap.exists()) {
          const d = snap.data();
          setLogoUrl(d.logoUrl || '');
          setChurchName(d.name || d.churchName || '');
          setChurchAddress(d.address || d.physicalAddress || '');
          setChurchPhone(d.phone || d.contactPhone || '');
          setChurchEmail(d.email || d.contactEmail || '');
          setChurchReg(d.registrationNumber || d.regNumber || '');
        }
      } catch (err) {
        console.error('Failed to load tenant details:', err);
      }
    };
    load();
  }, [appUser]);

  // ── Calculations ─────────────────────────────────────────────────────────────

  const grossEarnings = earnings.reduce((sum, e) => sum + toNum(e.amount), 0);
  const totalDeductions = deductions.reduce((sum, d) => sum + toNum(d.amount), 0);
  const netPay = grossEarnings - totalDeductions;

  // ── Earnings / Deduction row helpers ─────────────────────────────────────────

  const updateEarning = (i: number, field: keyof Earning, val: string) => {
    setEarnings((prev) => prev.map((e, idx) => idx === i ? { ...e, [field]: val } : e));
  };
  const addEarning = () => setEarnings((prev) => [...prev, { label: '', amount: '' }]);
  const removeEarning = (i: number) => setEarnings((prev) => prev.filter((_, idx) => idx !== i));

  const updateDeduction = (i: number, field: keyof Deduction, val: string) => {
    setDeductions((prev) => prev.map((d, idx) => idx === i ? { ...d, [field]: val } : d));
  };
  const addDeduction = () => setDeductions((prev) => [...prev, { label: '', amount: '' }]);
  const removeDeduction = (i: number) => setDeductions((prev) => prev.filter((_, idx) => idx !== i));

  // ── Print ─────────────────────────────────────────────────────────────────────

  const handlePrint = () => {
    setPreview(true);
    setTimeout(() => window.print(), 300);
  };

  if (userLoading) {
    return (
      <div className="p-10 flex items-center gap-2">
        <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  const periodLabel = `${MONTHS[payMonth]} ${payYear}`;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #payslip-print, #payslip-print * { visibility: visible !important; }
          #payslip-print { position: fixed; inset: 0; background: white; padding: 32px; }
          @page { size: A4 portrait; margin: 16mm; }
        }
      `}</style>

      <div className="p-6 max-w-4xl mx-auto">

        {/* Header */}
        <div className="mb-6 flex items-center gap-4">
          <Link href="/dashboard/finance" className="text-sm text-gray-400 hover:text-gray-700 transition">
            ← Finance
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Payslip Generator</h1>
            <p className="text-sm text-gray-500 mt-0.5">Fill in the details below, then print or save as PDF.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* ── Left: Form ── */}
          <div className="space-y-5">

            {/* Church Details */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Church Details</h2>
              <p className="text-xs text-gray-400">Pre-filled from your branding settings. Edit here if needed.</p>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Church Name</label>
                <input value={churchName} onChange={(e) => setChurchName(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Address</label>
                <input value={churchAddress} onChange={(e) => setChurchAddress(e.target.value)} placeholder="123 Church Street, Pretoria, 0001" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Phone</label>
                  <input value={churchPhone} onChange={(e) => setChurchPhone(e.target.value)} placeholder="012 000 0000" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Email</label>
                  <input value={churchEmail} onChange={(e) => setChurchEmail(e.target.value)} placeholder="admin@church.co.za" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
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
                  <input value={empIdNumber} onChange={(e) => setEmpIdNumber(e.target.value)} placeholder="8001010000000" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Position / Role</label>
                  <input value={empPosition} onChange={(e) => setEmpPosition(e.target.value)} placeholder="Church Administrator" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Tax Reference (optional)</label>
                  <input value={empTaxRef} onChange={(e) => setEmpTaxRef(e.target.value)} placeholder="1234567890" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Bank Name</label>
                  <input value={empBank} onChange={(e) => setEmpBank(e.target.value)} placeholder="FNB" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Account Number</label>
                  <input value={empBankAcc} onChange={(e) => setEmpBankAcc(e.target.value)} placeholder="123 456 7890" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
              </div>
            </div>

            {/* Earnings */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Earnings</h2>
              {earnings.map((e, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    value={e.label}
                    onChange={(ev) => updateEarning(i, 'label', ev.target.value)}
                    placeholder="Earning label"
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <input
                    type="number"
                    value={e.amount}
                    onChange={(ev) => updateEarning(i, 'amount', ev.target.value)}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => removeEarning(i)}
                    className="text-gray-300 hover:text-red-400 transition text-lg leading-none"
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              ))}
              <div className="flex items-center justify-between pt-1">
                <button type="button" onClick={addEarning} className="text-xs font-semibold text-emerald-600 hover:text-emerald-800 transition">
                  + Add Earning
                </button>
                <span className="text-sm font-bold text-gray-700">Gross: {fmt(grossEarnings)}</span>
              </div>
            </div>

            {/* Deductions */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Deductions</h2>
              {deductions.map((d, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    value={d.label}
                    onChange={(ev) => updateDeduction(i, 'label', ev.target.value)}
                    placeholder="Deduction label"
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <input
                    type="number"
                    value={d.amount}
                    onChange={(ev) => updateDeduction(i, 'amount', ev.target.value)}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => removeDeduction(i)}
                    className="text-gray-300 hover:text-red-400 transition text-lg leading-none"
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              ))}
              <div className="flex items-center justify-between pt-1">
                <button type="button" onClick={addDeduction} className="text-xs font-semibold text-red-500 hover:text-red-700 transition">
                  + Add Deduction
                </button>
                <span className="text-sm font-bold text-red-600">Total Deductions: {fmt(totalDeductions)}</span>
              </div>
            </div>

            {/* Notes */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-2">
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Notes (optional)</h2>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="e.g. Payment made via EFT on 25 June 2026"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
              />
            </div>

            <button
              onClick={handlePrint}
              className="w-full py-3 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition shadow-sm"
            >
              Print / Save as PDF
            </button>
          </div>

          {/* ── Right: Live Preview ── */}
          <div className="hidden lg:block">
            <div className="sticky top-6">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Live Preview</p>
              <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm scale-90 origin-top-left" style={{ width: '111%' }}>
                <PayslipDocument
                  logoUrl={logoUrl}
                  churchName={churchName}
                  churchAddress={churchAddress}
                  churchPhone={churchPhone}
                  churchEmail={churchEmail}
                  churchReg={churchReg}
                  periodLabel={periodLabel}
                  empName={empName}
                  empIdNumber={empIdNumber}
                  empPosition={empPosition}
                  empTaxRef={empTaxRef}
                  empBank={empBank}
                  empBankAcc={empBankAcc}
                  earnings={earnings}
                  deductions={deductions}
                  grossEarnings={grossEarnings}
                  totalDeductions={totalDeductions}
                  netPay={netPay}
                  notes={notes}
                  fmt={fmt}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden print target */}
      <div id="payslip-print" className="hidden print:block bg-white">
        <PayslipDocument
          logoUrl={logoUrl}
          churchName={churchName}
          churchAddress={churchAddress}
          churchPhone={churchPhone}
          churchEmail={churchEmail}
          churchReg={churchReg}
          periodLabel={periodLabel}
          empName={empName}
          empIdNumber={empIdNumber}
          empPosition={empPosition}
          empTaxRef={empTaxRef}
          empBank={empBank}
          empBankAcc={empBankAcc}
          earnings={earnings}
          deductions={deductions}
          grossEarnings={grossEarnings}
          totalDeductions={totalDeductions}
          netPay={netPay}
          notes={notes}
          fmt={fmt}
        />
      </div>
    </>
  );
}

// ── PayslipDocument — shared between preview and print ─────────────────────────

function PayslipDocument({
  logoUrl, churchName, churchAddress, churchPhone, churchEmail, churchReg,
  periodLabel, empName, empIdNumber, empPosition, empTaxRef, empBank, empBankAcc,
  earnings, deductions, grossEarnings, totalDeductions, netPay, notes, fmt,
}: {
  logoUrl: string; churchName: string; churchAddress: string;
  churchPhone: string; churchEmail: string; churchReg: string;
  periodLabel: string; empName: string; empIdNumber: string;
  empPosition: string; empTaxRef: string; empBank: string; empBankAcc: string;
  earnings: { label: string; amount: string }[];
  deductions: { label: string; amount: string }[];
  grossEarnings: number; totalDeductions: number; netPay: number;
  notes: string; fmt: (n: number) => string;
}) {
  const toNum = (s: string) => { const n = parseFloat(s); return isNaN(n) ? 0 : n; };

  return (
    <div className="bg-white p-8 font-sans text-gray-900 text-sm leading-relaxed min-h-[297mm]">

      {/* Header */}
      <div className="flex items-start justify-between mb-6 pb-4 border-b-2 border-emerald-700">
        <div className="flex items-center gap-4">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Church logo" className="h-14 w-auto object-contain" />
          )}
          <div>
            <h1 className="text-lg font-black text-emerald-800">{churchName || 'Church Name'}</h1>
            {churchAddress && <p className="text-xs text-gray-500 mt-0.5">{churchAddress}</p>}
            {(churchPhone || churchEmail) && (
              <p className="text-xs text-gray-400">
                {[churchPhone, churchEmail].filter(Boolean).join(' | ')}
              </p>
            )}
            {churchReg && <p className="text-xs text-gray-400">Reg: {churchReg}</p>}
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold text-emerald-700 uppercase tracking-widest">Pay Slip</p>
          <p className="text-xs text-gray-500 mt-1">Period: {periodLabel}</p>
        </div>
      </div>

      {/* Employee info grid */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 mb-6 bg-gray-50 rounded-lg p-4">
        {[
          ['Employee Name', empName],
          ['Position', empPosition],
          ['ID Number', empIdNumber],
          ['Tax Reference', empTaxRef],
          ['Bank', empBank],
          ['Account Number', empBankAcc],
        ].map(([label, val]) => val ? (
          <div key={label} className="flex gap-2">
            <span className="text-xs text-gray-400 font-semibold w-32 shrink-0">{label}:</span>
            <span className="text-xs text-gray-800 font-medium">{val}</span>
          </div>
        ) : null)}
      </div>

      {/* Earnings table */}
      <table className="w-full mb-4 text-xs border-collapse">
        <thead>
          <tr className="bg-emerald-700 text-white">
            <th className="text-left px-3 py-2 font-semibold rounded-tl-md">Earnings</th>
            <th className="text-right px-3 py-2 font-semibold rounded-tr-md">Amount</th>
          </tr>
        </thead>
        <tbody>
          {earnings.filter(e => e.label || toNum(e.amount) > 0).map((e, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              <td className="px-3 py-1.5 text-gray-700">{e.label || 'Earning'}</td>
              <td className="px-3 py-1.5 text-right text-gray-800 font-medium">{fmt(toNum(e.amount))}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-emerald-700 bg-emerald-50">
            <td className="px-3 py-2 font-bold text-emerald-800">Gross Earnings</td>
            <td className="px-3 py-2 text-right font-bold text-emerald-800">{fmt(grossEarnings)}</td>
          </tr>
        </tbody>
      </table>

      {/* Deductions table */}
      <table className="w-full mb-6 text-xs border-collapse">
        <thead>
          <tr className="bg-red-600 text-white">
            <th className="text-left px-3 py-2 font-semibold rounded-tl-md">Deductions</th>
            <th className="text-right px-3 py-2 font-semibold rounded-tr-md">Amount</th>
          </tr>
        </thead>
        <tbody>
          {deductions.filter(d => d.label || toNum(d.amount) > 0).map((d, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              <td className="px-3 py-1.5 text-gray-700">{d.label || 'Deduction'}</td>
              <td className="px-3 py-1.5 text-right text-gray-800 font-medium">{fmt(toNum(d.amount))}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-red-600 bg-red-50">
            <td className="px-3 py-2 font-bold text-red-700">Total Deductions</td>
            <td className="px-3 py-2 text-right font-bold text-red-700">{fmt(totalDeductions)}</td>
          </tr>
        </tbody>
      </table>

      {/* Net Pay */}
      <div className="bg-emerald-700 text-white rounded-lg px-5 py-4 flex items-center justify-between mb-6">
        <span className="text-sm font-bold uppercase tracking-wide">Net Pay for {periodLabel}</span>
        <span className="text-2xl font-black">{fmt(netPay)}</span>
      </div>

      {/* Notes */}
      {notes && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-6">
          <p className="text-xs text-amber-800">{notes}</p>
        </div>
      )}

      {/* Signatures */}
      <div className="grid grid-cols-2 gap-12 mt-10">
        <div>
          <div className="border-t border-gray-300 pt-2">
            <p className="text-xs text-gray-500">Authorised Signature</p>
          </div>
        </div>
        <div>
          <div className="border-t border-gray-300 pt-2">
            <p className="text-xs text-gray-500">Employee Signature</p>
          </div>
        </div>
      </div>

      <p className="text-center text-xs text-gray-300 mt-10">Generated by Kereke Hub</p>
    </div>
  );
}
