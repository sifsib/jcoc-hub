// Sidebar usage meter for the free-tier member cap.
//
// Shows a free church how close it is to its 50-member limit so the hard block
// never comes as a surprise. Paid churches see a simple "Unlimited" note.
//
// This is a plain server component: it reads the numbers the dashboard layout
// already loaded from the tenant doc, so it refreshes whenever a page loads.

type Props = {
  tier?: string | null;
  activeMemberCount?: number | null;
  memberLimit?: number | null;
};

export default function MemberUsageMeter({ tier, activeMemberCount, memberLimit }: Props) {
  // Paid / comped churches have no cap.
  if (tier && tier !== "free") {
    return (
      <div className="px-4 pb-2 pt-3 border-t border-gray-100">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-100">
          <span className="text-sm">∞</span>
          <span className="text-xs font-semibold text-emerald-700">Unlimited members</span>
        </div>
      </div>
    );
  }

  // For an un-backfilled tenant the numbers may not be set yet. Don't show a
  // misleading meter; just render nothing until the fields exist.
  if (typeof activeMemberCount !== "number" || typeof memberLimit !== "number" || memberLimit <= 0) {
    return null;
  }

  const count = activeMemberCount;
  const limit = memberLimit;
  const pct = Math.min(100, Math.round((count / limit) * 100));
  const atLimit = count >= limit;
  const nearLimit = count >= limit - 5; // amber from 45 on a 50 cap

  // Colour states: sage green normally, amber when close, red at or over the cap.
  const barColor = atLimit ? "bg-red-500" : nearLimit ? "bg-amber-500" : "bg-emerald-500";
  const textColor = atLimit ? "text-red-700" : nearLimit ? "text-amber-700" : "text-gray-600";

  return (
    <div className="px-4 pb-2 pt-3 border-t border-gray-100">
      <div className="px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-100">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Members</span>
          <span className={`text-xs font-bold ${textColor}`}>
            {count} / {limit}
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
          <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
        </div>
        {atLimit ? (
          <p className="mt-2 text-[11px] leading-snug text-red-600">
            You have reached your free limit. Upgrade for unlimited members.
          </p>
        ) : nearLimit ? (
          <p className="mt-2 text-[11px] leading-snug text-amber-600">
            You are close to your free limit of {limit}.
          </p>
        ) : null}
        {atLimit && (
          <a
            href="/dashboard/billing"
            className="mt-2 block text-center text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg px-3 py-1.5 transition"
          >
            Upgrade to unlimited
          </a>
        )}
      </div>
    </div>
  );
}
