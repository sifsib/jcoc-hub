// Re-export of the shared tier helpers so server code can import them via the
// "@/lib/tier" alias (which resolves to app/lib), while the single source of
// truth stays in the root lib/tier.ts used by client components.
export * from "../../lib/tier";
