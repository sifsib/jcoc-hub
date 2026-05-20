"use client";

import { useEffect, useState } from "react";
import { auth, db } from "../../../lib/firebase";
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  deleteDoc, 
  doc, 
  serverTimestamp 
} from "firebase/firestore";

interface Member {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: string;
  dob?: string;
  region?: string;
  ministry?: string;
}

export default function RosterPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);

  // Form states
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("Member");
  const [dob, setDob] = useState("");
  const [region, setRegion] = useState("");
  const [ministry, setMinistry] = useState("");

  const fetchRoster = async (uid: string) => {
    try {
      const q = query(collection(db, "members"), where("tenantId", "==", uid));
      const querySnapshot = await getDocs(q);
      const memberList: Member[] = [];
      
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        memberList.push({
          id: docSnap.id,
          fullName: data.fullName,
          email: data.email,
          phone: data.phone,
          role: data.role,
          dob: data.dob,
          region: data.region,
          ministry: data.ministry,
        });
      });
      
      setMembers(memberList);
    } catch (error) {
      console.error("Error fetching roster records:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        fetchRoster(user.uid);
      } else {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;

    setSubmitLoading(true);

    let formattedPhone = phone.trim().replace(/\s+/g, "");
    if (formattedPhone.startsWith("0")) {
      formattedPhone = "27" + formattedPhone.substring(1);
    }

    try {
      const newMemberData = {
        tenantId: user.uid,
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        phone: formattedPhone,
        role: role,
        dob: dob,
        region: region.trim(),
        ministry: ministry.trim(),
        createdAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, "members"), newMemberData);

      setMembers((prev) => [
        ...prev,
        {
          id: docRef.id,
          ...newMemberData
        },
      ]);

      // Clear form
      setFullName("");
      setEmail("");
      setPhone("");
      setRole("Member");
      setDob("");
      setRegion("");
      setMinistry("");
    } catch (error) {
      console.error("Error adding member record:", error);
      alert("Failed to register member. Please check configuration.");
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDeleteMember = async (id: string) => {
    if (!confirm("Are you sure you want to remove this person from the registry?")) return;

    try {
      await deleteDoc(doc(db, "members", id));
      setMembers((prev) => prev.filter((m) => m.id !== id));
    } catch (error) {
      console.error("Error deleting member document:", error);
      alert("Could not remove record. Try again.");
    }
  };

  // Helper function ported from your original app to calculate birthdays
  const getDaysUntilBirthday = (dobStr?: string) => {
    if (!dobStr) return null;
    const parts = dobStr.split('-');
    if (parts.length !== 3) return null;
    
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    if (isNaN(month) || isNaN(day)) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let next = new Date(today.getFullYear(), month, day);
    if (next < today) {
      next = new Date(today.getFullYear() + 1, month, day);
    }
    
    const ms = next.getTime() - today.getTime();
    return Math.round(ms / (1000 * 60 * 60 * 24));
  };

  const formatBirthday = (dobStr?: string) => {
    if (!dobStr) return "";
    const date = new Date(dobStr);
    return date.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });
  };

  if (loading) {
    return (
      <div className="p-10 flex items-center gap-2">
        <div className="spinner !border-blue-600 !border-t-transparent"></div>
        <p className="text-gray-600">Loading congregation records...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl p-10 mx-auto flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Church Management Roster</h1>
        <p className="text-gray-500 text-sm mt-1">Register, organize, and monitor active leadership and congregation members</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Registration Form */}
        <div className="bg-white border rounded-lg p-5 shadow-sm flex flex-col gap-4">
          <h2 className="text-lg font-bold text-gray-700">Add New Record</h2>
          <hr className="border-gray-100" />
          
          <form onSubmit={handleAddMember} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Full Name</label>
              <input 
                type="text" 
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. John Doe"
                className="border p-2 rounded text-sm text-gray-700 focus:outline-blue-500"
                required 
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Contact Number</label>
                <input 
                  type="text" 
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 0712345678"
                  className="border p-2 rounded text-sm text-gray-700 focus:outline-blue-500"
                  required 
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Date of Birth</label>
                <input 
                  type="date" 
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  className="border p-2 rounded text-sm text-gray-700 focus:outline-blue-500"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Email Address</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. john@gmail.com"
                className="border p-2 rounded text-sm text-gray-700 focus:outline-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Region / Branch</label>
                <input 
                  type="text" 
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  placeholder="e.g. North Region"
                  className="border p-2 rounded text-sm text-gray-700 focus:outline-blue-500"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Ministry</label>
                <input 
                  type="text" 
                  value={ministry}
                  onChange={(e) => setMinistry(e.target.value)}
                  placeholder="e.g. Youth"
                  className="border p-2 rounded text-sm text-gray-700 focus:outline-blue-500"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Assigned Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="border p-2 rounded text-sm text-gray-700 bg-white focus:outline-blue-500"
              >
                <option value="Member">Member</option>
                <option value="Pastor">Pastor</option>
                <option value="Youth Leader">Youth Leader</option>
                <option value="Treasurer">Treasurer</option>
                <option value="Branch Administrator">Branch Administrator</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={submitLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition-colors text-sm flex justify-center items-center gap-2 mt-2 disabled:opacity-50"
            >
              {submitLoading && <div className="spinner !w-3 !h-3"></div>}
              {submitLoading ? "Saving..." : "Add to Roster"}
            </button>
          </form>
        </div>

        {/* Data Table */}
        <div className="lg:col-span-2 bg-white border rounded-lg shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-100">
            <h2 className="text-lg font-bold text-gray-700">Active Register ({members.length})</h2>
          </div>
          
          {members.length === 0 ? (
            <div className="p-10 text-center text-gray-400 text-sm">
              No members found in your roster. Use the form to register your first member.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-gray-400 font-semibold uppercase text-xs tracking-wider">
                    <th className="p-4">Name & Department</th>
                    <th className="p-4">Contact & Info</th>
                    <th className="p-4">Role</th>
                    <th className="p-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  {members.map((member) => {
                    const daysToBday = getDaysUntilBirthday(member.dob);
                    
                    return (
                      <tr key={member.id} className="hover:bg-gray-50/70 transition-colors">
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-gray-900">{member.fullName}</p>
                            {daysToBday !== null && daysToBday <= 14 && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                                {daysToBday === 0 ? "🎂 Today!" : `🎂 In ${daysToBday} days`}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                            {member.region && <span className="bg-gray-100 px-1.5 py-0.5 rounded">{member.region}</span>}
                            {member.ministry && <span className="bg-gray-100 px-1.5 py-0.5 rounded">{member.ministry}</span>}
                          </div>
                        </td>
                        <td className="p-4">
                          <p className="font-mono text-xs text-gray-600">+{member.phone}</p>
                          {member.dob && <p className="text-xs text-gray-400 mt-0.5">Born: {formatBirthday(member.dob)}</p>}
                        </td>
                        <td className="p-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wide ${
                            member.role === "Pastor" ? "bg-purple-100 text-purple-800" :
                            member.role === "Treasurer" ? "bg-amber-100 text-amber-800" :
                            member.role === "Branch Administrator" ? "bg-blue-100 text-blue-800" :
                            "bg-gray-100 text-gray-600"
                          }`}>
                            {member.role}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => handleDeleteMember(member.id)}
                            className="text-red-500 hover:text-red-700 font-medium text-xs transition-colors"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}