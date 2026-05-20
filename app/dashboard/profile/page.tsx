"use client";

import { useEffect, useState } from "react";
import { auth, db } from "../../../lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";

interface TenantData {
  ownerEmail: string;
  status: string;
  createdAt: any;
  churchName?: string;
  contactNumber?: string;
  address?: string;
}

export default function ProfilePage() {
  const [tenant, setTenant] = useState<TenantData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

  // Form states
  const [churchName, setChurchName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [address, setAddress] = useState("");

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        try {
          const docRef = doc(db, "tenants", user.uid);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            const data = docSnap.data() as TenantData;
            setTenant(data);
            setChurchName(data.churchName || "");
            setContactNumber(data.contactNumber || "");
            setAddress(data.address || "");
          }
        } catch (error) {
          console.error("Error fetching tenant data:", error);
        } finally {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;

    setSaveLoading(true);

    let formattedNumber = contactNumber.trim().replace(/\s+/g, "");
    if (formattedNumber.startsWith("0")) {
      formattedNumber = "27" + formattedNumber.substring(1);
    }

    try {
      const docRef = doc(db, "tenants", user.uid);
      const updatedFields = {
        churchName: churchName.trim(),
        contactNumber: formattedNumber,
        address: address.trim(),
      };

      await updateDoc(docRef, updatedFields);

      setTenant((prev) => prev ? { ...prev, ...updatedFields } : null);
      setIsEditing(false);
    } catch (error) {
      console.error("Error updating profile:", error);
      alert("Failed to save changes. Please try again.");
    } finally {
      setSaveLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-10 flex items-center gap-2">
        <div className="spinner !border-blue-600 !border-t-transparent"></div>
        <p className="text-gray-600">Loading your profile data...</p>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="p-10 text-red-600">
        <p>Could not load profile details. Please ensure you are logged in correctly.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl p-10 mx-auto">
      <div className="bg-white border rounded-lg p-6 shadow-sm flex flex-col gap-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Church Profile</h1>
            <p className="text-gray-500 text-sm mt-1">Manage your registered church hub details</p>
          </div>
          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-1.5 px-4 rounded transition-colors text-sm"
            >
              Edit Profile
            </button>
          )}
        </div>

        <hr className="border-gray-200" />

        {isEditing ? (
          <form onSubmit={handleSave} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Church / Ministry Name
              </label>
              <input
                type="text"
                value={churchName}
                onChange={(e) => setChurchName(e.target.value)}
                placeholder="e.g. Grace Fellowship International"
                className="border p-2 rounded text-gray-700 focus:outline-blue-500 text-base"
                required
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Contact Number
              </label>
              <input
                type="text"
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
                placeholder="e.g. 0821234567"
                className="border p-2 rounded text-gray-700 focus:outline-blue-500 text-base"
                required
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Physical Headquarters Address
              </label>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Enter church street address, city, province"
                className="border p-2 rounded text-gray-700 focus:outline-blue-500 text-base h-20 resize-none"
              />
            </div>

            <div className="flex gap-3 justify-end mt-2">
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setChurchName(tenant.churchName || "");
                  setContactNumber(tenant.contactNumber || "");
                  setAddress(tenant.address || "");
                }}
                disabled={saveLoading}
                className="text-gray-500 hover:text-gray-700 font-medium py-2 px-4 rounded text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saveLoading}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-5 rounded transition-colors text-sm flex items-center gap-2 disabled:opacity-50"
              >
                {saveLoading && <div className="spinner !w-3 !h-3"></div>}
                {saveLoading ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        ) : (
          <div className="grid grid-cols-1 gap-5">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Church Name
              </label>
              <p className="text-lg font-medium text-gray-700 mt-1">
                {tenant.churchName || "Not configured yet"}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Contact Number
              </label>
              <p className="text-lg font-medium text-gray-700 mt-1">
                {tenant.contactNumber ? `+${tenant.contactNumber}` : "Not configured yet"}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Physical Address
              </label>
              <p className="text-base text-gray-600 mt-1 whitespace-pre-wrap">
                {tenant.address || "Not configured yet"}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Registered Email Address
                </label>
                <p className="text-base font-medium text-gray-600 mt-1">{tenant.ownerEmail}</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Account Status
                </label>
                <div className="mt-1">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 uppercase">
                    {tenant.status}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Registration Date
              </label>
              <p className="text-sm text-gray-500 mt-1">
                {tenant.createdAt?.toDate ? tenant.createdAt.toDate().toLocaleDateString() : "Just now"}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}