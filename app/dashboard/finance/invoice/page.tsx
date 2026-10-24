'use client';

// hub: app/dashboard/finance/invoice/page.tsx
// Invoice generator — v2:
//   "Save for next time" persists church + bank details to tenant doc
//   History tab with paid/unpaid status toggle and reprint

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

type LineItem = { description: string; qty: string; rate: string };
type InvoiceStatus = 'unpaid' | 'paid';
type PageTab = 'generate' | 'history';

type InvoiceSnapshot = {
  churchName: string; churchAddress: string; churchPhone: string; churchEmail: string;
  bankName: string; bankAcc: string; bankBranch: string; bankRef: string;
  invoiceNumber: string; invoiceDate: string; dueDate: string; vatRate: string;
  clientName: string; clientAddress: string; clientEmail: string; clientRef: string;
  items: LineItem[]; subtotal: number; vatAmount: number; total: number; notes: string;
};

type InvoiceRecord = {
  id: string;
  invoiceNumber: string;
  clientName: string;
  total: number;
  status: InvoiceStatus;
  invoiceDate: string;
  createdAt: unknown;
  snapshot: InvoiceSnapshot;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  `R ${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const toNum = (s: string) => {
  const n = parseFloat(String(s).replace(/[^0-9.]/g, ''));
  return isNaN(n) ? 0 : n;
};

const todayStr = () => new Date().toISOString().split('T')[0];

const fmtDate = (s: string) => {
  if (!s) return '';
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });
};

const tsToDate = (val: unknown): string => {
  if (!val) return '-';
  if (typeof val === 'object' && val !== null && 'toDate' in val) {
    return (val as { toDate: () => Date }).toDate()
      .toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  return '-';
};

const genNumber = () => {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const rand = String(Math.floor(Math.random() * 900) + 100);
  return `INV-${yy}${mm}-${rand}`;
};

// ── Component ──────────────────────────────────────────────────────────────────

export default function InvoicePage() {
  const { appUser, loading: userLoading } = useAppUser();
  const [pageTab, setPageTab] = useState<PageTab>('generate');

  // Church / sender
  const [logoUrl, setLogoUrl] = useState('');
  const [churchName, setChurchName] = useState('');
  const [churchAddress, setChurchAddress] = useState('');
  const [churchPhone, setChurchPhone] = useState('');
  const [churchEmail, setChurchEmail] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAcc, setBankAcc] = useState('');
  const [bankBranch, setBankBranch] = useState('');
  const [bankRef, setBankRef] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsSaved, setDetailsSaved] = useState(false);

  // Invoice meta
  const [invoiceNumber, setInvoiceNumber] = useState(genNumber);
  const [invoiceDate, setInvoiceDate] = useState(todayStr);
  const [dueDate, setDueDate] = useState('');
  const [vatRate, setVatRate] = useState('');

  // Bill to
  const [clientName, setClientName] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientRef, setClientRef] = useState('');

  // Line items
  const [items, setItems] = useState<LineItem[]>([{ description: '', qty: '1', rate: '' }]);
  const [notes, setNotes] = useState('');

  // History
  const [history, setHistory] = useState<InvoiceRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  // ── Load tenant ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!appUser?.tenantId) return;
    getDoc(doc(db, 'tenants', appUser.tenantId)).then((snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      setLogoUrl(d.logoUrl || '');
      setChurchName(d.name || d.churchName || '');
      setChurchAddress(d.address || d.physicalAddress || '');
      setChurchPhone(d.phone || d.contactPhone || '');
      setChurchEmail(d.email || d.contactEmail || '');
      setBankName(d.bankName || '');
      setBankAcc(d.bankAccount || '');
      setBankBranch(d.bankBranch || '');
    }).catch(console.error);
  }, [appUser]);

  // ── Load history ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (pageTab !== 'history' || !appUser?.tenantId) return;
    setHistoryLoading(true);
    getDocs(
      query(
        collection(db, 'invoice_records'),
        where('tenantId', '==', appUser.tenantId),
        orderBy('createdAt', 'desc'),
      ),
    ).then((snap) => {
      setHistory(snap.docs.map((d) => ({ id: d.id, ...d.data() } as InvoiceRecord)));
    }).catch(console.error)
      .finally(() => setHistoryLoading(false));
  }, [pageTab, appUser]);

  // ── Save church + bank details ────────────────────────────────────────────────

  const saveDetails = async () => {
    if (!appUser?.tenantId) return;
    setSavingDetails(true);
    try {
      await updateDoc(doc(db, 'tenants', appUser.tenantId), {
        address: churchAddress,
        phone: churchPhone,
        email: churchEmail,
        bankName,
        bankAccount: bankAcc,
        bankBranch,
      });
      setDetailsSaved(true);
      setTimeout(() => setDetailsSaved(false), 3000);
    } catch (err) {
      console.error('Failed to save details:', err);
    } finally {
      setSavingDetails(false);
    }
  };

  // ── Calculations ──────────────────────────────────────────────────────────────

  const subtotal = items.reduce((s, i) => s + toNum(i.qty) * toNum(i.rate), 0);
  const vatAmount = vatRate ? subtotal * (toNum(vatRate) / 100) : 0;
  const total = subtotal + vatAmount;

  // Line item helpers
  const updateItem = (i: number, f: keyof LineItem, v: string) =>
    setItems((p) => p.map((item, idx) => idx === i ? { ...item, [f]: v } : item));
  const addItem = () => setItems((p) => [...p, { description: '', qty: '1', rate: '' }]);
  const removeItem = (i: number) => setItems((p) => p.filter((_, idx) => idx !== i));

  // ── Generate + save record ────────────────────────────────────────────────────

  const handlePrint = async () => {
    if (!appUser?.tenantId) return;
    setGenerating(true);
    try {
      const snapshot: InvoiceSnapshot = {
        churchName, churchAddress, churchPhone, churchEmail,
        bankName, bankAcc, bankBranch, bankRef,
        invoiceNumber, invoiceDate, dueDate, vatRate,
        clientName, clientAddress, clientEmail, clientRef,
        items: items.map((i) => ({ ...i })),
        subtotal, vatAmount, total, notes,
      };
      await addDoc(collection(db, 'invoice_records'), {
        tenantId: appUser.tenantId,
        invoiceNumber,
        clientName,
        total,
        status: 'unpaid' as InvoiceStatus,
        invoiceDate,
        snapshot,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('Failed to save invoice record:', err);
    } finally {
      setGenerating(false);
      window.print();
    }
  };

  // ── Reprint from history ──────────────────────────────────────────────────────

  const reprint = (record: InvoiceRecord) => {
    const s = record.snapshot;
    setChurchName(s.churchName); setChurchAddress(s.churchAddress);
    setChurchPhone(s.churchPhone); setChurchEmail(s.churchEmail);
    setBankName(s.bankName); setBankAcc(s.bankAcc); setBankBranch(s.bankBranch); setBankRef(s.bankRef);
    setInvoiceNumber(s.invoiceNumber); setInvoiceDate(s.invoiceDate); setDueDate(s.dueDate); setVatRate(s.vatRate);
    setClientName(s.clientName); setClientAddress(s.clientAddress); setClientEmail(s.clientEmail); setClientRef(s.clientRef);
    setItems(s.items.map((i) => ({ ...i })));
    setNotes(s.notes);
    setPageTab('generate');
  };

  const toggleStatus = async (record: InvoiceRecord) => {
    const next: InvoiceStatus = record.status === 'paid' ? 'unpaid' : 'paid';
    try {
      await updateDoc(doc(db, 'invoice_records', record.id), { status: next });
      setHistory((prev) => prev.map((r) => r.id === record.id ? { ...r, status: next } : r));
    } catch (err) { console.error(err); }
  };

  const deleteRecord = async (id: string) => {
    if (!confirm('Delete this invoice record?')) return;
    try {
      await deleteDoc(doc(db, 'invoice_records', id));
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

  const docProps = {
    logoUrl, churchName, churchAddress, churchPhone, churchEmail,
    bankName, bankAcc, bankBranch, bankRef: bankRef || invoiceNumber,
    invoiceNumber, invoiceDate, dueDate, vatRate,
    clientName, clientAddress, clientEmail, clientRef,
    items, subtotal, vatAmount, total, notes, fmt, fmtDate,
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #invoice-print, #invoice-print * { visibility: visible !important; }
          #invoice-print { position: fixed; inset: 0; background: white; padding: 32px; }
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
            <h1 className="text-2xl font-bold text-gray-900">Invoice Generator</h1>
            <p className="text-sm text-gray-500 mt-0.5">Create and print a professional invoice for any service your church provides.</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-end gap-1 mb-6 border-b border-gray-200">
          {(['generate', 'history'] as PageTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setPageTab(t)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition ${
                t === pageTab
                  ? 'bg-white border border-b-white border-gray-200 text-emerald-700 -mb-px'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'generate' ? 'Generate' : `History (${history.length || ''})`}
            </button>
          ))}
        </div>

        {/* ── Generate Tab ── */}
        {pageTab === 'generate' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-5">

              {/* Church Details */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Your Church (From)</h2>
                  <button
                    onClick={saveDetails}
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
                  <input value={churchAddress} onChange={(e) => setChurchAddress(e.target.value)} placeholder="123 Church St, Pretoria" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
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
              </div>

              {/* Invoice Meta */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Invoice Details</h2>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Invoice Number</label>
                    <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">VAT % (blank = no VAT)</label>
                    <input type="number" value={vatRate} onChange={(e) => setVatRate(e.target.value)} min="0" max="100" step="0.01" placeholder="e.g. 15" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Invoice Date</label>
                    <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Due Date (optional)</label>
                    <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                </div>
              </div>

              {/* Bill To */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Bill To (Client)</h2>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Name / Organisation</label>
                  <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="John Mokoena" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Address (optional)</label>
                  <input value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Email (optional)</label>
                    <input value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">PO / Ref (optional)</label>
                    <input value={clientRef} onChange={(e) => setClientRef(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                </div>
              </div>

              {/* Line Items */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Services / Line Items</h2>
                <div className="grid grid-cols-12 gap-2 text-xs font-bold text-gray-400 uppercase tracking-wide">
                  <div className="col-span-6">Description</div>
                  <div className="col-span-2 text-center">Qty</div>
                  <div className="col-span-3 text-right">Rate (R)</div>
                  <div className="col-span-1" />
                </div>
                {items.map((item, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <input value={item.description} onChange={(e) => updateItem(i, 'description', e.target.value)} placeholder="Service description" className="col-span-6 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                    <input type="number" value={item.qty} onChange={(e) => updateItem(i, 'qty', e.target.value)} min="0" step="1" className="col-span-2 border border-gray-300 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                    <input type="number" value={item.rate} onChange={(e) => updateItem(i, 'rate', e.target.value)} min="0" step="0.01" placeholder="0.00" className="col-span-3 border border-gray-300 rounded-lg px-2 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                    <button type="button" onClick={() => removeItem(i)} className="col-span-1 text-gray-300 hover:text-red-400 text-xl text-center">×</button>
                  </div>
                ))}
                <button type="button" onClick={addItem} className="text-xs font-semibold text-emerald-600 hover:text-emerald-800 transition">
                  + Add Line Item
                </button>
                <div className="border-t border-gray-100 pt-3 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Subtotal</span>
                    <span className="font-medium text-gray-800">{fmt(subtotal)}</span>
                  </div>
                  {vatRate && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">VAT ({vatRate}%)</span>
                      <span className="font-medium text-gray-800">{fmt(vatAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-bold">
                    <span className="text-gray-900">Total</span>
                    <span className="text-emerald-700">{fmt(total)}</span>
                  </div>
                </div>
              </div>

              {/* Banking Details */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Banking Details</h2>
                <p className="text-xs text-gray-400">Saved together with church details when you click "Save for next time" above.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Bank Name</label>
                    <input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="FNB" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Account Number</label>
                    <input value={bankAcc} onChange={(e) => setBankAcc(e.target.value)} placeholder="123 456 7890" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Branch Code</label>
                    <input value={bankBranch} onChange={(e) => setBankBranch(e.target.value)} placeholder="250655" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Payment Reference</label>
                    <input value={bankRef} onChange={(e) => setBankRef(e.target.value)} placeholder={invoiceNumber} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-2">
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Notes / Terms (optional)</h2>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="e.g. Payment due within 30 days. Thank you for your support." className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setInvoiceNumber(genNumber())}
                  className="flex-none px-4 py-3 rounded-xl text-sm font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 transition"
                  title="Generate a new invoice number"
                >
                  New #
                </button>
                <button
                  onClick={handlePrint}
                  disabled={generating}
                  className="flex-1 py-3 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition shadow-sm disabled:opacity-60"
                >
                  {generating ? 'Saving record...' : 'Generate Invoice (Print / PDF)'}
                </button>
              </div>
            </div>

            {/* Live Preview */}
            <div className="hidden lg:block">
              <div className="sticky top-6">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Live Preview</p>
                <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm scale-90 origin-top-left" style={{ width: '111%' }}>
                  <InvoiceDocument {...docProps} />
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
                <p className="text-3xl mb-3">🧾</p>
                <p className="text-sm font-semibold text-gray-700">No invoices generated yet</p>
                <p className="text-xs text-gray-400 mt-1">Generated invoices appear here. Track payments and reprint anytime.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Summary */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { label: 'Total Invoiced', val: fmt(history.reduce((s, r) => s + r.total, 0)), color: 'text-gray-900' },
                    { label: 'Paid', val: fmt(history.filter(r => r.status === 'paid').reduce((s, r) => s + r.total, 0)), color: 'text-emerald-700' },
                    { label: 'Outstanding', val: fmt(history.filter(r => r.status === 'unpaid').reduce((s, r) => s + r.total, 0)), color: 'text-amber-600' },
                  ].map((item) => (
                    <div key={item.label} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                      <p className="text-xs text-gray-500">{item.label}</p>
                      <p className={`text-lg font-bold ${item.color}`}>{item.val}</p>
                    </div>
                  ))}
                </div>

                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Invoice</th>
                        <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Client</th>
                        <th className="text-right px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Total</th>
                        <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Status</th>
                        <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Created</th>
                        <th className="px-5 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {history.map((record) => (
                        <tr key={record.id} className="hover:bg-gray-50 transition">
                          <td className="px-5 py-3.5">
                            <p className="font-mono text-xs font-semibold text-gray-700">{record.invoiceNumber}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{fmtDate(record.invoiceDate)}</p>
                          </td>
                          <td className="px-5 py-3.5 font-medium text-gray-900">{record.clientName || '-'}</td>
                          <td className="px-5 py-3.5 text-right font-bold text-gray-800">{fmt(record.total)}</td>
                          <td className="px-5 py-3.5">
                            <button
                              onClick={() => toggleStatus(record)}
                              className={`text-xs font-bold px-2.5 py-1 rounded-full border transition ${
                                record.status === 'paid'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                  : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                              }`}
                            >
                              {record.status === 'paid' ? 'Paid' : 'Unpaid'}
                            </button>
                          </td>
                          <td className="px-5 py-3.5 text-gray-400 text-xs hidden lg:table-cell">
                            {tsToDate(record.createdAt)}
                          </td>
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
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hidden print target */}
      <div id="invoice-print" className="hidden print:block bg-white">
        <InvoiceDocument {...docProps} />
      </div>
    </>
  );
}

// ── InvoiceDocument ────────────────────────────────────────────────────────────

type InvoiceDocProps = {
  logoUrl: string; churchName: string; churchAddress: string;
  churchPhone: string; churchEmail: string;
  bankName: string; bankAcc: string; bankBranch: string; bankRef: string;
  invoiceNumber: string; invoiceDate: string; dueDate: string; vatRate: string;
  clientName: string; clientAddress: string; clientEmail: string; clientRef: string;
  items: LineItem[]; subtotal: number; vatAmount: number; total: number;
  notes: string; fmt: (n: number) => string; fmtDate: (s: string) => string;
};

function InvoiceDocument({
  logoUrl, churchName, churchAddress, churchPhone, churchEmail,
  bankName, bankAcc, bankBranch, bankRef,
  invoiceNumber, invoiceDate, dueDate, vatRate,
  clientName, clientAddress, clientEmail, clientRef,
  items, subtotal, vatAmount, total, notes, fmt, fmtDate,
}: InvoiceDocProps) {
  const n = (s: string) => { const v = parseFloat(s); return isNaN(v) ? 0 : v; };

  return (
    <div className="bg-white p-8 font-sans text-gray-900 text-sm leading-relaxed min-h-[297mm]">
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-4">
          {logoUrl && <img src={logoUrl} alt="Logo" className="h-14 w-auto object-contain" />}
          <div>
            <h1 className="text-lg font-black text-emerald-800">{churchName || 'Church Name'}</h1>
            {churchAddress && <p className="text-xs text-gray-500 mt-0.5">{churchAddress}</p>}
            {(churchPhone || churchEmail) && <p className="text-xs text-gray-400">{[churchPhone, churchEmail].filter(Boolean).join(' | ')}</p>}
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-black text-emerald-700 uppercase tracking-widest">Invoice</p>
          <p className="text-xs font-mono text-gray-500 mt-1">{invoiceNumber}</p>
          <p className="text-xs text-gray-400 mt-0.5">Date: {fmtDate(invoiceDate)}</p>
          {dueDate && <p className="text-xs text-red-500 font-semibold mt-0.5">Due: {fmtDate(dueDate)}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8 mb-8">
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Bill To</p>
          <p className="font-semibold text-gray-900">{clientName || 'Client Name'}</p>
          {clientAddress && <p className="text-xs text-gray-500 mt-0.5">{clientAddress}</p>}
          {clientEmail && <p className="text-xs text-gray-400">{clientEmail}</p>}
          {clientRef && <p className="text-xs text-gray-400 mt-1">Ref: {clientRef}</p>}
        </div>
        {(bankName || bankAcc) && (
          <div className="bg-emerald-50 rounded-lg p-4">
            <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-2">Payment Details</p>
            {bankName && <p className="text-xs text-gray-700"><span className="font-semibold">Bank:</span> {bankName}</p>}
            {bankAcc && <p className="text-xs text-gray-700"><span className="font-semibold">Account:</span> {bankAcc}</p>}
            {bankBranch && <p className="text-xs text-gray-700"><span className="font-semibold">Branch:</span> {bankBranch}</p>}
            {bankRef && <p className="text-xs text-gray-700"><span className="font-semibold">Reference:</span> {bankRef}</p>}
          </div>
        )}
      </div>

      <table className="w-full mb-6 text-xs border-collapse">
        <thead>
          <tr className="bg-emerald-700 text-white">
            <th className="text-left px-3 py-2.5 font-semibold">Description</th>
            <th className="text-center px-3 py-2.5 font-semibold w-16">Qty</th>
            <th className="text-right px-3 py-2.5 font-semibold w-28">Unit Price</th>
            <th className="text-right px-3 py-2.5 font-semibold w-28">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.filter((i) => i.description || n(i.rate) > 0).map((item, i) => {
            const lineTotal = n(item.qty) * n(item.rate);
            return (
              <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-3 py-2 text-gray-700">{item.description || 'Service'}</td>
                <td className="px-3 py-2 text-center text-gray-600">{item.qty}</td>
                <td className="px-3 py-2 text-right text-gray-600">{fmt(n(item.rate))}</td>
                <td className="px-3 py-2 text-right font-medium text-gray-800">{fmt(lineTotal)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="flex justify-end mb-6">
        <div className="w-64 space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Subtotal</span>
            <span className="text-gray-800 font-medium">{fmt(subtotal)}</span>
          </div>
          {vatRate && (
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">VAT ({vatRate}%)</span>
              <span className="text-gray-800 font-medium">{fmt(vatAmount)}</span>
            </div>
          )}
          <div className="border-t border-emerald-700 pt-2 flex justify-between">
            <span className="font-bold text-gray-900">Total Due</span>
            <span className="font-black text-lg text-emerald-700">{fmt(total)}</span>
          </div>
        </div>
      </div>

      {notes && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-6">
          <p className="text-xs font-bold text-amber-700 mb-1">Notes</p>
          <p className="text-xs text-amber-800">{notes}</p>
        </div>
      )}
      <p className="text-center text-xs text-gray-300 mt-10">Generated by {BRAND.productName}</p>
    </div>
  );
}
