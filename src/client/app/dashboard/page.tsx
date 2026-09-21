"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext";

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading, logout } = useAuth();

  useEffect(() => {
    // Only redirect once authentication status has been resolved
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <p className="text-sm text-zinc-400">Verifying authentication...</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return null; // Will redirect via useEffect
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-zinc-950 text-zinc-100">
      <div className="w-full max-w-lg p-8 bg-zinc-900 border border-zinc-800 rounded-xl shadow-lg space-y-6">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 text-xs rounded-full bg-indigo-950/60 text-indigo-400 border border-indigo-800">
            Authentication Verified
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Welcome, {user.name}
          </h1>
          <p className="text-sm text-zinc-400">
            Email: <span className="text-zinc-200 font-medium">{user.email}</span>
          </p>
        </div>

        <div className="p-4 bg-zinc-800/60 border border-zinc-700/60 rounded-lg text-sm text-zinc-400 space-y-1">
          <p>
            User ID: <span className="font-mono text-xs text-zinc-300">{user.id}</span>
          </p>
          <p>
            Session: <span className="text-emerald-400 font-medium">HTTP-Only Cookie Active</span>
          </p>
        </div>

        <div className="pt-2">
          <button
            onClick={handleLogout}
            className="w-full py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 hover:text-white font-medium rounded-lg shadow-sm transition focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            Logout
          </button>
        </div>
      </div>
    </main>
  );
}
