"use client";

import { useState } from "react";

interface Props<T extends object> {
  data: T[];
  filename: string;
  columns?: { key: keyof T; label: string }[];
  disabled?: boolean;
}

function escapeCell(value: string): string {
  const str = String(value).replace(/"/g, '""');
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

async function downloadXLSX<T extends object>(
  data: T[],
  filename: string,
  columns?: { key: keyof T; label: string }[]
): Promise<void> {
  if (!data || data.length === 0) return;

  const XLSX = await import("xlsx");

  const cols = columns
    ? columns
    : (Object.keys(data[0] as Record<string, unknown>) as (keyof T)[]).map((k) => ({ key: k, label: String(k) }));

  const rows = data.map((row) =>
    cols.reduce((acc, c) => {
      acc[c.label] = (row as Record<keyof T, unknown>)[c.key] ?? "";
      return acc;
    }, {} as Record<string, unknown>)
  );

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Members");

  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${filename}-${date}.xlsx`);
}

export default function ExportMemberButton<T extends object>({
  data,
  filename,
  columns,
  disabled = false,
}: Props<T>) {
  const [showMenu, setShowMenu] = useState(false);

  const isDisabled = disabled || data.length === 0;

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        disabled={isDisabled}
        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
        title={data.length === 0 ? "No data to export" : `Export ${data.length} rows`}
      >
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
        </svg>
        Export
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>

      {showMenu && !isDisabled && (
        <div className="absolute right-0 mt-1 w-32 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
          <button
            onClick={() => {
              downloadCSV(data, filename, columns);
              setShowMenu(false);
            }}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 first:rounded-t-lg flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" />
            </svg>
            CSV
          </button>
          <button
            onClick={() => {
              downloadXLSX(data, filename, columns);
              setShowMenu(false);
            }}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 last:rounded-b-lg flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" />
            </svg>
            XLSX
          </button>
        </div>
      )}
    </div>
  );
}
