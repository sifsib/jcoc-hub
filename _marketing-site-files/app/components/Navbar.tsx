"use client";

// app/components/Navbar.tsx

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

const NAV_LINKS = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/demo", label: "Watch Demo" },
  { href: "/about", label: "About Us" },
  { href: "/faqs", label: "FAQs" },
  { href: "/contact", label: "Contact & Support" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
      <nav className="container mx-auto px-6 py-4 flex items-center justify-between">

        {/* Logo */}
        <Link href="/" className="flex items-center group" onClick={() => setOpen(false)}>
          <Image
            src="/Kereke_logo.jpg"
            alt="Kereke Hub Logo"
            width={140}
            height={42}
            priority
            className="object-contain rounded-md"
          />
        </Link>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-300">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-emerald-400 transition">
              {link.label}
            </Link>
          ))}
        </div>

        {/* Desktop CTAs */}
        <div className="hidden md:flex items-center gap-4">
          <a href="https://hub.kerekehub.co.za/login" className="text-slate-400 hover:text-white transition text-sm font-semibold">
            Log In
          </a>
          <a href="https://hub.kerekehub.co.za/signup" className="border border-emerald-500 text-emerald-400 hover:bg-emerald-500 hover:text-white px-5 py-2.5 rounded-full text-sm font-bold transition-all duration-300">
            Sign Up Free
          </a>
          <Link href="/demo#request" className="bg-emerald-600 text-white px-5 py-2.5 rounded-full text-sm font-bold transition-all duration-300 transform hover:scale-105 hover:bg-emerald-500 active:scale-95 shadow-md shadow-emerald-900/20">
            Book a Demo
          </Link>
        </div>

        {/* Mobile: Log In + hamburger */}
        <div className="flex md:hidden items-center gap-3">
          <a href="https://hub.kerekehub.co.za/login" className="text-slate-400 hover:text-white transition text-sm font-semibold">
            Log In
          </a>
          <button
            onClick={() => setOpen(!open)}
            aria-label="Toggle menu"
            className="p-2 rounded-md text-slate-300 hover:text-white hover:bg-slate-800 transition"
          >
            {open ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden bg-slate-900 border-t border-slate-800 px-6 py-4 flex flex-col gap-4">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="text-slate-300 hover:text-emerald-400 text-sm font-semibold py-1 transition"
            >
              {link.label}
            </Link>
          ))}
          <div className="border-t border-slate-800 pt-4 flex flex-col gap-3">
            <a href="https://hub.kerekehub.co.za/signup" className="border border-emerald-500 text-emerald-400 hover:bg-emerald-500 hover:text-white px-5 py-2.5 rounded-full text-sm font-bold transition-all duration-300 text-center">
              Sign Up Free
            </a>
            <Link
              href="/demo#request"
              onClick={() => setOpen(false)}
              className="bg-emerald-600 text-white px-5 py-2.5 rounded-full text-sm font-bold transition-all duration-300 hover:bg-emerald-500 active:scale-95 shadow-md shadow-emerald-900/20 text-center"
            >
              Book a Demo
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
