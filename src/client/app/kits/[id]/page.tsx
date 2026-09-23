"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "../../../context/AuthContext";
import { IKit, IRequirement, ISource, IQuestion, IFlashcard, IStudyDay, ICoverageReport, IRequirementCoverage, QuestionCategory, ContentState } from "@shared/types";
import { getKit, extractKitRequirements, researchCompanyBrief, generateKitQuestions, generateKitFlashcards, generateKitSchedule, getKitCoverage, updateKit, KitApiError } from "../../../lib/kits";

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

  // Builder State for Question Bank & Company Brief
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    question: string;
    answerOutline: string;
    durationMinutes: number;
    category: QuestionCategory;
  }>({
    question: "",
    answerOutline: "",
    durationMinutes: 30,
    category: "technical",
  });
  const [isAddingQuestion, setIsAddingQuestion] = useState(false);
  const [newQuestionForm, setNewQuestionForm] = useState<{
    question: string;
    answerOutline: string;
    durationMinutes: number;
    category: QuestionCategory;
  }>({
    question: "",
    answerOutline: "",
    durationMinutes: 30,
    category: "technical",
  });
  const [isEditingBrief, setIsEditingBrief] = useState(false);
  const [briefSummary, setBriefSummary] = useState("");
  const [briefIndustry, setBriefIndustry] = useState("");
  const [briefHiringProcess, setBriefHiringProcess] = useState("");
  const [savingKit, setSavingKit] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // Flashcards & Practice Mode State
  const [generatingFlashcards, setGeneratingFlashcards] = useState(false);
  const [flashcardError, setFlashcardError] = useState<string | null>(null);
  const [editingFlashcardId, setEditingFlashcardId] = useState<string | null>(null);
  const [editFlashcardForm, setEditFlashcardForm] = useState({ front: "", back: "" });
  const [isAddingFlashcard, setIsAddingFlashcard] = useState(false);
  const [newFlashcardForm, setNewFlashcardForm] = useState({ front: "", back: "" });

  // Practice Mode interactive state
  const [isPracticeActive, setIsPracticeActive] = useState(false);
  const [practiceDeck, setPracticeDeck] = useState<IFlashcard[]>([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isCardFlipped, setIsCardFlipped] = useState(false);
  const [practiceConfidence, setPracticeConfidence] = useState<Record<string, "again" | "good" | "easy">>({});
  const [isPracticeFinished, setIsPracticeFinished] = useState(false);

  // Study Schedule State
  const [generatingSchedule, setGeneratingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  // Export State
  const [copiedExport, setCopiedExport] = useState(false);

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
      await generateKitQuestions(kit.id);
      const updatedKit = await getKit(kit.id);
      setKit(updatedKit);
      fetchCoverage(kit.id);
    } catch (err) {
      setGenerationError(
        (err as Error)?.message || "Failed to generate question bank. Please try again."
      );
    } finally {
      setGeneratingQuestions(false);
    }
  };

  const handleStartEditBrief = () => {
    setIsEditingBrief(true);
    setBriefSummary(kit?.companyBrief?.summary || "");
    setBriefIndustry(kit?.companyBrief?.industry || "");
    setBriefHiringProcess(kit?.companyBrief?.hiringProcess || "");
  };

  const handleSaveBrief = async () => {
    if (!kit) return;
    setSavingKit(true);
    const updatedBrief = {
      summary: briefSummary.trim(),
      industry: briefIndustry.trim(),
      productsOrServices: kit.companyBrief?.productsOrServices || [],
      hiringProcess: briefHiringProcess.trim() || null,
      sources: kit.companyBrief?.sources || [],
    };
    try {
      const savedKit = await updateKit(kit.id, { companyBrief: updatedBrief });
      setKit(savedKit);
      setIsEditingBrief(false);
      setSaveSuccessMessage("Company brief updated successfully.");
      setTimeout(() => setSaveSuccessMessage(null), 3000);
    } catch (err) {
      setResearchError((err as Error)?.message || "Failed to update company brief.");
    } finally {
      setSavingKit(false);
    }
  };

  const handleStartEditQuestion = (q: IQuestion) => {
    setEditingQuestionId(q.id);
    setEditForm({
      question: q.question,
      answerOutline: q.answerOutline || "",
      durationMinutes: q.durationMinutes || 30,
      category: q.category || "technical",
    });
  };

  const handleCancelEditQuestion = () => {
    setEditingQuestionId(null);
  };

  const handleSaveQuestion = async (qId: string) => {
    if (!kit || !kit.questionBank) return;
    if (!editForm.question.trim()) return;
    setSavingKit(true);

    const updated = kit.questionBank.map((q) => {
      if (q.id === qId) {
        return {
          ...q,
          question: editForm.question.trim(),
          answerOutline: editForm.answerOutline.trim(),
          durationMinutes: Number(editForm.durationMinutes) || 30,
          category: editForm.category,
          state: (q.state === "pinned" ? "pinned" : "edited") as ContentState,
        };
      }
      return q;
    });

    try {
      const savedKit = await updateKit(kit.id, { questionBank: updated });
      setKit(savedKit);
      setEditingQuestionId(null);
      fetchCoverage(kit.id);
      setSaveSuccessMessage("Question updated successfully.");
      setTimeout(() => setSaveSuccessMessage(null), 3000);
    } catch (err) {
      setGenerationError((err as Error)?.message || "Failed to update question.");
    } finally {
      setSavingKit(false);
    }
  };

  const handleMoveQuestion = async (index: number, direction: "up" | "down") => {
    if (!kit || !kit.questionBank) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= kit.questionBank.length) return;

    const list = [...kit.questionBank];
    const temp = list[index];
    list[index] = list[targetIndex];
    list[targetIndex] = temp;

    setKit((prev) => (prev ? { ...prev, questionBank: list } : prev));
    try {
      await updateKit(kit.id, { questionBank: list });
    } catch (err) {
      console.error("Failed to reorder questions:", err);
    }
  };

  const handleTogglePin = async (qId: string) => {
    if (!kit || !kit.questionBank) return;
    const updated = kit.questionBank.map((q) => {
      if (q.id === qId) {
        const nextState: ContentState = q.state === "pinned" ? "edited" : "pinned";
        return { ...q, state: nextState };
      }
      return q;
    });
    setKit((prev) => (prev ? { ...prev, questionBank: updated } : prev));
    try {
      await updateKit(kit.id, { questionBank: updated });
    } catch (err) {
      console.error("Failed to toggle pin:", err);
    }
  };

  const handleDeleteQuestion = async (qId: string) => {
    if (!kit || !kit.questionBank) return;
    if (!confirm("Are you sure you want to delete this question?")) return;

    const updated = kit.questionBank.filter((q) => q.id !== qId);
    setKit((prev) => (prev ? { ...prev, questionBank: updated } : prev));
    try {
      await updateKit(kit.id, { questionBank: updated });
      fetchCoverage(kit.id);
      setSaveSuccessMessage("Question deleted from bank.");
      setTimeout(() => setSaveSuccessMessage(null), 3000);
    } catch (err) {
      console.error("Failed to delete question:", err);
    }
  };

  const handleAddQuestionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kit) return;
    if (!newQuestionForm.question.trim()) return;

    const newId = `Q-${(kit.questionBank?.length || 0) + 1}-${Math.floor(100 + Math.random() * 900)}`;
    const newQ: IQuestion = {
      id: newId,
      question: newQuestionForm.question.trim(),
      answerOutline: newQuestionForm.answerOutline.trim(),
      durationMinutes: Number(newQuestionForm.durationMinutes) || 30,
      category: newQuestionForm.category,
      requirementIds: [],
      state: "edited",
    };

    const updated = [...(kit.questionBank || []), newQ];
    setSavingKit(true);
    try {
      const savedKit = await updateKit(kit.id, { questionBank: updated });
      setKit(savedKit);
      setIsAddingQuestion(false);
      setNewQuestionForm({
        question: "",
        answerOutline: "",
        durationMinutes: 30,
        category: "technical",
      });
      fetchCoverage(kit.id);
      setSaveSuccessMessage("Custom question added to bank.");
      setTimeout(() => setSaveSuccessMessage(null), 3000);
    } catch (err) {
      setGenerationError((err as Error)?.message || "Failed to add question.");
    } finally {
      setSavingKit(false);
    }
  };

  const handleGenerateFlashcards = async () => {
    if (!kit) return;
    setGeneratingFlashcards(true);
    setFlashcardError(null);
    try {
      const cards = await generateKitFlashcards(kit.id);
      setKit((prev) => (prev ? { ...prev, flashcards: cards } : prev));
      setSaveSuccessMessage("Flashcards generated successfully.");
      setTimeout(() => setSaveSuccessMessage(null), 3000);
    } catch (err) {
      setFlashcardError((err as Error)?.message || "Failed to generate flashcards.");
    } finally {
      setGeneratingFlashcards(false);
    }
  };

  const handleGenerateSchedule = async () => {
    if (!kit) return;
    setGeneratingSchedule(true);
    setScheduleError(null);
    try {
      const schedule = await generateKitSchedule(kit.id);
      setKit((prev) => (prev ? { ...prev, studySchedule: schedule } : prev));
      setSaveSuccessMessage("Study schedule generated successfully.");
      setTimeout(() => setSaveSuccessMessage(null), 3000);
    } catch (err) {
      setScheduleError((err as Error)?.message || "Failed to generate study schedule.");
    } finally {
      setGeneratingSchedule(false);
    }
  };

  const handleStartEditFlashcard = (fc: IFlashcard) => {
    setEditingFlashcardId(fc.id);
    setEditFlashcardForm({ front: fc.front, back: fc.back });
  };

  const handleSaveFlashcard = async (fcId: string) => {
    if (!kit || !kit.flashcards) return;
    if (!editFlashcardForm.front.trim() || !editFlashcardForm.back.trim()) return;
    setSavingKit(true);
    const updated = kit.flashcards.map((f) => {
      if (f.id === fcId) {
        return {
          ...f,
          front: editFlashcardForm.front.trim(),
          back: editFlashcardForm.back.trim(),
          state: (f.state === "pinned" ? "pinned" : "edited") as ContentState,
        };
      }
      return f;
    });

    try {
      const savedKit = await updateKit(kit.id, { flashcards: updated });
      setKit(savedKit);
      setEditingFlashcardId(null);
      setSaveSuccessMessage("Flashcard updated successfully.");
      setTimeout(() => setSaveSuccessMessage(null), 3000);
    } catch (err) {
      setFlashcardError((err as Error)?.message || "Failed to update flashcard.");
    } finally {
      setSavingKit(false);
    }
  };

  const handleTogglePinFlashcard = async (fcId: string) => {
    if (!kit || !kit.flashcards) return;
    const updated = kit.flashcards.map((f) => {
      if (f.id === fcId) {
        const nextState: ContentState = f.state === "pinned" ? "edited" : "pinned";
        return { ...f, state: nextState };
      }
      return f;
    });
    setKit((prev) => (prev ? { ...prev, flashcards: updated } : prev));
    try {
      await updateKit(kit.id, { flashcards: updated });
    } catch (err) {
      console.error("Failed to pin flashcard:", err);
    }
  };

  const handleDeleteFlashcard = async (fcId: string) => {
    if (!kit || !kit.flashcards) return;
    if (!confirm("Are you sure you want to delete this flashcard?")) return;
    const updated = kit.flashcards.filter((f) => f.id !== fcId);
    setKit((prev) => (prev ? { ...prev, flashcards: updated } : prev));
    try {
      await updateKit(kit.id, { flashcards: updated });
    } catch (err) {
      console.error("Failed to delete flashcard:", err);
    }
  };

  const handleAddFlashcardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kit) return;
    if (!newFlashcardForm.front.trim() || !newFlashcardForm.back.trim()) return;

    setSavingKit(true);
    const newCard: IFlashcard = {
      id: "f" + (Date.now() % 100000),
      front: newFlashcardForm.front.trim(),
      back: newFlashcardForm.back.trim(),
      state: "edited",
    };
    const updated = [...(kit.flashcards || []), newCard];

    try {
      const savedKit = await updateKit(kit.id, { flashcards: updated });
      setKit(savedKit);
      setIsAddingFlashcard(false);
      setNewFlashcardForm({ front: "", back: "" });
      setSaveSuccessMessage("Custom flashcard added to deck.");
      setTimeout(() => setSaveSuccessMessage(null), 3000);
    } catch (err) {
      setFlashcardError((err as Error)?.message || "Failed to add flashcard.");
    } finally {
      setSavingKit(false);
    }
  };

  const startPracticeSession = (weakestFirst = false) => {
    if (!kit || !kit.flashcards || kit.flashcards.length === 0) return;
    const deck = [...kit.flashcards];
    if (weakestFirst) {
      const weight: Record<string, number> = { again: 0, good: 1, easy: 2 };
      deck.sort((a, b) => {
        const scoreA = practiceConfidence[a.id] ? weight[practiceConfidence[a.id]] : -1;
        const scoreB = practiceConfidence[b.id] ? weight[practiceConfidence[b.id]] : -1;
        return scoreA - scoreB;
      });
    }
    setPracticeDeck(deck);
    setCurrentCardIndex(0);
    setIsCardFlipped(false);
    setIsPracticeActive(true);
    setIsPracticeFinished(false);
  };

  const handleConfidenceRating = (rating: "again" | "good" | "easy") => {
    const currentCard = practiceDeck[currentCardIndex];
    if (!currentCard) return;

    setPracticeConfidence((prev) => ({
      ...prev,
      [currentCard.id]: rating,
    }));

    if (currentCardIndex + 1 < practiceDeck.length) {
      setCurrentCardIndex((prev) => prev + 1);
      setIsCardFlipped(false);
    } else {
      setIsPracticeFinished(true);
    }
  };

  const handleExportMarkdown = () => {
    if (!kit) return;
    let md = `# Interview Prep Kit: ${kit.title}\n\n`;
    md += `**Target Company:** ${kit.companyUrl}\n`;
    md += `**Preparation Window:** ${kit.daysAvailable} Days\n`;
    md += `**Generated Date:** ${new Date().toLocaleDateString()}\n\n`;
    md += `---\n\n`;

    if (kit.companyBrief?.summary) {
      md += `## 1. Company Brief & Interview Insights\n\n`;
      md += `**Industry:** ${kit.companyBrief.industry || "General Tech"}\n\n`;
      md += `### Summary\n${kit.companyBrief.summary}\n\n`;
      if (kit.companyBrief.hiringProcess) {
        md += `### Hiring Process\n${kit.companyBrief.hiringProcess}\n\n`;
      }
    }

    if (kit.requirements && kit.requirements.length > 0) {
      md += `## 2. Extracted Requirements Checklist\n\n`;
      for (const r of kit.requirements) {
        md += `- [ ] **[${r.id}]** (${r.kind.toUpperCase()} | ${r.priority.toUpperCase()}-HAVE): ${r.text}\n`;
      }
      md += `\n`;
    }

    if (kit.questionBank && kit.questionBank.length > 0) {
      md += `## 3. Question Bank & Answer Guidance\n\n`;
      kit.questionBank.forEach((q, idx) => {
        md += `### Q${idx + 1}. [${q.category.toUpperCase()} - ${q.durationMinutes} min] ${q.question}\n\n`;
        if (q.requirementIds && q.requirementIds.length > 0) {
          md += `*Linked Requirements: ${q.requirementIds.join(", ")}*\n\n`;
        }
        if (q.answerOutline) {
          md += `**Answer Guidance & Outline:**\n${q.answerOutline}\n\n`;
        }
      });
    }

    if (kit.studySchedule && kit.studySchedule.length > 0) {
      md += `## 4. Day-by-Day Study Schedule\n\n`;
      for (const s of kit.studySchedule) {
        md += `### Day ${s.day}: ${s.topic} (${s.durationMinutes} mins)\n`;
        if (s.questionIds && s.questionIds.length > 0) {
          md += `Questions to focus on: ${s.questionIds.join(", ")}\n`;
        }
        md += `\n`;
      }
    }

    if (kit.flashcards && kit.flashcards.length > 0) {
      md += `## 5. Flashcards Deck\n\n`;
      kit.flashcards.forEach((f, idx) => {
        md += `**Card ${idx + 1} (${f.id})**\n- **Front:** ${f.front}\n- **Back:** ${f.back}\n\n`;
      });
    }

    // Trigger download
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${kit.title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-prep-kit.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Also copy to clipboard
    if (navigator.clipboard) {
      navigator.clipboard.writeText(md);
    }
    setCopiedExport(true);
    setTimeout(() => setCopiedExport(false), 3000);
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 text-xs rounded-full bg-indigo-950/60 text-indigo-400 border border-indigo-800">
                Interview Preparation Kit
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-white">
                {kit.title}
              </h1>
            </div>

            <button
              type="button"
              onClick={handleExportMarkdown}
              className="inline-flex items-center justify-center gap-2 py-2 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white text-xs font-semibold rounded-lg border border-zinc-700 shadow transition shrink-0"
              title="Export complete prep kit to a printable markdown document"
            >
              <span>{copiedExport ? "✓ Copied & Downloaded!" : "📄 Export Kit (.md)"}</span>
            </button>
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

            <div className="flex flex-wrap items-center gap-2">
              {kit.companyBrief?.summary && !isEditingBrief && (
                <button
                  type="button"
                  onClick={handleStartEditBrief}
                  className="py-2 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium rounded-lg border border-zinc-700 transition"
                >
                  ✏️ Edit Brief
                </button>
              )}

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
          </div>

          {/* Company Brief Inline Edit Form */}
          {isEditingBrief && (
            <div className="p-5 bg-zinc-950 border border-emerald-800/80 rounded-lg space-y-4 shadow-lg animate-fadeIn">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                <span className="text-sm font-semibold text-emerald-400">Edit Company Brief Inline</span>
                <span className="text-xs text-zinc-500">Changes will be saved to your kit</span>
              </div>

              <div className="space-y-3 text-sm">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Company Summary / Overview</label>
                  <textarea
                    rows={4}
                    value={briefSummary}
                    onChange={(e) => setBriefSummary(e.target.value)}
                    className="w-full p-2.5 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500 font-sans"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Industry</label>
                  <input
                    type="text"
                    value={briefIndustry}
                    onChange={(e) => setBriefIndustry(e.target.value)}
                    className="w-full p-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Hiring &amp; Interview Process</label>
                  <textarea
                    rows={3}
                    value={briefHiringProcess}
                    onChange={(e) => setBriefHiringProcess(e.target.value)}
                    placeholder="Describe known interview stages (e.g. Recruiter Screen, Technical Assessment, System Design)..."
                    className="w-full p-2.5 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500 font-sans"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsEditingBrief(false)}
                  className="py-1.5 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingKit}
                  onClick={handleSaveBrief}
                  className="py-1.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 text-white font-medium text-xs rounded-lg transition"
                >
                  {savingKit ? "Saving..." : "Save Brief"}
                </button>
              </div>
            </div>
          )}

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

        {/* Interview Question Bank Section (The Builder) */}
        <div className="p-8 bg-zinc-900 border border-zinc-800 rounded-xl shadow-lg space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-semibold text-white">Interview Question Bank &amp; Builder</h2>
                {kit.questionBank && kit.questionBank.length > 0 && (
                  <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-indigo-950/60 text-indigo-400 border border-indigo-800">
                    {kit.questionBank.length} {kit.questionBank.length === 1 ? "Question" : "Questions"}
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                Edit any question inline, reorder with arrows, change categories, or add custom questions by hand.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setIsAddingQuestion((prev) => !prev)}
                className="inline-flex items-center justify-center gap-1.5 py-2 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium rounded-lg text-sm transition border border-zinc-700 cursor-pointer"
              >
                <span>{isAddingQuestion ? "✕ Cancel" : "+ Add Question"}</span>
              </button>

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
                  <span>Regenerate (Preserves Edits)</span>
                ) : (
                  <span>Generate Questions</span>
                )}
              </button>
            </div>
          </div>

          {saveSuccessMessage && (
            <div className="p-3 text-sm rounded-lg bg-emerald-950/60 border border-emerald-800 text-emerald-300 flex items-center justify-between">
              <span>✓ {saveSuccessMessage}</span>
              <button onClick={() => setSaveSuccessMessage(null)} className="text-emerald-400 hover:text-emerald-200 text-xs">✕</button>
            </div>
          )}

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

          {/* Add Question Form Card */}
          {isAddingQuestion && (
            <form
              onSubmit={handleAddQuestionSubmit}
              className="p-5 bg-zinc-950 border border-indigo-800/80 rounded-lg space-y-4 shadow-lg animate-fadeIn"
            >
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                <span className="text-sm font-semibold text-indigo-400">Add New Question to Bank</span>
                <span className="text-xs text-zinc-500">Will be saved as custom/edited</span>
              </div>

              <div className="space-y-3 text-sm">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Question Prompt</label>
                  <textarea
                    rows={2}
                    required
                    value={newQuestionForm.question}
                    onChange={(e) => setNewQuestionForm({ ...newQuestionForm, question: e.target.value })}
                    placeholder="e.g. How do you manage component state and side effects in Next.js?"
                    className="w-full p-2.5 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1">Category</label>
                    <select
                      value={newQuestionForm.category}
                      onChange={(e) => setNewQuestionForm({ ...newQuestionForm, category: e.target.value as QuestionCategory })}
                      className="w-full p-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
                    >
                      <option value="technical">Technical</option>
                      <option value="behavioral">Behavioral</option>
                      <option value="roleSpecific">Role Specific / Domain</option>
                      <option value="company">Company Fit</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1">Expected Duration (Minutes)</label>
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={newQuestionForm.durationMinutes}
                      onChange={(e) => setNewQuestionForm({ ...newQuestionForm, durationMinutes: parseInt(e.target.value, 10) || 15 })}
                      className="w-full p-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Answer Guidance &amp; Outline</label>
                  <textarea
                    rows={3}
                    value={newQuestionForm.answerOutline}
                    onChange={(e) => setNewQuestionForm({ ...newQuestionForm, answerOutline: e.target.value })}
                    placeholder="Outline key discussion points, trade-offs, and examples candidate should demonstrate..."
                    className="w-full p-2.5 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsAddingQuestion(false)}
                  className="py-1.5 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingKit}
                  className="py-1.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 text-white font-medium text-xs rounded-lg transition"
                >
                  {savingKit ? "Saving..." : "Add to Bank"}
                </button>
              </div>
            </form>
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
              {kit.questionBank.map((q: IQuestion, index: number) => {
                const isEditing = editingQuestionId === q.id;

                return (
                  <div
                    key={q.id}
                    className={`p-5 bg-zinc-950 border rounded-lg space-y-3 transition ${
                      q.state === "pinned"
                        ? "border-amber-700/80 bg-amber-950/10 shadow-amber-950/30"
                        : q.state === "edited"
                        ? "border-indigo-700/80 bg-indigo-950/10"
                        : "border-zinc-800 hover:border-zinc-700/80"
                    }`}
                  >
                    {/* Header Row */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 font-mono text-xs font-semibold rounded bg-zinc-800 text-zinc-200 border border-zinc-700">
                          {q.id}
                        </span>

                        {/* Category Badge */}
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

                        {/* State Badge (Section 6 Requirement) */}
                        {q.state === "pinned" && (
                          <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-amber-950/80 text-amber-300 border border-amber-700">
                            📌 Pinned
                          </span>
                        )}
                        {q.state === "edited" && (
                          <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-cyan-950/80 text-cyan-300 border border-cyan-700">
                            ✏️ Edited
                          </span>
                        )}
                      </div>

                      {/* Controls Toolbar: Reorder, Pin, Edit, Delete */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-xs text-zinc-400 mr-2">
                          ⏱️ {q.durationMinutes} min
                        </span>

                        {/* Reorder Up */}
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => handleMoveQuestion(index, "up")}
                          title="Move question up"
                          className="p-1 px-1.5 text-xs bg-zinc-900 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-300 rounded border border-zinc-800"
                        >
                          ▲
                        </button>

                        {/* Reorder Down */}
                        <button
                          type="button"
                          disabled={index === (kit.questionBank?.length || 0) - 1}
                          onClick={() => handleMoveQuestion(index, "down")}
                          title="Move question down"
                          className="p-1 px-1.5 text-xs bg-zinc-900 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-300 rounded border border-zinc-800"
                        >
                          ▼
                        </button>

                        {/* Pin Toggle */}
                        <button
                          type="button"
                          onClick={() => handleTogglePin(q.id)}
                          title={q.state === "pinned" ? "Unpin question" : "Pin question (protected from regeneration)"}
                          className={`p-1 px-2 text-xs rounded border transition ${
                            q.state === "pinned"
                              ? "bg-amber-950/80 text-amber-300 border-amber-700 hover:bg-amber-900"
                              : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200"
                          }`}
                        >
                          📌 {q.state === "pinned" ? "Pinned" : "Pin"}
                        </button>

                        {/* Edit Toggle */}
                        <button
                          type="button"
                          onClick={() => (isEditing ? handleCancelEditQuestion() : handleStartEditQuestion(q))}
                          className="p-1 px-2.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded border border-zinc-700 transition"
                        >
                          {isEditing ? "Cancel" : "✏️ Edit"}
                        </button>

                        {/* Delete Button */}
                        <button
                          type="button"
                          onClick={() => handleDeleteQuestion(q.id)}
                          title="Delete this question"
                          className="p-1 px-2 text-xs bg-red-950/40 hover:bg-red-900/60 text-red-400 rounded border border-red-800/80 transition"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>

                    {/* Requirement Tags */}
                    {q.requirementIds && q.requirementIds.length > 0 && (
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <span className="text-[11px] text-zinc-500">Linked Requirements:</span>
                        {q.requirementIds.map((reqId: string) => (
                          <span
                            key={reqId}
                            className="px-2 py-0.5 font-mono text-[11px] rounded bg-zinc-900 text-zinc-300 border border-zinc-800"
                          >
                            {reqId}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Question Content: Read Mode vs. Inline Edit Mode */}
                    {isEditing ? (
                      <div className="space-y-3 pt-2 text-sm bg-zinc-900/90 p-4 rounded-lg border border-indigo-800/80">
                        <div>
                          <label className="block text-xs font-semibold text-zinc-400 mb-1">
                            Edit Question Prompt:
                          </label>
                          <textarea
                            rows={3}
                            value={editForm.question}
                            onChange={(e) => setEditForm({ ...editForm, question: e.target.value })}
                            className="w-full p-2.5 bg-zinc-950 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500 font-sans"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-semibold text-zinc-400 mb-1">
                              Category:
                            </label>
                            <select
                              value={editForm.category}
                              onChange={(e) => setEditForm({ ...editForm, category: e.target.value as QuestionCategory })}
                              className="w-full p-2 bg-zinc-950 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
                            >
                              <option value="technical">Technical</option>
                              <option value="behavioral">Behavioral</option>
                              <option value="roleSpecific">Role Specific / Domain</option>
                              <option value="company">Company Fit</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-zinc-400 mb-1">
                              Duration (Minutes):
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={180}
                              value={editForm.durationMinutes}
                              onChange={(e) => setEditForm({ ...editForm, durationMinutes: parseInt(e.target.value, 10) || 15 })}
                              className="w-full p-2 bg-zinc-950 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-zinc-400 mb-1">
                            Answer Guidance &amp; Outline:
                          </label>
                          <textarea
                            rows={3}
                            value={editForm.answerOutline}
                            onChange={(e) => setEditForm({ ...editForm, answerOutline: e.target.value })}
                            className="w-full p-2.5 bg-zinc-950 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500 font-sans"
                          />
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2">
                          <button
                            type="button"
                            onClick={handleCancelEditQuestion}
                            className="py-1.5 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded-lg transition"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={savingKit}
                            onClick={() => handleSaveQuestion(q.id)}
                            className="py-1.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 text-white font-medium text-xs rounded-lg transition"
                          >
                            {savingKit ? "Saving..." : "Save Changes"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
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
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Flashcards & Practice Mode Section (Stage 7 & Section 6 Builder) */}
        <div className="p-8 bg-zinc-900 border border-zinc-800 rounded-xl shadow-lg space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-semibold text-white">Flashcards &amp; Practice Mode</h2>
                {kit.flashcards && kit.flashcards.length > 0 && (
                  <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-indigo-950/60 text-indigo-400 border border-indigo-800">
                    {kit.flashcards.length} {kit.flashcards.length === 1 ? "Card" : "Cards"}
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                Active recall flashcards for quick revision with confidence-based spaced repetition.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {kit.flashcards && kit.flashcards.length > 0 && (
                <button
                  type="button"
                  onClick={() => startPracticeSession(false)}
                  className="py-1.5 px-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow transition cursor-pointer"
                >
                  ▶ Start Practice Mode
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsAddingFlashcard((prev) => !prev)}
                className="py-1.5 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold rounded-lg border border-zinc-700 transition"
              >
                {isAddingFlashcard ? "Cancel" : "+ Add Flashcard"}
              </button>

              <button
                type="button"
                onClick={handleGenerateFlashcards}
                disabled={generatingFlashcards || !kit.requirements || kit.requirements.length === 0}
                className="py-1.5 px-3 bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-300 text-xs font-medium rounded-lg border border-zinc-700 transition cursor-pointer disabled:cursor-not-allowed"
              >
                {generatingFlashcards ? "Generating..." : kit.flashcards && kit.flashcards.length > 0 ? "Regenerate Flashcards" : "Generate Flashcards"}
              </button>
            </div>
          </div>

          {flashcardError && (
            <div role="alert" className="p-3 text-sm rounded-lg bg-red-950/60 border border-red-800 text-red-300">
              {flashcardError}
            </div>
          )}

          {/* Interactive Practice Mode Screen */}
          {isPracticeActive && practiceDeck.length > 0 && (
            <div className="p-6 bg-gradient-to-b from-indigo-950/40 to-zinc-950 border border-indigo-700/60 rounded-xl space-y-5">
              <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">Practice Session</span>
                  <span className="text-xs text-zinc-400 font-mono">
                    Card {currentCardIndex + 1} of {practiceDeck.length}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPracticeActive(false)}
                  className="text-xs text-zinc-400 hover:text-zinc-200 transition"
                >
                  ✕ Exit Practice
                </button>
              </div>

              {!isPracticeFinished ? (
                <div className="space-y-4">
                  {/* The Flippable Card */}
                  <div
                    onClick={() => setIsCardFlipped((prev) => !prev)}
                    className="min-h-[200px] p-6 bg-zinc-900/90 border border-zinc-700 rounded-xl shadow-xl flex flex-col justify-between cursor-pointer hover:border-indigo-500 transition select-none"
                  >
                    <div className="flex items-center justify-between text-xs text-zinc-500">
                      <span className="font-mono">{practiceDeck[currentCardIndex]?.id}</span>
                      <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[11px]">
                        {isCardFlipped ? "Answer / Key Concept" : "Question / Prompt (Click to reveal answer)"}
                      </span>
                    </div>

                    <div className="my-auto py-4 text-center">
                      <p className="text-base sm:text-lg font-medium text-white leading-relaxed">
                        {isCardFlipped
                          ? practiceDeck[currentCardIndex]?.back
                          : practiceDeck[currentCardIndex]?.front}
                      </p>
                    </div>

                    <div className="text-center text-xs text-indigo-400">
                      {isCardFlipped ? "🔄 Click to flip back" : "💡 Click to reveal answer"}
                    </div>
                  </div>

                  {/* Rating Confidence Controls */}
                  <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-lg space-y-2">
                    <p className="text-xs text-center text-zinc-400">How confident did you feel about this card?</p>
                    <div className="grid grid-cols-3 gap-3">
                      <button
                        type="button"
                        onClick={() => handleConfidenceRating("again")}
                        className="py-2.5 px-3 bg-red-950/60 hover:bg-red-900/80 border border-red-800/80 text-red-300 text-xs font-semibold rounded-lg transition"
                      >
                        🔴 Needs Work (Again)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleConfidenceRating("good")}
                        className="py-2.5 px-3 bg-amber-950/60 hover:bg-amber-900/80 border border-amber-800/80 text-amber-300 text-xs font-semibold rounded-lg transition"
                      >
                        🟡 Felt Okay (Good)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleConfidenceRating("easy")}
                        className="py-2.5 px-3 bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-800/80 text-emerald-300 text-xs font-semibold rounded-lg transition"
                      >
                        🟢 Mastered (Easy)
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Practice Finished Summary */
                <div className="py-6 text-center space-y-4">
                  <div className="text-4xl">🎉</div>
                  <h3 className="text-lg font-bold text-white">Practice Session Complete!</h3>
                  <p className="text-xs text-zinc-400 max-w-md mx-auto">
                    You have reviewed all {practiceDeck.length} flashcards in this deck. Review cards you marked as needing work to solidify your knowledge.
                  </p>

                  <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => startPracticeSession(true)}
                      className="py-2 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-lg shadow transition"
                    >
                      🔄 Practice Weakest Cards First
                    </button>
                    <button
                      type="button"
                      onClick={() => startPracticeSession(false)}
                      className="py-2 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs rounded-lg transition"
                    >
                      Repeat Full Deck
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsPracticeActive(false)}
                      className="py-2 px-4 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 text-xs rounded-lg transition"
                    >
                      Done Practicing
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Add Custom Flashcard Form (The Builder) */}
          {isAddingFlashcard && (
            <form onSubmit={handleAddFlashcardSubmit} className="p-4 bg-zinc-950 border border-indigo-900/80 rounded-xl space-y-3">
              <h3 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">Add Custom Flashcard</h3>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Front (Prompt / Question):</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. What is the difference between optimistic and pessimistic locking?"
                  value={newFlashcardForm.front}
                  onChange={(e) => setNewFlashcardForm({ ...newFlashcardForm, front: e.target.value })}
                  className="w-full p-2.5 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Back (Answer / Key Takeaway):</label>
                <textarea
                  rows={2}
                  required
                  placeholder="e.g. Optimistic assumes no conflict occurs and verifies before commit; pessimistic locks the resource immediately."
                  value={newFlashcardForm.back}
                  onChange={(e) => setNewFlashcardForm({ ...newFlashcardForm, back: e.target.value })}
                  className="w-full p-2.5 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsAddingFlashcard(false)}
                  className="py-1 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingKit}
                  className="py-1 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 text-white font-medium text-xs rounded-lg transition"
                >
                  {savingKit ? "Adding..." : "Add Flashcard"}
                </button>
              </div>
            </form>
          )}

          {/* Flashcards List Deck */}
          {!kit.flashcards || kit.flashcards.length === 0 ? (
            <div className="p-6 bg-zinc-950/60 border border-dashed border-zinc-800 rounded-lg text-center space-y-2">
              <p className="text-sm text-zinc-400">No flashcards generated yet.</p>
              <p className="text-xs text-zinc-500">
                Click &quot;Generate Flashcards&quot; above to create targeted active recall cards.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {kit.flashcards.map((fc: IFlashcard) => {
                const isEditingThisCard = editingFlashcardId === fc.id;
                const isPinned = fc.state === "pinned";
                const isEdited = fc.state === "edited";
                const confidence = practiceConfidence[fc.id];

                return (
                  <div
                    key={fc.id}
                    className="p-4 bg-zinc-950 border border-zinc-800 hover:border-zinc-700 rounded-xl space-y-2 transition flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-zinc-400 text-[11px]">{fc.id}</span>
                        {isPinned && (
                          <span className="px-1.5 py-0.2 text-[10px] rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                            📌 Pinned
                          </span>
                        )}
                        {isEdited && !isPinned && (
                          <span className="px-1.5 py-0.2 text-[10px] rounded bg-amber-950 text-amber-300 border border-amber-800">
                            ✏️ Edited
                          </span>
                        )}
                        {confidence && (
                          <span
                            className={`px-1.5 py-0.2 text-[10px] rounded border ${
                              confidence === "easy"
                                ? "bg-emerald-950/60 text-emerald-400 border-emerald-800"
                                : confidence === "good"
                                ? "bg-amber-950/60 text-amber-400 border-amber-800"
                                : "bg-red-950/60 text-red-400 border-red-800"
                            }`}
                          >
                            {confidence === "easy" ? "Mastered" : confidence === "good" ? "Good" : "Needs Work"}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleTogglePinFlashcard(fc.id)}
                          className={`p-1 px-1.5 text-xs rounded transition border ${
                            isPinned
                              ? "bg-indigo-900/60 text-indigo-300 border-indigo-700"
                              : "bg-zinc-800 text-zinc-400 hover:text-zinc-200 border-zinc-700"
                          }`}
                          title="Pin flashcard to protect from regeneration"
                        >
                          {isPinned ? "📌" : "📍"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStartEditFlashcard(fc)}
                          className="p-1 px-2 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded border border-zinc-700 transition"
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteFlashcard(fc.id)}
                          className="p-1 px-2 text-xs bg-red-950/40 hover:bg-red-900/60 text-red-400 rounded border border-red-800/80 transition"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>

                    {isEditingThisCard ? (
                      <div className="space-y-2 pt-1 text-xs">
                        <div>
                          <label className="block text-zinc-500 mb-0.5">Front:</label>
                          <textarea
                            rows={2}
                            value={editFlashcardForm.front}
                            onChange={(e) => setEditFlashcardForm({ ...editFlashcardForm, front: e.target.value })}
                            className="w-full p-2 bg-zinc-900 border border-zinc-700 rounded text-white text-xs focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-zinc-500 mb-0.5">Back:</label>
                          <textarea
                            rows={2}
                            value={editFlashcardForm.back}
                            onChange={(e) => setEditFlashcardForm({ ...editFlashcardForm, back: e.target.value })}
                            className="w-full p-2 bg-zinc-900 border border-zinc-700 rounded text-white text-xs focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setEditingFlashcardId(null)}
                            className="py-1 px-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded transition"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={savingKit}
                            onClick={() => handleSaveFlashcard(fc.id)}
                            className="py-1 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded transition"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2 text-xs">
                        <div className="p-2.5 bg-zinc-900/90 rounded border border-zinc-800/60">
                          <span className="text-[10px] text-zinc-500 uppercase tracking-wider block font-semibold">Q / Front:</span>
                          <p className="text-zinc-200 mt-0.5">{fc.front}</p>
                        </div>
                        <div className="p-2.5 bg-zinc-900/60 rounded border border-zinc-800/40">
                          <span className="text-[10px] text-indigo-400 uppercase tracking-wider block font-semibold">A / Back:</span>
                          <p className="text-zinc-300 mt-0.5">{fc.back}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Study Schedule Roadmap Section (Stage 8 & Section 6 Builder) */}
        <div className="p-8 bg-zinc-900 border border-zinc-800 rounded-xl shadow-lg space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-semibold text-white">Day-by-Day Study Schedule</h2>
                {kit.studySchedule && kit.studySchedule.length > 0 && (
                  <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-950/60 text-emerald-400 border border-emerald-800">
                    {kit.studySchedule.length} Days Allocated
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                Deterministic allocation spreading interview requirements across your {kit.daysAvailable}-day preparation window.
              </p>
            </div>

            <button
              type="button"
              onClick={handleGenerateSchedule}
              disabled={generatingSchedule || !kit.questionBank || kit.questionBank.length === 0}
              className="inline-flex items-center justify-center gap-2 py-1.5 px-3 bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-300 font-medium rounded-lg text-xs transition cursor-pointer disabled:cursor-not-allowed border border-zinc-700 shrink-0"
            >
              {generatingSchedule ? (
                <>
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-300 border-t-transparent" />
                  <span>Allocating...</span>
                </>
              ) : kit.studySchedule && kit.studySchedule.length > 0 ? (
                <span>Regenerate Schedule</span>
              ) : (
                <span>Generate Schedule</span>
              )}
            </button>
          </div>

          {scheduleError && (
            <div role="alert" className="p-3 text-sm rounded-lg bg-red-950/60 border border-red-800 text-red-300">
              {scheduleError}
            </div>
          )}

          {!kit.studySchedule || kit.studySchedule.length === 0 ? (
            <div className="p-6 bg-zinc-950/60 border border-dashed border-zinc-800 rounded-lg text-center space-y-2">
              <p className="text-sm text-zinc-400">Study schedule has not been allocated yet.</p>
              <p className="text-xs text-zinc-500">
                Generate questions first, then click &quot;Generate Schedule&quot; above to build your daily study roadmap.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {kit.studySchedule.map((day: IStudyDay) => (
                <div
                  key={day.day}
                  className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-zinc-700 transition"
                >
                  <div className="flex items-start gap-3">
                    <span className="px-2.5 py-1 font-mono text-xs font-bold rounded-lg bg-indigo-950/80 text-indigo-400 border border-indigo-800/80 shrink-0">
                      Day {day.day}
                    </span>
                    <div className="space-y-1">
                      <h4 className="text-sm font-semibold text-white">{day.topic}</h4>
                      {day.questionIds && day.questionIds.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          <span className="text-[11px] text-zinc-500">Practice questions:</span>
                          {day.questionIds.map((qId: string) => (
                            <span
                              key={qId}
                              className="px-2 py-0.5 font-mono text-[11px] rounded bg-zinc-900 text-zinc-300 border border-zinc-800"
                            >
                              {qId}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
                    <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-zinc-900 text-zinc-300 border border-zinc-800">
                      ⏱️ {day.durationMinutes} mins
                    </span>
                  </div>
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


