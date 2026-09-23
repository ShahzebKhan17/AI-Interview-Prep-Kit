# AI Interview Prep Kit 🚀

> **Trao Full-Stack Engineering Assessment** | Assessment ID: `FS-AI-INTERVIEW-01`  
> An autonomous, full-stack application that transforms any Job Description and company website into a personalized, verified interview preparation workspace.

---

## 🌐 Live Deployments & Repository Links

* **Live Web Application (Frontend):** [https://ai-interview-prep-kit-cz2d.vercel.app](https://ai-interview-prep-kit-cz2d.vercel.app)
* **Live API Backend:** [https://ai-interview-prep-kit-production.up.railway.app](https://ai-interview-prep-kit-production.up.railway.app)
* **GitHub Repository:** [https://github.com/ShahzebKhan17/AI-Interview-Prep-Kit](https://github.com/ShahzebKhan17/AI-Interview-Prep-Kit)

---

## 📌 Project Overview & Tech Stack

The **AI Interview Prep Kit** automates the end-to-end preparation journey for technical, behavioral, and domain-specific interviews. Rather than relying on a single monolithic prompt, the system executes a deliberate sequence of retrieval, extraction, cross-referencing, multi-pass coverage verification, and arithmetic schedule allocation.

### Chosen Stack & Architectural Justifications

| Layer | Technology | Justification |
| :--- | :--- | :--- |
| **Frontend** | **Next.js 15 (App Router) + Tailwind CSS** | Provides fast client-side navigation, immediate UI updates for inline editing/reordering, and accessible keyboard navigation without round-tripping for every keystroke. |
| **Backend** | **Node.js (v20+) + Express + TypeScript** | Strict type safety across client, server, and evaluator; clear separation of concerns between HTTP routes, controllers, crawlers, and LLM pipelines. |
| **Database** | **MongoDB Atlas + Mongoose** | Flexible document modeling for nested kit structures (`requirements`, `questionBank`, `flashcards`, `studySchedule`) with per-user ownership isolation. |
| **LLM Inference** | **Groq API (`openai/gpt-oss-120b`)** | Ultra-fast token generation on LPUs adhering to free-tier constraints; standard OpenAI-compatible protocol via `OPENAI_BASE_URL`. Includes an intelligent offline `MockLlmService` fallback for zero-cost, deterministic local testing. |
| **Web Retrieval** | **Custom `SafeWebFetcher` (Node fetch + Cheerio/Regex)** | SSRF-hardened web crawler with URL resolution, link ranking, robots.txt compliance, and automatic backoff. |

---

## 🏛️ High-Level Architecture

```
[ User Browser / Next.js Client ]
             │
             │ HTTPS (JWT in SameSite=None / Secure Cookies)
             ▼
[ Express API Server (Railway) ]
  ├── Middleware: CORS, CookieParser, Auth Guard (req.userId isolation)
  ├── Controllers & Zod Validators (50,000 char limits, URL sanitation)
  └── Services Layer:
        ├── SafeWebFetcher (SSRF filter, Private IP / Metadata blocking)
        ├── Company Crawler & Public Discussion Retrieval
        ├── Requirement Extraction Service (Must vs. Nice, Kind classifier)
        ├── Question Bank Generator (Category-specific prompt isolation)
        ├── Coverage & Gap Analysis Engine (Deterministic arithmetic check)
        ├── Pass 2 Gap Closure Loop (Targeted missing-requirement remediation)
        ├── Schedule Allocator (Deterministic day & difficulty bin-packing)
        └── LLM Client (Exponential backoff, 429/503 retry with jitter)
             │
             ├──► MongoDB Atlas (Persistence)
             └──► Groq / OpenAI API (Model Inference)

[ CLI Evaluator (npm run evaluate) ] ──► Pure in-memory execution of the pipeline (Zero-DB dependency)
```

---

## ⚡ Setup Instructions

### 1. Local Development

#### Prerequisites
* Node.js v20+
* MongoDB (local or Atlas connection string)
* Free Groq API Key (or OpenAI API Key)

#### Installation
```bash
# Clone the repository
git clone https://github.com/ShahzebKhan17/AI-Interview-Prep-Kit.git
cd AI-Interview-Prep-Kit

# Install dependencies
npm install
```

#### Environment Variables (`.env`)
Create a `.env` file in the root directory (refer to `.env.example`):
```env
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:3000

# Database
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/ai_interview_prep?retryWrites=true&w=majority

# Authentication
JWT_SECRET=your_super_secret_jwt_key_at_least_32_characters
JWT_EXPIRES_IN=7d

# LLM Configuration (Groq Free Tier)
OPENAI_API_KEY=gsk_your_groq_api_key
OPENAI_BASE_URL=https://api.groq.com/openai/v1
OPENAI_MODEL=openai/gpt-oss-120b

# (Optional) Offline Mock Mode
MOCK_LLM=false
```

#### Run Locally
```bash
# Concurrently runs Next.js frontend (port 3000) and Express server (port 5000)
npm run dev
```

---

### 2. Mandatory Batch Entry Point (Section 9)

The repository exposes a standalone CLI evaluator that executes the complete retrieval, generation, and multi-pass coverage pipeline across an array of test cases without requiring MongoDB:

```bash
npm run evaluate -- --input <cases.json> --output <kits.json>
```

#### Input Format (`cases.json`)
```json
[
  {
    "id": "case-01",
    "jd": "Senior Backend Engineer\n\nWe are looking for Node.js, TypeScript, and MongoDB experience...",
    "company_url": "https://company.example.com",
    "days": 5
  }
]
```

#### Output Format (`kits.json`)
Produces an output file adhering strictly to **Appendix B** containing full **Appendix A** kit schemas:
```json
{
  "version": "1.0",
  "generated_at": "2026-09-23T10:00:00Z",
  "kits": [
    {
      "id": "case-01",
      "status": "ok",
      "kit": {
        "source": { "company": "", "company_url": "https://company.example.com", "role": "", "location": "", "jd_chars": 120, "researched_at": "2026-09-23T10:00:00Z", "pages_used": [] },
        "company_brief": { "summary": "...", "what_they_do": "...", "sources": [] },
        "role": { "title": "Senior Backend Engineer", "seniority": "Senior", "responsibilities": [], "requirements": [] },
        "questions": [],
        "flashcards": [],
        "schedule": { "days_available": 5, "days": [] },
        "coverage": { "uncovered_requirement_ids": [], "passes": 2 }
      },
      "error": null
    }
  ]
}
```

#### Running Automated Tests
```bash
npm test
```
*All 30 automated test suites pass*, validating SSRF security, job description boundary limits, prompt injection invariants, deterministic difficulty and scheduling, failure isolation, and Appendix A/B contract compliance.

---

## 🔍 Retrieval Approach & Web Scraping

Finding relevant hiring pages cannot be achieved via hard-coded paths. The crawler executes the following pipeline:
1. **URL Validation & SSRF Defense (`SafeWebFetcher`):**
   * Resolves hostnames via DNS and checks against private/reserved IPv4 ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local/cloud metadata (`169.254.169.254`), and IPv6 loopback (`::1`, `fe80::/10`).
   * Evaluator mode allows `http://localhost:*` testing while strictly maintaining cloud metadata and internal network barriers.
2. **Robots.txt & Status Inspection:**
   * Fetches `/robots.txt` when present, honoring crawl delays and disallow directives.
3. **Dynamic Link Ranking:**
   * Ingests the company root HTML and extracts anchors.
   * Ranks links using a scoring heuristic favoring career paths (`/careers`, `/jobs`, `/about`, `/culture`, `/engineering`, `/handbook`, `/team`) over generic pages.
4. **Public Discussion Search:**
   * Queries public developer discussions (Glassdoor, Reddit, engineering blogs) for company interview rounds (take-home tests, system design expectations).
5. **Honest Reporting:**
   * If a site returns a 404, blocks crawlers, or lacks a hiring page, the system **honestly reports an empty brief and records the unretrieved source in `pages_used`**, rather than fabricating fictitious facts.

---

## 🧠 Research & Generation Sequencing

The kit generation pipeline enforces strict separation of concerns through deliberate stages:

```
[ Job Description ] ──► [ Step 1: Input Validation ]
                              │
                              ▼
                        [ Step 2: Requirement Extraction ] (Atomic items: Must/Nice, Kind)
                              │
                              ├──► [ Step 3: Safe Crawler ] (Company context & hiring insights)
                              ├──► [ Step 4: Role Extraction ] (Seniority & responsibilities)
                              │
                              ▼
                        [ Step 5: Question Generation - Pass 1 ]
                              │  (Technical, Behavioral, System Design, Company Fit)
                              ▼
                        [ Step 6: Coverage Gap Check (Code Arithmetic) ]
                              │
                              ├─► Uncovered Must-Haves? ──► [ Pass 2: Targeted Gap Closure ]
                              │                                       │
                              ▼                                       ▼
                        [ Step 7: Deterministic Schedule Allocation ]
                              │
                              ▼
                        [ Step 8: Flashcard Generation & Verification ]
```

1. **Step 1: Input Validation:** Enforces non-empty input and a strict 50,000 character maximum to prevent resource exhaustion attacks.
2. **Step 2: Requirement Extraction:** Extracts explicit skills, assigning deterministic IDs (`r1`, `r2`, ...). Separates `technical`, `behavioral`, and `domain` skills, marking `must` vs. `nice`. Never fabricates requirements not in the posting.
3. **Step 3: Company Retrieval:** Crawls ranked links for engineering culture and hiring rounds.
4. **Step 4: Role Extraction:** Identifies role title, seniority, and primary responsibilities.
5. **Step 5: Question Generation (Pass 1):** Generates questions mapped explicitly to `requirement_ids`, answer guidance outlines, and integer difficulties (1–3).
6. **Step 6: Second Pass (Coverage Gap Check):** A deterministic, code-based set difference compares extracted requirements with generated question `requirement_ids`. If any must-have requirements remain uncovered, **Pass 2** triggers targeted generation specifically for those missing IDs, reporting `passes: 2`.
7. **Step 7: Deterministic Schedule Allocation:** Arithmetic bin-packing maps questions to the exact number of days requested, landing higher-priority, harder questions early.
8. **Step 8: Flashcard Generation:** Creates atomic flashcards mapped to individual requirements for rapid recall.

---

## 🛠️ The Builder: State Representation & Preservation

In the interactive workspace ([src/client/app/kits/[id]/page.tsx](file:///c:/Users/hp/Downloads/Switch/AI%20Interview%20Prep%20Kit/src/client/app/kits/%5Bid%5D/page.tsx)), users can edit question text, modify answer outlines, reorder cards, and add custom entries.

### How Generated, Edited, and Pinned States are Preserved:
To solve the hardest state challenge (preventing a section regeneration from discarding manual user work):
* **State Flags:** Every entity maintains `isCustom` (manually added), `isEdited` (modified from generated text), and `isPinned` (locked by user).
* **Targeted Section Regeneration:** When regenerating a single category (e.g., *Behavioral* or *Company Brief*):
  1. The backend isolates the request to that specific section.
  2. The merge algorithm retains all questions where `isCustom === true` or `isEdited === true`.
  3. Only unmodified, generated questions are refreshed, ensuring user edits survive regenerations intact.

---

## 📅 Schedule Allocation Algorithm

The schedule generation is strictly **deterministic arithmetic in code**, never delegated to an unpredictable LLM prompt:
1. **Duration:** Every question has an integer duration in minutes (e.g. 15, 30, 45, 60 minutes).
2. **Difficulty Scoring:** Each question has a difficulty from 1 (fundamental) to 3 (complex architectural / high-pressure scenario).
3. **Priority Bin-Packing:**
   * Day count equals exactly the user's requested `days_available` (handles edge cases from 1 day to 60 days).
   * **Harder, high-priority (Must-Have) questions land on early days** (Days 1–3), avoiding cramming complex topics the night before.
   * Behavioral, review, and company-fit questions are allocated toward the final days before the interview.

---

## 🎯 Practice Mode & Confidence Tracking

A preparation kit is meant to be actively practiced, not just read:
* **Interactive Flashcards:** Users flip cards to review core principles.
* **Confidence Rating:** After each card, users record a confidence score (1 to 5).
* **Smart Review Ordering:** Future sessions sort cards by **lowest confidence first**, prioritizing weak spots and unreviewed cards.

---

## 🛡️ Edge Cases, Robustness & Security

| Failure Scenario | Defensive Implementation |
| :--- | :--- |
| **Invalid Company URL / 404 / Timeout** | Safely caught by `SafeWebFetcher`; logged in `pages_used`, produces an honest company brief without failing the kit. |
| **Two-Line Job Description Stub** | Extracts only the few explicit requirements present; reports thin coverage honestly without hallucinating unmentioned skills. |
| **LLM Rate Limits (`429`) & Transient Errors (`503`)** | Implements exponential backoff with random jitter (`baseDelay * 2^attempt + jitter`), automatically retrying up to 3 times before failing gracefully. |
| **Malformed LLM Output** | Unwraps markdown code fences; applies strict Zod validation; executes a single corrective retry if schema validation fails. |
| **Prompt Injection Protection** | Untrusted crawled text and job postings are treated strictly as data payloads inside delimiters, never executable instructions. Invariant filters discard any model output attempting to inject arbitrary system keys. |
| **SSRF & Private Network Isolation** | Blocks access to loopback (`127.0.0.1`), private networks (`10.0.0.0/8`, `192.168.0.0/16`), and AWS/GCP metadata endpoints (`169.254.169.254`). |

---

## ⚖️ Key Design Decisions & Trade-Offs

1. **Groq + LPU vs. Standard Cloud APIs:**  
   * *Decision:* Selected Groq's `openai/gpt-oss-120b` endpoint with a built-in `MockLlmService` fallback.  
   * *Trade-off:* Free-tier rate limits necessitate client-side exponential backoff, but provides fast sub-second token generation without API costs for evaluators.
2. **Deterministic Code Checks vs. Model Self-Reflection:**  
   * *Decision:* Coverage verification and schedule allocations are executed via deterministic TypeScript algorithms rather than asking the LLM "Did you cover everything?".  
   * *Trade-off:* Requires dedicated parsing and relational mapping code, but guarantees 100% verifiable traceability without hallucinations.
3. **Stateless Evaluator vs. Database Persistence:**  
   * *Decision:* The batch evaluator (`src/evaluator/cli.ts`) operates completely in-memory without requiring a running MongoDB instance.  
   * *Trade-off:* Duplicates zero schema validation logic while enabling instant evaluation from a clean git clone.

---

## 👨‍💻 Author
**Shahzeb Khan**  
* GitHub: [@ShahzebKhan17](https://github.com/ShahzebKhan17)
