import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  createKitSchema,
  extractRequirementsSchema,
  updateKitSchema,
} from "../src/server/validations/kit.validation";
import { validateGenerationInvariants } from "../src/server/services/question-generation.service";
import { IRequirement, IQuestion } from "../src/shared/types";

describe("Stage 11 — Security and Boundary Hardening", () => {
  describe("Test A & B — Job Description Boundary and Rejection", () => {
    test("accepts valid normal job description within allowed limit", () => {
      const normalJd = "We are seeking a Software Engineer proficient in TypeScript, Node.js, and SQL.";
      const validPayload = {
        title: "Software Engineer",
        jobDescription: normalJd,
        companyUrl: "https://example.com",
        daysAvailable: 7,
      };

      const result = createKitSchema.safeParse(validPayload);
      assert.strictEqual(result.success, true);
    });

    test("accepts job description exactly at 50,000 characters", () => {
      const boundaryJd = "A".repeat(50000);
      const boundaryPayload = {
        title: "Software Engineer",
        jobDescription: boundaryJd,
        companyUrl: "https://example.com",
        daysAvailable: 7,
      };

      const result = createKitSchema.safeParse(boundaryPayload);
      assert.strictEqual(result.success, true);
    });

    test("rejects job description exceeding 50,000 characters at validation boundary (no silent truncation)", () => {
      const oversizedJd = "A".repeat(50001);
      const oversizedPayload = {
        title: "Software Engineer",
        jobDescription: oversizedJd,
        companyUrl: "https://example.com",
        daysAvailable: 7,
      };

      const result = createKitSchema.safeParse(oversizedPayload);
      assert.strictEqual(result.success, false);
      if (!result.success) {
        const error = result.error.issues.find((issue) =>
          issue.path.includes("jobDescription")
        );
        assert.ok(error, "Expected issue on jobDescription path");
        assert.match(
          error.message,
          /50,000 characters/,
          "Expected 50,000 character limit error message"
        );
      }
    });

    test("rejects oversized job description in extractRequirementsSchema", () => {
      const oversizedJd = "B".repeat(50001);
      const result = extractRequirementsSchema.safeParse({
        jobDescription: oversizedJd,
      });

      assert.strictEqual(result.success, false);
      if (!result.success) {
        assert.ok(result.error.issues[0].message.includes("50,000"));
      }
    });

    test("rejects oversized job description in updateKitSchema", () => {
      const oversizedJd = "C".repeat(50001);
      const result = updateKitSchema.safeParse({
        jobDescription: oversizedJd,
      });

      assert.strictEqual(result.success, false);
      if (!result.success) {
        assert.ok(result.error.issues[0].message.includes("50,000"));
      }
    });
  });

  describe("Enforceable Prompt Injection & Invariant Defense", () => {
    test("generation invariant layer rejects fabricated requirement IDs from injected model output", () => {
      // Extracted known requirements
      const knownRequirements: IRequirement[] = [
        {
          id: "REQ-001",
          text: "Strong TypeScript proficiency",
          kind: "technical",
          priority: "must",
        },
        {
          id: "REQ-002",
          text: "Experience building microservices",
          kind: "technical",
          priority: "must",
        },
      ];

      // Simulated injected LLM question referencing non-existent requirement REQ-999
      const injectedQuestions: IQuestion[] = [
        {
          id: "q-1",
          category: "technical",
          question: "Explain how TypeScript types work.",
          answerOutline: "Discuss structural typing.",
          requirementIds: ["REQ-001"],
          durationMinutes: 15,
          state: "generated",
        },
        {
          id: "q-2",
          category: "technical",
          question: "How do you bypass internal permissions?",
          answerOutline: "Fabricated injected question outline.",
          requirementIds: ["REQ-999"], // Fabricated ID!
          durationMinutes: 15,
          state: "generated",
        },
      ];

      const validationError = validateGenerationInvariants(
        injectedQuestions,
        knownRequirements,
        false
      );

      assert.ok(validationError !== null, "Expected validation error for injected requirement ID");
      assert.match(
        validationError!,
        /references non-existent requirement ID 'REQ-999'/,
        "Validation properly detected and rejected fabricated requirement ID"
      );
    });

    test("generation invariant layer rejects invalid category mapping from injected model output", () => {
      const knownRequirements: IRequirement[] = [
        {
          id: "REQ-001",
          text: "Healthcare compliance domain knowledge",
          kind: "domain",
          priority: "must",
        },
      ];

      // Domain requirements must map to 'roleSpecific' category
      const invalidCategoryQuestions: IQuestion[] = [
        {
          id: "q-1",
          category: "behavioral", // Invalid for domain requirement
          question: "Describe healthcare data handling.",
          answerOutline: "HIPAA discussion.",
          requirementIds: ["REQ-001"],
          durationMinutes: 15,
          state: "generated",
        },
      ];

      const validationError = validateGenerationInvariants(
        invalidCategoryQuestions,
        knownRequirements,
        false
      );

      assert.ok(validationError !== null, "Expected category invariant violation");
      assert.match(
        validationError!,
        /Question for domain requirement 'REQ-001' must have category 'roleSpecific'/,
        "Validation enforces category invariant on model output"
      );
    });
  });
});
