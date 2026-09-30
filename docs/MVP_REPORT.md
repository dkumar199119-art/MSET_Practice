# MVP Completion Report — OBE IQAC Command Center

Date: 2026-09-30 · Branch: `claude/obe-iqac-command-center-ta6r8k`

## 1. Summary

The MVP (spec §45) is implemented and the complete course lifecycle (§53) and final acceptance scenario (§60)
run end-to-end **against real PostgreSQL records**, both through the service layer (integration tests) and
through the browser UI (Playwright), with row level security active for every request.
Phase 2–6 features were not started, as instructed.

## 2. Verification

| Check | Result |
|---|---|
| `npm run typecheck` (TypeScript strict) | pass |
| `npm run lint` (eslint-config-next) | pass, 0 warnings |
| `npm run build` (Next.js production build) | pass |
| Unit tests — calculation engine, marks validation, Bloom, completion, RBAC matrix, sanitiser | 29 pass |
| Integration tests (real PostgreSQL + RLS) — lifecycle (10), security (12), AI governance (5) | 27 pass |
| E2E (Playwright, Chromium) — spec §60 scenario through the UI as every role | 1 pass (≈40 s) |

### Acceptance scenario (§60) — as executed by `tests/e2e/acceptance.spec.ts`

1. HOD logs in, creates **B.Tech Mechanical Engineering** (12 standard POs initialised), assigns the Program Coordinator.
2. PC logs in, adds PSO1/PSO2, creates **ME301 Engineering Mechanics**, assigns the Course Coordinator.
3. CC logs in and allocates ME301 (2025-26, Odd, batch 2023-27, section A) to **Faculty A**.
4. Faculty A sees ME301 under **My Assigned Courses** at **0%**, opens it and completes: profile confirmation,
   syllabus, objectives, CO1–CO5, Bloom levels, CO targets, CO-PO matrix, CO-PSO matrix, assessment structure,
   question mapping, section enrollment.
5. Faculty downloads the marks template, uploads an **invalid** file (rejected, save disabled) and then a valid one
   (validated → confirmed → saved).
6. Direct attainment is calculated; the feedback form is generated from the COs and published.
7. Four students log in and submit feedback (duplicate submission impossible).
8. Faculty recalculates: indirect, final (80/20 formula shown), PO/PSO contribution, gaps; requests AI gap analysis
   (Gemini not configured in the test environment → explicit message, logged); records action plans for gaps;
   uploads evidence; course reaches **100%** and is submitted.
9. Course Coordinator → Program Coordinator → HOD approve; the course becomes **Approved · Locked**, snapshot
   "2025-26 Version 1" is created; faculty editing is disabled.
10. PC calculates program attainment (ME301 contributes to PO1/PO2/PSO1).
11. IQAC sees ME301 at 100% / Approved · Locked in the Command Center and downloads Course Attainment,
    PO/PSO Attainment, Gap Analysis and Program Attainment reports (PDF, Excel, CSV).

The integration test (`tests/integration/lifecycle.test.ts`) additionally covers: return-for-correction and
resubmission, stage-order enforcement (PC cannot approve before CC), DB-level lock enforcement with raw SQL,
independent recomputation of direct attainment from SQL, PO formula check, anonymity of responses,
no-PII in AI prompts, revision request → version 2 with version 1 preserved, and audit coverage of all
major events.

## 3. What is implemented (MVP scope)

* Authentication (bcrypt + signed httpOnly session) and RBAC (10 roles, 20 permissions) + PostgreSQL RLS on every table.
* Institution, schools, departments, academic years/semesters, batches (admin UI).
* HOD → Program (+ standard POs) → Program Coordinator; PC → Courses, POs/PSOs, program targets → Course Coordinator;
  CC/PC → faculty allocation (year, semester, batch, section, course role) with notifications.
* Faculty Course Setup Wizard (21 steps, progress stepper, completion %, "Complete Now" links):
  profile (protected fields + correction requests), syllabus (rich text, units, paste, PDF/DOCX/TXT extraction),
  objectives, COs (measurability check), Bloom levels, target hierarchy, CO-PO and CO-PSO matrices (coverage,
  unmapped lists, configurable scale), assessments & questions, question→CO mapping, enrollment,
  Excel/CSV marks upload (detect → map → preview → validate → confirm), direct / feedback / indirect / final
  attainment with "View Calculation", PO/PSO contribution, gap analysis + action plans, evidence, course reports,
  submission with checklist, review, history and versions.
* Configurable, versioned methodology (weights, threshold, weighting mode, indirect method, level bands, gap bands,
  program aggregation & scope) and configurable completion weights.
* Program attainment (course/credit/mapping-weighted), provisional vs final.
* Multi-stage approval (CC → PC → HOD optional), return/resubmit, locking, revision requests and version snapshots.
* Dashboards: faculty, PC/HOD program completion, review queue, IQAC Command Center with 8 filters and completion monitor.
* Reports: Course Attainment, Course PO/PSO, Course Gap, Program Attainment, Program Gap — PDF, Excel, CSV.
* Gemini (server-side): syllabus analysis, objectives, COs, CO review, CO-PO/CO-PSO suggestions, gap analysis;
  suggestions require explicit acceptance; interactions and decisions logged; aggregated data only.
* Audit trail via DB triggers (user, role, action, entity, old/new value, timestamp) + semantic events; audit UI.

## 4. Deviations & decisions to review

1. **Authentication is built-in, not Supabase Auth.** Everything else is Supabase-compatible (Postgres, RLS policies
   fall back to the Supabase JWT `sub`, Storage for evidence). This allowed full testing on plain PostgreSQL;
   switching to Supabase Auth/SSO is an adapter change (`src/lib/auth`).
2. **Gemini was not called live.** No `GEMINI_API_KEY` was available; AI flows are tested with a mocked transport,
   and the UI shows an explicit "not configured" state. Validate prompts/outputs with a real key before rollout.
3. **Direct attainment definition:** a student's CO score uses only questions for which the student has a mark
   record (absent/unattempted questions are excluded); a question mapped to several COs counts fully toward each.
   Both are common NBA practices but should be confirmed by IQAC.
4. **Final approval locks immediately** (APPROVED and LOCKED are both recorded in history).
5. **Evidence & action plans**: basic versions were built because the §24 submission checklist requires them
   (both requirements can be switched off in Settings). The full Phase 2 evidence repository and action-plan
   implementation/review cycle are not built.
6. SheetJS is used from npm (`xlsx@0.18.5`, the CDN build was blocked by the network policy); it parses uploads only
   in the browser. Consider `https://cdn.sheetjs.com` builds for production.

## 5. Known limitations (MVP)

* Correction requests are recorded and notified to the PC, but there is no resolve UI yet.
* No email/SMS delivery (in-app notifications only); no background jobs.
* Offerings list/dashboards compute progress per offering on request — fine for department scale; add caching or
  materialised progress for institution scale.
* Accreditation ZIP export, OBE Copilot, historical comparisons, versioning UI (diff viewer), data-quality engine,
  criteria mapping and integrations are Phase 2–6 and intentionally absent.

## 6. How to run

See `README.md`. Quick start: `npm install && cp .env.example .env && npm run db:reset && npm run demo && npm run dev`.

## 7. Next step

Awaiting MVP review/approval before starting Phase 2.
