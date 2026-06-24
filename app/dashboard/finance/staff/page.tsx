'use client';

// hub: app/dashboard/finance/staff/page.tsx
// Staff Register — store church workers once; payslip page pulls from here.

import { useState, useEffect } from 'react';
import { db } from '../../../../lib/firebase';
import { useAppUser } from '../../../../lib/useAppUser';
import {
  collection, addDoc, updateDoc, deleteDoc,
  getDocs, query, where, orderBy, doc, serverTimestamp,
} from 'firebase/firestore';
import Link from 'next/link';

type Earning = { label: string; amount: string };
type Deduction = { label: string; amount: string };

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

type FormData = Omit<StaffMember, 'id'>;

const BLANK: FormData = {
  name: '', idNumber: '', position: '', taxRef: '', bank: '', bankAccount: '',
  earnings: [{ label: 'Basic Salary', amount: '' }],
  deductions: [{ label: 'PAYE', amount: '' }, { label: 'UIF', amount: '' }],
};

const fmt = (n: number) =>
  `R ${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function StaffRegisterPage() {
  const { appUser, loading: userLoading } = useAppUser();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(BLANK);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadStaff = async (tenantId: string) => {
    setLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'staff_members'), where('tenantId', '==', tenantId), orderBy('name', 'asc')),
      );
      setStaff(snap.docs.map((d) => ({ id: d.id, ...d.data() } as StaffMember)));
    } catch (err) {
      console.error('Failed to load staff:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!appUser?.tenantId) return;
    loadStaff(appUser.tenantId);
  }, [appUser]);

  const openNew = () => {
    setEditId(null);
    setForm(BLANK);
    setError('');
    setShowForm(true);
  };

  const openEdit = (m: StaffMember) => {
    setEditId(m.id);
    setForm({
      name: m.name, idNumber: m.idNumber, position: m.position,
      taxRef: m.taxRef, bank: m.bank, bankAccount: m.bankAccount,
      earnings: (m.earnings || [{ label: 'Basic Salary', amount: '' }]).map((e) => ({ ...e })),
      deductions: (m.deductions || [{ label: 'PAYE', amount: '' }, { label: 'UIF', amount: '' }]).map((d) => ({ ...d })),
    });
    setError('');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!appUser?.tenantId) return;
    if (!form.name.trim()) { setError('Full name is required.'); return; }
    setSaving(true);
    try {
      if (editId) {
        await updateDoc(doc(db, 'staff_members', editId), { ...form, updatedAt: serverTimestamp() });
      } else {
        await addDoc(collection(db, 'staff_members'), {
          ...form,
          tenantId: appUser.tenantId,
          createdAt: serverTimestamp(),
        });
      }
      setShowForm(false);
      await loadStaff(appUser.tenantId);
    } catch (err) {
      console.error('Failed to save staff member:', err);
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!appUser?.tenantId || !confirm('Remove this staff member?')) return;
    try {
      await deleteDoc(doc(db, 'staff_members', id));
      setStaff((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  };

  // Form row helpers
  const updateEarning = (i: number, f: keyof Earning, v: string) =>
    setForm((p) => ({ ...p, earnings: p.earnings.map((e, idx) => idx === i ? { ...e, [f]: v } : e) }));
  const addEarning = () => setForm((p) => ({ ...p, earnings: [...p.earnings, { label: '', amount: '' }] }));
  const removeEarning = (i: number) => setForm((p) => ({ ...p, earnings: p.earnings.filter((_, idx) => idx !== i) }));

  const updateDeduction = (i: number, f: keyof Deduction, v: string) =>
    setForm((p) => ({ ...p, deductions: p.deductions.map((d, idx) => idx === i ? { ...d, [f]: v } : d) }));
  const addDeduction = () => setForm((p) => ({ ...p, deductions: [...p.deductions, { label: '', amount: '' }] }));
  const removeDeduction = (i: number) => setForm((p) => ({ ...p, deductions: p.deductions.filter((_, idx) => idx !== i) }));

  if (userLoading || loading) {
    return (
      <div className="p-10 flex items-center gap-2">
        <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/finance" className="text-sm text-gray-400 hover:text-gray-700 transition">
            ← Finance
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Staff Register</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Save staff details once. Payslip generator auto-fills from here.
            </p>
          </div>
        </div>
        <button
          onClick={openNew}
          className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition"
        >
          + Add Staff Member
        </button>
      </div>

      {/* Staff list */}
      {staff.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-14 text-center">
          <p className="text-4xl mb-3">👤</p>
          <p className="text-sm font-semibold text-gray-700">No staff members yet</p>
          <p className="text-xs text-gray-400 mt-1 mb-5">
            Add workers here and their details will auto-fill on the payslip page.
          </p>
          <button
            onClick={openNew}
            className="px-5 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-lg"
          >
            Add First Member
          </button>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Name</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Position</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide hidden md:table-cell">Bank</th>
                <th className="text-right px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Default Gross</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {staff.map((member) => {
                const gross = (member.earnings || []).reduce(
                  (s, e) => s + (parseFloat(e.amount) || 0), 0,
                );
                return (
                  <tr key={member.id} className="hover:bg-gray-50 transition">
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-gray-900">{member.name}</p>
                      {member.idNumber && (
                        <p className="text-xs text-gray-400">ID: {member.idNumber}</p>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-gray-600">{member.position || '-'}</td>
                    <td className="px-5 py-3.5 text-gray-600 hidden md:table-cell">
                      <span>{member.bank || '-'}</span>
                      {member.bankAccount && (
                        <span className="text-xs text-gray-400 block">{member.bankAccount}</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold text-emerald-700">
                      {gross > 0 ? fmt(gross) : '-'}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={() => openEdit(member)}
                          className="text-xs font-semibold text-gray-500 hover:text-emerald-700 transition"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(member.id)}
                          className="text-xs font-semibold text-gray-300 hover:text-red-500 transition"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Slide-over form */}
      {showForm && (
        <div
          className="fixed inset-0 bg-black/30 z-40 flex justify-end"
          onClick={(e) => e.target === e.currentTarget && setShowForm(false)}
        >
          <div className="w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
            {/* Drawer header */}
            <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between shrink-0">
              <h2 className="text-base font-bold text-gray-900">
                {editId ? 'Edit Staff Member' : 'Add Staff Member'}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="text-gray-400 hover:text-gray-700 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            {/* Drawer body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              {/* Basic info */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Full Name *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="John Dlamini"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">ID Number</label>
                  <input
                    value={form.idNumber}
                    onChange={(e) => setForm((p) => ({ ...p, idNumber: e.target.value }))}
                    placeholder="8001010000000"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Position</label>
                  <input
                    value={form.position}
                    onChange={(e) => setForm((p) => ({ ...p, position: e.target.value }))}
                    placeholder="Church Administrator"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Tax Reference</label>
                  <input
                    value={form.taxRef}
                    onChange={(e) => setForm((p) => ({ ...p, taxRef: e.target.value }))}
                    placeholder="1234567890"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Bank Name</label>
                  <input
                    value={form.bank}
                    onChange={(e) => setForm((p) => ({ ...p, bank: e.target.value }))}
                    placeholder="FNB"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Account Number</label>
                  <input
                    value={form.bankAccount}
                    onChange={(e) => setForm((p) => ({ ...p, bankAccount: e.target.value }))}
                    placeholder="123 456 7890"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Default Earnings */}
              <div>
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                  Default Earnings
                </h3>
                <p className="text-xs text-gray-400 mb-3">
                  These pre-fill on the payslip each month. Adjust amounts there before printing.
                </p>
                {form.earnings.map((e, i) => (
                  <div key={i} className="flex gap-2 mb-2 items-center">
                    <input
                      value={e.label}
                      onChange={(ev) => updateEarning(i, 'label', ev.target.value)}
                      placeholder="e.g. Basic Salary"
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <input
                      type="number"
                      value={e.amount}
                      onChange={(ev) => updateEarning(i, 'amount', ev.target.value)}
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => removeEarning(i)}
                      className="text-gray-300 hover:text-red-400 transition text-xl leading-none"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addEarning}
                  className="text-xs font-semibold text-emerald-600 hover:text-emerald-800 transition"
                >
                  + Add Earning
                </button>
              </div>

              {/* Default Deductions */}
              <div>
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                  Default Deductions
                </h3>
                {form.deductions.map((d, i) => (
                  <div key={i} className="flex gap-2 mb-2 items-center">
                    <input
                      value={d.label}
                      onChange={(ev) => updateDeduction(i, 'label', ev.target.value)}
                      placeholder="e.g. PAYE"
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <input
                      type="number"
                      value={d.amount}
                      onChange={(ev) => updateDeduction(i, 'amount', ev.target.value)}
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => removeDeduction(i)}
                      className="text-gray-300 hover:text-red-400 transition text-xl leading-none"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addDeduction}
                  className="text-xs font-semibold text-red-500 hover:text-red-700 transition"
                >
                  + Add Deduction
                </button>
              </div>
            </div>

            {/* Drawer footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex gap-3 shrink-0">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition disabled:opacity-50"
              >
                {saving ? 'Saving...' : editId ? 'Update' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
