"use client";

/**
 * csvExport.ts
 * Reusable CSV export utility for Kereke Hub.
 *
 * Usage:
 *   import { exportToCSV } from "@/lib/csvExport";
 *   exportToCSV(data, "members-export");
 */

/**
 * Converts an array of objects to a CSV string and triggers a file download.
 * @param data    Array of flat objects (each row = one object)
 * @param filename  File name without the .csv extension
 * @param columns   Optional: specify which keys to include and their header labels.
 *                  If omitted, all keys from the first row are used.
 */
export function exportToCSV<T extends Record<string, unknown>>(
  data: T[],
  filename: string,
  columns?: { key: keyof T; label: string }[]
): void {
  if (!data || data.length === 0) {
    console.warn("exportToCSV: no data to export.");
    return;
  }

  // Determine columns
  const cols = columns
    ? columns
    : (Object.keys(data[0]) as (keyof T)[]).map((k) => ({
        key: k,
        label: String(k),
      }));

  // Build header row
  const header = cols.map((c) => escapeCell(c.label)).join(",");

  // Build data rows
  const rows = data.map((row) =>
    cols.map((c) => escapeCell(String(row[c.key] ?? ""))).join(",")
  );

  const csvContent = [header, ...rows].join("\r\n");

  // Trigger download
  const blob = new Blob(["﻿" + csvContent], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}-${formatDateForFilename(new Date())}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/** Wraps cell value in quotes and escapes inner quotes. */
function escapeCell(value: string): string {
  const str = value.replace(/"/g, '""');
  // Wrap in quotes if value contains comma, newline, or quote
  return /[,"\r\n]/.test(str) ? `"${str}"` : str;
}

function formatDateForFilename(date: Date): string {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}
