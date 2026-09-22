import "dotenv/config";
import { runBatchEvaluation } from "./evaluator";

interface ParsedArgs {
  inputPath?: string;
  outputPath?: string;
}

function parseCliArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--input" || arg === "-i") {
      result.inputPath = args[i + 1];
      i++;
    } else if (arg.startsWith("--input=")) {
      result.inputPath = arg.split("=")[1];
    } else if (arg === "--output" || arg === "-o") {
      result.outputPath = args[i + 1];
      i++;
    } else if (arg.startsWith("--output=")) {
      result.outputPath = arg.split("=")[1];
    }
  }

  return result;
}

function printUsage(): void {
  console.error("Usage: npm run evaluate -- --input <cases.json> --output <kits.json>");
  console.error("Options:");
  console.error("  --input, -i   Path to the input JSON file containing array of cases");
  console.error("  --output, -o  Path to the output JSON file to write generated kits");
}

async function main(): Promise<void> {
  // Discard node binary and script path
  const rawArgs = process.argv.slice(2);
  const { inputPath, outputPath } = parseCliArgs(rawArgs);

  if (!inputPath || !outputPath) {
    console.error("Error: Both --input and --output arguments are required.\n");
    printUsage();
    process.exit(1);
  }

  try {
    console.log(`[Evaluator] Starting batch evaluation...`);
    console.log(`[Evaluator] Input:  ${inputPath}`);
    console.log(`[Evaluator] Output: ${outputPath}`);

    const startTime = Date.now();
    const result = await runBatchEvaluation({
      inputPath,
      outputPath,
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    const successfulCount = result.kits.filter((k) => k.status === "ok").length;
    const failedCount = result.kits.filter((k) => k.status === "failed").length;

    console.log(
      `[Evaluator] Evaluation complete in ${elapsed}s: ${successfulCount} succeeded, ${failedCount} failed. Total cases: ${result.kits.length}.`
    );
    console.log(`[Evaluator] Results saved to ${outputPath}`);
    process.exit(0);
  } catch (err) {
    console.error(`[Evaluator] Fatal batch error: ${(err as Error).message}`);
    process.exit(1);
  }
}

main();
