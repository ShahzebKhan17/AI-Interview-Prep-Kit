import { Request, Response } from "express";
import mongoose from "mongoose";
import { Kit, KitDocument, IRequirementDoc } from "../models/Kit";
import {
  createKitSchema,
  updateKitSchema,
  extractRequirementsSchema,
  validateKitInvariants,
} from "../validations/kit.validation";
import { extractRequirementsFromJD } from "../services/requirement-extraction.service";

function formatKit(doc: KitDocument) {
  return {
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    title: doc.title,
    jobDescription: doc.jobDescription,
    companyUrl: doc.companyUrl,
    daysAvailable: doc.daysAvailable,
    status: doc.status,
    requirements: doc.requirements,
    companyBrief: doc.companyBrief,
    roleBreakdown: doc.roleBreakdown,
    questionBank: doc.questionBank,
    flashcards: doc.flashcards,
    studySchedule: doc.studySchedule,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function getParamId(param: string | string[] | undefined): string | null {
  if (typeof param === "string" && mongoose.Types.ObjectId.isValid(param)) {
    return param;
  }
  return null;
}

export async function createKit(req: Request, res: Response): Promise<void> {
  const parseResult = createKitSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: parseResult.error.issues[0]?.message || "Invalid input data.",
      },
    });
    return;
  }

  try {
    const { title, jobDescription, companyUrl, daysAvailable } =
      parseResult.data;

    const kit = await Kit.create({
      userId: new mongoose.Types.ObjectId(req.userId),
      title,
      jobDescription,
      companyUrl,
      daysAvailable,
      status: "draft",
      requirements: [],
      companyBrief: {
        summary: "",
        productsOrServices: [],
        industry: "",
        hiringProcess: null,
        sources: [],
      },
      roleBreakdown: {
        summary: "",
        responsibilities: [],
        skills: [],
      },
      questionBank: [],
      flashcards: [],
      studySchedule: [],
    });

    res.status(201).json({
      success: true,
      kit: formatKit(kit),
    });
  } catch (error) {
    console.error("[Kit] Create error:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred creating the interview kit.",
      },
    });
  }
}

export async function listKits(req: Request, res: Response): Promise<void> {
  try {
    const kits = await Kit.find({ userId: req.userId }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      kits: kits.map(formatKit),
    });
  } catch (error) {
    console.error("[Kit] List error:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred retrieving kits.",
      },
    });
  }
}

export async function getKitById(req: Request, res: Response): Promise<void> {
  const id = getParamId(req.params.id);

  if (!id) {
    res.status(404).json({
      success: false,
      error: {
        code: "KIT_NOT_FOUND",
        message: "Interview kit not found.",
      },
    });
    return;
  }

  try {
    // Scoped strictly to the authenticated user to ensure ownership isolation
    const kit = await Kit.findOne({
      _id: id,
      userId: req.userId,
    });

    if (!kit) {
      res.status(404).json({
        success: false,
        error: {
          code: "KIT_NOT_FOUND",
          message: "Interview kit not found.",
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      kit: formatKit(kit),
    });
  } catch (error) {
    console.error("[Kit] Get error:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred retrieving the kit.",
      },
    });
  }
}

export async function updateKit(req: Request, res: Response): Promise<void> {
  const id = getParamId(req.params.id);

  if (!id) {
    res.status(404).json({
      success: false,
      error: {
        code: "KIT_NOT_FOUND",
        message: "Interview kit not found.",
      },
    });
    return;
  }

  const parseResult = updateKitSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: parseResult.error.issues[0]?.message || "Invalid update data.",
      },
    });
    return;
  }

  try {
    // Check kit exists and belongs to authenticated user
    const kit = await Kit.findOne({
      _id: id,
      userId: req.userId,
    });

    if (!kit) {
      res.status(404).json({
        success: false,
        error: {
          code: "KIT_NOT_FOUND",
          message: "Interview kit not found.",
        },
      });
      return;
    }

    const updateData = parseResult.data;

    // Determine effective data for relational validation
    const effectiveRequirements =
      updateData.requirements !== undefined
        ? updateData.requirements
        : kit.requirements;
    const effectiveQuestionBank =
      updateData.questionBank !== undefined
        ? updateData.questionBank
        : kit.questionBank;
    const effectiveFlashcards =
      updateData.flashcards !== undefined
        ? updateData.flashcards
        : kit.flashcards;
    const effectiveStudySchedule =
      updateData.studySchedule !== undefined
        ? updateData.studySchedule
        : kit.studySchedule;

    // Validate relational invariants
    const invariantError = validateKitInvariants({
      requirements: effectiveRequirements,
      questionBank: effectiveQuestionBank,
      flashcards: effectiveFlashcards,
      studySchedule: effectiveStudySchedule,
    });

    if (invariantError) {
      res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: invariantError,
        },
      });
      return;
    }

    // Apply allowed updates only (preventing userId, _id, createdAt modifications)
    if (updateData.title !== undefined) kit.title = updateData.title;
    if (updateData.jobDescription !== undefined)
      kit.jobDescription = updateData.jobDescription;
    if (updateData.companyUrl !== undefined)
      kit.companyUrl = updateData.companyUrl;
    if (updateData.daysAvailable !== undefined)
      kit.daysAvailable = updateData.daysAvailable;
    if (updateData.status !== undefined) kit.status = updateData.status;
    if (updateData.requirements !== undefined)
      kit.requirements = updateData.requirements;
    if (updateData.companyBrief !== undefined)
      kit.companyBrief = updateData.companyBrief;
    if (updateData.roleBreakdown !== undefined)
      kit.roleBreakdown = updateData.roleBreakdown;
    if (updateData.questionBank !== undefined)
      kit.questionBank = updateData.questionBank;
    if (updateData.flashcards !== undefined)
      kit.flashcards = updateData.flashcards;
    if (updateData.studySchedule !== undefined)
      kit.studySchedule = updateData.studySchedule;

    await kit.save();

    res.status(200).json({
      success: true,
      kit: formatKit(kit),
    });
  } catch (error) {
    console.error("[Kit] Update error:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred updating the kit.",
      },
    });
  }
}

export async function deleteKit(req: Request, res: Response): Promise<void> {
  const id = getParamId(req.params.id);

  if (!id) {
    res.status(404).json({
      success: false,
      error: {
        code: "KIT_NOT_FOUND",
        message: "Interview kit not found.",
      },
    });
    return;
  }

  try {
    const deletedKit = await Kit.findOneAndDelete({
      _id: id,
      userId: req.userId,
    });

    if (!deletedKit) {
      res.status(404).json({
        success: false,
        error: {
          code: "KIT_NOT_FOUND",
          message: "Interview kit not found.",
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Kit deleted successfully.",
    });
  } catch (error) {
    console.error("[Kit] Delete error:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred deleting the kit.",
      },
    });
  }
}

export async function extractRequirementsForKit(
  req: Request,
  res: Response
): Promise<void> {
  const id = getParamId(req.params.id || req.params.kitId);

  if (!id) {
    res.status(404).json({
      success: false,
      error: {
        code: "KIT_NOT_FOUND",
        message: "Interview kit not found.",
      },
    });
    return;
  }

  const parseResult = extractRequirementsSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: parseResult.error.issues[0]?.message || "Invalid input data.",
      },
    });
    return;
  }

  const { jobDescription } = parseResult.data;

  try {
    // 1. Verify Kit exists and belongs to authenticated user (ownership isolation)
    const kit = await Kit.findOne({
      _id: id,
      userId: req.userId,
    });

    if (!kit) {
      res.status(404).json({
        success: false,
        error: {
          code: "KIT_NOT_FOUND",
          message: "Interview kit not found.",
        },
      });
      return;
    }

    // 2. Call the Stage 5.2 extraction service
    let extractionResult;
    try {
      extractionResult = await extractRequirementsFromJD(jobDescription);
    } catch (serviceError) {
      console.error("[Kit] Extraction service error:", serviceError);
      res.status(500).json({
        success: false,
        error: {
          code: "EXTRACTION_FAILED",
          message:
            "Failed to extract requirements from job description. Please try again.",
        },
      });
      return;
    }

    // 3. Format requirements with kitId and populate subdocuments
    const newRequirements: IRequirementDoc[] =
      extractionResult.requirements.map((r) => ({
        id: r.id,
        kitId: kit._id,
        text: r.text,
        kind: r.kind,
        priority: r.priority,
      }));

    // 4. Update the kit's requirements (clean replacement, deterministic IDs)
    kit.requirements = newRequirements;
    kit.jobDescription = jobDescription;

    await kit.save();

    res.status(200).json({
      success: true,
      requirements: kit.requirements,
    });
  } catch (error) {
    console.error("[Kit] Extract requirements error:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred during requirement extraction.",
      },
    });
  }
}

