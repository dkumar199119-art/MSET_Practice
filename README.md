# OBE IQAC Command Center

AI-assisted Outcome-Based Education (OBE) and attainment management platform for universities:
academic ownership (HOD → Program → Program Coordinator → Course → Course Coordinator → Faculty),
guided faculty course setup, CO–PO/PSO articulation, direct & indirect attainment, program attainment,
gap analysis, continuous improvement, evidence, multi-stage approval with locking and versioning,
audit trail and accreditation-oriented reports.

**Status: MVP** (spec §45). Phase 2–6 features are *not* implemented — see [`docs/MVP_REPORT.md`](docs/MVP_REPORT.md).
Architecture, ERD, permission matrix, workflows and calculation design: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · shadcn-style UI · Lucide · Recharts · Zod ·
PostgreSQL / Supabase (RLS) · SheetJS · jsPDF · Gemini API (server-side).

## Getting started

Requirements: Node 20+, PostgreSQL 15+ (local or Supabase).

```bash
npm install
cp .env.example .env          # set DATABASE_URL and SESSION_SECRET (≥ 32 chars); GEMINI_API_KEY optional
npm run db:migrate            # applies db/migrations/*.sql (schema, RLS, triggers, workflow functions)
npm run db:seed               # institution, departments, calendar, demo users, 60 students
npm run dev                   # http://localhost:3000
```

`npm run db:reset` drops and recreates the schema (refuses when `NODE_ENV=production`).

### Supabase

Use the project's Postgres connection string as `DATABASE_URL` and run the migrations. The app switches to the
RLS-restricted `obe_app` role inside every transaction, so policies apply regardless of the login role.
Set `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` to store evidence in Supabase Storage (create a private
bucket named `evidence`); otherwise files are stored in `./storage`. Never commit `.env`.

### Gemini

Set `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`, default `gemini-2.5-flash`). The key is only read on the server.
Without it, AI buttons report "Gemini is not configured" — all non-AI features work.

## Demo accounts (password `Password@123`)

| Role | Email |
|---|---|
| Super Admin | superadmin@obe.local |
| IQAC Admin | iqac@obe.local |
| Director | director@obe.local |
| Dean (School of Engineering) | dean.engg@obe.local |
| HOD Mechanical | hod.me@obe.local |
| Future Program Coordinator | pc.me@obe.local |
| Future Course Coordinator | cc.me@obe.local |
| Faculty A / Faculty B | faculty.a@obe.local / faculty.b@obe.local |
| HOD CSE | hod.cse@obe.local |
| Reviewer | reviewer@obe.local |
| Students | me23001@students.obe.local … me23060@students.obe.local |

Programs and courses are deliberately **not** seeded: walk the workflow — HOD creates the program and assigns
the PC; the PC creates courses and assigns the CC; the CC allocates faculty. To generate a complete sample course
automatically, run `npm run demo` (executes the full lifecycle through the service layer).

## Tests

```bash
npm run test:unit          # calculation engine, marks validation, Bloom, completion, RBAC, sanitiser
npm run test:integration   # real PostgreSQL: full lifecycle, RLS/RBAC, AI governance (uses TEST_DATABASE_URL, default obe_test)
npm run test:e2e           # Playwright: spec §60 acceptance scenario through the UI (uses E2E_DATABASE_URL, default obe_e2e)
npm run typecheck && npm run lint
```

Integration and E2E tests **drop and recreate** their target databases.

## Project layout

```
db/migrations/        SQL schema, security functions, RLS policies, progress function
scripts/              migrate, seed, demo lifecycle
src/lib/domain/       pure logic: attainment engine, methodology, marks validation, Bloom, completion
src/lib/services/     business services (run under RLS via withUser)
src/lib/ai/           server-side Gemini client
src/lib/reports/      report datasets and PDF/XLSX/CSV rendering
src/app/              Next.js routes, server actions, API routes
src/components/       UI components, workspace wizard steps, charts
tests/                unit, integration (PostgreSQL), e2e (Playwright)
```
