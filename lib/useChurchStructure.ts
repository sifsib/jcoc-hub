"use client";

// Live sectors and family groups for one region (ADR-010). Archived ones are
// included, so screens can still name a member's old placement; use
// pickerOptions() from churchStructure.ts for anything a user chooses from.

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "./firebase";
import type { FamilyGroup, Sector } from "./churchStructure";

export interface ChurchStructure {
  sectors: Sector[];
  familyGroups: FamilyGroup[];
  sectorById: Map<string, Sector>;
  familyGroupById: Map<string, FamilyGroup>;
  loading: boolean;
  error: string | null;
}

export function useChurchStructure(tenantId: string | null | undefined): ChurchStructure {
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [familyGroups, setFamilyGroups] = useState<FamilyGroup[]>([]);
  const [loaded, setLoaded] = useState({ sectors: false, groups: false });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    setLoaded({ sectors: false, groups: false });
    const onError = (err: Error) => {
      console.error("useChurchStructure:", err);
      setError("Could not load the church structure.");
    };
    const unsubSectors = onSnapshot(
      query(collection(db, "sectors"), where("tenantId", "==", tenantId)),
      (snap) => {
        setSectors(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Sector, "id">), archived: d.data().archived === true })));
        setLoaded((l) => ({ ...l, sectors: true }));
      },
      onError,
    );
    const unsubGroups = onSnapshot(
      query(collection(db, "familyGroups"), where("tenantId", "==", tenantId)),
      (snap) => {
        setFamilyGroups(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FamilyGroup, "id">), archived: d.data().archived === true })));
        setLoaded((l) => ({ ...l, groups: true }));
      },
      onError,
    );
    return () => {
      unsubSectors();
      unsubGroups();
    };
  }, [tenantId]);

  const sectorById = useMemo(() => new Map(sectors.map((s) => [s.id, s])), [sectors]);
  const familyGroupById = useMemo(() => new Map(familyGroups.map((g) => [g.id, g])), [familyGroups]);

  return {
    sectors,
    familyGroups,
    sectorById,
    familyGroupById,
    loading: !!tenantId && !(loaded.sectors && loaded.groups) && !error,
    error,
  };
}
