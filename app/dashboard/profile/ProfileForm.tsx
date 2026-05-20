"use client";

import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../../lib/firebase";

interface ProfileFormProps {
  initialData: {
    ownerEmail: string;
    status: string;
    createdAt: string;
    churchName?: string;
    contactNumber?: string;
    address?: string;
  };
  userId: string;
}

export default function ProfileForm({ initialData, userId }: ProfileFormProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

  const [churchName, setChurchName] = useState(initialData.churchName || "");
  const [contactNumber, setContactNumber] = useState(initialData.contactNumber || "");
  const [address, setAddress] = useState(initialData.address || "");
  const [tenant, setTenant] = useState(initialData);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveLoading(true);

    let formattedNumber = contactNumber.trim().replace(/\s+/g, "");
    if (formattedNumber.startsWith("0")) {
      formattedNumber = "27" + formattedNumber.substring(1);
    }

    try {
      const docRef = doc(db, "tenants", userId);
      const updatedFields = {
        churchName: churchName.trim(),
        contactNumber: formattedNumber,
        address: address.trim(),
      };

      await updateDoc(docRef, updatedFields);

      setTenant((prev) => ({ ...prev, ...updatedFields }));
      setIsEditing(false);
    } catch (error) {
      console.error("Error updating profile input collection:", error);
      alert("Failed to save changes. Please try again.");
    } finally {
      setSaveLoading(false);
    }
  };

  if (isEditing) {
    return (
      <form onSubmit={handleSave} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Church / Ministry Name
          </label>
          <input
            type="text"
            value={churchName}
            onChange={(e) => setChurchName(e.target.value)}
            className="border p-2 rounded text-gray-700 focus:outline-emerald-500 text-base"
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
            className="border p-2 rounded text-gray-700 focus:outline-emerald-500 text-base"
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
            className="border p-2 rounded text-gray-700 focus:outline-emerald-500 text-base h-20 resize-none"
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
            className="text-gray-500 hover:text-gray-700 font-medium py-2 px-4 rounded text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saveLoading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 px-5 rounded transition-colors text-sm flex items-center gap-2 disabled:opacity-50"
          >
            {saveLoading ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5">
      <div className="flex justify-between items-start">
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Church Name
          </label>
          <p className="text-lg font-medium text-gray-700 mt-1">
            {tenant.churchName || "Not configured yet"}
          </p>
        </div>
        <button
          onClick={() => setIsEditing(true)}
          className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-1.5 px-4 rounded transition-colors text-sm"
        >
          Edit Profile
        </button>
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

      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100">
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
        <p className="text-sm text-gray-500 mt-1">{tenant.createdAt}</p>
      </div>
    </div>
  );
}