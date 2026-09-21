"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../context/AuthContext";
import { createKit, KitApiError } from "../../../lib/kits";

export default function NewKitPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [title, setTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [companyUrl, setCompanyUrl] = useState("");
  const [daysAvailable, setDaysAvailable] = useState<number | "">(5);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [user, authLoading, router]);

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (!title.trim()) {
      errors.title = "Job / Kit title is required.";
    }

    if (!jobDescription.trim()) {
      errors.jobDescription = "Job description is required.";
    }

    const urlTrimmed = companyUrl.trim();
    if (!urlTrimmed) {
      errors.companyUrl = "Company website URL is required.";
    } else if (!/^https?:\/\/.+/i.test(urlTrimmed)) {
      errors.companyUrl = "Company URL must start with http:// or https://";
    }

    const days = typeof daysAvailable === "number" ? daysAvailable : parseInt(daysAvailable, 10);
    if (isNaN(days) || days < 1 || !Number.isInteger(days)) {
      errors.daysAvailable = "Days available must be an integer of at least 1.";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!validate()) {
      return;
    }

    setSubmitting(true);

    try {
      const days = typeof daysAvailable === "number" ? daysAvailable : parseInt(daysAvailable, 10);
      const kit = await createKit({
        title: title.trim(),
        jobDescription: jobDescription.trim(),
        companyUrl: companyUrl.trim(),
        daysAvailable: days,
      });

      // Redirect immediately to the newly created Kit details page
      router.push(`/kits/${kit.id}`);
    } catch (err) {
      if (err instanceof KitApiError && err.status === 401) {
        router.replace("/login");
        return;
      }
      setFormError(
        (err as Error)?.message || "Failed to create kit. Please try again."
      );
      setSubmitting(false);
    }
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
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Link href="/dashboard" className="hover:text-zinc-200 transition">
            &larr; Back to Dashboard
          </Link>
        </div>

        <div className="p-8 bg-zinc-900 border border-zinc-800 rounded-xl shadow-lg space-y-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Create Interview Kit
            </h1>
            <p className="text-sm text-zinc-400">
              Provide role details to generate your tailored study roadmap and practice material.
            </p>
          </div>

          {formError && (
            <div
              role="alert"
              className="p-3 text-sm rounded-lg bg-red-950/60 border border-red-800 text-red-300"
            >
              {formError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Title */}
            <div className="space-y-1.5">
              <label
                htmlFor="title"
                className="block text-sm font-medium text-zinc-300"
              >
                Kit / Job Title <span className="text-indigo-400">*</span>
              </label>
              <input
                id="title"
                type="text"
                disabled={submitting}
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (fieldErrors.title) {
                    setFieldErrors((prev) => ({ ...prev, title: "" }));
                  }
                }}
                placeholder="e.g. Senior Full Stack Engineer"
                className={`w-full px-3.5 py-2.5 bg-zinc-800 border rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 ${
                  fieldErrors.title ? "border-red-600" : "border-zinc-700"
                }`}
              />
              {fieldErrors.title && (
                <p className="text-xs text-red-400">{fieldErrors.title}</p>
              )}
            </div>

            {/* Company Website URL */}
            <div className="space-y-1.5">
              <label
                htmlFor="companyUrl"
                className="block text-sm font-medium text-zinc-300"
              >
                Company Website URL <span className="text-indigo-400">*</span>
              </label>
              <input
                id="companyUrl"
                type="text"
                disabled={submitting}
                value={companyUrl}
                onChange={(e) => {
                  setCompanyUrl(e.target.value);
                  if (fieldErrors.companyUrl) {
                    setFieldErrors((prev) => ({ ...prev, companyUrl: "" }));
                  }
                }}
                placeholder="https://company.com"
                className={`w-full px-3.5 py-2.5 bg-zinc-800 border rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 ${
                  fieldErrors.companyUrl ? "border-red-600" : "border-zinc-700"
                }`}
              />
              {fieldErrors.companyUrl && (
                <p className="text-xs text-red-400">{fieldErrors.companyUrl}</p>
              )}
            </div>

            {/* Days Available */}
            <div className="space-y-1.5">
              <label
                htmlFor="daysAvailable"
                className="block text-sm font-medium text-zinc-300"
              >
                Days Available to Prepare <span className="text-indigo-400">*</span>
              </label>
              <input
                id="daysAvailable"
                type="number"
                min={1}
                step={1}
                disabled={submitting}
                value={daysAvailable}
                onChange={(e) => {
                  const val = e.target.value === "" ? "" : parseInt(e.target.value, 10);
                  setDaysAvailable(val);
                  if (fieldErrors.daysAvailable) {
                    setFieldErrors((prev) => ({ ...prev, daysAvailable: "" }));
                  }
                }}
                placeholder="5"
                className={`w-full px-3.5 py-2.5 bg-zinc-800 border rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 ${
                  fieldErrors.daysAvailable ? "border-red-600" : "border-zinc-700"
                }`}
              />
              {fieldErrors.daysAvailable && (
                <p className="text-xs text-red-400">{fieldErrors.daysAvailable}</p>
              )}
            </div>

            {/* Job Description */}
            <div className="space-y-1.5">
              <label
                htmlFor="jobDescription"
                className="block text-sm font-medium text-zinc-300"
              >
                Job Description <span className="text-indigo-400">*</span>
              </label>
              <textarea
                id="jobDescription"
                rows={6}
                disabled={submitting}
                value={jobDescription}
                onChange={(e) => {
                  setJobDescription(e.target.value);
                  if (fieldErrors.jobDescription) {
                    setFieldErrors((prev) => ({ ...prev, jobDescription: "" }));
                  }
                }}
                placeholder="Paste the complete job description here..."
                className={`w-full px-3.5 py-2.5 bg-zinc-800 border rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 resize-y ${
                  fieldErrors.jobDescription ? "border-red-600" : "border-zinc-700"
                }`}
              />
              {fieldErrors.jobDescription && (
                <p className="text-xs text-red-400">{fieldErrors.jobDescription}</p>
              )}
            </div>

            {/* Submit & Cancel buttons */}
            <div className="pt-2 flex items-center justify-end gap-3">
              <Link
                href="/dashboard"
                className="py-2.5 px-4 text-sm font-medium text-zinc-400 hover:text-zinc-200 transition"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={submitting}
                className="py-2.5 px-6 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg text-sm shadow transition focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {submitting ? "Creating..." : "Create Interview Kit"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
