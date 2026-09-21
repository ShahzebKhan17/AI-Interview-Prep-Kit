"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext";
import { IKit } from "@shared/types";
import { getKits, KitApiError } from "../../lib/kits";

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();

  const [kits, setKits] = useState<IKit[]>([]);
  const [kitsLoading, setKitsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [user, authLoading, router]);

  const loadKits = useCallback(async () => {
    setError(null);
    setKitsLoading(true);
    try {
      const data = await getKits();
      setKits(data);
    } catch (err) {
      if (err instanceof KitApiError && err.status === 401) {
        router.replace("/login");
        return;
      }
      setError(
        (err as Error)?.message || "Failed to load interview kits. Please try again."
      );
    } finally {
      setKitsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (user) {
      loadKits();
    }
  }, [user, loadKits]);

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  if (authLoading) {
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
    return null;
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-6 md:p-10">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-zinc-800">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Dashboard
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              Welcome back, <span className="text-zinc-200 font-medium">{user.name}</span>{" "}
              ({user.email})
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/kits/new"
              className="py-2.5 px-5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg text-sm transition shadow-sm"
            >
              + Create Interview Kit
            </Link>
            <button
              onClick={handleLogout}
              className="py-2.5 px-4 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white font-medium rounded-lg text-sm transition cursor-pointer"
            >
              Logout
            </button>
          </div>
        </header>

        {/* Kits Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">
              Your Interview Kits
            </h2>
            <span className="text-xs text-zinc-500">
              {kits.length} {kits.length === 1 ? "kit" : "kits"} total
            </span>
          </div>

          {/* Loading State */}
          {kitsLoading && (
            <div className="flex flex-col items-center justify-center p-12 bg-zinc-900/50 border border-zinc-800/80 rounded-xl space-y-3">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
              <p className="text-sm text-zinc-400">Loading your kits...</p>
            </div>
          )}

          {/* Error State */}
          {!kitsLoading && error && (
            <div className="p-6 bg-red-950/40 border border-red-800/80 rounded-xl space-y-3 text-center">
              <p className="text-red-300 text-sm">{error}</p>
              <button
                onClick={loadKits}
                className="py-1.5 px-4 bg-red-900/60 hover:bg-red-800 border border-red-700 text-white text-xs font-medium rounded-lg transition cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}

          {/* Empty State */}
          {!kitsLoading && !error && kits.length === 0 && (
            <div className="p-12 text-center bg-zinc-900/30 border border-dashed border-zinc-800 rounded-xl space-y-4">
              <div className="h-12 w-12 mx-auto rounded-full bg-indigo-950/60 border border-indigo-800 flex items-center justify-center text-indigo-400 text-xl font-bold">
                📋
              </div>
              <div className="space-y-1 max-w-sm mx-auto">
                <h3 className="text-base font-medium text-white">No interview kits yet</h3>
                <p className="text-sm text-zinc-400">
                  Create your first personalized interview prep kit by entering a job title and description.
                </p>
              </div>
              <Link
                href="/kits/new"
                className="inline-block py-2.5 px-5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition shadow-sm"
              >
                Create Interview Kit
              </Link>
            </div>
          )}

          {/* Kits List Grid */}
          {!kitsLoading && !error && kits.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {kits.map((kit) => (
                <Link
                  key={kit.id}
                  href={`/kits/${kit.id}`}
                  className="block p-5 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 rounded-xl transition shadow-sm space-y-3 group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-lg font-semibold text-white group-hover:text-indigo-400 transition">
                      {kit.title}
                    </h3>
                    <span
                      className={`px-2.5 py-0.5 text-xs font-medium rounded-full border uppercase tracking-wider ${
                        kit.status === "ready"
                          ? "bg-emerald-950/60 text-emerald-400 border-emerald-800"
                          : kit.status === "generating"
                          ? "bg-amber-950/60 text-amber-400 border-amber-800"
                          : "bg-zinc-800 text-zinc-300 border-zinc-700"
                      }`}
                    >
                      {kit.status}
                    </span>
                  </div>

                  <div className="space-y-1 text-xs text-zinc-400">
                    <p className="truncate">
                      <span className="text-zinc-500">Company:</span>{" "}
                      <span className="text-zinc-300">{kit.companyUrl}</span>
                    </p>
                    <p>
                      <span className="text-zinc-500">Preparation Window:</span>{" "}
                      <span className="text-zinc-300 font-medium">{kit.daysAvailable} {kit.daysAvailable === 1 ? "day" : "days"}</span>
                    </p>
                    {kit.createdAt && (
                      <p className="text-zinc-500">
                        Created: {new Date(kit.createdAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>

                  <div className="pt-2 flex items-center text-xs text-indigo-400 group-hover:text-indigo-300 font-medium">
                    View Kit Details &rarr;
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
