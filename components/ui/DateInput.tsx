"use client";

import { useState, useEffect, ChangeEvent } from "react";

interface DateInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  required?: boolean;
  placeholder?: string;
}

export default function DateInput({
  value,
  onChange,
  className = "",
  required,
  placeholder = "YYYY/MM/DD",
}: DateInputProps) {
  const toDisplay = (iso: string) => (iso ? iso.replace(/-/g, "/") : "");

  const [display, setDisplay] = useState(toDisplay(value));

  useEffect(() => {
    setDisplay(toDisplay(value));
  }, [value]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/[^0-9/]/g, "");

    // Auto-insert slashes as user types
    if (raw.length === 4 && !raw.includes("/")) {
      raw = raw + "/";
    } else if (
      raw.length === 7 &&
      raw.split("/").length === 2 &&
      !raw.endsWith("/")
    ) {
      raw = raw + "/";
    }

    setDisplay(raw);

    if (raw === "") {
      onChange("");
      return;
    }

    // Only emit when the date is fully entered and valid
    const match = raw.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
    if (match) {
      const iso = `${match[1]}-${match[2]}-${match[3]}`;
      const date = new Date(iso);
      if (!isNaN(date.getTime())) {
        onChange(iso);
      }
    }
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      value={display}
      onChange={handleChange}
      placeholder={placeholder}
      maxLength={10}
      required={required}
      className={className}
    />
  );
}
