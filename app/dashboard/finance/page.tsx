'use client';

// hub: app/dashboard/finance/page.tsx
//
// Financial Dashboard — all existing functionality preserved.
// Added: "Online Giving" tab showing giving_records from the public giving page.
// Added: "Manage Categories" button linking to /dashboard/finance/settings

import { useState, useEffect, useRef } from 'react';
import { db, storage } from '../../../lib/firebase';
import { useAppUser } from '../../../lib/useAppUser';
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import Link from 'next/link';


// --- Constants ---

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DEFAULT_INCOME_CATEGORIES = ['Tithes', 'Offerings', 'Building Fund', 'Other'];

const DEFAULT_EXPENSE_CATEGORIES = [
  'Allowance',
  'Electricity',
  'Petrol',
  'Catering',
  'Welfare',
  'Land Purchase Payment',
  'Bank Charges',
  'Evangelism',
  "Pastor's Travel",
  'Bereavement',
  'Donations/Offering',
  'Church Maintenance',
  'Conferences',
  'Debt Repayment',
  'Stock Purchases',
  'Memberships/Subscriptions',
  'Miscellaneous',
];

// --- Types ---

type Transaction = {
  id: string;
  type: 'income' | 'expense';
  date: string;
  description: string;
  amount: number;
  category: string;
  otherDescription?: string;
  miscDescription?: string;
  invoiceUrl?: string;
  tenantId: string;
  createdAt: unknown;
};

type GivingRecord = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  amount: number;
  category: string;
  categoryName: string;
  method: string;
  status: string;
  reference?: string;
  createdAt: string;
};

type Tab = 'overview' | 'add' | 'ledger' | 'export' | 'online';
type PeriodType = 'month' | 'mtd' | 'quarter' | 'qtd' | 'year' | 'ytd';

// --- Helpers ---

const fmt = (n: number) =>
  `R ${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const todayStr = () => new Date().toISOString().split('T')[0];

const getMonthYear = (dateStr: string) => {
  const d = new Date(dateStr);
  return { month: d.getMonth(), year: d.getFullYear() };
};

const formatDate = (val: string) => {
  if (!val) return '-';
  const d = new Date(val);
  return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
};

// --- Component ---

export default function FinancePage() {
  const { appUser, loading: userLoading } = useAppUser();

  const [periodType, setPeriodType] = useState<PeriodType>('mtd');
  const [overviewMonth, setOverviewMonth] = useState(new Date().getMonth());
  const [overviewYear, setOverviewYear] = useState(new Date().getFullYear());
  const [overviewQuarter, setOverviewQuarter] = useState(Math.floor(new Date().getMonth() / 3));

  const [tab, setTab] = useState<Tab>('overview');

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Custom categories from Firestore
  const [incomeCategories, setIncomeCategories] = useState<string[]>(DEFAULT_INCOME_CATEGORIES);
  const [expenseCategories, setExpenseCategories] = useState<string[]>(DEFAULT_EXPENSE_CATEGORIES);

  // Online giving state
  const [givingRecords, setGivingRecords] = useState<GivingRecord[]>([]);
  const [givingLoading, setGivingLoading] = useState(false);
  const [givingStatusFilter, setGivingStatusFilter] = useState<string>('all');
  const [givingSearch, setGivingSearch] = useState('');

  // form
  const [txType, setTxType] = useState<'income' | 'expense'>('income');
  const [date, setDate] = useState(todayStr());
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [otherDesc, setOtherDesc] = useState('');
  const [miscDesc, setMiscDesc] = useState('');
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ledger filters
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth());
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');

  // export
  const [exportYear, setExportYear] = useState(new Date().getFullYear());
  const [exporting, setExporting] = useState(false);

  // --- Fetch transactions ---

  const fetchTransactions = async (tenantId: string) => {
    setLoading(true);
    try {
      const q = query(
        collection(db, 'transactions'),
        where('tenantId', '==', tenantId),
        orderBy('date', 'desc'),
      );
      const snap = await getDocs(q);
      setTransactions(
        snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Transaction)),
      );
    } catch (err) {
      console.error('Failed to load transactions:', err);
    } finally {
      setLoading(false);
    }
  };

  // --- Fetch giving records (only when Online tab is opened) ---

  const fetchGivingRecords = async (tenantId: string) => {
    setGivingLoading(true);
    try {
      const snap = await getDocs(
        query(
          collection(db, 'giving_records'),
          where('tenantId', '==', tenantId),
          orderBy('createdAt', 'desc'),
        ),
      );
      setGivingRecords(
        snap.docs.map((d) => {
          const r = d.data();
          return {
            id: d.id,
            firstName: r.firstName || '',
            lastName: r.lastName || '',
            email: r.email || '',
            amount: r.amount || 0,
            category: r.category || '',
            categoryName: r.categoryName || r.category || '',
            method: r.method || 'eft',
            status: r.status || 'pending',
            reference: r.reference || '',
            createdAt: r.createdAt || '',
          };
        }),
      );
    } catch (err) {
      console.error('Failed to load giving records:', err);
    } finally {
      setGivingLoading(false);
    }
  };

  // Load custom categories from Firestore
  const fetchCustomCategories = async (tenantId: string) => {
    try {
      const incomeSnap = await getDocs(
        query(
          collection(db, 'finance_categories'),
          where('tenantId', '==', tenantId),
          where('type', '==', 'income'),
          orderBy('order', 'asc'),
        ),
      );
      const expenseSnap = await getDocs(
        query(
          collection(db, 'finance_categories'),
          where('tenantId', '==', tenantId),
          where('type', '==', 'expense'),
          orderBy('order', 'asc'),
        ),
      );

      const income = incomeSnap.docs.map(d => d.data().name);
      const expense = expenseSnap.docs.map(d => d.data().name);

      // Always update, use empty array if none exist (don't fall back to defaults here)
      setIncomeCategories(income.length > 0 ? income : DEFAULT_INCOME_CATEGORIES);
      setExpenseCategories(expense.length > 0 ? expense : DEFAULT_EXPENSE_CATEGORIES);
    } catch (err) {
      console.error('Failed to load custom categories:', err);
    }
  };

  useEffect(() => {
    if (userLoading || !appUser) return;
    fetchTransactions(appUser.tenantId);
    fetchCustomCategories(appUser.tenantId);
  }, [appUser, userLoading]);

  // Refresh categories when Add tab is opened
  useEffect(() => {
    if (tab === 'add' && appUser) {
      fetchCustomCategories(appUser.tenantId);
    }
  }, [tab, appUser]);

  // Load giving records when Online tab is first opened
  useEffect(() => {
    if (tab === 'online' && appUser && givingRecords.length === 0 && !givingLoading) {
      fetchGivingRecords(appUser.tenantId);
    }
  }, [tab, appUser]);

  // --- Submit transaction ---

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appUser) return;

    setFormError('');

    if (!date || !description.trim() || !amount || !category) {
      setFormError('Date, description, amount, and category are required.');
      return;
    }
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) {
      setFormError('Amount must be a positive number.');
      return;
    }
    if (category === 'Other' && txType === 'income' && !otherDesc.trim()) {
      setFormError('Please describe the Other income.');
      return;
    }
    if (category === 'Miscellaneous' && txType === 'expense' && !miscDesc.trim()) {
      setFormError('Please describe the miscellaneous expense.');
      return;
    }

    setSaving(true);
    try {
      let invoiceUrl = '';
      if (invoiceFile) {
        setUploading(true);
        const storageRef = ref(
          storage,
          `tenants/${appUser.tenantId}/invoices/${Date.now()}_${invoiceFile.name}`,
        );
        await uploadBytes(storageRef, invoiceFile);
        invoiceUrl = await getDownloadURL(storageRef);
        setUploading(false);
      }

      await addDoc(collection(db, 'transactions'), {
        tenantId: appUser.tenantId,
        type: txType,
        date,
        description: description.trim(),
        amount: parsed,
        category,
        ...(category === 'Other' && txType === 'income' && { otherDescription: otherDesc.trim() }),
        ...(category === 'Miscellaneous' && txType === 'expense' && { miscDescription: miscDesc.trim() }),
        ...(invoiceUrl && { invoiceUrl }),
        createdAt: serverTimestamp(),
      });

      setDate(todayStr());
      setDescription('');
      setAmount('');
      setCategory('');
      setOtherDesc('');
      setMiscDesc('');
      setInvoiceFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';

      setFormSuccess(`${txType === 'income' ? 'Income' : 'Expense'} recorded successfully.`);
      setTimeout(() => setFormSuccess(''), 4000);
      await fetchTransactions(appUser.tenantId);
    } catch (err) {
      console.error(err);
      setFormError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  // --- Computed ---

  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();
  const currentQuarter = Math.floor(thisMonth / 3);

  const QUARTERS = [
    { label: 'Q1 (Jan-Mar)', months: [0, 1, 2] },
    { label: 'Q2 (Apr-Jun)', months: [3, 4, 5] },
    { label: 'Q3 (Jul-Sep)', months: [6, 7, 8] },
    { label: 'Q4 (Oct-Dec)', months: [9, 10, 11] },
  ];

  const getPeriodLabel = () => {
    switch (periodType) {
      case 'month': return `${MONTHS[overviewMonth]} ${overviewYear}`;
      case 'mtd': return `Month to Date (${MONTHS[thisMonth]} ${thisYear})`;
      case 'quarter': return `${QUARTERS[overviewQuarter].label} ${overviewYear}`;
      case 'qtd': return `Quarter to Date (${QUARTERS[currentQuarter].label} ${thisYear})`;
      case 'year': return `Full Year ${overviewYear}`;
      case 'ytd': return `Year to Date ${thisYear}`;
    }
  };

  const overviewTx = transactions.filter((tx) => {
    const d = new Date(tx.date);
    const m = d.getMonth();
    const y = d.getFullYear();
    switch (periodType) {
      case 'month': return m === overviewMonth && y === overviewYear;
      case 'mtd': return m === thisMonth && y === thisYear && d <= now;
      case 'quarter': return QUARTERS[overviewQuarter].months.includes(m) && y === overviewYear;
      case 'qtd': return QUARTERS[currentQuarter].months.includes(m) && y === thisYear && d <= now;
      case 'year': return y === overviewYear;
      case 'ytd': return y === thisYear && d <= now;
    }
  });

  const overviewIncome = overviewTx.filter((tx) => tx.type === 'income').reduce((s, tx) => s + tx.amount, 0);
  const overviewExpenses = overviewTx.filter((tx) => tx.type === 'expense').reduce((s, tx) => s + tx.amount, 0);
  const overviewNet = overviewIncome - overviewExpenses;

  const ledgerTx = transactions
    .filter((tx) => {
      const { month, year } = getMonthYear(tx.date);
      return month === filterMonth && year === filterYear && (filterType === 'all' || tx.type === filterType);
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  let runningBalance = 0;
  const ledgerWithBalance = ledgerTx
    .map((tx) => {
      runningBalance += tx.type === 'income' ? tx.amount : -tx.amount;
      return { ...tx, balance: runningBalance };
    })
    .reverse();

  // Filtered giving records for Online tab
  const filteredGiving = givingRecords.filter((r) => {
    if (givingStatusFilter !== 'all' && r.status !== givingStatusFilter) return false;
    if (givingSearch) {
      const q = givingSearch.toLowerCase();
      const name = `${r.firstName} ${r.lastName}`.toLowerCase();
      if (!name.includes(q) && !r.email.toLowerCase().includes(q) && !r.categoryName.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const givingComplete = givingRecords.filter((r) => r.status === 'complete');
  const givingPendingEft = givingRecords.filter((r) => r.status === 'pending_eft');
  const givingTotal = givingComplete.reduce((s, r) => s + r.amount, 0);
  const givingPendingTotal = givingPendingEft.reduce((s, r) => s + r.amount, 0);

  // Category totals for Online Giving
  const categoryTotals: Record<string, number> = {};
  givingComplete.forEach((r) => {
    const key = r.categoryName || r.category || 'Other';
    categoryTotals[key] = (categoryTotals[key] || 0) + r.amount;
  });
  const topCategories = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // --- Excel Export ---

  const handleExport = async () => {
    setExporting(true);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();

      const getTotal = (type: 'income' | 'expense', m: number, cat?: string) =>
        transactions
          .filter((tx) => {
            const { month, year } = getMonthYear(tx.date);
            return tx.type === type && month === m && year === exportYear && (cat ? tx.category === cat : true);
          })
          .reduce((s, tx) => s + tx.amount, 0);

      const introData = [
        ['Kingdom Faith Worship Centre Financial Statement'],
        [],
        ['Generated by Kereke ChMS'],
        [`Financial Year: ${exportYear}`],
        [`Export Date: ${new Date().toLocaleDateString('en-ZA')}`],
        [],
        ['Enter values in the monthly sheets only.'],
        ['The Income Statement is auto-populated from monthly sheets.'],
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(introData), 'Intro and Setup');

      for (let m = 0; m < 12; m++) {
        const monthName = MONTHS[m];
        const monthTx = transactions.filter((tx) => {
          const { month, year } = getMonthYear(tx.date);
          return month === m && year === exportYear;
        });
        const incomeTx = monthTx.filter((tx) => tx.type === 'income');
        const expenseTx = monthTx.filter((tx) => tx.type === 'expense');

        const incomeHeader = ['Date', 'Description', 'Amount', 'Tithes', 'Offerings', 'Building Fund', 'Other'];
        const incomeRows = incomeTx.map((tx) => [
          tx.date,
          tx.category === 'Other' && tx.otherDescription ? tx.otherDescription : tx.description,
          tx.amount,
          tx.category === 'Tithes' ? 'x' : '',
          tx.category === 'Offerings' ? 'x' : '',
          tx.category === 'Building Fund' ? 'x' : '',
          tx.category === 'Other' ? 'x' : '',
        ]);
        const incomeTotals = [
          'TOTAL', '',
          incomeTx.reduce((s, tx) => s + tx.amount, 0),
          incomeTx.filter((tx) => tx.category === 'Tithes').reduce((s, tx) => s + tx.amount, 0),
          incomeTx.filter((tx) => tx.category === 'Offerings').reduce((s, tx) => s + tx.amount, 0),
          incomeTx.filter((tx) => tx.category === 'Building Fund').reduce((s, tx) => s + tx.amount, 0),
          incomeTx.filter((tx) => tx.category === 'Other').reduce((s, tx) => s + tx.amount, 0),
        ];
        const incomeData = [
          [`INCOMES FOR ${monthName.toUpperCase()} ${exportYear}`],
          ['MARK THE RELEVANT CATEGORY WITH AN X'],
          [],
          incomeHeader,
          ...incomeRows,
          [],
          incomeTotals,
        ];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(incomeData), `${monthName} - Incomes`);

        const expCats = [...expenseCategories];
        const expenseHeader = ['Date', 'Payee', 'Amount', ...expCats];
        const expenseRows = expenseTx.map((tx) => {
          const payee = tx.category === 'Miscellaneous' && tx.miscDescription
            ? `${tx.description} - ${tx.miscDescription}`
            : tx.description;
          return [tx.date, payee, tx.amount, ...expCats.map((cat) => (tx.category === cat ? 'x' : ''))];
        });
        const expTotals = [
          'TOTAL', '',
          expenseTx.reduce((s, tx) => s + tx.amount, 0),
          ...expCats.map((cat) => expenseTx.filter((tx) => tx.category === cat).reduce((s, tx) => s + tx.amount, 0)),
        ];
        const expenseData = [
          [`EXPENSES FOR ${monthName.toUpperCase()} ${exportYear}`],
          ['MARK THE RELEVANT CATEGORY WITH AN X'],
          [],
          expenseHeader,
          ...expenseRows,
          [],
          expTotals,
        ];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(expenseData), `${monthName} - Expenses`);
      }

      const stmtHeader = ['', ...MONTHS.map((m) => m.slice(0, 3)), 'Total'];
      const incomeStmt: unknown[][] = [
        [`INCOME STATEMENT - ${exportYear}`],
        [],
        stmtHeader,
        [
          'INCOME',
          ...Array.from({ length: 12 }, (_, m) => getTotal('income', m)),
          Array.from({ length: 12 }, (_, m) => getTotal('income', m)).reduce((a, b) => a + b, 0),
        ],
        ['  Tithes', ...Array.from({ length: 12 }, (_, m) => getTotal('income', m, 'Tithes')), Array.from({ length: 12 }, (_, m) => getTotal('income', m, 'Tithes')).reduce((a, b) => a + b, 0)],
        ['  Offerings', ...Array.from({ length: 12 }, (_, m) => getTotal('income', m, 'Offerings')), Array.from({ length: 12 }, (_, m) => getTotal('income', m, 'Offerings')).reduce((a, b) => a + b, 0)],
        ['  Building Fund', ...Array.from({ length: 12 }, (_, m) => getTotal('income', m, 'Building Fund')), Array.from({ length: 12 }, (_, m) => getTotal('income', m, 'Building Fund')).reduce((a, b) => a + b, 0)],
        ['  Other', ...Array.from({ length: 12 }, (_, m) => getTotal('income', m, 'Other')), Array.from({ length: 12 }, (_, m) => getTotal('income', m, 'Other')).reduce((a, b) => a + b, 0)],
        [],
        [
          'EXPENSES',
          ...Array.from({ length: 12 }, (_, m) => getTotal('expense', m)),
          Array.from({ length: 12 }, (_, m) => getTotal('expense', m)).reduce((a, b) => a + b, 0),
        ],
        ...expenseCategories.map((cat) => [
          `  ${cat}`,
          ...Array.from({ length: 12 }, (_, m) => getTotal('expense', m, cat)),
          Array.from({ length: 12 }, (_, m) => getTotal('expense', m, cat)).reduce((a, b) => a + b, 0),
        ]),
        [],
        [
          'NET SURPLUS / DEFICIT',
          ...Array.from({ length: 12 }, (_, m) => getTotal('income', m) - getTotal('expense', m)),
          Array.from({ length: 12 }, (_, m) => getTotal('income', m) - getTotal('expense', m)).reduce((a, b) => a + b, 0),
        ],
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(incomeStmt), 'Income Statement');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['BALANCE SHEET'], ['Complete manually using the Income Statement totals above.']]), 'Balance sheet');

      XLSX.writeFile(wb, `KFWC_Financial_Statement_${exportYear}.xlsx`);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  // --- Render ---

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'add', label: 'Record' },
    { key: 'ledger', label: 'Ledger' },
    { key: 'export', label: 'Export' },
    { key: 'online', label: 'Online Giving' },
  ];

  const givingStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      complete: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      pending_eft: 'bg-amber-50 text-amber-700 border-amber-200',
      pending_payment: 'bg-blue-50 text-blue-700 border-blue-200',
      failed: 'bg-red-50 text-red-700 border-red-200',
    };
    const labels: Record<string, string> = {
      complete: 'Complete',
      pending_eft: 'Pending EFT',
      pending_payment: 'Pending',
      failed: 'Failed',
    };
    return (
      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide border ${map[status] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
        {labels[status] ?? status}
      </span>
    );
  };

  if (userLoading) {
    return (
      <div className="p-10 flex items-center gap-2">
        <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Financial Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Income, expenses, and reporting for your church.</p>
        </div>
        <Link
          href="/dashboard/finance/settings"
          className="text-xs font-semibold text-gray-500 hover:text-gray-900 bg-white border border-gray-200 hover:border-gray-300 px-3 py-2 rounded-lg transition-colors"
        >
          ⚙️ Manage Categories
        </Link>
      </div>

      <div className="flex gap-1 mb-6 border-b border-gray-200 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition whitespace-nowrap ${
              tab === t.key
                ? 'bg-white border border-b-white border-gray-200 text-emerald-700 -mb-px'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { key: 'mtd', label: 'Month to Date' },
                  { key: 'month', label: 'Month' },
                  { key: 'qtd', label: 'QTD' },
                  { key: 'quarter', label: 'Quarter' },
                  { key: 'ytd', label: 'YTD' },
                  { key: 'year', label: 'Year' },
                ] as { key: PeriodType; label: string }[]
              ).map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPeriodType(p.key)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
                    periodType === p.key ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-3">
              {periodType === 'month' && (
                <>
                  <select value={overviewMonth} onChange={(e) => setOverviewMonth(Number(e.target.value))} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                    {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
                  </select>
                  <select value={overviewYear} onChange={(e) => setOverviewYear(Number(e.target.value))} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                    {[thisYear - 1, thisYear].map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </>
              )}
              {periodType === 'quarter' && (
                <>
                  <select value={overviewQuarter} onChange={(e) => setOverviewQuarter(Number(e.target.value))} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                    {QUARTERS.map((q, i) => <option key={i} value={i}>{q.label}</option>)}
                  </select>
                  <select value={overviewYear} onChange={(e) => setOverviewYear(Number(e.target.value))} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                    {[thisYear - 1, thisYear].map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </>
              )}
              {periodType === 'year' && (
                <select value={overviewYear} onChange={(e) => setOverviewYear(Number(e.target.value))} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                  {[thisYear - 1, thisYear].map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              )}
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">{getPeriodLabel()}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-xs text-gray-500 mb-1">Income</p>
                <p className="text-2xl font-bold text-emerald-700">{fmt(overviewIncome)}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-xs text-gray-500 mb-1">Expenses</p>
                <p className="text-2xl font-bold text-red-600">{fmt(overviewExpenses)}</p>
              </div>
              <div className={`rounded-xl border p-5 ${overviewNet >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                <p className="text-xs text-gray-500 mb-1">Net</p>
                <p className={`text-2xl font-bold ${overviewNet >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{fmt(overviewNet)}</p>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Recent Transactions</h2>
            {loading ? (
              <p className="text-sm text-gray-400">Loading...</p>
            ) : transactions.length === 0 ? (
              <p className="text-sm text-gray-400">No transactions recorded yet.</p>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                {transactions.slice(0, 8).map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{tx.description}</p>
                      <p className="text-xs text-gray-400">{tx.date} · {tx.category}</p>
                    </div>
                    <span className={`text-sm font-bold ${tx.type === 'income' ? 'text-emerald-700' : 'text-red-600'}`}>
                      {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Record ── */}
      {tab === 'add' && (
        <div className="max-w-lg">
          <div className="flex gap-2 mb-6">
            {(['income', 'expense'] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setTxType(t); setCategory(''); setFormError(''); }}
                className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition ${
                  txType === t
                    ? t === 'income' ? 'bg-emerald-600 text-white' : 'bg-red-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {t === 'income' ? '+ Income' : '- Expense'}
              </button>
            ))}
            <button
              onClick={() => appUser && fetchCustomCategories(appUser.tenantId)}
              className="px-3 py-2.5 text-xs font-semibold bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg border border-blue-200 transition"
              title="Refresh categories from settings"
            >
              ⟳
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 bg-white border border-gray-200 rounded-xl p-6">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" required />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">{txType === 'income' ? 'Description' : 'Payee / Description'}</label>
              <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={txType === 'income' ? 'e.g. Payshap Credit - Tebogo' : 'e.g. Shell Laezonia'} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" required />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Amount (ZAR)</label>
              <input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" required />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" required>
                <option value="">Select a category</option>
                {(txType === 'income' ? incomeCategories : expenseCategories).map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            {txType === 'income' && category === 'Other' && (
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Specify Other Income</label>
                <input type="text" value={otherDesc} onChange={(e) => setOtherDesc(e.target.value)} placeholder="Describe the income source" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
            )}
            {txType === 'expense' && category === 'Miscellaneous' && (
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Specify Miscellaneous Expense</label>
                <input type="text" value={miscDesc} onChange={(e) => setMiscDesc(e.target.value)} placeholder="Describe the expense" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
            )}
            {txType === 'expense' && (
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Invoice / Receipt <span className="text-gray-400 font-normal">(optional)</span></label>
                <input ref={fileInputRef} type="file" accept="image/*,application/pdf" onChange={(e) => setInvoiceFile(e.target.files?.[0] ?? null)} className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200" />
                {invoiceFile && <p className="text-xs text-gray-500 mt-1">{invoiceFile.name}</p>}
              </div>
            )}
            {formError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>}
            {formSuccess && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{formSuccess}</p>}
            <button
              type="submit"
              disabled={saving}
              className={`w-full py-2.5 rounded-lg text-sm font-semibold transition ${txType === 'income' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-red-500 hover:bg-red-600 text-white'} disabled:opacity-50`}
            >
              {saving ? (uploading ? 'Uploading invoice...' : 'Saving...') : `Save ${txType === 'income' ? 'Income' : 'Expense'}`}
            </button>
          </form>
        </div>
      )}

      {/* ── Ledger ── */}
      {tab === 'ledger' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 bg-white border border-gray-200 rounded-xl px-5 py-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Month</label>
              <select value={filterMonth} onChange={(e) => setFilterMonth(Number(e.target.value))} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Year</label>
              <select value={filterYear} onChange={(e) => setFilterYear(Number(e.target.value))} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                {[thisYear - 1, thisYear, thisYear + 1].map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Type</label>
              <select value={filterType} onChange={(e) => setFilterType(e.target.value as typeof filterType)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                <option value="all">All</option>
                <option value="income">Income</option>
                <option value="expense">Expenses</option>
              </select>
            </div>
          </div>

          {ledgerTx.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Income', val: ledgerTx.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0), color: 'text-emerald-700' },
                { label: 'Expenses', val: ledgerTx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0), color: 'text-red-600' },
                { label: 'Net', val: ledgerTx.reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0), color: 'text-gray-900' },
              ].map((item) => (
                <div key={item.label} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                  <p className="text-xs text-gray-500">{item.label}</p>
                  <p className={`text-lg font-bold ${item.color}`}>{fmt(item.val)}</p>
                </div>
              ))}
            </div>
          )}

          {loading ? (
            <p className="text-sm text-gray-400">Loading...</p>
          ) : ledgerWithBalance.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
              <p className="text-sm text-gray-400">No transactions for {MONTHS[filterMonth]} {filterYear}.</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Date</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Description</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Category</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Amount</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Balance</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-500">Invoice</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {ledgerWithBalance.map((tx) => (
                      <tr key={tx.id} className="hover:bg-gray-50 transition">
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{tx.date}</td>
                        <td className="px-4 py-3 text-gray-900">
                          {tx.description}
                          {tx.otherDescription && <span className="text-gray-400 text-xs block">{tx.otherDescription}</span>}
                          {tx.miscDescription && <span className="text-gray-400 text-xs block">{tx.miscDescription}</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{tx.category}</td>
                        <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${tx.type === 'income' ? 'text-emerald-700' : 'text-red-600'}`}>
                          {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}
                        </td>
                        <td className={`px-4 py-3 text-right whitespace-nowrap ${tx.balance >= 0 ? 'text-gray-700' : 'text-red-600'}`}>
                          {fmt(tx.balance)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {tx.invoiceUrl ? (
                            <a href={tx.invoiceUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-emerald-600 hover:text-emerald-800">View</a>
                          ) : (
                            <span className="text-gray-300 text-xs">-</span>
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
      )}

      {/* ── Export ── */}
      {tab === 'export' && (
        <div className="max-w-md space-y-6">
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Export Financial Statement</h2>
              <p className="text-sm text-gray-500 mt-1">Downloads an Excel workbook matching the KFWC audit format: 26 sheets covering income and expenses for each month, plus an Income Statement.</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Financial Year</label>
              <select value={exportYear} onChange={(e) => setExportYear(Number(e.target.value))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                {[thisYear - 1, thisYear].map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              <p className="text-xs text-amber-800">The export pulls all transactions recorded in Kereke for the selected year. Go through your existing statement and capture any missing transactions in the Record tab before exporting.</p>
            </div>
            <button
              onClick={handleExport}
              disabled={exporting || loading}
              className="w-full py-2.5 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition disabled:opacity-50"
            >
              {exporting ? 'Generating Excel...' : `Download ${exportYear} Statement (.xlsx)`}
            </button>
          </div>
        </div>
      )}

      {/* ── Online Giving ── */}
      {tab === 'online' && (
        <div className="space-y-6">

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs text-gray-500 mb-1">Total Received</p>
              <p className="text-2xl font-bold text-emerald-700">{fmt(givingTotal)}</p>
              <p className="text-xs text-gray-400 mt-1">{givingComplete.length} confirmed</p>
            </div>
            <div className="bg-white border border-amber-200 rounded-xl p-5">
              <p className="text-xs text-amber-600 mb-1">Pending EFT</p>
              <p className="text-2xl font-bold text-amber-700">{fmt(givingPendingTotal)}</p>
              <p className="text-xs text-amber-400 mt-1">{givingPendingEft.length} awaiting transfer</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs text-gray-500 mb-1">Giving Link</p>
              <p className="text-xs font-mono text-emerald-600 break-all mt-1">kerekehub.co.za/give/{appUser?.tenantId}</p>
            </div>
          </div>

          {/* Category breakdown */}
          {topCategories.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h2 className="text-sm font-bold text-gray-900 mb-4">By Category (confirmed only)</h2>
              <div className="space-y-3">
                {topCategories.map(([cat, total]) => {
                  const pct = givingTotal > 0 ? (total / givingTotal) * 100 : 0;
                  return (
                    <div key={cat}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-700 font-medium">{cat}</span>
                        <span className="text-sm font-bold text-gray-900">{fmt(total)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Filters + table */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 border-b border-gray-100">
              <div className="flex gap-1 flex-wrap">
                {['all', 'complete', 'pending_eft', 'pending_payment', 'failed'].map((s) => (
                  <button
                    key={s}
                    onClick={() => setGivingStatusFilter(s)}
                    className={`text-xs px-2.5 py-1.5 rounded-lg font-semibold transition border ${
                      givingStatusFilter === s
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'text-gray-400 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {s === 'all' ? `All (${givingRecords.length})` : s.replace('_', ' ')}
                  </button>
                ))}
              </div>
              <div className="sm:ml-auto">
                <input
                  type="text"
                  placeholder="Search name, email, fund..."
                  value={givingSearch}
                  onChange={(e) => setGivingSearch(e.target.value)}
                  className="w-full sm:w-56 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400 transition-colors"
                />
              </div>
            </div>

            {givingLoading ? (
              <div className="p-8 flex items-center justify-center gap-2 text-gray-400">
                <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Loading giving records...</span>
              </div>
            ) : filteredGiving.length === 0 ? (
              <div className="p-10 text-center">
                <p className="text-sm text-gray-400">
                  {givingRecords.length === 0
                    ? 'No online giving records yet. Share your giving link to get started.'
                    : 'No records match your filter.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Donor</th>
                      <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Fund</th>
                      <th className="text-right px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Amount</th>
                      <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Method</th>
                      <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Reference</th>
                      <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredGiving.map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="font-semibold text-gray-900">{`${r.firstName} ${r.lastName}`.trim() || '-'}</div>
                          {r.email && <div className="text-xs text-gray-400">{r.email}</div>}
                        </td>
                        <td className="px-5 py-3.5 text-gray-700">{r.categoryName || r.category || '-'}</td>
                        <td className="px-5 py-3.5 text-right font-bold text-gray-900">{fmt(r.amount)}</td>
                        <td className="px-5 py-3.5 text-gray-500 text-xs font-medium">
                          {r.method === 'card' ? '💳 Card' : '🏦 EFT'}
                        </td>
                        <td className="px-5 py-3.5">{givingStatusBadge(r.status)}</td>
                        <td className="px-5 py-3.5 text-gray-400 text-xs font-mono">{r.reference || '-'}</td>
                        <td className="px-5 py-3.5 text-gray-500 text-xs">{formatDate(r.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
