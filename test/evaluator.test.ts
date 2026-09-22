import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {
  isPrivateOrReservedIp,
  validateSafeUrl,
  MockWebFetcher,
} from "../src/server/services/crawler/web-fetcher";
import {
  calculateQuestionDifficulty,
  allocateStudySchedule,
} from "../src/server/services/scheduling.service";
import {
  generateDeterministicFlashcards,
} from "../src/server/services/flashcard-generation.service";
import {
  generateFullKitPipeline,
} from "../src/server/services/kit-pipeline.service";
import {
  runBatchEvaluation,
} from "../src/evaluator/evaluator";
import { MockLlmService, OpenAiLlmService } from "../src/server/services/llm.service";
import { extractRequirementsFromJD } from "../src/server/services/requirement-extraction.service";

describe("Stage 9 — SSRF Security and Localhost Boundary", () => {
  test("SSRF: rejects private IPv4 ranges (10/8, 172.16/12, 192.168/16)", () => {
    assert.strictEqual(isPrivateOrReservedIp("10.0.0.1"), true);
    assert.strictEqual(isPrivateOrReservedIp("10.255.255.255"), true);
    assert.strictEqual(isPrivateOrReservedIp("172.16.0.1"), true);
    assert.strictEqual(isPrivateOrReservedIp("172.31.255.255"), true);
    assert.strictEqual(isPrivateOrReservedIp("192.168.1.1"), true);
    assert.strictEqual(isPrivateOrReservedIp("192.168.0.254"), true);
  });

  test("SSRF: rejects link-local and cloud metadata IP (169.254.169.254)", () => {
    assert.strictEqual(isPrivateOrReservedIp("169.254.169.254"), true);
    assert.strictEqual(isPrivateOrReservedIp("169.254.0.1"), true);
  });

  test("SSRF: rejects IPv6 private, loopback, and link-local ranges by default", () => {
    assert.strictEqual(isPrivateOrReservedIp("::1"), true);
    assert.strictEqual(isPrivateOrReservedIp("fe80::1"), true);
    assert.strictEqual(isPrivateOrReservedIp("fc00::1"), true);
    assert.strictEqual(isPrivateOrReservedIp("fd12::34"), true);
  });

  test("SSRF: production mode (allowLocalAddresses = false) rejects localhost and 127.0.0.1", async () => {
    await assert.rejects(
      async () => validateSafeUrl("http://localhost:8099/acme/", { allowLocalAddresses: false }),
      /Access to local domains is prohibited/
    );
    await assert.rejects(
      async () => validateSafeUrl("http://127.0.0.1:8099/acme/", { allowLocalAddresses: false }),
      /prohibited/
    );
  });

  test("SSRF: evaluator mode (allowLocalAddresses = true) permits localhost while continuing to block private IPs and cloud metadata", async () => {
    const validLocal = await validateSafeUrl("http://localhost:8099/acme/", { allowLocalAddresses: true });
    assert.strictEqual(validLocal.hostname, "localhost");

    const validIp = await validateSafeUrl("http://127.0.0.1:8099/acme/", { allowLocalAddresses: true });
    assert.strictEqual(validIp.hostname, "127.0.0.1");

    // Must still reject private networks and cloud metadata even in evaluator mode
    await assert.rejects(
      async () => validateSafeUrl("http://192.168.1.100/admin", { allowLocalAddresses: true }),
      /prohibited/
    );
    await assert.rejects(
      async () => validateSafeUrl("http://10.0.0.1/internal", { allowLocalAddresses: true }),
      /prohibited/
    );
    await assert.rejects(
      async () => validateSafeUrl("http://169.254.169.254/latest/meta-data/", { allowLocalAddresses: true }),
      /prohibited/
    );
  });

  test("SSRF: non-HTTP schemes are always rejected", async () => {
    await assert.rejects(
      async () => validateSafeUrl("ftp://localhost:21/data", { allowLocalAddresses: true }),
      /Prohibited protocol/
    );
    await assert.rejects(
      async () => validateSafeUrl("file:///etc/passwd", { allowLocalAddresses: true }),
      /Prohibited protocol/
    );
  });
});

describe("Stage 9 — Deterministic Difficulty & Scheduler Edge Cases", () => {
  test("Difficulty: calculates max difficulty across multiple linked requirements", () => {
    const requirements = [
      { id: "r1", kind: "behavioral", priority: "nice" }, // diff 1
      { id: "r2", kind: "technical", priority: "nice" },   // diff 2
      { id: "r3", kind: "technical", priority: "must" },   // diff 3
    ];

    // Single link
    assert.strictEqual(
      calculateQuestionDifficulty({ id: "q1", category: "behavioral", requirement_ids: ["r1"] }, requirements),
      1
    );
    assert.strictEqual(
      calculateQuestionDifficulty({ id: "q2", category: "technical", requirement_ids: ["r2"] }, requirements),
      2
    );
    assert.strictEqual(
      calculateQuestionDifficulty({ id: "q3", category: "technical", requirement_ids: ["r3"] }, requirements),
      3
    );

    // Multi-link takes MAXIMUM
    assert.strictEqual(
      calculateQuestionDifficulty({ id: "q4", category: "technical", requirement_ids: ["r1", "r2"] }, requirements),
      2
    );
    assert.strictEqual(
      calculateQuestionDifficulty({ id: "q5", category: "technical", requirement_ids: ["r1", "r3"] }, requirements),
      3
    );

    // Unlinked fallback = 1
    assert.strictEqual(
      calculateQuestionDifficulty({ id: "q6", category: "company", requirement_ids: [] }, requirements),
      1
    );
  });

  test("Scheduler: handles empty mustHaveQuestions without errors or NaN", () => {
    const questions = [
      { id: "q1", category: "behavioral", requirement_ids: ["r1"] },
      { id: "q2", category: "technical", requirement_ids: ["r2"] },
    ];
    // Both requirements are "nice", so mustHaveQuestions is empty
    const requirements = [
      { id: "r1", kind: "behavioral", priority: "nice" },
      { id: "r2", kind: "technical", priority: "nice" },
    ];

    const schedule = allocateStudySchedule({
      questions,
      requirements,
      daysAvailable: 5,
    });

    assert.strictEqual(schedule.days_available, 5);
    assert.strictEqual(schedule.days.length, 5);
    for (const day of schedule.days) {
      assert.ok(day.day >= 1 && day.day <= 5);
      assert.ok(day.focus.length > 0);
      assert.ok(day.question_ids.length > 0);
      assert.ok(Number.isInteger(day.minutes) && day.minutes > 0);
    }
  });

  test("Scheduler: handles extreme schedule (1 question / 60 days) without inventing questions", () => {
    const questions = [{ id: "q1", category: "technical", requirement_ids: ["r1"] }];
    const requirements = [{ id: "r1", kind: "technical", priority: "must" }];

    const schedule = allocateStudySchedule({
      questions,
      requirements,
      daysAvailable: 60,
    });

    assert.strictEqual(schedule.days_available, 60);
    assert.strictEqual(schedule.days.length, 60);

    for (let d = 1; d <= 60; d++) {
      const day = schedule.days[d - 1];
      assert.strictEqual(day.day, d);
      assert.deepStrictEqual(day.question_ids, ["q1"]); // Reuses only the valid question ID
      assert.strictEqual(day.minutes, 15);
      assert.ok(day.focus.length > 0);
    }
  });
});

describe("Stage 9 — Deterministic Flashcard Generation", () => {
  test("Flashcards: produces stable f1..fn IDs and maps requirement_ids exactly", () => {
    const requirements = [
      { id: "r1", text: "Proficiency in Node.js event loop" },
      { id: "r2", text: "Experience with PostgreSQL query optimization" },
    ];
    const questions = [
      { id: "q1", requirement_ids: ["r1"], answer_outline: "Discuss microtasks, timers, and libuv." },
    ];

    const flashcards = generateDeterministicFlashcards(requirements, questions);

    assert.strictEqual(flashcards.length, 2);
    assert.strictEqual(flashcards[0].id, "f1");
    assert.strictEqual(flashcards[0].requirement_ids[0], "r1");
    assert.ok(flashcards[0].front.includes("Node.js event loop"));
    assert.ok(flashcards[0].back.includes("microtasks"));

    assert.strictEqual(flashcards[1].id, "f2");
    assert.strictEqual(flashcards[1].requirement_ids[0], "r2");
    assert.ok(flashcards[1].front.includes("PostgreSQL"));
  });
});

describe("Stage 9 — Company Name Verification Rule", () => {
  test("Company: leaves company name as empty string when unverified, never manufactures from URL", async () => {
    const mockFetcher = new MockWebFetcher({ allowLocalAddresses: true });
    // URL containing "acme-corp", but page contains generic content without verified company name
    mockFetcher.setFixture("http://localhost:8099/acme-corp/jobs", {
      body: "<html><head><title>Job Postings</title></head><body>We are hiring engineers.</body></html>",
    });

    const kit = await generateFullKitPipeline(
      {
        id: "case-company-test",
        jd: "Senior Backend Developer needed.\n- Experience with Node.js and TypeScript (must)\n- Cloud architectures (must)",
        company_url: "http://localhost:8099/acme-corp/jobs",
        days: 3,
      },
      {
        webFetcher: mockFetcher,
        llmService: new MockLlmService(),
      }
    );

    // source.company must NOT be manufactured as "acme-corp" or "acme"
    assert.strictEqual(kit.source.company, "");
    assert.strictEqual(kit.source.company_url, "http://localhost:8099/acme-corp/jobs");
  });
});

describe("Stage 9 — End-to-End Pipeline & Appendix A/B Contracts", () => {
  test("Pipeline: produces valid Appendix A structure with exact top-level fields", async () => {
    const mockFetcher = new MockWebFetcher({ allowLocalAddresses: true });
    mockFetcher.setFixture("http://localhost:8099/acme/", {
      body: "<html><head><title>Acme Innovations - Careers</title></head><body><h1>About Us</h1><p>We build developer tooling.</p></body></html>",
    });

    const kit = await generateFullKitPipeline(
      {
        id: "case-01",
        jd: `Role: Senior Backend Engineer
Location: Remote
Responsibilities:
- Build high-throughput microservices in Node.js
- Optimize database performance
Requirements:
- Strong Node.js asynchronous programming skills (must)
- Production PostgreSQL experience (must)
- Familiarity with Kubernetes (nice)`,
        company_url: "http://localhost:8099/acme/",
        days: 5,
      },
      {
        webFetcher: mockFetcher,
        llmService: new MockLlmService(),
      }
    );

    // Verify exact Appendix A top-level keys
    const keys = Object.keys(kit).sort();
    assert.deepStrictEqual(keys, [
      "company_brief",
      "coverage",
      "flashcards",
      "questions",
      "role",
      "schedule",
      "source",
    ]);

    // Source contract
    assert.strictEqual(typeof kit.source.company, "string");
    assert.strictEqual(kit.source.company_url, "http://localhost:8099/acme/");
    assert.strictEqual(kit.source.role, "Senior Backend Engineer");
    assert.strictEqual(kit.source.location, "Remote");
    assert.ok(kit.source.jd_chars > 0);
    assert.ok(Array.isArray(kit.source.pages_used));

    // Role contract
    assert.strictEqual(kit.role.title, "Senior Backend Engineer");
    assert.strictEqual(kit.role.seniority, "Senior");
    assert.ok(kit.role.responsibilities.length > 0);
    assert.ok(kit.role.requirements.length >= 3);
    for (const req of kit.role.requirements) {
      assert.ok(req.id.startsWith("r"));
      assert.ok(req.text.length > 0);
      assert.ok(["technical", "behavioral", "domain"].includes(req.kind));
      assert.ok(["must", "nice"].includes(req.priority));
    }

    // Questions contract
    assert.ok(kit.questions.length >= 3);
    for (const q of kit.questions) {
      assert.ok(q.id.startsWith("q"));
      assert.ok(Array.isArray(q.requirement_ids));
      assert.ok(q.prompt.length > 0);
      assert.ok(q.answer_outline.length > 0);
      assert.ok([1, 2, 3].includes(q.difficulty));
      // Invariant: duration_minutes must not be present
      assert.strictEqual((q as Record<string, unknown>).duration_minutes, undefined);
    }

    // Schedule contract
    assert.strictEqual(kit.schedule.days_available, 5);
    assert.strictEqual(kit.schedule.days.length, 5);
    for (const day of kit.schedule.days) {
      assert.ok(day.day >= 1 && day.day <= 5);
      assert.ok(day.focus.length > 0);
      assert.ok(day.question_ids.length > 0);
      assert.ok(day.minutes > 0);
    }

    // Coverage contract
    assert.ok(Array.isArray(kit.coverage.uncovered_requirement_ids));
    assert.ok([1, 2].includes(kit.coverage.passes));
  });

  test("Batch Evaluator: handles multiple cases, error isolation, and failed kit: null contract", async () => {
    const tmpDir = path.resolve("./test/scratch");
    await fs.mkdir(tmpDir, { recursive: true });

    const inputPath = path.join(tmpDir, "test-cases.json");
    const outputPath = path.join(tmpDir, "test-kits.json");

    const cases = [
      {
        id: "case-valid-1",
        jd: "Senior Backend Engineer\n- Node.js (must)\n- Docker (nice)",
        company_url: "http://localhost:8099/acme/",
        days: 3,
      },
      {
        id: "case-invalid-days",
        jd: "Developer\n- Python (must)",
        company_url: "http://localhost:8099/acme/",
        days: -5, // Invalid days
      },
      {
        id: "case-valid-2",
        jd: "Frontend Engineer\n- React and TypeScript (must)",
        company_url: "http://localhost:8099/acme/",
        days: 2,
      },
    ];

    await fs.writeFile(inputPath, JSON.stringify(cases, null, 2), "utf-8");

    const mockFetcher = new MockWebFetcher({ allowLocalAddresses: true });
    mockFetcher.setFixture("http://localhost:8099/acme/", {
      body: "<html><body>Welcome to Acme</body></html>",
    });

    const result = await runBatchEvaluation({
      inputPath,
      outputPath,
      webFetcher: mockFetcher,
      llmService: new MockLlmService(),
    });

    assert.strictEqual(result.version, "1.0");
    assert.strictEqual(result.kits.length, 3);

    // Case 1: Success
    assert.strictEqual(result.kits[0].id, "case-valid-1");
    assert.strictEqual(result.kits[0].status, "ok");
    assert.ok(result.kits[0].kit !== null);
    assert.strictEqual(result.kits[0].error, null);

    // Case 2: Failed - MUST HAVE kit: null (never {})
    assert.strictEqual(result.kits[1].id, "case-invalid-days");
    assert.strictEqual(result.kits[1].status, "failed");
    assert.strictEqual(result.kits[1].kit, null);
    assert.ok(result.kits[1].error !== null);
    assert.strictEqual(result.kits[1].error?.code, "INVALID_INPUT");

    // Case 3: Success - Processing continued after failure in case 2!
    assert.strictEqual(result.kits[2].id, "case-valid-2");
    assert.strictEqual(result.kits[2].status, "ok");
    assert.ok(result.kits[2].kit !== null);
    assert.strictEqual(result.kits[2].error, null);

    // Verify written file matches
    const fileContent = await fs.readFile(outputPath, "utf-8");
    const parsedFile = JSON.parse(fileContent);
    assert.strictEqual(parsedFile.kits.length, 3);
    assert.strictEqual(parsedFile.kits[1].kit, null);
  });

  test("Batch Evaluator: isolates duplicate case IDs without aborting the batch", async () => {
    const tmpDir = path.resolve("./test/scratch");
    await fs.mkdir(tmpDir, { recursive: true });

    const inputPath = path.join(tmpDir, "test-dup-cases.json");
    const outputPath = path.join(tmpDir, "test-dup-kits.json");

    const cases = [
      {
        id: "dup-id-1",
        jd: "Senior Engineer\n- Go programming (must)",
        company_url: "http://localhost:8099/acme/",
        days: 2,
      },
      {
        id: "dup-id-1", // Duplicate ID
        jd: "Another Role\n- Java (must)",
        company_url: "http://localhost:8099/acme/",
        days: 2,
      },
      {
        id: "unique-id-2",
        jd: "DevOps Engineer\n- Terraform (must)",
        company_url: "http://localhost:8099/acme/",
        days: 1,
      },
    ];

    await fs.writeFile(inputPath, JSON.stringify(cases, null, 2), "utf-8");

    const mockFetcher = new MockWebFetcher({ allowLocalAddresses: true });
    mockFetcher.setFixture("http://localhost:8099/acme/", {
      body: "<html><body>Acme</body></html>",
    });

    const result = await runBatchEvaluation({
      inputPath,
      outputPath,
      webFetcher: mockFetcher,
      llmService: new MockLlmService(),
    });

    assert.strictEqual(result.kits.length, 3);
    assert.strictEqual(result.kits[0].status, "ok");

    // Duplicate case fails
    assert.strictEqual(result.kits[1].status, "failed");
    assert.strictEqual(result.kits[1].kit, null);
    assert.strictEqual(result.kits[1].error?.code, "DUPLICATE_CASE_ID");

    // Third case succeeds
    assert.strictEqual(result.kits[2].status, "ok");
  });

  test("Coverage: Pass 2 targets only uncovered requirements and recalculates coverage", async () => {
    // Custom LLM mock that produces incomplete question coverage on Pass 1 (only covers REQ-001)
    // and then produces questions for REQ-002 on Pass 2
    let passCount = 0;
    const targetedRequirementsSeen: string[] = [];

    const customLlm = new MockLlmService((options) => {
      const prompt = options.userPrompt;
      if (prompt.includes("<requirements>")) {
        passCount++;
        if (passCount === 1) {
          // Pass 1: return 2 questions (matching 2 requirements count), but both link to REQ-001,
          // leaving REQ-002 uncovered as a gap
          return JSON.stringify({
            questions: [
              {
                category: "technical",
                question: "Explain Node.js event loop in depth.",
                answerOutline: "Microtasks, timers, check phase, and threadpool.",
                requirementIds: ["REQ-001"],
              },
              {
                category: "technical",
                question: "Explain Node.js Streams and backpressure.",
                answerOutline: "Readable, writable, transform streams and backpressure handling.",
                requirementIds: ["REQ-001"],
              },
            ],
          });
        } else {
          // Pass 2: Record what requirements were passed into Pass 2
          const match2 = prompt.match(/\[(REQ-\d+)\]/g) || [];
          targetedRequirementsSeen.push(...match2);

          // Pass 2: provide question for the uncovered requirement REQ-002
          return JSON.stringify({
            questions: [
              {
                category: "technical",
                question: "Explain Docker containerization and image layers.",
                answerOutline: "Layer caching, multi-stage builds, and container isolation.",
                requirementIds: ["REQ-002"],
              },
            ],
          });
        }
      }

      // Default requirements extraction
      return JSON.stringify({
        requirements: [
          { text: "Node.js proficiency", kind: "technical", priority: "must" },
          { text: "Docker containerization", kind: "technical", priority: "must" },
        ],
      });
    });

    const mockFetcher = new MockWebFetcher({ allowLocalAddresses: true });
    mockFetcher.setFixture("http://localhost:8099/acme/", {
      body: "<html><body>Acme</body></html>",
    });

    const kit = await generateFullKitPipeline(
      {
        id: "case-pass2-test",
        jd: "Backend Engineer\n- Node.js (must)\n- Docker (must)",
        company_url: "http://localhost:8099/acme/",
        days: 3,
      },
      {
        webFetcher: mockFetcher,
        llmService: customLlm,
      }
    );

    // Verify Pass 2 was executed
    assert.strictEqual(kit.coverage.passes, 2);
    // Verify Pass 2 ONLY received the uncovered requirement REQ-002, not REQ-001!
    assert.ok(targetedRequirementsSeen.includes("[REQ-002]"));
    assert.strictEqual(targetedRequirementsSeen.includes("[REQ-001]"), false);

    // Verify all must-haves are covered after Pass 2 recalculation
    assert.strictEqual(kit.coverage.uncovered_requirement_ids.length, 0);
    // All 3 questions present in questions array (2 from Pass 1 + 1 from Pass 2)
    assert.strictEqual(kit.questions.length, 3);
    assert.strictEqual(kit.questions[0].id, "q1");
    assert.strictEqual(kit.questions[1].id, "q2");
    assert.strictEqual(kit.questions[2].id, "q3");
  });

  test("Database Independence: batch execution operates entirely without MongoDB", async () => {
    const mongoose = await import("mongoose");
    // Verify MongoDB connection is disconnected (readyState 0)
    assert.strictEqual(mongoose.default.connection.readyState, 0);

    const mockFetcher = new MockWebFetcher({ allowLocalAddresses: true });
    mockFetcher.setFixture("http://localhost:8099/acme/", {
      body: "<html><body>Acme</body></html>",
    });

    const kit = await generateFullKitPipeline(
      {
        id: "case-no-db",
        jd: "Senior Engineer\n- TypeScript (must)",
        company_url: "http://localhost:8099/acme/",
        days: 2,
      },
      {
        webFetcher: mockFetcher,
        llmService: new MockLlmService(),
      }
    );

    assert.ok(kit !== null);
    assert.strictEqual(kit.role.title, "Senior Engineer");
    // Ensure MongoDB connection remained disconnected (readyState 0) throughout
    assert.strictEqual(mongoose.default.connection.readyState, 0);
  });
});

describe("Stage 10 — Edge Cases and Failure Handling", () => {
  test("LLM Provider: retries on HTTP 429 and succeeds on attempt 2", async () => {
    const originalFetch = globalThis.fetch;
    let callCount = 0;
    try {
      globalThis.fetch = async () => {
        callCount++;
        if (callCount === 1) {
          return new Response(JSON.stringify({ error: { message: "Rate limit exceeded" } }), {
            status: 429,
            headers: { "Content-Type": "application/json", "retry-after": "0" },
          });
        }
        return new Response(
          JSON.stringify({ choices: [{ message: { content: "{\"result\": \"success\"}" } }] }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      };

      const llm = new OpenAiLlmService({
        apiKey: "test-api-key",
        initialRetryDelayMs: 1,
      });

      const res = await llm.generateCompletion({ userPrompt: "Test 429 prompt" });
      assert.strictEqual(res, "{\"result\": \"success\"}");
      assert.strictEqual(callCount, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("LLM Provider: retries on transient HTTP 503 and succeeds on attempt 2", async () => {
    const originalFetch = globalThis.fetch;
    let callCount = 0;
    try {
      globalThis.fetch = async () => {
        callCount++;
        if (callCount === 1) {
          return new Response(JSON.stringify({ error: { message: "Service Unavailable" } }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({ choices: [{ message: { content: "Recovered from 503" } }] }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      };

      const llm = new OpenAiLlmService({
        apiKey: "test-api-key",
        initialRetryDelayMs: 1,
      });

      const res = await llm.generateCompletion({ userPrompt: "Test 503 prompt" });
      assert.strictEqual(res, "Recovered from 503");
      assert.strictEqual(callCount, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("LLM Provider: does NOT retry permanent 4xx errors (e.g. 401 Unauthorized)", async () => {
    const originalFetch = globalThis.fetch;
    let callCount = 0;
    try {
      globalThis.fetch = async () => {
        callCount++;
        return new Response(JSON.stringify({ error: { message: "Invalid API key" } }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      };

      const llm = new OpenAiLlmService({
        apiKey: "invalid-key",
        initialRetryDelayMs: 1,
      });

      await assert.rejects(
        async () => llm.generateCompletion({ userPrompt: "Test 401 prompt" }),
        /OpenAI API request failed \(401\)/
      );
      // Confirms exactly 1 call was made and NO retries occurred
      assert.strictEqual(callCount, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("Requirement Extraction: retries on malformed JSON and succeeds on attempt 2", async () => {
    let callCount = 0;
    const mockLlm = new MockLlmService(() => {
      callCount++;
      if (callCount === 1) {
        // Attempt 1: Malformed JSON output
        return "Not valid json { requirements: [ broken";
      }
      // Attempt 2: Valid JSON
      return JSON.stringify({
        requirements: [
          { text: "Python and Django proficiency", kind: "technical", priority: "must" },
        ],
      });
    });

    const result = await extractRequirementsFromJD("Backend Engineer\n- Python and Django proficiency (must)", {
      llmService: mockLlm,
    });

    assert.strictEqual(callCount, 2);
    assert.strictEqual(result.requirements.length, 1);
    assert.strictEqual(result.requirements[0].id, "REQ-001");
    assert.strictEqual(result.requirements[0].text, "Python and Django proficiency");
  });

  test("Requirement Extraction: fails after exactly 2 attempts if output remains invalid", async () => {
    let callCount = 0;
    const mockLlm = new MockLlmService(() => {
      callCount++;
      // Always return invalid structure
      return "{ invalid: true }";
    });

    await assert.rejects(
      async () =>
        extractRequirementsFromJD("Backend Engineer\n- Python and Django proficiency (must)", {
          llmService: mockLlm,
        }),
      /LLM extraction output failed validation/
    );

    // Exactly 2 attempts (Attempt 1 + Attempt 2) occurred
    assert.strictEqual(callCount, 2);
  });

  test("Thin Job Description: extracts only the explicit requirement and produces a valid kit", async () => {
    const mockFetcher = new MockWebFetcher({ allowLocalAddresses: true });
    mockFetcher.setFixture("http://localhost:8099/acme/", {
      body: "<html><head><title>Acme Innovations - Careers</title></head><body>Welcome</body></html>",
    });

    const thinJd = `Role: Junior Developer
Location: Remote
Requirements:
- Must have basic knowledge of Git (must)`;

    const kit = await generateFullKitPipeline(
      {
        id: "case-thin-jd",
        jd: thinJd,
        company_url: "http://localhost:8099/acme/",
        days: 3,
      },
      {
        webFetcher: mockFetcher,
        llmService: new MockLlmService(),
      }
    );

    // Verify only the 1 requirement exists and no requirements were fabricated
    assert.strictEqual(kit.role.requirements.length, 1);
    assert.strictEqual(kit.role.requirements[0].id, "r1");
    assert.ok(kit.role.requirements[0].text.toLowerCase().includes("git"));

    // Verify questions and flashcards are grounded strictly in this 1 requirement
    assert.strictEqual(kit.questions.length, 1);
    assert.strictEqual(kit.questions[0].id, "q1");
    assert.deepStrictEqual(kit.questions[0].requirement_ids, ["r1"]);

    assert.strictEqual(kit.flashcards.length, 1);
    assert.strictEqual(kit.flashcards[0].id, "f1");
    assert.deepStrictEqual(kit.flashcards[0].requirement_ids, ["r1"]);

    // Verify 3-day schedule is fully allocated without errors
    assert.strictEqual(kit.schedule.days_available, 3);
    assert.strictEqual(kit.schedule.days.length, 3);
    for (const day of kit.schedule.days) {
      assert.deepStrictEqual(day.question_ids, ["q1"]);
    }
  });

  test("Batch Failure Isolation: provider failure in one case does not abort other cases", async () => {
    const tmpDir = path.resolve("./test/scratch");
    await fs.mkdir(tmpDir, { recursive: true });

    const inputPath = path.join(tmpDir, "test-provider-fail-cases.json");
    const outputPath = path.join(tmpDir, "test-provider-fail-kits.json");

    const cases = [
      {
        id: "case-success-1",
        jd: "Senior Backend Engineer\n- Node.js (must)",
        company_url: "http://localhost:8099/acme/",
        days: 2,
      },
      {
        id: "case-provider-failure",
        jd: "DevOps Engineer\n- Kubernetes (must)",
        company_url: "http://localhost:8099/acme/",
        days: 2,
      },
      {
        id: "case-success-2",
        jd: "Frontend Engineer\n- React (must)",
        company_url: "http://localhost:8099/acme/",
        days: 2,
      },
    ];

    await fs.writeFile(inputPath, JSON.stringify(cases, null, 2), "utf-8");

    const mockFetcher = new MockWebFetcher({ allowLocalAddresses: true });
    mockFetcher.setFixture("http://localhost:8099/acme/", {
      body: "<html><body>Acme</body></html>",
    });

    const failingLlm = new MockLlmService((options) => {
      if (options.userPrompt.includes("DevOps Engineer")) {
        throw new Error("OpenAI API request failed (500): Internal Server Error");
      }
      return new MockLlmService().generateCompletion(options);
    });

    const result = await runBatchEvaluation({
      inputPath,
      outputPath,
      webFetcher: mockFetcher,
      llmService: failingLlm,
    });

    assert.strictEqual(result.kits.length, 3);

    // Case 1: Succeeded
    assert.strictEqual(result.kits[0].id, "case-success-1");
    assert.strictEqual(result.kits[0].status, "ok");
    assert.ok(result.kits[0].kit !== null);

    // Case 2: Failed due to provider error — isolated as failed, kit: null
    assert.strictEqual(result.kits[1].id, "case-provider-failure");
    assert.strictEqual(result.kits[1].status, "failed");
    assert.strictEqual(result.kits[1].kit, null);
    assert.ok(result.kits[1].error?.message.includes("OpenAI API request failed (500)"));

    // Case 3: Succeeded despite Case 2's provider failure!
    assert.strictEqual(result.kits[2].id, "case-success-2");
    assert.strictEqual(result.kits[2].status, "ok");
    assert.ok(result.kits[2].kit !== null);
  });

  after(async () => {
    const tmpDir = path.resolve("./test/scratch");
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });
});


