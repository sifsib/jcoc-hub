"use client";

import { useState, useEffect, useMemo } from "react";
import { db } from "../../../lib/firebase";
import { useAppUser } from "../../../lib/useAppUser";
import { useTenantTier } from "../../../lib/useTenantTier";
import { isPaidTier } from "../../../lib/tier";
import PaidFeatureLock from "../../components/PaidFeatureLock";
import DateInput from "../../../components/ui/DateInput";
import {
  collection,
  query,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  orderBy,
} from "firebase/firestore";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Song {
  id: string;
  title: string;
  artist?: string;
  key?: string;
  tempo?: string;
  tags?: string[];
  notes?: string;
  lyrics?: string;
  createdAt: any;
}

interface SetlistSong {
  songId: string;
  title: string;
  key?: string;        // can override the library key for that service
  notes?: string;
  order: number;
}

interface Setlist {
  id: string;
  serviceDate: string;
  serviceLabel: string;
  songs: SetlistSong[];
  notes?: string;
  createdAt: any;
}

type ViewTab = "setlists" | "library";

// ─── Constants ────────────────────────────────────────────────────────────────

const KEYS = ["A", "A#/Bb", "B", "C", "C#/Db", "D", "D#/Eb", "E", "F", "F#/Gb", "G", "G#/Ab"];
const TEMPOS = ["Slow", "Medium-Slow", "Medium", "Medium-Fast", "Fast", "Varies"];
const SERVICE_LABELS = [
  "Sunday Service",
  "Sunday Evening Service",
  "Wednesday Prayer Meeting",
  "Youth Service",
  "Women's Meeting",
  "Men's Meeting",
  "Special Event",
];

const EMPTY_SONG_FORM = { title: "", artist: "", key: "", tempo: "", tags: "", notes: "", lyrics: "" };
const EMPTY_SETLIST_FORM = { serviceDate: "", serviceLabel: "Sunday Service", notes: "" };

function today() {
  return new Date().toISOString().split("T")[0];
}

function upcomingSunday() {
  const d = new Date();
  const diff = (7 - d.getDay()) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-ZA", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function WorshipPage() {
  const { appUser, tenantId, loading: userLoading } = useAppUser();
  const { tier, loading: tierLoading } = useTenantTier();
  const [tab, setTab] = useState<ViewTab>("setlists");

  const [songs, setSongs] = useState<Song[]>([]);
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  const [loading, setLoading] = useState(true);

  // Setlist state
  const [selectedSetlistId, setSelectedSetlistId] = useState<string | null>(null);
  const [showSetlistModal, setShowSetlistModal] = useState(false);
  const [setlistForm, setSetlistForm] = useState({ ...EMPTY_SETLIST_FORM, serviceDate: upcomingSunday() });
  const [setlistError, setSetlistError] = useState("");
  const [savingSetlist, setSavingSetlist] = useState(false);

  // Song picker (add to setlist)
  const [showSongPicker, setShowSongPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerOverrideKey, setPickerOverrideKey] = useState("");
  const [pickerNotes, setPickerNotes] = useState("");
  const [pickerSongId, setPickerSongId] = useState("");
  const [addingToSetlist, setAddingToSetlist] = useState(false);

  // Song library state
  const [showSongModal, setShowSongModal] = useState(false);
  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const [songForm, setSongForm] = useState({ ...EMPTY_SONG_FORM });
  const [songError, setSongError] = useState("");
  const [savingSong, setSavingSong] = useState(false);
  const [librarySearch, setLibrarySearch] = useState("");
  const [expandedSongId, setExpandedSongId] = useState<string | null>(null);

  const [setlistNotesDraft, setSetlistNotesDraft] = useState("");
  const [savingSetlistNotes, setSavingSetlistNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [notesSaveError, setNotesSaveError] = useState("");

  const canManage = appUser?.role === "owner" || appUser?.role === "admin" || appUser?.role === "member_manager";

  // ── Load data ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!tenantId) return;

    const unsubSongs = onSnapshot(
      query(collection(db, "tenants", tenantId, "songs"), orderBy("title")),
      (snap) => setSongs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Song)))
    );

    const unsubSetlists = onSnapshot(
      query(collection(db, "tenants", tenantId, "setlists"), orderBy("serviceDate", "desc")),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Setlist));
        setSetlists(list);
        if (!selectedSetlistId && list.length > 0) setSelectedSetlistId(list[0].id);
        setLoading(false);
      }
    );

    return () => { unsubSongs(); unsubSetlists(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const selectedSetlist = useMemo(
    () => setlists.find((s) => s.id === selectedSetlistId) ?? null,
    [setlists, selectedSetlistId]
  );

  const sortedSetlistSongs = useMemo(
    () => [...(selectedSetlist?.songs ?? [])].sort((a, b) => a.order - b.order),
    [selectedSetlist]
  );

  const filteredLibrary = useMemo(() => {
    const q = librarySearch.toLowerCase();
    return songs.filter(
      (s) =>
        !q ||
        s.title.toLowerCase().includes(q) ||
        (s.artist ?? "").toLowerCase().includes(q) ||
        (s.tags ?? []).some((t) => t.toLowerCase().includes(q))
    );
  }, [songs, librarySearch]);

  const pickerFiltered = useMemo(() => {
    const q = pickerSearch.toLowerCase();
    return songs.filter(
      (s) =>
        !q ||
        s.title.toLowerCase().includes(q) ||
        (s.artist ?? "").toLowerCase().includes(q)
    );
  }, [songs, pickerSearch]);

  // ── Setlist actions ────────────────────────────────────────────────────────

  async function createSetlist() {
    if (!tenantId) return;
    if (!setlistForm.serviceDate) { setSetlistError("Please pick a service date."); return; }
    setSavingSetlist(true);
    setSetlistError("");
    try {
      const ref = await addDoc(collection(db, "tenants", tenantId, "setlists"), {
        serviceDate: setlistForm.serviceDate,
        serviceLabel: setlistForm.serviceLabel,
        notes: setlistForm.notes.trim(),
        songs: [],
        createdAt: serverTimestamp(),
      });
      setSelectedSetlistId(ref.id);
      setShowSetlistModal(false);
      setSetlistForm({ serviceDate: upcomingSunday(), serviceLabel: "Sunday Service", notes: "" });
    } catch {
      setSetlistError("Failed to create setlist.");
    } finally {
      setSavingSetlist(false);
    }
  }

  async function deleteSetlist(id: string) {
    if (!tenantId || !confirm("Delete this setlist? This cannot be undone.")) return;
    await deleteDoc(doc(db, "tenants", tenantId, "setlists", id));
    if (selectedSetlistId === id) setSelectedSetlistId(setlists.find((s) => s.id !== id)?.id ?? null);
  }

  async function addSongToSetlist() {
    if (!tenantId || !selectedSetlist || !pickerSongId) return;
    const song = songs.find((s) => s.id === pickerSongId);
    if (!song) return;
    const alreadyIn = selectedSetlist.songs.some((s) => s.songId === pickerSongId);
    if (alreadyIn) {
      alert("That song is already in this setlist.");
      return;
    }
    setAddingToSetlist(true);
    const nextOrder = selectedSetlist.songs.length > 0
      ? Math.max(...selectedSetlist.songs.map((s) => s.order)) + 1
      : 1;
    const newSong: SetlistSong = {
      songId: pickerSongId,
      title: song.title,
      key: pickerOverrideKey || song.key || "",
      notes: pickerNotes.trim(),
      order: nextOrder,
    };
    try {
      await updateDoc(doc(db, "tenants", tenantId, "setlists", selectedSetlist.id), {
        songs: [...selectedSetlist.songs, newSong],
      });
      setShowSongPicker(false);
      setPickerSongId("");
      setPickerSearch("");
      setPickerOverrideKey("");
      setPickerNotes("");
    } finally {
      setAddingToSetlist(false);
    }
  }

  async function removeSongFromSetlist(songId: string) {
    if (!tenantId || !selectedSetlist) return;
    await updateDoc(doc(db, "tenants", tenantId, "setlists", selectedSetlist.id), {
      songs: selectedSetlist.songs.filter((s) => s.songId !== songId),
    });
  }

  async function moveSong(songId: string, direction: "up" | "down") {
    if (!tenantId || !selectedSetlist) return;
    const sorted = [...selectedSetlist.songs].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((s) => s.songId === songId);
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === sorted.length - 1) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    const updated = sorted.map((s, i) => {
      if (i === idx) return { ...s, order: sorted[swapIdx].order };
      if (i === swapIdx) return { ...s, order: sorted[idx].order };
      return s;
    });
    await updateDoc(doc(db, "tenants", tenantId, "setlists", selectedSetlist.id), {
      songs: updated,
    });
  }

  async function saveSetlistNotes() {
    if (!tenantId || !selectedSetlist) return;
    setSavingSetlistNotes(true);
    setNotesSaveError("");
    try {
      await updateDoc(doc(db, "tenants", tenantId, "setlists", selectedSetlist.id), {
        notes: setlistNotesDraft,
      });
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2500);
    } catch (e) {
      console.error("saveSetlistNotes error:", e);
      setNotesSaveError("Failed to save. Please try again.");
    } finally {
      setSavingSetlistNotes(false);
    }
  }

  // Sync notes draft when setlist changes
  useEffect(() => {
    setSetlistNotesDraft(selectedSetlist?.notes ?? "");
  }, [selectedSetlist?.id]);

  // ── Song library actions ───────────────────────────────────────────────────

  function openNewSong() {
    setEditingSong(null);
    setSongForm({ ...EMPTY_SONG_FORM });
    setSongError("");
    setShowSongModal(true);
  }

  function openEditSong(song: Song) {
    setEditingSong(song);
    setSongForm({
      title: song.title,
      artist: song.artist ?? "",
      key: song.key ?? "",
      tempo: song.tempo ?? "",
      tags: (song.tags ?? []).join(", "),
      notes: song.notes ?? "",
      lyrics: song.lyrics ?? "",
    });
    setSongError("");
    setShowSongModal(true);
  }

  async function saveSong() {
    if (!tenantId) return;
    if (!songForm.title.trim()) { setSongError("Song title is required."); return; }
    setSavingSong(true);
    setSongError("");
    const payload = {
      title: songForm.title.trim(),
      artist: songForm.artist.trim(),
      key: songForm.key,
      tempo: songForm.tempo,
      tags: songForm.tags.split(",").map((t) => t.trim()).filter(Boolean),
      notes: songForm.notes.trim(),
      lyrics: songForm.lyrics.trim(),
    };
    try {
      if (editingSong) {
        await updateDoc(doc(db, "tenants", tenantId, "songs", editingSong.id), payload);
      } else {
        await addDoc(collection(db, "tenants", tenantId, "songs"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
      setShowSongModal(false);
    } catch {
      setSongError("Failed to save. Please try again.");
    } finally {
      setSavingSong(false);
    }
  }

  async function deleteSong(id: string, title: string) {
    if (!tenantId || !confirm(`Delete "${title}" from the library?`)) return;
    await deleteDoc(doc(db, "tenants", tenantId, "songs", id));
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (userLoading || loading || tierLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400 text-sm animate-pulse">Loading worship planner...</p>
      </div>
    );
  }

  if (!isPaidTier(tier)) {
    return <PaidFeatureLock feature="Worship Planning" />;
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Worship Planning</h1>
          <p className="text-sm text-gray-500 mt-0.5">Song library and service setlists</p>
        </div>
        <div className="flex gap-2">
          {canManage && tab === "setlists" && (
            <button
              onClick={() => { setShowSetlistModal(true); setSetlistError(""); }}
              className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors"
            >
              + New Setlist
            </button>
          )}
          {canManage && tab === "library" && (
            <button
              onClick={openNewSong}
              className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors"
            >
              + Add Song
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {[
          { key: "setlists", label: "Setlists" },
          { key: "library", label: `Song Library (${songs.length})` },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as ViewTab)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: Setlists ── */}
      {tab === "setlists" && (
        <div className="flex gap-5 items-start">

          {/* Setlist sidebar */}
          <div className="w-56 shrink-0 space-y-1.5">
            {setlists.length === 0 ? (
              <p className="text-sm text-gray-400 italic px-1">No setlists yet.</p>
            ) : (
              setlists.map((sl) => (
                <button
                  key={sl.id}
                  onClick={() => setSelectedSetlistId(sl.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors border ${
                    sl.id === selectedSetlistId
                      ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                      : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <p className="text-xs font-bold truncate">{sl.serviceLabel}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(sl.serviceDate + "T00:00:00").toLocaleDateString("en-ZA", {
                      day: "numeric", month: "short", year: "numeric",
                    })}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{sl.songs.length} song{sl.songs.length !== 1 ? "s" : ""}</p>
                </button>
              ))
            )}
          </div>

          {/* Setlist detail */}
          <div className="flex-1 min-w-0">
            {!selectedSetlist ? (
              <div className="bg-white rounded-xl border border-gray-200 px-6 py-14 text-center">
                <p className="text-4xl mb-3">🎵</p>
                <p className="text-sm text-gray-500">Create your first setlist to get started.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Setlist header card */}
                <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-bold text-gray-900 text-lg">{selectedSetlist.serviceLabel}</h2>
                    <p className="text-sm text-gray-500">{formatDate(selectedSetlist.serviceDate)}</p>
                  </div>
                  {canManage && (
                    <button
                      onClick={() => deleteSetlist(selectedSetlist.id)}
                      className="text-xs text-red-400 hover:text-red-600 font-medium transition-colors shrink-0"
                    >
                      Delete Setlist
                    </button>
                  )}
                </div>

                {/* Songs list */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-700">
                      Songs <span className="text-gray-400 font-normal">({sortedSetlistSongs.length})</span>
                    </p>
                    {canManage && (
                      <button
                        onClick={() => {
                          setShowSongPicker(true);
                          setPickerSearch("");
                          setPickerSongId("");
                          setPickerOverrideKey("");
                          setPickerNotes("");
                        }}
                        className="text-sm text-emerald-600 font-semibold hover:text-emerald-800 transition-colors"
                      >
                        + Add Song
                      </button>
                    )}
                  </div>

                  {sortedSetlistSongs.length === 0 ? (
                    <div className="px-5 py-10 text-center">
                      <p className="text-sm text-gray-400">No songs in this setlist yet.</p>
                      {songs.length === 0 && (
                        <p className="text-xs text-gray-400 mt-1">
                          Add songs to your library first via the "Song Library" tab.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {sortedSetlistSongs.map((s, idx) => (
                        <div key={s.songId} className="px-5 py-3 flex items-center gap-3">
                          <span className="text-xs font-bold text-gray-300 w-5 text-center">{idx + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 truncate">{s.title}</p>
                            <div className="flex items-center gap-3 mt-0.5">
                              {s.key && (
                                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono font-semibold">
                                  {s.key}
                                </span>
                              )}
                              {s.notes && <span className="text-xs text-gray-400 italic truncate">{s.notes}</span>}
                            </div>
                          </div>
                          {canManage && (
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => moveSong(s.songId, "up")}
                                disabled={idx === 0}
                                className="p-1 text-gray-300 hover:text-gray-600 disabled:opacity-30 transition-colors"
                                title="Move up"
                              >
                                ▲
                              </button>
                              <button
                                onClick={() => moveSong(s.songId, "down")}
                                disabled={idx === sortedSetlistSongs.length - 1}
                                className="p-1 text-gray-300 hover:text-gray-600 disabled:opacity-30 transition-colors"
                                title="Move down"
                              >
                                ▼
                              </button>
                              <button
                                onClick={() => removeSongFromSetlist(s.songId)}
                                className="p-1 text-gray-300 hover:text-red-500 transition-colors text-base leading-none ml-1"
                                title="Remove from setlist"
                              >
                                &times;
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Service notes */}
                <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 space-y-2">
                  <p className="text-sm font-semibold text-gray-700">Service Notes</p>
                  <textarea
                    rows={3}
                    placeholder="Transitions, key changes, special instructions..."
                    value={setlistNotesDraft}
                    onChange={(e) => setSetlistNotesDraft(e.target.value)}
                    disabled={!canManage}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-50 disabled:text-gray-400 resize-none"
                  />
                  {canManage && (
                    <div className="flex items-center justify-end gap-3">
                      {notesSaveError && (
                        <p className="text-xs text-red-500">{notesSaveError}</p>
                      )}
                      <button
                        onClick={saveSetlistNotes}
                        disabled={savingSetlistNotes}
                        className="px-4 py-1.5 bg-gray-800 text-white text-xs font-semibold rounded-lg hover:bg-gray-900 disabled:opacity-50 transition-colors"
                      >
                        {savingSetlistNotes ? "Saving..." : notesSaved ? "Saved!" : "Save Notes"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: Song Library ── */}
      {tab === "library" && (
        <div className="space-y-4">
          <input
            type="text"
            placeholder="Search songs, artist, or tag..."
            value={librarySearch}
            onChange={(e) => setLibrarySearch(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />

          {filteredLibrary.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 px-6 py-14 text-center">
              <p className="text-4xl mb-3">🎼</p>
              <p className="text-sm text-gray-500">
                {songs.length === 0
                  ? "Your song library is empty. Add your first song to get started."
                  : "No songs match your search."}
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {filteredLibrary.map((song) => (
                <div key={song.id}>
                  <div className="px-5 py-4 flex items-start gap-4">
                    <button
                      onClick={() => setExpandedSongId(expandedSongId === song.id ? null : song.id)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900">{song.title}</span>
                        {song.key && (
                          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono font-semibold">
                            {song.key}
                          </span>
                        )}
                        {song.tempo && (
                          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
                            {song.tempo}
                          </span>
                        )}
                        {(song.tags ?? []).map((tag) => (
                          <span key={tag} className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded">
                            {tag}
                          </span>
                        ))}
                      </div>
                      {song.artist && <p className="text-sm text-gray-500 mt-0.5">{song.artist}</p>}
                      {song.notes && <p className="text-xs text-gray-400 italic mt-1">{song.notes}</p>}
                    </button>

                    {canManage && (
                      <div className="flex items-center gap-3 shrink-0">
                        <button
                          onClick={() => openEditSong(song)}
                          className="text-xs text-gray-400 hover:text-gray-700 font-medium transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteSong(song.id, song.title)}
                          className="text-xs text-red-400 hover:text-red-600 font-medium transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Expanded lyrics */}
                  {expandedSongId === song.id && song.lyrics && (
                    <div className="px-5 pb-4">
                      <pre className="text-sm text-gray-600 whitespace-pre-wrap bg-gray-50 rounded-lg p-4 font-sans leading-relaxed">
                        {song.lyrics}
                      </pre>
                    </div>
                  )}
                  {expandedSongId === song.id && !song.lyrics && (
                    <div className="px-5 pb-4">
                      <p className="text-sm text-gray-400 italic">No lyrics stored for this song.</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Modal: New Setlist ── */}
      {showSetlistModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">New Setlist</h2>
              <button onClick={() => setShowSetlistModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Service Date</label>
                <DateInput
                  value={setlistForm.serviceDate}
                  onChange={(val) => setSetlistForm({ ...setlistForm, serviceDate: val })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Service Type</label>
                <select
                  value={setlistForm.serviceLabel}
                  onChange={(e) => setSetlistForm({ ...setlistForm, serviceLabel: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {SERVICE_LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  type="text"
                  placeholder="Theme, speaker, special occasion..."
                  value={setlistForm.notes}
                  onChange={(e) => setSetlistForm({ ...setlistForm, notes: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              {setlistError && <p className="text-sm text-red-500">{setlistError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setShowSetlistModal(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800">Cancel</button>
              <button
                onClick={createSetlist}
                disabled={savingSetlist}
                className="px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {savingSetlist ? "Creating..." : "Create Setlist"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Add Song to Setlist (picker) ── */}
      {showSongPicker && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[80vh]">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between shrink-0">
              <h2 className="text-lg font-bold text-gray-900">Add Song to Setlist</h2>
              <button onClick={() => setShowSongPicker(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>

            <div className="px-6 pt-4 shrink-0 space-y-3">
              <input
                type="text"
                placeholder="Search songs..."
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                autoFocus
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {songs.length === 0 ? (
              <div className="px-6 py-8 text-center">
                <p className="text-sm text-gray-400">No songs in your library yet.</p>
                <button
                  className="mt-2 text-sm text-emerald-600 font-medium hover:underline"
                  onClick={() => { setShowSongPicker(false); setTab("library"); openNewSong(); }}
                >
                  Add your first song
                </button>
              </div>
            ) : (
              <div className="overflow-y-auto flex-1 px-6 py-2">
                {pickerFiltered.map((song) => (
                  <button
                    key={song.id}
                    onClick={() => setPickerSongId(song.id === pickerSongId ? "" : song.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg mb-1 border transition-colors ${
                      pickerSongId === song.id
                        ? "bg-emerald-50 border-emerald-300"
                        : "border-transparent hover:bg-gray-50"
                    }`}
                  >
                    <p className="font-medium text-gray-900 text-sm">{song.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {song.artist && <span className="text-xs text-gray-400">{song.artist}</span>}
                      {song.key && <span className="text-xs font-mono font-semibold text-slate-500">{song.key}</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Override key + notes — shown when a song is selected */}
            {pickerSongId && (
              <div className="px-6 py-4 border-t border-gray-100 space-y-3 shrink-0">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Key for this service</label>
                    <select
                      value={pickerOverrideKey}
                      onChange={(e) => setPickerOverrideKey(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">Same as library ({songs.find((s) => s.id === pickerSongId)?.key || "not set"})</option>
                      {KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                    <input
                      type="text"
                      placeholder="Optional..."
                      value={pickerNotes}
                      onChange={(e) => setPickerNotes(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0">
              <button onClick={() => setShowSongPicker(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800">Cancel</button>
              <button
                onClick={addSongToSetlist}
                disabled={!pickerSongId || addingToSetlist}
                className="px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {addingToSetlist ? "Adding..." : "Add to Setlist"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Add / Edit Song ── */}
      {showSongModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between shrink-0">
              <h2 className="text-lg font-bold text-gray-900">{editingSong ? "Edit Song" : "Add Song to Library"}</h2>
              <button onClick={() => setShowSongModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Song Title</label>
                <input
                  type="text"
                  placeholder="e.g. How Great is Our God"
                  value={songForm.title}
                  onChange={(e) => setSongForm({ ...songForm, title: e.target.value })}
                  autoFocus
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Artist */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Artist / Songwriter</label>
                  <input
                    type="text"
                    placeholder="Chris Tomlin..."
                    value={songForm.artist}
                    onChange={(e) => setSongForm({ ...songForm, artist: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Key */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Default Key</label>
                  <select
                    value={songForm.key}
                    onChange={(e) => setSongForm({ ...songForm, key: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Not set</option>
                    {KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Tempo */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Tempo</label>
                  <select
                    value={songForm.tempo}
                    onChange={(e) => setSongForm({ ...songForm, tempo: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Not set</option>
                    {TEMPOS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                {/* Tags */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Tags <span className="text-gray-400 font-normal">(comma separated)</span></label>
                  <input
                    type="text"
                    placeholder="worship, praise, closing..."
                    value={songForm.tags}
                    onChange={(e) => setSongForm({ ...songForm, tags: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
                <input
                  type="text"
                  placeholder="Capo, arrangement notes, when to use..."
                  value={songForm.notes}
                  onChange={(e) => setSongForm({ ...songForm, notes: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Lyrics */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Lyrics <span className="text-gray-400 font-normal">(optional)</span></label>
                <textarea
                  rows={8}
                  placeholder="Paste lyrics here..."
                  value={songForm.lyrics}
                  onChange={(e) => setSongForm({ ...songForm, lyrics: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none font-sans"
                />
              </div>

              {songError && <p className="text-sm text-red-500">{songError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0">
              <button onClick={() => setShowSongModal(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800">Cancel</button>
              <button
                onClick={saveSong}
                disabled={savingSong}
                className="px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {savingSong ? "Saving..." : editingSong ? "Save Changes" : "Add to Library"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
