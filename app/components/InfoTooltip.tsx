"use client";

import { useState, useId } from "react";

/**
 * Small "?" icon that shows a definition + why-it-matters tooltip on hover/tap.
 * Usage: <InfoTooltip label="Tier" text="Which plan features this church can access." why="Members past the free limit can't be added until you upgrade." />
 */
export default function InfoTooltip({
  text,
  why,
  className = "",
}: {
  text: string;
  why?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span className={`relative inline-flex align-middle ${className}`}>
      <button
        type="button"
        aria-describedby={id}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
        className="w-4 h-4 rounded-full bg-gray-200 text-gray-500 hover:bg-blue-100 hover:text-blue-600 text-[10px] font-bold flex items-center justify-center leading-none transition-colors"
      >
        ?
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute z-50 left-1/2 -translate-x-1/2 bottom-full mb-2 w-56 rounded-lg bg-gray-800 text-white text-xs leading-snug p-2.5 shadow-lg"
        >
          <span className="block">{text}</span>
          {why && <span className="block mt-1 text-gray-300">{why}</span>}
          <span className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-gray-800 rotate-45" />
        </span>
      )}
    </span>
  );
}
