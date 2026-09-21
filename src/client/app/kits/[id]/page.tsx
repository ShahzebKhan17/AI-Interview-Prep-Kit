"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "../../../context/AuthContext";
import { IKit, IRequirement, ISource, IQuestion, ICoverageReport, IRequirementCoverage } from "@shared/types";
import { getKit, extractKitRequirements, researchCompanyBrief, generateKitQuestions, getKitCoverage, KitApiError } from "../../../lib/kits";

export default function KitDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const rawId = params?.id;
  const kitId = Array.isArray(rawId) ? rawId[0] : rawId;

  const { user, loading: authLoading } = useAuth();
  const [kit, setKit] = useState<IKit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [researching, setResearching] = useState(false);
  const [researchError, setResearchError] = useState<string | null>(null);
  const [generatingQuestions, setGeneratingQuestions] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [coverage, setCoverage] = useState<ICoverageReport | null>(null);
  const [loadingCoverage, setLoadingCoverage] = useState(false);
  const [coverageError, setCoverageError] = useState<string | null>(null);

  const fetchCoverage = useCallback(async (id: string) => {
    setLoadingCoverage(true);
    setCoverageError(null);
    try {
      const rep = await getKitCoverage(id);
      setCoverage(rep);
    } catch (err) {
      if (err instanceof KitApiError && err.status === 400) {
        setCoverage(null);
      } else {
        setCoverageError(
          (err as Error)?.message || "Failed to load coverage report."
        );
      }
    } finally {
      setLoadingCoverage(false);
    }
  }, []);

  const handleExtractRequirements = async () => {
    if (!kit) return;
    setExtracting(true);
    setExtractionError(null);

    try {
      const extracted = await extractKitRequirements(kit.id, kit.jobDescription);
      setKit((prev) => (prev ? { ...prev, requirements: extracted } : prev));
      fetchCoverage(kit.id);
    } catch (err) {
      setExtractionError(
        (err as Error)?.message || "Failed to extract requirements. Please try again."
      );
    } finally {
      setExtracting(false);
    }
  };

  const handleResearchCompany = async () => {
    if (!kit) return;
    setResearching(true);
    setResearchError(null);

    try {
      const brief = await researchCompanyBrief(kit.id, kit.companyUrl);
      setKit((prev) => (prev ? { ...prev, companyBrief: brief } : prev));
    } catch (err) {
      setResearchError(
        (err as Error)?.message || "Failed to research company. Please try again."
      );
    } finally {
      setResearching(false);
    }
  };

  const handleGenerateQuestions = async () => {
    if (!kit) return;
    if (!kit.requirements || kit.requirements.length === 0) {
      setGenerationError("Please extract job requirements before generating questions.");
      return;
    }

    setGeneratingQuestions(true);
    setGenerationError(null);

    try {
      const questions = await generateKitQuestions(kit.id);
      setKit((prev) => (prev ? { ...prev, questionBank: questions } : prev));
      fetchCoverage(kit.id);
    } catch (err) {
      setGenerationError(
        (err as Error)?.message || "Failed to generate question bank. Please try again."
      );
    } finally {
      setGeneratingQuestions(false);
    }
  };

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
      if (data.requirements && data.requirements.length > 0) {
        fetchCoverage(data.id);
      }
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
  }, [kitId, router, fetchCoverage]);

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

        {/* Extracted Job Requirements Section (Stage 5.3) */}
        <div className="p-8 bg-zinc-900 border border-zinc-800 rounded-xl shadow-lg space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-semibold text-white">Extracted Requirements</h2>
                {kit.requirements && kit.requirements.length > 0 && (
                  <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-indigo-950/60 text-indigo-400 border border-indigo-800">
                    {kit.requirements.length} {kit.requirements.length === 1 ? "Requirement" : "Requirements"}
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                Structured technical, behavioral, and domain requirements extracted from the Job Description.
              </p>
            </div>

            <button
              onClick={handleExtractRequirements}
              disabled={extracting}
              className="inline-flex items-center justify-center gap-2 py-2 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-medium rounded-lg text-sm transition focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer disabled:cursor-not-allowed shrink-0"
            >
              {extracting ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Extracting...</span>
                </>
              ) : kit.requirements && kit.requirements.length > 0 ? (
                <span>Re-extract Requirements</span>
              ) : (
                <span>Extract Requirements</span>
              )}
            </button>
          </div>

          {extractionError && (
            <div
              role="alert"
              className="p-3 text-sm rounded-lg bg-red-950/60 border border-red-800 text-red-300"
            >
              {extractionError}
            </div>
          )}

          {extracting && (
            <div className="p-6 bg-zinc-950 border border-zinc-800 rounded-lg flex flex-col items-center justify-center gap-3 text-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
              <p className="text-sm text-zinc-300 font-medium">
                Analyzing Job Description and extracting structured requirements...
              </p>
              <p className="text-xs text-zinc-500">
                Categorizing into technical, behavioral, and domain requirements with deterministic IDs.
              </p>
            </div>
          )}

          {!extracting && (!kit.requirements || kit.requirements.length === 0) && (
            <div className="p-6 bg-zinc-950/60 border border-dashed border-zinc-800 rounded-lg text-center space-y-2">
              <p className="text-sm text-zinc-400">
                No requirements have been extracted for this kit yet.
              </p>
              <p className="text-xs text-zinc-500">
                Click &quot;Extract Requirements&quot; above to run the extraction service on this Job Description.
              </p>
            </div>
          )}

          {!extracting && kit.requirements && kit.requirements.length > 0 && (
            <div className="divide-y divide-zinc-800/80 border border-zinc-800 rounded-lg overflow-hidden bg-zinc-950">
              {kit.requirements.map((req: IRequirement) => (
                <div
                  key={req.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-zinc-900/50 transition"
                >
                  <div className="flex items-start gap-3">
                    <span className="px-2 py-0.5 font-mono text-xs font-semibold rounded bg-zinc-800 text-zinc-200 border border-zinc-700 shrink-0">
                      {req.id}
                    </span>
                    <span className="text-sm text-zinc-200 leading-snug">
                      {req.text}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    {/* Kind badge */}
                    <span
                      className={`px-2 py-0.5 text-xs font-medium rounded-full border capitalize ${
                        req.kind === "technical"
                          ? "bg-blue-950/60 text-blue-400 border-blue-800"
                          : req.kind === "behavioral"
                          ? "bg-purple-950/60 text-purple-400 border-purple-800"
                          : "bg-emerald-950/60 text-emerald-400 border-emerald-800"
                      }`}
                    >
                      {req.kind}
                    </span>

                    {/* Priority badge */}
                    <span
                      className={`px-2 py-0.5 text-xs font-medium rounded-full border ${
                        req.priority === "must"
                          ? "bg-amber-950/60 text-amber-400 border-amber-800"
                          : "bg-zinc-800 text-zinc-400 border-zinc-700"
                      }`}
                    >
                      {req.priority === "must" ? "Must Have" : "Nice to Have"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Company Brief & Public Interview Research Section (Stage 6) */}
        <div className="p-8 bg-zinc-900 border border-zinc-800 rounded-xl shadow-lg space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-semibold text-white">Company Brief & Interview Insights</h2>
                {kit.companyBrief?.summary && (
                  <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-950/60 text-emerald-400 border border-emerald-800">
                    Researched
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                Autonomous crawler analysis of company website and public interview research.
              </p>
            </div>

            <button
              onClick={handleResearchCompany}
              disabled={researching}
              className="inline-flex items-center justify-center gap-2 py-2 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-medium rounded-lg text-sm transition focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer disabled:cursor-not-allowed shrink-0"
            >
              {researching ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Researching...</span>
                </>
              ) : kit.companyBrief?.summary ? (
                <span>Re-research Company</span>
              ) : (
                <span>Research Company</span>
              )}
            </button>
          </div>

          {researchError && (
            <div
              role="alert"
              className="p-3 text-sm rounded-lg bg-red-950/60 border border-red-800 text-red-300"
            >
              {researchError}
            </div>
          )}

          {researching && (
            <div className="p-6 bg-zinc-950 border border-zinc-800 rounded-lg flex flex-col items-center justify-center gap-3 text-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
              <p className="text-sm text-zinc-300 font-medium">
                Crawling company website and gathering interview reviews...
              </p>
              <p className="text-xs text-zinc-500">
                Discovering pages, checking robots.txt, searching public interview experiences, and synthesizing intelligence.
              </p>
            </div>
          )}

          {!researching && (!kit.companyBrief || !kit.companyBrief.summary) && (
            <div className="p-6 bg-zinc-950/60 border border-dashed border-zinc-800 rounded-lg text-center space-y-2">
              <p className="text-sm text-zinc-400">
                No company research conducted yet.
              </p>
              <p className="text-xs text-zinc-500">
                Click &quot;Research Company&quot; above to crawl {kit.companyUrl} and retrieve verified interview insights.
              </p>
            </div>
          )}

          {!researching && kit.companyBrief?.summary && (
            <div className="space-y-4">
              {/* Summary and Overview */}
              <div className="p-5 bg-zinc-950 border border-zinc-800 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    Company Overview
                  </span>
                  {kit.companyBrief.industry && (
                    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
                      Industry: {kit.companyBrief.industry}
                    </span>
                  )}
                </div>
                <p className="text-sm text-zinc-200 leading-relaxed">
                  {kit.companyBrief.summary}
                </p>

                {kit.companyBrief.productsOrServices && kit.companyBrief.productsOrServices.length > 0 && (
                  <div className="pt-2">
                    <span className="text-xs text-zinc-500 block mb-1.5">Products & Services</span>
                    <div className="flex flex-wrap gap-1.5">
                      {kit.companyBrief.productsOrServices.map((product, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-0.5 text-xs rounded-md bg-zinc-900 text-zinc-300 border border-zinc-800"
                        >
                          {product}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Hiring Process */}
              <div className="p-5 bg-zinc-950 border border-zinc-800 rounded-lg space-y-2">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
                  Hiring & Interview Process
                </span>
                {kit.companyBrief.hiringProcess ? (
                  <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">
                    {kit.companyBrief.hiringProcess}
                  </p>
                ) : (
                  <div className="p-3 bg-zinc-900/60 border border-zinc-800/80 rounded text-xs text-zinc-400 italic">
                    No verified interview or hiring process information publicly discovered for this company.
                  </div>
                )}
              </div>

              {/* Sources */}
              {kit.companyBrief.sources && kit.companyBrief.sources.length > 0 && (
                <div className="p-5 bg-zinc-950 border border-zinc-800 rounded-lg space-y-3">
                  <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
                    Verified Sources & References ({kit.companyBrief.sources.length})
                  </span>
                  <div className="divide-y divide-zinc-800/60 border border-zinc-800 rounded-lg overflow-hidden bg-zinc-900/40">
                    {kit.companyBrief.sources.map((src: ISource, idx: number) => (
                      <div
                        key={idx}
                        className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-zinc-900 transition text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-zinc-500 font-mono text-[11px] shrink-0">
                            [{idx + 1}]
                          </span>
                          <a
                            href={src.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-400 hover:text-indigo-300 font-medium truncate"
                          >
                            {src.title || src.url}
                          </a>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                          <span
                            className={`px-2 py-0.5 text-[11px] font-medium rounded-full border capitalize ${
                              src.sourceType === "company_website"
                                ? "bg-blue-950/60 text-blue-400 border-blue-800"
                                : src.sourceType === "careers_page"
                                ? "bg-purple-950/60 text-purple-400 border-purple-800"
                                : src.sourceType === "interview_review"
                                ? "bg-amber-950/60 text-amber-400 border-amber-800"
                                : "bg-zinc-800 text-zinc-400 border-zinc-700"
                            }`}
                          >
                            {src.sourceType.replace(/_/g, " ")}
                          </span>
                          <span className="text-zinc-500 text-[11px] truncate max-w-[200px]">
                            {src.url}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Interview Question Bank Section (Stage 7) */}
        <div className="p-8 bg-zinc-900 border border-zinc-800 rounded-xl shadow-lg space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-semibold text-white">Interview Question Bank</h2>
                {kit.questionBank && kit.questionBank.length > 0 && (
                  <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-indigo-950/60 text-indigo-400 border border-indigo-800">
                    {kit.questionBank.length} {kit.questionBank.length === 1 ? "Question" : "Questions"}
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                AI-generated interview questions mapped to requirements and grounded in company research.
              </p>
            </div>

            <button
              onClick={handleGenerateQuestions}
              disabled={generatingQuestions || !kit.requirements || kit.requirements.length === 0}
              className="inline-flex items-center justify-center gap-2 py-2 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-medium rounded-lg text-sm transition focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer disabled:cursor-not-allowed shrink-0"
              title={
                !kit.requirements || kit.requirements.length === 0
                  ? "Requirements must be extracted before generating questions."
                  : undefined
              }
            >
              {generatingQuestions ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Generating...</span>
                </>
              ) : kit.questionBank && kit.questionBank.length > 0 ? (
                <span>Regenerate Question Bank</span>
              ) : (
                <span>Generate Questions</span>
              )}
            </button>
          </div>

          {(!kit.requirements || kit.requirements.length === 0) && (
            <div className="p-3 text-xs rounded-lg bg-amber-950/40 border border-amber-800/80 text-amber-300">
              Note: Extract job requirements above before generating interview questions.
            </div>
          )}

          {generationError && (
            <div
              role="alert"
              className="p-3 text-sm rounded-lg bg-red-950/60 border border-red-800 text-red-300"
            >
              {generationError}
            </div>
          )}

          {generatingQuestions && (
            <div className="p-6 bg-zinc-950 border border-zinc-800 rounded-lg flex flex-col items-center justify-center gap-3 text-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
              <p className="text-sm text-zinc-300 font-medium">
                Generating targeted interview questions and structured answer outlines...
              </p>
              <p className="text-xs text-zinc-500">
                Mapping questions to requirements, allocating practice duration, and grounding in company brief.
              </p>
            </div>
          )}

          {!generatingQuestions && (!kit.questionBank || kit.questionBank.length === 0) && (
            <div className="p-6 bg-zinc-950/60 border border-dashed border-zinc-800 rounded-lg text-center space-y-2">
              <p className="text-sm text-zinc-400">
                No interview questions generated yet.
              </p>
              <p className="text-xs text-zinc-500">
                Click &quot;Generate Questions&quot; above to synthesize a complete question bank based on the extracted requirements.
              </p>
            </div>
          )}

          {!generatingQuestions && kit.questionBank && kit.questionBank.length > 0 && (
            <div className="space-y-4">
              {kit.questionBank.map((q: IQuestion) => (
                <div
                  key={q.id}
                  className="p-5 bg-zinc-950 border border-zinc-800 rounded-lg space-y-3 hover:border-zinc-700/80 transition"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 font-mono text-xs font-semibold rounded bg-zinc-800 text-zinc-200 border border-zinc-700">
                        {q.id}
                      </span>
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded-full border capitalize ${
                          q.category === "technical"
                            ? "bg-blue-950/60 text-blue-400 border-blue-800"
                            : q.category === "behavioral"
                            ? "bg-purple-950/60 text-purple-400 border-purple-800"
                            : q.category === "roleSpecific"
                            ? "bg-emerald-950/60 text-emerald-400 border-emerald-800"
                            : "bg-amber-950/60 text-amber-400 border-amber-800"
                        }`}
                      >
                        {q.category === "roleSpecific" ? "Role Specific" : q.category}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-400">
                        ⏱️ {q.durationMinutes} min
                      </span>
                      {q.requirementIds && q.requirementIds.length > 0 && (
                        <div className="flex items-center gap-1">
                          {q.requirementIds.map((reqId: string) => (
                            <span
                              key={reqId}
                              className="px-2 py-0.5 font-mono text-[11px] rounded bg-zinc-900 text-zinc-400 border border-zinc-800"
                            >
                              {reqId}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <p className="text-base font-semibold text-white leading-snug">
                    {q.question}
                  </p>

                  {q.answerOutline && (
                    <div className="p-3 bg-zinc-900/70 border border-zinc-800/80 rounded-lg space-y-1">
                      <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider block">
                        Answer Guidance &amp; Outline:
                      </span>
                      <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">
                        {q.answerOutline}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Requirement Coverage & Gap Analysis Section (Stage 8) */}
        <div className="p-8 bg-zinc-900 border border-zinc-800 rounded-xl shadow-lg space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-semibold text-white">Coverage &amp; Gap Analysis</h2>
                {coverage && (
                  <span
                    className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${
                      coverage.summary.coveragePercentage === 100
                        ? "bg-emerald-950/60 text-emerald-400 border-emerald-800"
                        : coverage.summary.coveragePercentage > 0
                        ? "bg-amber-950/60 text-amber-400 border-amber-800"
                        : "bg-red-950/60 text-red-400 border-red-800"
                    }`}
                  >
                    {coverage.summary.coveragePercentage}% Coverage
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                Deterministic traceability matrix mapping extracted job requirements to interview questions.
              </p>
            </div>

            {kit.requirements && kit.requirements.length > 0 && (
              <button
                onClick={() => fetchCoverage(kit.id)}
                disabled={loadingCoverage}
                className="inline-flex items-center justify-center gap-2 py-1.5 px-3 bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-800 disabled:text-zinc-500 text-zinc-300 font-medium rounded-lg text-xs transition cursor-pointer disabled:cursor-not-allowed shrink-0 border border-zinc-700"
              >
                {loadingCoverage ? (
                  <>
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-300 border-t-transparent" />
                    <span>Analyzing...</span>
                  </>
                ) : (
                  <span>Refresh Analysis</span>
                )}
              </button>
            )}
          </div>

          {coverageError && (
            <div
              role="alert"
              className="p-3 text-sm rounded-lg bg-red-950/60 border border-red-800 text-red-300"
            >
              {coverageError}
            </div>
          )}

          {(!kit.requirements || kit.requirements.length === 0) && (
            <div className="p-6 bg-zinc-950/60 border border-dashed border-zinc-800 rounded-lg text-center space-y-2">
              <p className="text-sm text-zinc-400">
                Requirements have not been extracted yet.
              </p>
              <p className="text-xs text-zinc-500">
                Extract job requirements above to unlock preparation coverage and gap detection.
              </p>
            </div>
          )}

          {kit.requirements && kit.requirements.length > 0 && loadingCoverage && !coverage && (
            <div className="p-6 bg-zinc-950 border border-zinc-800 rounded-lg flex flex-col items-center justify-center gap-3 text-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
              <p className="text-sm text-zinc-300 font-medium">
                Evaluating question bank coverage against job requirements...
              </p>
            </div>
          )}

          {coverage && (
            <div className="space-y-6">
              {/* Coverage Progress Bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400 font-medium">Preparation Completeness</span>
                  <span className="text-zinc-200 font-semibold font-mono">
                    {coverage.summary.coveredCount} of {coverage.summary.totalRequirements} Requirements Covered ({coverage.summary.coveragePercentage}%)
                  </span>
                </div>
                <div className="w-full h-2.5 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800">
                  <div
                    className={`h-full transition-all duration-500 rounded-full ${
                      coverage.summary.coveragePercentage === 100
                        ? "bg-emerald-500"
                        : coverage.summary.coveragePercentage > 50
                        ? "bg-indigo-500"
                        : coverage.summary.coveragePercentage > 0
                        ? "bg-amber-500"
                        : "bg-red-500"
                    }`}
                    style={{ width: `${coverage.summary.coveragePercentage}%` }}
                  />
                </div>
              </div>

              {/* Metric Breakdown Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
                  <span className="text-[11px] uppercase tracking-wider text-zinc-500 block">Total Requirements</span>
                  <span className="text-lg font-bold text-white mt-0.5 block">{coverage.summary.totalRequirements}</span>
                </div>
                <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
                  <span className="text-[11px] uppercase tracking-wider text-emerald-400 block">Covered</span>
                  <span className="text-lg font-bold text-emerald-400 mt-0.5 block">{coverage.summary.coveredCount}</span>
                </div>
                <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
                  <span className="text-[11px] uppercase tracking-wider text-amber-400 block">Gaps (Uncovered)</span>
                  <span className="text-lg font-bold text-amber-400 mt-0.5 block">{coverage.summary.uncoveredCount}</span>
                </div>
                <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
                  <span className="text-[11px] uppercase tracking-wider text-indigo-400 block">Must-Have Covered</span>
                  <span className="text-lg font-bold text-indigo-400 mt-0.5 block">
                    {coverage.summary.byPriority.must.covered} / {coverage.summary.byPriority.must.total}
                  </span>
                </div>
              </div>

              {/* Kind Breakdown Pills */}
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="px-3 py-1 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-300">
                  <strong className="text-blue-400">Technical:</strong> {coverage.summary.byKind.technical.covered} / {coverage.summary.byKind.technical.total}
                </span>
                <span className="px-3 py-1 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-300">
                  <strong className="text-purple-400">Behavioral:</strong> {coverage.summary.byKind.behavioral.covered} / {coverage.summary.byKind.behavioral.total}
                </span>
                <span className="px-3 py-1 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-300">
                  <strong className="text-emerald-400">Domain:</strong> {coverage.summary.byKind.domain.covered} / {coverage.summary.byKind.domain.total}
                </span>
                <span className="px-3 py-1 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-300">
                  <strong className="text-zinc-400">Nice-to-Have:</strong> {coverage.summary.byPriority.nice.covered} / {coverage.summary.byPriority.nice.total}
                </span>
              </div>

              {/* Gaps Alert Banner & List */}
              {coverage.gaps.length > 0 ? (
                <div className="p-4 bg-amber-950/20 border border-amber-800/60 rounded-xl space-y-3">
                  <div className="flex items-center gap-2 text-amber-400">
                    <span className="text-base">⚠️</span>
                    <h3 className="text-sm font-semibold">
                      Detected Preparation Gaps ({coverage.gaps.length} Uncovered {coverage.gaps.length === 1 ? "Requirement" : "Requirements"})
                    </h3>
                  </div>
                  <p className="text-xs text-zinc-400">
                    These requirements currently do not have any linked practice questions in your question bank.
                  </p>
                  <div className="space-y-2 pt-1">
                    {coverage.gaps.map((gap: IRequirementCoverage) => (
                      <div
                        key={gap.requirement.id}
                        className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-zinc-300">
                              {gap.requirement.id}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 text-[10px] font-medium rounded border uppercase ${
                                gap.requirement.kind === "technical"
                                  ? "bg-blue-950/60 text-blue-400 border-blue-800"
                                  : gap.requirement.kind === "behavioral"
                                  ? "bg-purple-950/60 text-purple-400 border-purple-800"
                                  : "bg-emerald-950/60 text-emerald-400 border-emerald-800"
                              }`}
                            >
                              {gap.requirement.kind}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 text-[10px] font-medium rounded border uppercase ${
                                gap.requirement.priority === "must"
                                  ? "bg-red-950/60 text-red-400 border-red-800"
                                  : "bg-zinc-800 text-zinc-400 border-zinc-700"
                              }`}
                            >
                              {gap.requirement.priority}-have
                            </span>
                          </div>
                          <p className="text-xs text-zinc-300">{gap.requirement.text}</p>
                        </div>
                        <span className="px-2 py-0.5 text-[11px] font-medium rounded bg-red-950/40 text-red-400 border border-red-800/60 self-start sm:self-center shrink-0">
                          Uncovered Gap
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-emerald-950/20 border border-emerald-800/60 rounded-xl flex items-center gap-3">
                  <span className="text-emerald-400 text-xl">✅</span>
                  <div>
                    <h3 className="text-sm font-semibold text-emerald-300">Full Requirement Coverage Achieved</h3>
                    <p className="text-xs text-emerald-400/80 mt-0.5">
                      All {coverage.summary.totalRequirements} extracted job requirements have at least one dedicated practice question in your Question Bank.
                    </p>
                  </div>
                </div>
              )}

              {/* Covered Requirements List */}
              {coverage.covered.length > 0 && (
                <div className="space-y-3 pt-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Covered Requirements ({coverage.covered.length})
                  </h3>
                  <div className="space-y-2">
                    {coverage.covered.map((item: IRequirementCoverage) => (
                      <div
                        key={item.requirement.id}
                        className="p-3 bg-zinc-950 border border-zinc-800/80 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-zinc-300">
                              {item.requirement.id}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 text-[10px] font-medium rounded border uppercase ${
                                item.requirement.kind === "technical"
                                  ? "bg-blue-950/60 text-blue-400 border-blue-800"
                                  : item.requirement.kind === "behavioral"
                                  ? "bg-purple-950/60 text-purple-400 border-purple-800"
                                  : "bg-emerald-950/60 text-emerald-400 border-emerald-800"
                              }`}
                            >
                              {item.requirement.kind}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 text-[10px] font-medium rounded border uppercase ${
                                item.requirement.priority === "must"
                                  ? "bg-red-950/60 text-red-400 border-red-800"
                                  : "bg-zinc-800 text-zinc-400 border-zinc-700"
                              }`}
                            >
                              {item.requirement.priority}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-300">{item.requirement.text}</p>
                        </div>
                        <div className="flex items-center gap-1.5 self-start sm:self-center shrink-0">
                          <span className="text-[11px] text-zinc-500 mr-1">Covered by:</span>
                          {item.linkedQuestionIds.map((qId: string) => (
                            <span
                              key={qId}
                              className="px-2 py-0.5 font-mono text-xs rounded bg-indigo-950/60 text-indigo-400 border border-indigo-800"
                            >
                              {qId}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}


