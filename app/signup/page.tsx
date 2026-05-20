"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "../../lib/firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";

export default function SignUp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. Create the Auth User
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 2. Grab the secure ID token from Firebase
      const idToken = await user.getIdToken();

      // 3. Create the "Tenant" record in Firestore
      await setDoc(doc(db, "tenants", user.uid), {
        ownerEmail: email,
        status: "active",
        createdAt: new Date(),
      });

      // 4. Send the token to our server to set the HttpOnly cookie
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to create session cookie");
      }

      // 5. Redirect to the dashboard
      router.push("/dashboard");
    } catch (error) {
      console.error("Error signing up:", error);
      alert("Sign up failed. Check the console.");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSignUp} className="flex flex-col gap-4 p-10">
      <h1 className="text-2xl font-bold">Register Your Church</h1>
      <input 
        type="email" 
        placeholder="Email" 
        onChange={(e) => setEmail(e.target.value)} 
        className="border p-2" 
        required 
      />
      <input 
        type="password" 
        placeholder="Password" 
        onChange={(e) => setPassword(e.target.value)} 
        className="border p-2" 
        required 
      />
      <button 
        type="submit" 
        className={`flex justify-center items-center bg-blue-600 text-white p-2 ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
        disabled={loading}
      >
        {loading && <div className="spinner"></div>}
        {loading ? "Processing..." : "Sign Up"}
      </button>
    </form>
  );
}