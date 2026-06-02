"use client";

import { useEffect, useState } from "react";
import { db } from "../../../lib/firebase";
import { useAppUser } from "../../../lib/useAppUser";
import {
  collection,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Member {
  id: string;
  fullName: string;
  firstName?: string;
  lastName?: string;
  dob?: string;
  gender?: string;
  phone?: string;
  email?: string;
  ministryGroup?: string;
  householdId?: string;
  householdRole?: string;
  maritalStatus?: string;
  role?: string;
}

interface Household {
  id: string;
  familyName: string;
  primaryMemberId?: string;
  spouseMemberId?: string;
  nonMemberSpouse?: {
    firstName?: string;
    lastName?: string;
    gender?: string;
    phone?: string;
  } | null;
  nonMemberChildren?: {
    firstName?: string;
    lastName?: string;
    dob?: string;
    gender?: string;
  }[];
  createdAt?: any;
}

interface FamilyUnit {
  household: Household;
  primary?: Member;
  spouse?: Member;
  children: Member[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcAge(dob?: string): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function ageLabel(dob?: string) {
  const age = calcAge(dob);
  return age !== null ? `${age} yrs` : null;
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, size = "md", color = "bg-emerald-700" }: { name: string; size?: "sm" | "md"; color?: string }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
  const sz = size === "sm" ? "w-7 h-7 text-[10px]" : "w-9 h-9 text-xs";
  return (
    <div className={`${sz} ${color} rounded-full flex items-center justify-center text-white font-bold shrink-0`}>
      {initials || "?"}
    </div>
  );
}

// ─── Member Row ───────────────────────────────────────────────────────────────

function MemberRow({
  member,
  role,
  isMember = true,
}: {
  member: { fullName?: string; firstName?: string; lastName?: string; phone?: string; dob?: string; gender?: string; ministryGroup?: string };
  role: string;
  isMember?: boolean;
}) {
  const name =
    member.fullName ||
    `${member.firstName || ""} ${member.lastName || ""}`.trim() ||
    "Unknown";
  const age = ageLabel(member.dob);
  const avatarColor = role === "Primary"
    ? "bg-emerald-700"
    : role === "Spouse"
    ? "bg-teal-600"
    : "bg-slate-400";

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <Avatar name={name} size={role === "Primary" || role === "Spouse" ? "md" : "sm"} color={avatarColor} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={`font-medium text-gray-900 truncate ${role === "Primary" ? "text-sm" : "text-xs"}`}>
            {name}
          </p>
          {!isMember && (
            <span className="text-[10px] bg-gray-100 text-gray-500 border border-gray-200 px-1.5 py-0.5 rounded">
              Non-member
            </span>
          )}
        </div>
        <div className="flex gap-2 mt-0.5 flex-wrap">
          <span className="text-[10px] text-gray-400 capitalize">{role}</span>
          {age && <span className="text-[10px] text-gray-400">{age}</span>}
          {member.ministryGroup && isMember && (
            <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 py-0.5 rounded">
              {member.ministryGroup}
            </span>
          )}
        </div>
      </div>
      {member.phone && isMember && (
        <p className="text-[10px] font-mono text-gray-400 hidden sm:block shrink-0">+{member.phone}</p>
      )}
    </div>
  );
}

// ─── Family Card ─────────────────────────────────────────────────────────────

function FamilyCard({ unit }: { unit: FamilyUnit }) {
  const { household, primary, spouse, children } = unit;
  const memberCount =
    (primary ? 1 : 0) + (spouse ? 1 : 0) + children.length;
  const nonMemberSpouseName =
    household.nonMemberSpouse?.firstName || household.nonMemberSpouse?.lastName
      ? `${household.nonMemberSpouse.firstName || ""} ${household.nonMemberSpouse.lastName || ""}`.trim()
      : null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">🏠</span>
          <p className="font-bold text-gray-800 text-sm">
            {household.familyName ? `${household.familyName} Family` : "Unnamed Family"}
          </p>
        </div>
        <span className="text-[10px] bg-white border border-gray-200 text-gray-500 px-2 py-0.5 rounded font-medium">
          {memberCount} member{memberCount !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Members */}
      <div className="px-4">
        {primary && (
          <MemberRow
            member={{ ...primary, fullName: primary.fullName }}
            role="Primary"
          />
        )}
        {spouse && (
          <MemberRow
            member={{ ...spouse, fullName: spouse.fullName }}
            role="Spouse"
          />
        )}
        {nonMemberSpouseName && !spouse && (
          <MemberRow
            member={{
              fullName: nonMemberSpouseName,
              phone: household.nonMemberSpouse?.phone,
              gender: household.nonMemberSpouse?.gender,
            }}
            role="Spouse"
            isMember={false}
          />
        )}
        {children.map((child) => (
          <MemberRow
            key={child.id}
            member={{ ...child, fullName: child.fullName }}
            role="Child"
          />
        ))}
        {(household.nonMemberChildren || []).map((child, i) => {
          const childName = `${child.firstName || ""} ${child.lastName || ""}`.trim();
          if (!childName) return null;
          return (
            <MemberRow
              key={`nm-child-${i}`}
              member={{ fullName: childName, dob: child.dob, gender: child.gender }}
              role="Child"
              isMember={false}
            />
          );
        })}
        {!primary && !spouse && children.length === 0 && (
          <p className="text-xs text-gray-400 py-3 italic">No linked members found.</p>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FamiliesPage() {
  const { tenantId, loading: userLoading } = useAppUser();

  const [households, setHouseholds] = useState<Household[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Fetch households
  useEffect(() => {
    if (!tenantId) return;
    const q = query(collection(db, "households"), where("tenantId", "==", tenantId));
    return onSnapshot(q, (snap) => {
      setHouseholds(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Household)));
    });
  }, [tenantId]);

  // Fetch members
  useEffect(() => {
    if (!tenantId) return;
    const q = query(
      collection(db, "members"),
      where("tenantId", "==", tenantId),
      where("isMember", "==", true)
    );
    return onSnapshot(q, (snap) => {
      setMembers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Member)));
      setLoading(false);
    });
  }, [tenantId]);

  if (userLoading || loading) {
    return (
      <div className="p-10 flex items-center gap-2">
        <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-600 text-sm">Loading family records...</p>
      </div>
    );
  }

  // Build member lookup map
  const memberMap = new Map<string, Member>(members.map((m) => [m.id, m]));

  // Build family units from households
  const familyUnits: FamilyUnit[] = households.map((hh) => {
    const primary = hh.primaryMemberId ? memberMap.get(hh.primaryMemberId) : undefined;
    const spouse = hh.spouseMemberId ? memberMap.get(hh.spouseMemberId) : undefined;
    const children = members.filter(
      (m) => m.householdId === hh.id && m.householdRole === "child"
    );
    return { household: hh, primary, spouse, children };
  });

  // Also catch members with a householdId that has no household doc (orphaned)
  const accountedIds = new Set<string>();
  familyUnits.forEach(({ primary, spouse, children }) => {
    if (primary) accountedIds.add(primary.id);
    if (spouse) accountedIds.add(spouse.id);
    children.forEach((c) => accountedIds.add(c.id));
  });

  // Filter + search
  const term = search.toLowerCase();
  const filtered = familyUnits.filter(({ household, primary, spouse, children }) => {
    if (!term) return true;
    const names = [
      household.familyName,
      primary?.fullName,
      spouse?.fullName,
      ...children.map((c) => c.fullName),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return names.includes(term);
  });

  // Sort alphabetically by family name
  filtered.sort((a, b) =>
    (a.household.familyName || "").localeCompare(b.household.familyName || "")
  );

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Family Groups</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {familyUnits.length} household{familyUnits.length !== 1 ? "s" : ""} registered
          </p>
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by family or member name..."
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      {/* Empty state */}
      {familyUnits.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <p className="text-4xl mb-3">🏠</p>
          <p className="font-semibold text-gray-700">No family records yet</p>
          <p className="text-sm text-gray-400 mt-1">
            Family records are created automatically when you register or import members.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
          <p className="text-sm text-gray-400">No families match your search.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((unit) => (
            <FamilyCard key={unit.household.id} unit={unit} />
          ))}
        </div>
      )}
    </div>
  );
}
