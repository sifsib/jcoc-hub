"use client";

import { useState } from "react";
import Link from "next/link";
import LogoutButton from "./LogoutButton";

interface NavItem {
  name: string;
  href: string;
  icon: string;
}

interface MobileSidebarProps {
  navigation: NavItem[];
  churchName: string;
  primaryColor: string;
  userRole: string;
}

export default function MobileSidebar({
  navigation,
  churchName,
  primaryColor,
  userRole,
}: MobileSidebarProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Hamburger button — only visible on mobile */}
      <button
        className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Overlay backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Slide-in drawer */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-72 bg-white border-r border-gray-200 flex flex-col shadow-xl transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-gray-200 shrink-0">
          <h1
            className="text-xl font-black tracking-tight truncate"
            style={{ color: primaryColor }}
          >
            {churchName}
          </h1>
          <button
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Ministry Platform</p>
        </div>

        <nav className="flex-1 overflow-y-auto">
          <ul className="flex flex-col space-y-1">
            {navigation.map((item) => (
              <li key={item.name}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-6 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 border-l-4 border-transparent"
                >
                  <span className="text-base opacity-60">{item.icon}</span>
                  {item.name}
                </Link>
              </li>
            ))}

            {userRole === "super_admin" && (
              <li>
                <Link
                  href="/dashboard/admin-settings"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-6 py-3 text-sm font-bold text-amber-700 bg-amber-50/50 border-l-4 border-amber-500"
                >
                  <span className="text-base">⚙️</span>
                  System Admin Panel
                </Link>
              </li>
            )}
          </ul>
        </nav>

        <div className="p-4 border-t border-gray-200 shrink-0">
          <LogoutButton />
        </div>
      </aside>
    </>
  );
}
