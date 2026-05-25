"use client";

import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../../lib/firebase";

const DEFAULT_MINISTRIES = [
  "Intercessory",
  "Band",
  "Worship Team",
  "Media Team (Sound)",
  "Media Team (Visuals)",
  "Ushering",
  "Hospitality",
  "Kingdom Kids",
  "Events Security",
];

const DEFAULT_MEMBERSHIP_TYPES = ["Full Active", "Associate"];

const DEFAULT_CHURCH_ROLES = [
  "Member",
  "Pastor",
  "Youth Leader",
  "Treasurer",
  "Branch Administrator",
];

interface ProfileFormProps {
  initialData: {
    ownerEmail: string;
    status: string;
    createdAt: string;
    churchName?: string;
    contactNumber?: string;
    address?: string;
    ministries?: string[];
    membershipTypes?: string[];
    churchRoles?: string[];
  };
  tenantId: string; // The Firestore document ID of the tenant — NOT the auth UID
}

// Reusable editable tag list component
function EditableList({
  label,
  items,
  onChange,
}: {
  label: string;
  items: string[];
  onChange: (updated: string[]) => void;
}) {
  const [inputValue, setInputValue] = useState("");

  const addItem = () => {
    const trimmed = inputValue.trim();
    if (!trimmed || items.includes(trimmed)) return;
    onChange([...items, trimmed]);
    setInputValue("");
  };

  const removeItem = (item: string) => {
    onChange(items.filter((i) => i !== item));
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
        {label}
      </label>

      {/* Existing tags */}
      <div className="flex flex-wrap gap-2 min-h-[36px]">
        {items.length === 0 && (
          <span className="text-sm text-gray-400 italic">No items yet</span>
        )}
        {items.map((item) => (
          <span
            key={item}
            className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-3 py-1 rounded-full"
          >
            {item}
            <button
              type="button"
              onClick={() => removeItem(item)}
              className="text-emerald-500 hover:text-red-500 transition-colors leading-none font-bold text-base"
              aria-label={`Remove ${item}`}
            >
              &times;
            </button>
          </span>
        ))}
      </div>

      {/* Add new item */}
      <div className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addItem();
            }
          }}
          placeholder={`Add a new item...`}
          className="flex-1 border p-2 rounded text-gray-700 focus:outline-emerald-500 text-sm"
        />
        <button
          type="button"
          onClick={addItem}
          disabled={!inputValue.trim()}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded transition-colors"
        >
          Add
        </button>
      </div>
    </div>
  );
}

// Read-only tag display used in view mode
function TagDisplay({
  label,
  items,
  emptyText = "Not configured yet",
}: {
  label: string;
  items: string[];
  emptyText?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">
        {label}
      </label>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {items.length === 0 ? (
          <span className="text-sm text-gray-400 italic">{emptyText}</span>
        ) : (
          items.map((item) => (
            <span
              key={item}
              className="inline-flex items-center bg-gray-100 text-gray-700 text-sm px-3 py-0.5 rounded-full"
            >
              {item}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

export default function ProfileForm({ initialData, tenantId }: ProfileFormProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

  // Basic profile fields
  const [churchName, setChurchName] = useState(initialData.churchName || "");
  const [contactNumber, setContactNumber] = useState(initialData.contactNumber || "");
  const [address, setAddress] = useState(initialData.address || "");

  // Configurable list fields — fall back to defaults if not yet set in Firestore
  const [ministries, setMinistries] = useState<string[]>(
    initialData.ministries ?? DEFAULT_MINISTRIES
  );
  const [membershipTypes, setMembershipTypes] = useState<string[]>(
    initialData.membershipTypes ?? DEFAULT_MEMBERSHIP_TYPES
  );
  const [churchRoles, setChurchRoles] = useState<string[]>(
    initialData.churchRoles ?? DEFAULT_CHURCH_ROLES
  );

  // Snapshot used to restore on cancel
  const [tenant, setTenant] = useState(initialData);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveLoading(true);

    let formattedNumber = contactNumber.trim().replace(/\s+/g, "");
    if (formattedNumber.startsWith("0")) {
      formattedNumber = "27" + formattedNumber.substring(1);
    }

    try {
      const docRef = doc(db, "tenants", tenantId);
      const updatedFields = {
        churchName: churchName.trim(),
        contactNumber: formattedNumber,
        address: address.trim(),
        ministries,
        membershipTypes,
        churchRoles,
      };

      await updateDoc(docRef, updatedFields);
      setTenant((prev) => ({ ...prev, ...updatedFields }));
      setIsEditing(false);
    } catch (error) {
      console.error("Error updating profile:", error);
      alert("Failed to save changes. Please try again.");
    } finally {
      setSaveLoading(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setChurchName(tenant.churchName || "");
    setContactNumber(tenant.contactNumber || "");
    setAddress(tenant.address || "");
    setMinistries(tenant.ministries ?? DEFAULT_MINISTRIES);
    setMembershipTypes(tenant.membershipTypes ?? DEFAULT_MEMBERSHIP_TYPES);
    setChurchRoles(tenant.churchRoles ?? DEFAULT_CHURCH_ROLES);
  };

  /* ─────────────────────────── EDIT MODE ─────────────────────────── */
  if (isEditing) {
    return (
      <form onSubmit={handleSave} className="flex flex-col gap-6">
        {/* Basic info */}
        <div className="flex flex-col gap-5">
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
        </div>

        {/* Configurable lists */}
        <div className="border-t border-gray-100 pt-5 flex flex-col gap-6">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Membership Configuration
            </p>
            <p className="text-sm text-gray-500 mt-1">
              These lists power the dropdowns on the Manage Membership page. Add or remove items to match your church.
            </p>
          </div>

          <EditableList
            label="Ministries"
            items={ministries}
            onChange={setMinistries}
          />

          <EditableList
            label="Membership Types"
            items={membershipTypes}
            onChange={setMembershipTypes}
          />

          <EditableList
            label="Church Roles"
            items={churchRoles}
            onChange={setChurchRoles}
          />
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 justify-end mt-2">
          <button
            type="button"
            onClick={handleCancel}
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

  /* ─────────────────────────── VIEW MODE ─────────────────────────── */
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

      {/* Configurable lists — read only */}
      <div className="border-t border-gray-100 pt-5 flex flex-col gap-5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Membership Configuration
        </p>

        <TagDisplay label="Ministries" items={ministries} />
        <TagDisplay label="Membership Types" items={membershipTypes} />
        <TagDisplay label="Church Roles" items={churchRoles} />
      </div>
    </div>
  );
}
