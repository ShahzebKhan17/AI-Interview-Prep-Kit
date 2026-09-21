"use client";

import Link from "next/link";
import { useAuth } from "../context/AuthContext";

export default function Home() {
  const { user, loading } = useAuth();

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-zinc-950 text-zinc-100">
      <div className="max-w-xl text-center space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            AI Interview Prep Kit
          </h1>
          <p className="text-zinc-400">
            Frontend & Backend Authentication Foundation
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          {loading ? (
            <span className="text-sm text-zinc-500">Checking session...</span>
          ) : user ? (
            <div className="space-y-3">
              <p className="text-sm text-zinc-300">
                Logged in as <span className="text-indigo-400 font-medium">{user.name}</span>
              </p>
              <Link
                href="/dashboard"
                className="inline-block py-2 px-5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition shadow"
              >
                Go to Dashboard
              </Link>
            </div>
          ) : (
            <>
              <Link
                href="/login"
                className="py-2 px-5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition shadow"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="py-2 px-5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-sm font-medium rounded-lg transition shadow-sm"
              >
                Create Account
              </Link>
            </>
          )}
        </div>

        <div className="inline-flex items-center gap-2 px-3 py-1 text-xs rounded-full bg-emerald-950/60 text-emerald-400 border border-emerald-800">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          Stage 2B Ready
        </div>
      </div>
    </main>
  );
}
