"use client";

// hub: app/dashboard/finance/settings/page.tsx
//
// Owners and admins configure the giving categories shown on the public giving page.
// Stored in Firestore: finance_categories collection (with tenantId field).
// These are separate from the hardcoded INCOME_CATEGORIES used in manual transaction entry.

import { useEffect, useState } from "react";
import { useAppUser } from "../../../../lib/useAppUser";
import { db } from "../../../../lib/firebase";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";
import Link from "next/link";

interface Category {
  id: string;
  name: string;
  order: number;
  type: "giving" | "income" | "expense";
}

const DEFAULT_GIVING = ["Tithe", "Offering", "Building Fund", "Missions", "Special Offering"];

const DEFAULT_INCOME = ["Tithes", "Offerings", "Building Fund", "Other"];

const DEFAULT_EXPENSE = [
  "Allowance", "Electricity", "Petrol", "Catering", "Welfare",
  "Land Purchase Payment", "Bank Charges", "Evangelism", "Pastor's Travel",
  "Bereavement", "Donations/Offering", "Church Maintenance", "Conferences",
  "Debt Repayment", "Stock Purchases", "Memberships/Subscriptions", "Miscellaneous",
];

export default function FinanceCategorySettings() {
  const { appUser, loading: userLoading } = useAppUser();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [activeTab, setActiveTab] = useState<"giving" | "income" | "expense">("giving");

  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const canManage =
    appUser?.role === "owner" ||
    appUser?.role === "admin" ||
    appUser?.role === "super_admin";

  useEffect(() => {
    if (userLoading || !appUser) return;
    loadCategories(appUser.tenantId);
  }, [appUser, userLoading, activeTab]);

  // Auto-seed defaults when tab changes
  useEffect(() => {
    if (userLoading || !appUser) return;
    // Always try to seed - seedDefaults will skip duplicates
    seedDefaults();
  }, [appUser, userLoading, activeTab]);

  async function loadCategories(tenantId: string) {
    setLoadingCats(true);
    try {
      const snap = await getDocs(
        query(
          collection(db, "finance_categories"),
          where("tenantId", "==", tenantId),
          where("type", "==", activeTab),
          orderBy("order", "asc")
        )
      );
      setCategories(
        snap.docs.map((d) => ({
          id: d.id,
          name: d.data().name || "",
          order: d.data().order ?? 0,
          type: d.data().type,
        }))
      );
    } catch (err) {
      console.error("Load categories error:", err);
    } finally {
      setLoadingCats(false);
    }
  }

  async function addCategory() {
    const name = newName.trim();
    if (!name || !appUser) return;
    if (categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      setError("A category with that name already exists.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const nextOrder =
        categories.length > 0 ? Math.max(...categories.map((c) => c.order)) + 1 : 0;
      const docRef = await addDoc(collection(db, "finance_categories"), {
        tenantId: appUser.tenantId,
        type: activeTab,
        name,
        order: nextOrder,
        createdAt: new Date().toISOString(),
      });
      setCategories((prev) => [...prev, { id: docRef.id, name, order: nextOrder, type: activeTab }]);
      setNewName("");
      flash("Category added.");
    } catch (err) {
      console.error("Add category error:", err);
      setError("Failed to add category. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit() {
    const name = editName.trim();
    if (!name || !editId) return;
    if (
      categories.some(
        (c) => c.id !== editId && c.name.toLowerCase() === name.toLowerCase()
      )
    ) {
      setError("A category with that name already exists.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await updateDoc(doc(db, "finance_categories", editId), { name });
      setCategories((prev) =>
        prev.map((c) => (c.id === editId ? { ...c, name } : c))
      );
      setEditId(null);
      setEditName("");
      flash("Category updated.");
    } catch (err) {
      console.error("Save edit error:", err);
      setError("Failed to update category.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCategory(id: string) {
    setDeleting(id);
    setError("");
    try {
      await deleteDoc(doc(db, "finance_categories", id));
      setCategories((prev) => prev.filter((c) => c.id !== id));
      flash("Category removed.");
    } catch (err) {
      console.error("Delete error:", err);
      setError("Failed to delete category.");
    } finally {
      setDeleting(null);
    }
  }

  async function seedDefaults() {
    if (!appUser) return;
    setSaving(true);
    setError("");
    try {
      const existing = categories.map((c) => c.name.toLowerCase());
      const defaults = activeTab === "giving" ? DEFAULT_GIVING : activeTab === "income" ? DEFAULT_INCOME : DEFAULT_EXPENSE;
      const toAdd = defaults.filter(
        (n) => !existing.includes(n.toLowerCase())
      );
      let nextOrder =
        categories.length > 0
          ? Math.max(...categories.map((c) => c.order)) + 1
          : 0;
      const newCats: Category[] = [];

      for (const name of toAdd) {
        const docRef = await addDoc(collection(db, "finance_categories"), {
          tenantId: appUser.tenantId,
          type: activeTab,
          name,
          order: nextOrder++,
          createdAt: new Date().toISOString(),
        });
        newCats.push({ id: docRef.id, name, order: nextOrder - 1, type: activeTab });
      }
      setCategories((prev) => [...prev, ...newCats]);
      flash(`${newCats.length} default categories added.`);
    } catch (err) {
      console.error("Seed defaults error:", err);
      setError("Failed to add defaults.");
    } finally {
      setSaving(false);
    }
  }

  function flash(msg: string) {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 3000);
  }

  // ── Guards ─────────────────────────────────────────────────────────────────

  if (userLoading || loadingCats) {
    return (
      <div className="flex items-center justify-center h-64 gap-3">
        <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 font-medium">Loading...</p>
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
        <div className="w-12 h-12 rounded-full bg-red-50 border border-red-200 flex items-center justify-center text-xl">🔒</div>
        <h2 className="text-lg font-bold text-gray-900">Access Restricted</h2>
        <p className="text-gray-500 text-sm max-w-xs">Only Owners and Admins can manage categories.</p>
      </div>
    );
  }

  // ── Page ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-8 max-w-2xl p-6">

      {/* Breadcrumb + header */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Link href="/dashboard/finance" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
            Financials
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-xs text-gray-600 font-semibold">Category Settings</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 border border-emerald-200 flex items-center justify-center text-sm">🏷️</div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Finance Categories</h1>
            <p className="text-gray-500 text-sm">Customize the categories used in your financial management.</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 flex gap-0">
        <button
          onClick={() => setActiveTab("giving")}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "giving"
              ? "border-emerald-600 text-emerald-600"
              : "border-transparent text-gray-600 hover:text-gray-900"
          }`}
        >
          Giving Categories
        </button>
        <button
          onClick={() => setActiveTab("income")}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "income"
              ? "border-emerald-600 text-emerald-600"
              : "border-transparent text-gray-600 hover:text-gray-900"
          }`}
        >
          Income Categories
        </button>
        <button
          onClick={() => setActiveTab("expense")}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "expense"
              ? "border-emerald-600 text-emerald-600"
              : "border-transparent text-gray-600 hover:text-gray-900"
          }`}
        >
          Expense Categories
        </button>
      </div>

      {/* Feedback */}
      {success && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium rounded-xl px-4 py-3">{success}</div>}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-medium rounded-xl px-4 py-3">{error}</div>}

      {/* Add new */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <h2 className="text-sm font-bold text-gray-900 mb-3">Add New Category</h2>
        <div className="flex gap-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCategory()}
            placeholder="e.g. Youth Fund, Benevolence..."
            className="flex-1 text-sm border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:border-emerald-400 transition-colors"
          />
          <button
            onClick={addCategory}
            disabled={saving || !newName.trim()}
            className="px-4 py-2.5 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {saving ? "Adding..." : "+ Add"}
          </button>
        </div>
      </div>

      {/* Category list */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-900">
            {categories.length} {categories.length === 1 ? "Category" : "Categories"}
          </h2>
          {categories.length === 0 && (
            <button
              onClick={seedDefaults}
              disabled={saving}
              className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? "Adding..." : "Add Default Categories"}
            </button>
          )}
        </div>

        {categories.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-gray-400 text-sm mb-1">No categories yet.</p>
            <p className="text-gray-400 text-xs">Add your own or click "Add Default Categories" to start quickly.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {categories.map((cat) => (
              <li key={cat.id} className="flex items-center gap-3 px-5 py-3.5">
                <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-xs font-bold text-emerald-600">🏷️</div>

                {editId === cat.id ? (
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit();
                        if (e.key === "Escape") { setEditId(null); setEditName(""); }
                      }}
                      autoFocus
                      className="flex-1 text-sm border border-emerald-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                    <button onClick={saveEdit} disabled={saving} className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50">Save</button>
                    <button onClick={() => { setEditId(null); setEditName(""); }} className="text-xs font-bold text-gray-400 hover:text-gray-600 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">Cancel</button>
                  </div>
                ) : (
                  <span className="flex-1 text-sm font-semibold text-gray-800">{cat.name}</span>
                )}

                {editId !== cat.id && (
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => { setEditId(cat.id); setEditName(cat.name); setError(""); }} className="text-xs text-gray-400 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 px-2.5 py-1.5 rounded-lg transition-colors font-medium">Rename</button>
                    <button onClick={() => deleteCategory(cat.id)} disabled={deleting === cat.id} className="text-xs text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 px-2.5 py-1.5 rounded-lg transition-colors font-medium disabled:opacity-50">{deleting === cat.id ? "..." : "Delete"}</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
        <strong>Note:</strong> Deleting a category does not affect past giving records. Donors who used that category will still appear in reports with the original category name.
      </div>
    </div>
  );
}
