"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "../../../context/AuthContext";
import { IKit } from "@shared/types";
import { getKit, KitApiError } from "../../../lib/kits";

export default function KitDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const rawId = params?.id;
  const kitId = Array.isArray(rawId) ? rawId[0] : rawId;

  const { user, loading: authLoading } = useAuth();
  const [kit, setKit] = useState<IKit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [user, authLoading, router]);

  const loadKit = useCallback(async () => {
    if (!kitId) return;

    setLoading(true);
    setError(null);

    try {
      const data = await getKit(kitId);
      setKit(data);
    } catch (err) {
      if (err instanceof KitApiError) {
        if (err.status === 401) {
          router.replace("/login");
          return;
        }
        if (err.status === 404) {
          setError("Kit not found or you do not have access to this kit.");
          return;
        }
      }
      setError(
        (err as Error)?.message || "Failed to load kit details. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }, [kitId, router]);

  useEffect(() => {
    if (user && kitId) {
      loadKit();
    }
  }, [user, kitId, loadKit]);

  if (authLoading || (loading && !error)) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <p className="text-sm text-zinc-400">Loading interview kit...</p>
        </div>
      </main>
    );
  }

  if (error || !kit) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100 p-6 md:p-10 flex items-center justify-center">
        <div className="max-w-md w-full p-8 bg-zinc-900 border border-zinc-800 rounded-xl text-center space-y-4 shadow-lg">
          <div className="h-12 w-12 mx-auto rounded-full bg-red-950/60 border border-red-800 flex items-center justify-center text-red-400 text-xl font-bold">
            !
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-white">Unavailable</h2>
            <p className="text-sm text-zinc-400">
              {error || "Kit not found or you do not have access to this kit."}
            </p>
          </div>
          <Link
            href="/dashboard"
            className="inline-block py-2 px-5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium rounded-lg transition"
          >
            &larr; Return to Dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-6 md:p-10">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between">
          <Link
            href="/dashboard"
            className="text-sm text-zinc-400 hover:text-zinc-200 transition"
          >
            &larr; Back to Dashboard
          </Link>
          <span
            className={`px-3 py-1 text-xs font-semibold rounded-full border uppercase tracking-wider ${
              kit.status === "ready"
                ? "bg-emerald-950/60 text-emerald-400 border-emerald-800"
                : kit.status === "generating"
                ? "bg-amber-950/60 text-amber-400 border-amber-800"
                : "bg-zinc-800 text-zinc-300 border-zinc-700"
            }`}
          >
            Status: {kit.status}
          </span>
        </div>

        {/* Kit Header Card */}
        <div className="p-8 bg-zinc-900 border border-zinc-800 rounded-xl shadow-lg space-y-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 text-xs rounded-full bg-indigo-950/60 text-indigo-400 border border-indigo-800">
              Draft Preparation Kit
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              {kit.title}
            </h1>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 text-sm">
            <div className="p-3 bg-zinc-800/60 border border-zinc-700/60 rounded-lg">
              <span className="text-xs text-zinc-500 block">Company Website</span>
              <a
                href={kit.companyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-400 hover:text-indigo-300 font-medium truncate block mt-0.5"
              >
                {kit.companyUrl} &nearr;
              </a>
            </div>

            <div className="p-3 bg-zinc-800/60 border border-zinc-700/60 rounded-lg">
              <span className="text-xs text-zinc-500 block">Preparation Window</span>
              <span className="text-zinc-200 font-medium block mt-0.5">
                {kit.daysAvailable} {kit.daysAvailable === 1 ? "day" : "days"}
              </span>
            </div>

            <div className="p-3 bg-zinc-800/60 border border-zinc-700/60 rounded-lg">
              <span className="text-xs text-zinc-500 block">Created On</span>
              <span className="text-zinc-200 font-medium block mt-0.5">
                {kit.createdAt ? new Date(kit.createdAt).toLocaleDateString() : "Just now"}
              </span>
            </div>
          </div>
        </div>

        {/* Stage Status Notice */}
        <div className="p-4 bg-indigo-950/30 border border-indigo-800/50 rounded-xl flex items-center gap-3">
          <span className="text-indigo-400 text-lg">ℹ️</span>
          <p className="text-sm text-indigo-200">
            Your interview preparation kit will be generated in the next stages.
          </p>
        </div>

        {/* Job Description Card */}
        <div className="p-8 bg-zinc-900 border border-zinc-800 rounded-xl shadow-lg space-y-3">
          <h2 className="text-lg font-semibold text-white">Job Description</h2>
          <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-300 whitespace-pre-wrap font-sans leading-relaxed">
            {kit.jobDescription}
          </div>
        </div>
      </div>
    </main>
  );
}
