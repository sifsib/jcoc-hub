"use client";

interface Props<T extends object> {
  data: T[];
  filename: string;
  columns?: { key: keyof T; label: string }[];
  disabled?: boolean;
  label?: string;
}

function escapeCell(value: string): string {
  const str = value.replace(/"/g, '""');
  return /[,"\r\n]/.test(str) ? `"${str}"` : str;
}

function downloadCSV<T extends object>(
  data: T[],
  filename: string,
  columns?: { key: keyof T; label: string }[]
): void {
  if (!data || data.length === 0) return;

  const cols = columns
    ? columns
    : (Object.keys(data[0] as Record<string, unknown>) as (keyof T)[]).map((k) => ({ key: k, label: String(k) }));

  const header = cols.map((c) => escapeCell(c.label)).join(",");
  const rows = data.map((row) =>
    cols.map((c) => escapeCell(String((row as Record<keyof T, unknown>)[c.key] ?? ""))).join(",")
  );

  const csvContent = [header, ...rows].join("\r\n");
  const blob = new Blob(["﻿" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `${filename}-${date}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function ExportCSVButton<T extends object>({
  data,
  filename,
  columns,
  disabled = false,
  label = "Export CSV",
}: Props<T>) {
  return (
    <button
      onClick={() => downloadCSV(data, filename, columns)}
      disabled={disabled || data.length === 0}
      className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
      title={data.length === 0 ? "No data to export" : `Export ${data.length} rows to CSV`}
    >
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
      </svg>
      {label}
    </button>
  );
}
