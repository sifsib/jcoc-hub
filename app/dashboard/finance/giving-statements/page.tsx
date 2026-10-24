'use client';

// hub: app/dashboard/finance/giving-statements/page.tsx
//
// Annual Giving Statements — loads all income transactions linked to a
// member (memberId present) for the selected year, groups them by member,
// and generates a printable per-member statement via window.print().

import { useState, useEffect } from 'react';
import { db } from '../../../../lib/firebase';
import { useAppUser } from '../../../../lib/useAppUser';
import {
  collection, getDocs, query, where, orderBy, doc, getDoc,
} from 'firebase/firestore';
import Link from 'next/link';
import { BRAND } from "../../../../lib/whiteLabel";

// --- Types ---

type Transaction = {
  id: string;
  memberId: string;
  memberName: string;
  date: string;
  amount: number;
  category: string;
  description: string;
  otherDescription?: string;
};

type GiverSummary = {
  memberId: string;
  memberName: string;
  transactions: Transaction[];
  total: number;
  byCategory: Record<string, number>;
};

// --- Helpers ---

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const currentYear = new Date().getFullYear();

const fmt = (n: number) =>
  `R ${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (s: string) => {
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
};

// --- Page ---

export default function GivingStatementsPage() {
  const { appUser, loading: userLoading } = useAppUser();

  // Church details from tenant doc
  const [logoUrl, setLogoUrl] = useState('');
  const [churchName, setChurchName] = useState('');
  const [churchAddress, setChurchAddress] = useState('');
  const [churchPhone, setChurchPhone] = useState('');
  const [churchEmail, setChurchEmail] = useState('');
  const [churchReg, setChurchReg] = useState('');

  const [year, setYear] = useState(currentYear);
  const [givers, setGivers] = useState<GiverSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [printGiver, setPrintGiver] = useState<GiverSummary | null>(null);

  // Load tenant details (for statement header)
  useEffect(() => {
    if (!appUser?.tenantId) return;
    getDoc(doc(db, 'tenants', appUser.tenantId)).then(snap => {
      if (!snap.exists()) return;
      const d = snap.data();
      setLogoUrl(d.logoUrl || '');
      setChurchName(d.name || d.churchName || '');
      setChurchAddress(d.address || d.physicalAddress || '');
      setChurchPhone(d.phone || d.contactPhone || '');
      setChurchEmail(d.email || d.contactEmail || '');
      setChurchReg(d.registrationNumber || d.regNumber || '');
    }).catch(console.error);
  }, [appUser]);

  // Load transactions and group by member
  const loadGivers = async () => {
    if (!appUser?.tenantId) return;
    setLoading(true);
    try {
      const snap = await getDocs(
        query(
          collection(db, 'transactions'),
          where('tenantId', '==', appUser.tenantId),
          where('type', '==', 'income'),
          orderBy('date', 'asc'),
        )
      );

      const txs = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Transaction))
        .filter(tx => {
          const txYear = new Date(tx.date).getFullYear();
          return txYear === year && !!tx.memberId;
        });

      const map: Record<string, GiverSummary> = {};
      txs.forEach(tx => {
        if (!map[tx.memberId]) {
          map[tx.memberId] = {
            memberId: tx.memberId,
            memberName: tx.memberName || 'Unknown Member',
            transactions: [],
            total: 0,
            byCategory: {},
          };
        }
        map[tx.memberId].transactions.push(tx);
        map[tx.memberId].total += tx.amount;
        const cat = tx.category || 'Other';
        map[tx.memberId].byCategory[cat] = (map[tx.memberId].byCategory[cat] || 0) + tx.amount;
      });

      setGivers(Object.values(map).sort((a, b) => b.total - a.total));
    } catch (err) {
      console.error('Failed to load giving data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (appUser?.tenantId) loadGivers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appUser, year]);

  const handlePrint = (giver: GiverSummary) => {
    setPrintGiver(giver);
    setTimeout(() => window.print(), 150);
  };

  const filteredGivers = givers.filter(g =>
    !search || g.memberName.toLowerCase().includes(search.toLowerCase())
  );

  const totalForYear = givers.reduce((s, g) => s + g.total, 0);

  if (userLoading) return (
    <div className="p-10 flex items-center gap-2">
      <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      <p className="text-gray-600">Loading...</p>
    </div>
  );

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #statement-print, #statement-print * { visibility: visible !important; }
          #statement-print { position: fixed; inset: 0; background: white; padding: 0; }
          @page { size: A4 portrait; margin: 15mm; }
        }
      `}</style>

      <div className="p-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center gap-4">
          <Link href="/dashboard/finance" className="text-sm text-gray-400 hover:text-gray-700 transition">
            Back to Finance
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Annual Giving Statements</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Per-member giving summaries for tax records.
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-end gap-3 mb-5">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Year</label>
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {[currentYear - 2, currentYear - 1, currentYear].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-40">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Search member</label>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Type a name..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Summary cards */}
        {givers.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500">Total Givers</p>
              <p className="text-2xl font-bold text-gray-900">{givers.length}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500">Total Received ({year})</p>
              <p className="text-2xl font-bold text-emerald-700">{fmt(totalForYear)}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4 hidden sm:block">
              <p className="text-xs text-gray-500">Avg Per Giver</p>
              <p className="text-2xl font-bold text-gray-700">
                {fmt(givers.length > 0 ? totalForYear / givers.length : 0)}
              </p>
            </div>
          </div>
        )}

        {/* Note */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-5">
          <p className="text-xs text-blue-800">
            Only income transactions linked to a member appear here. To link a contribution to a member, use the Member field when recording income in the Finance tab.
          </p>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center gap-2 p-8">
            <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-500">Loading...</p>
          </div>
        ) : filteredGivers.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
            <p className="text-3xl mb-3">📋</p>
            <p className="text-sm font-semibold text-gray-700">
              {givers.length === 0
                ? `No linked giving records for ${year}`
                : 'No members match your search'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Link income transactions to members when recording them in Finance.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Member</th>
                  <th className="text-right px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide hidden md:table-cell">Transactions</th>
                  <th className="text-right px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Total Given</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredGivers.map(giver => (
                  <tr key={giver.memberId} className="hover:bg-gray-50 transition">
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-gray-900">{giver.memberName}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {Object.keys(giver.byCategory).join(' · ')}
                      </p>
                    </td>
                    <td className="px-5 py-3.5 text-right text-gray-500 hidden md:table-cell">
                      {giver.transactions.length}
                    </td>
                    <td className="px-5 py-3.5 text-right font-bold text-emerald-700">
                      {fmt(giver.total)}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => handlePrint(giver)}
                        className="text-xs font-semibold text-emerald-600 hover:text-emerald-800 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition"
                      >
                        Print Statement
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Hidden print target — becomes visible only via @media print */}
      <div id="statement-print" style={{ display: 'none' }}>
        {printGiver && (
          <StatementDoc
            giver={printGiver}
            year={year}
            churchName={churchName}
            churchAddress={churchAddress}
            churchPhone={churchPhone}
            churchEmail={churchEmail}
            churchReg={churchReg}
            logoUrl={logoUrl}
            fmt={fmt}
            fmtDate={fmtDate}
          />
        )}
      </div>
    </>
  );
}

// --- Printable Statement ---

type StatementDocProps = {
  giver: GiverSummary;
  year: number;
  churchName: string;
  churchAddress: string;
  churchPhone: string;
  churchEmail: string;
  churchReg: string;
  logoUrl: string;
  fmt: (n: number) => string;
  fmtDate: (s: string) => string;
};

function StatementDoc({
  giver, year, churchName, churchAddress, churchPhone, churchEmail, churchReg,
  logoUrl, fmt, fmtDate,
}: StatementDocProps) {
  return (
    <div style={{ background: 'white', fontFamily: 'Arial, sans-serif', color: '#111', fontSize: '13px', lineHeight: '1.6' }}>

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', paddingBottom: '16px', borderBottom: `2px solid ${BRAND.colours.primary}`, marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {logoUrl && (
            <img src={logoUrl} alt="Church logo" style={{ height: '56px', width: 'auto', objectFit: 'contain' }} />
          )}
          <div>
            <div style={{ fontSize: '17px', fontWeight: '900', color: BRAND.colours.primary }}>{churchName}</div>
            {churchAddress && <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>{churchAddress}</div>}
            {(churchPhone || churchEmail) && (
              <div style={{ fontSize: '11px', color: '#888' }}>
                {[churchPhone, churchEmail].filter(Boolean).join(' | ')}
              </div>
            )}
            {churchReg && <div style={{ fontSize: '11px', color: '#999' }}>Reg: {churchReg}</div>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '11px', fontWeight: 'bold', color: BRAND.colours.primary, textTransform: 'uppercase', letterSpacing: '1px' }}>
            Annual Giving Statement
          </div>
          <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>Tax Year: {year}</div>
          <div style={{ fontSize: '11px', color: '#999' }}>
            Printed: {new Date().toLocaleDateString('en-ZA')}
          </div>
        </div>
      </div>

      {/* Member name */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#999', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>
          Prepared for
        </div>
        <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#111' }}>{giver.memberName}</div>
      </div>

      {/* Transactions table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginBottom: '24px' }}>
        <thead>
          <tr style={{ background: BRAND.colours.primary, color: 'white' }}>
            <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: '600' }}>Date</th>
            <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: '600' }}>Description</th>
            <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: '600' }}>Fund</th>
            <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: '600' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {giver.transactions.map((tx, i) => (
            <tr key={tx.id} style={{ background: i % 2 === 0 ? 'white' : '#f9fafb' }}>
              <td style={{ padding: '7px 12px', color: '#555', whiteSpace: 'nowrap' }}>{fmtDate(tx.date)}</td>
              <td style={{ padding: '7px 12px', color: '#333' }}>{tx.description}</td>
              <td style={{ padding: '7px 12px', color: '#555' }}>
                {tx.category}{tx.otherDescription ? ` (${tx.otherDescription})` : ''}
              </td>
              <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: '500' }}>{fmt(tx.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: `2px solid ${BRAND.colours.primary}`, background: '#f0faf4' }}>
            <td colSpan={3} style={{ padding: '10px 12px', fontWeight: 'bold', color: BRAND.colours.primary, textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.5px' }}>
              Total Contributions for {year}
            </td>
            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '900', fontSize: '20px', color: BRAND.colours.primary }}>
              {fmt(giver.total)}
            </td>
          </tr>
        </tfoot>
      </table>

      {/* Category breakdown — only shown when more than one fund contributed to */}
      {Object.keys(giver.byCategory).length > 1 && (
        <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
          <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#999', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>
            Summary by Fund
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            {Object.entries(giver.byCategory).map(([cat, total]) => (
              <div key={cat} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#555', fontSize: '12px' }}>{cat}</span>
                <span style={{ fontWeight: 'bold', color: '#222', fontSize: '12px' }}>{fmt(total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
        <p style={{ fontSize: '11px', color: '#666', marginBottom: '6px' }}>
          This statement reflects contributions recorded against your name for the {year} tax year. Please retain this document for your personal tax records.
        </p>
        {churchReg && (
          <p style={{ fontSize: '11px', color: '#888' }}>
            {churchName} is a registered organisation ({churchReg}). Please consult your tax advisor regarding the deductibility of your contributions.
          </p>
        )}
      </div>

      {/* Signature line */}
      <div style={{ marginTop: '48px' }}>
        <div style={{ width: '180px', borderTop: '1px solid #aaa', paddingTop: '6px' }}>
          <div style={{ fontSize: '11px', color: '#888' }}>Authorised Signature</div>
        </div>
      </div>

      <div style={{ textAlign: 'center', fontSize: '10px', color: '#ccc', marginTop: '32px' }}>
        Generated by {BRAND.productName}
      </div>
    </div>
  );
}
