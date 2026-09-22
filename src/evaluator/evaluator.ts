import fs from "node:fs/promises";
import path from "node:path";
import { generateFullKitPipeline, PipelineCaseInput } from "../server/services/kit-pipeline.service";
import { AppendixBCaseResult, AppendixBOutput } from "./dto";
import { ILlmService } from "../server/services/llm.service";
import { IWebFetcher, SafeWebFetcher } from "../server/services/crawler/web-fetcher";

export interface EvaluatorRunOptions {
  inputPath: string;
  outputPath: string;
  llmService?: ILlmService;
  webFetcher?: IWebFetcher;
  timeoutPerCaseMs?: number;
}

/**
 * Validates the raw JSON input to ensure it is a valid array of cases.
 */
export function parseCasesJson(jsonContent: string): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonContent);
  } catch {
    throw new Error("Input file is not valid JSON.");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Input JSON must contain an array of case objects.");
  }

  return parsed;
}

/**
 * Executes batch evaluation across all input cases with per-case failure isolation.
 */
export async function runBatchEvaluation(options: EvaluatorRunOptions): Promise<AppendixBOutput> {
  const { inputPath, outputPath } = options;
  const timeoutMs = options.timeoutPerCaseMs ?? 120000; // 120s per case ceiling

  const resolvedInput = path.resolve(inputPath);
  const resolvedOutput = path.resolve(outputPath);

  let rawContent: string;
  try {
    rawContent = await fs.readFile(resolvedInput, "utf-8");
  } catch {
    throw new Error(`Failed to read input file at '${inputPath}'. File does not exist or is not readable.`);
  }

  const rawCases = parseCasesJson(rawContent);

  const seenIds = new Set<string>();
  const kitsResults: AppendixBCaseResult[] = [];

  // Use evaluator web fetcher that allows local addresses
  const evaluatorWebFetcher =
    options.webFetcher || new SafeWebFetcher({ allowLocalAddresses: true });

  for (let idx = 0; idx < rawCases.length; idx++) {
    const rawItem = rawCases[idx] as Record<string, unknown>;
    const rawId = typeof rawItem?.id === "string" ? rawItem.id : `case-idx-${idx + 1}`;

    // 1. Check duplicate case ID
    if (seenIds.has(rawId)) {
      kitsResults.push({
        id: rawId,
        status: "failed",
        kit: null,
        error: {
          code: "DUPLICATE_CASE_ID",
          message: `Duplicate case ID '${rawId}' detected in input batch.`,
        },
      });
      continue;
    }
    seenIds.add(rawId);

    // 2. Validate case schema
    if (
      !rawItem ||
      typeof rawItem !== "object" ||
      typeof rawItem.id !== "string" ||
      !rawItem.id.trim() ||
      typeof rawItem.jd !== "string" ||
      !rawItem.jd.trim() ||
      typeof rawItem.company_url !== "string" ||
      !/^https?:\/\/.+/i.test(rawItem.company_url) ||
      typeof rawItem.days !== "number" ||
      !Number.isInteger(rawItem.days) ||
      rawItem.days < 1
    ) {
      kitsResults.push({
        id: rawId,
        status: "failed",
        kit: null,
        error: {
          code: "INVALID_INPUT",
          message: "Case missing required fields or has invalid types (id, jd, company_url, days >= 1).",
        },
      });
      continue;
    }

    const caseInput: PipelineCaseInput = {
      id: rawItem.id.trim(),
      jd: rawItem.jd.trim(),
      company_url: rawItem.company_url.trim(),
      days: rawItem.days,
    };

    // 3. Execute with per-case isolation and timeout
    let timer: NodeJS.Timeout | undefined;
    try {
      const casePromise = generateFullKitPipeline(caseInput, {
        llmService: options.llmService,
        webFetcher: evaluatorWebFetcher,
        allowLocalAddresses: true,
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`Case '${caseInput.id}' timed out after ${timeoutMs / 1000} seconds.`));
        }, timeoutMs);
      });

      const generatedKit = await Promise.race([casePromise, timeoutPromise]);

      kitsResults.push({
        id: caseInput.id,
        status: "ok",
        kit: generatedKit,
        error: null,
      });
    } catch (caseErr) {
      const errorObj = caseErr as { code?: string; message?: string };
      kitsResults.push({
        id: caseInput.id,
        status: "failed",
        kit: null,
        error: {
          code: errorObj.code || "PIPELINE_ERROR",
          message: errorObj.message || "An unexpected error occurred processing this case.",
        },
      });
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  // 4. Construct final Appendix B document
  const output: AppendixBOutput = {
    version: "1.0",
    generated_at: new Date().toISOString(),
    kits: kitsResults,
  };

  // 5. Atomic write to output file
  await fs.mkdir(path.dirname(resolvedOutput), { recursive: true });
  await fs.writeFile(resolvedOutput, JSON.stringify(output, null, 2), "utf-8");

  return output;
}
