-- =============================================================================
-- OBE IQAC Command Center — core schema
-- PostgreSQL 15+ / Supabase compatible. UUID primary keys, FK-enforced hierarchy:
-- institution → school → department → program → course → offering → academic data
-- =============================================================================

create extension if not exists pgcrypto;

create schema if not exists app;

-- ---------------------------------------------------------------------------
-- Reusable updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Institution structure
-- ---------------------------------------------------------------------------
create table institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table schools (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions(id) on delete restrict,
  name text not null,
  code text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (institution_id, code)
);
create index on schools (institution_id);

create table departments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete restrict,
  name text not null,
  code text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, code)
);
create index on departments (school_id);

-- ---------------------------------------------------------------------------
-- Users, roles, permissions
-- ---------------------------------------------------------------------------
create table users (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions(id) on delete restrict,
  email text not null,
  full_name text not null,
  password_hash text,
  designation text,
  school_id uuid references schools(id) on delete set null,
  department_id uuid references departments(id) on delete set null,
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index users_email_key on users (lower(email));
create index on users (department_id);

create table roles (
  code text primary key,
  name text not null,
  description text,
  rank int not null default 0
);

create table permissions (
  code text primary key,
  description text not null
);

create table role_permissions (
  role_code text not null references roles(code) on delete cascade,
  permission_code text not null references permissions(code) on delete cascade,
  primary key (role_code, permission_code)
);

-- Base / scoped roles. Program and course coordinator roles are *derived* from
-- program_coordinators / course_coordinators; FACULTY teaching rights come from
-- faculty_assignments. user_roles holds institutional and scoped designations.
create table user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  role_code text not null references roles(code),
  school_id uuid references schools(id) on delete cascade,
  department_id uuid references departments(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references users(id)
);
create unique index user_roles_unique on user_roles (user_id, role_code, coalesce(school_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index on user_roles (role_code);

-- ---------------------------------------------------------------------------
-- Institutional configuration & methodology (never hard-coded in app logic)
-- ---------------------------------------------------------------------------
create table institution_settings (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null unique references institutions(id) on delete cascade,
  cam_scale_max int not null default 3 check (cam_scale_max between 1 and 5),
  cam_scale_labels jsonb not null default '{"0":"No correlation","1":"Low","2":"Moderate","3":"High"}',
  feedback_scale_max int not null default 5 check (feedback_scale_max between 2 and 10),
  allow_multi_co_questions boolean not null default true,
  hod_approval_required boolean not null default true,
  students_can_view_attainment boolean not null default false,
  require_evidence boolean not null default true,
  require_action_plan_for_gaps boolean not null default true,
  default_co_target numeric(5,2) not null default 60 check (default_co_target between 0 and 100),
  default_po_target numeric(5,2) not null default 60 check (default_po_target between 0 and 100),
  completion_weights jsonb not null default '{"profile":5,"syllabus":10,"objectives":5,"cos":10,"bloom":5,"targets":5,"co_po":10,"co_pso":5,"assessments":10,"question_mapping":5,"marks":10,"direct":5,"feedback":5,"indirect":5,"final":5}',
  ai_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Versioned attainment methodology. program_id null => institution default.
create table attainment_methodologies (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions(id) on delete cascade,
  program_id uuid,
  version int not null,
  name text not null,
  config jsonb not null,
  is_active boolean not null default true,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);
create unique index methodology_active_scope on attainment_methodologies (institution_id, coalesce(program_id, '00000000-0000-0000-0000-000000000000'::uuid)) where is_active;

-- ---------------------------------------------------------------------------
-- Academic calendar
-- ---------------------------------------------------------------------------
create table academic_years (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions(id) on delete restrict,
  name text not null,
  start_date date not null,
  end_date date not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (institution_id, name),
  check (end_date > start_date)
);

create table semesters (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references academic_years(id) on delete restrict,
  name text not null,
  term text not null check (term in ('ODD','EVEN','SUMMER')),
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academic_year_id, name)
);
create index on semesters (academic_year_id);

-- ---------------------------------------------------------------------------
-- Programs
-- ---------------------------------------------------------------------------
create table programs (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references departments(id) on delete restrict,
  code text not null,
  name text not null,
  level text not null default 'UG' check (level in ('UG','PG','DIPLOMA','DOCTORAL','CERTIFICATE')),
  duration_years int not null default 4 check (duration_years between 1 and 7),
  default_co_target numeric(5,2) check (default_co_target between 0 and 100),
  default_po_target numeric(5,2) check (default_po_target between 0 and 100),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','ARCHIVED')),
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (department_id, code)
);
create index on programs (department_id);

alter table attainment_methodologies
  add constraint attainment_methodologies_program_fk foreign key (program_id) references programs(id) on delete cascade;

create table batches (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions(id) on delete restrict,
  department_id uuid references departments(id) on delete restrict,
  program_id uuid references programs(id) on delete set null,
  name text not null,
  start_year int not null,
  end_year int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (institution_id, department_id, name),
  check (end_year > start_year)
);
create index on batches (department_id);

create table program_coordinators (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs(id) on delete cascade,
  user_id uuid not null references users(id) on delete restrict,
  is_active boolean not null default true,
  assigned_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, user_id)
);
create index on program_coordinators (user_id);

create table program_outcomes (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs(id) on delete cascade,
  code text not null,
  title text not null,
  description text not null,
  target numeric(5,2) check (target between 0 and 100),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, code)
);

create table program_specific_outcomes (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs(id) on delete cascade,
  code text not null,
  title text not null,
  description text not null,
  target numeric(5,2) check (target between 0 and 100),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, code)
);

-- ---------------------------------------------------------------------------
-- Courses & offerings
-- ---------------------------------------------------------------------------
create table courses (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs(id) on delete restrict,
  code text not null,
  name text not null,
  semester_number int not null check (semester_number between 1 and 14),
  credits numeric(4,1) not null check (credits >= 0),
  lecture_hours int not null default 3 check (lecture_hours >= 0),
  tutorial_hours int not null default 0 check (tutorial_hours >= 0),
  practical_hours int not null default 0 check (practical_hours >= 0),
  course_type text not null default 'THEORY' check (course_type in ('THEORY','LAB','INTEGRATED','PROJECT','SEMINAR')),
  category text not null default 'PC' check (category in ('BS','ES','HS','PC','PE','OE','PROJ','MC')),
  is_active boolean not null default true,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, code)
);
create index on courses (program_id);

create table course_coordinators (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  user_id uuid not null references users(id) on delete restrict,
  is_active boolean not null default true,
  assigned_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, user_id)
);
create index on course_coordinators (user_id);

create table course_offerings (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete restrict,
  academic_year_id uuid not null references academic_years(id) on delete restrict,
  semester_id uuid not null references semesters(id) on delete restrict,
  batch_id uuid not null references batches(id) on delete restrict,
  section text not null default 'A',
  status text not null default 'DRAFT'
    check (status in ('DRAFT','SUBMITTED','UNDER_REVIEW','RETURNED','RESUBMITTED','APPROVED','LOCKED')),
  review_stage text check (review_stage in ('COURSE_COORDINATOR','PROGRAM_COORDINATOR','HOD')),
  version int not null default 1,
  deadline date,
  profile_confirmed_at timestamptz,
  calc_inputs_changed_at timestamptz not null default now(),
  submitted_at timestamptz,
  approved_at timestamptz,
  locked_at timestamptz,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, academic_year_id, semester_id, batch_id, section)
);
create index on course_offerings (course_id);
create index on course_offerings (academic_year_id);
create index on course_offerings (status);

create table faculty_assignments (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references course_offerings(id) on delete cascade,
  user_id uuid not null references users(id) on delete restrict,
  course_role text not null check (course_role in ('COURSE_COORDINATOR','COURSE_INSTRUCTOR','LAB_INSTRUCTOR','CO_INSTRUCTOR')),
  is_active boolean not null default true,
  assigned_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (offering_id, user_id, course_role)
);
create index on faculty_assignments (user_id);

create table correction_requests (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references course_offerings(id) on delete cascade,
  field text not null,
  requested_value text not null,
  reason text not null,
  status text not null default 'OPEN' check (status in ('OPEN','RESOLVED','REJECTED')),
  requested_by uuid not null references users(id),
  resolved_by uuid references users(id),
  resolution_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on correction_requests (offering_id);

-- ---------------------------------------------------------------------------
-- Course academic content (all versioned through offering_versions snapshots,
-- audited row-by-row, and locked by trigger once the offering leaves draft)
-- ---------------------------------------------------------------------------
create table syllabus (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null unique references course_offerings(id) on delete cascade,
  overview text not null default '',
  teaching_methodology text not null default '',
  reference_books text not null default '',
  digital_resources text not null default '',
  source text not null default 'MANUAL' check (source in ('MANUAL','PASTE','UPLOAD')),
  source_evidence_id uuid,
  raw_text text,
  updated_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table syllabus_units (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references course_offerings(id) on delete cascade,
  unit_no int not null check (unit_no > 0),
  title text not null,
  topics text not null default '',
  hours numeric(5,1) not null default 0 check (hours >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (offering_id, unit_no)
);

create table course_objectives (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references course_offerings(id) on delete cascade,
  code text not null,
  description text not null,
  sort_order int not null default 0,
  source text not null default 'MANUAL' check (source in ('MANUAL','AI_ACCEPTED','AI_MODIFIED')),
  ai_suggestion_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (offering_id, code)
);

create table course_outcomes (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references course_offerings(id) on delete cascade,
  code text not null,
  description text not null,
  bloom_level text check (bloom_level in ('REMEMBER','UNDERSTAND','APPLY','ANALYZE','EVALUATE','CREATE')),
  target numeric(5,2) check (target between 0 and 100),
  weightage numeric(6,2) not null default 1 check (weightage > 0),
  status text not null default 'DRAFT' check (status in ('DRAFT','FINAL')),
  sort_order int not null default 0,
  source text not null default 'MANUAL' check (source in ('MANUAL','AI_ACCEPTED','AI_MODIFIED')),
  ai_suggestion_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (offering_id, code)
);
create index on course_outcomes (offering_id);

-- Course-level target (between program default and CO-specific target).
create table course_targets (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null unique references course_offerings(id) on delete cascade,
  default_co_target numeric(5,2) check (default_co_target between 0 and 100),
  rationale text,
  confirmed_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table co_po_mappings (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references course_offerings(id) on delete cascade,
  co_id uuid not null references course_outcomes(id) on delete cascade,
  po_id uuid not null references program_outcomes(id) on delete restrict,
  value smallint not null check (value between 0 and 5),
  source text not null default 'MANUAL' check (source in ('MANUAL','AI_ACCEPTED','AI_MODIFIED')),
  ai_suggested_value smallint,
  ai_suggestion_id uuid,
  updated_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (co_id, po_id)
);
create index on co_po_mappings (offering_id);

create table co_pso_mappings (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references course_offerings(id) on delete cascade,
  co_id uuid not null references course_outcomes(id) on delete cascade,
  pso_id uuid not null references program_specific_outcomes(id) on delete restrict,
  value smallint not null check (value between 0 and 5),
  source text not null default 'MANUAL' check (source in ('MANUAL','AI_ACCEPTED','AI_MODIFIED')),
  ai_suggested_value smallint,
  ai_suggestion_id uuid,
  updated_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (co_id, pso_id)
);
create index on co_pso_mappings (offering_id);

create table assessments (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references course_offerings(id) on delete cascade,
  name text not null,
  assessment_type text not null check (assessment_type in ('INTERNAL','MIDTERM','END_SEMESTER','QUIZ','ASSIGNMENT','LABORATORY','PROJECT','VIVA','PRESENTATION')),
  max_marks numeric(7,2) not null check (max_marks > 0),
  weightage numeric(6,2) not null default 0 check (weightage between 0 and 100),
  assessment_date date,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (offering_id, name)
);
create index on assessments (offering_id);

create table assessment_questions (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references course_offerings(id) on delete cascade,
  assessment_id uuid not null references assessments(id) on delete cascade,
  label text not null,
  max_marks numeric(7,2) not null check (max_marks > 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assessment_id, label)
);
create index on assessment_questions (offering_id);

create table question_co_mappings (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references course_offerings(id) on delete cascade,
  question_id uuid not null references assessment_questions(id) on delete cascade,
  co_id uuid not null references course_outcomes(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (question_id, co_id)
);
create index on question_co_mappings (offering_id);

-- ---------------------------------------------------------------------------
-- Students, enrollment, marks
-- ---------------------------------------------------------------------------
create table students (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions(id) on delete restrict,
  user_id uuid unique references users(id) on delete set null,
  roll_no text not null,
  full_name text not null,
  email text,
  department_id uuid references departments(id) on delete set null,
  program_id uuid references programs(id) on delete set null,
  batch_id uuid references batches(id) on delete set null,
  section text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (institution_id, roll_no)
);
create index on students (batch_id, section);
create index on students (department_id);

create table enrollments (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references course_offerings(id) on delete cascade,
  student_id uuid not null references students(id) on delete restrict,
  status text not null default 'ENROLLED' check (status in ('ENROLLED','WITHDRAWN')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (offering_id, student_id)
);
create index on enrollments (student_id);

create table marks_uploads (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references course_offerings(id) on delete cascade,
  file_name text not null,
  total_rows int not null,
  saved_rows int not null,
  column_mapping jsonb not null default '{}',
  summary jsonb not null default '{}',
  uploaded_by uuid not null references users(id),
  created_at timestamptz not null default now()
);
create index on marks_uploads (offering_id);

create table student_marks (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references course_offerings(id) on delete cascade,
  student_id uuid not null references students(id) on delete restrict,
  question_id uuid not null references assessment_questions(id) on delete cascade,
  marks numeric(7,2) not null check (marks >= 0),
  upload_id uuid references marks_uploads(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, question_id)
);
create index on student_marks (offering_id);
create index on student_marks (question_id);

-- ---------------------------------------------------------------------------
-- Course feedback (indirect assessment). Responses are anonymous: the
-- submission row prevents duplicates, responses carry no student reference.
-- ---------------------------------------------------------------------------
create table feedback_templates (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null unique references course_offerings(id) on delete cascade,
  title text not null,
  scale_max int not null check (scale_max between 2 and 10),
  status text not null default 'DRAFT' check (status in ('DRAFT','OPEN','CLOSED')),
  opened_at timestamptz,
  closed_at timestamptz,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table feedback_questions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references feedback_templates(id) on delete cascade,
  offering_id uuid not null references course_offerings(id) on delete cascade,
  co_id uuid not null references course_outcomes(id) on delete cascade,
  text text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, co_id)
);

create table feedback_submissions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references feedback_templates(id) on delete cascade,
  offering_id uuid not null references course_offerings(id) on delete cascade,
  student_id uuid not null references students(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  unique (template_id, student_id)
);

create table feedback_responses (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references feedback_templates(id) on delete cascade,
  offering_id uuid not null references course_offerings(id) on delete cascade,
  question_id uuid not null references feedback_questions(id) on delete cascade,
  response_set uuid not null,
  rating int not null check (rating >= 1),
  created_at timestamptz not null default now(),
  unique (response_set, question_id)
);
create index on feedback_responses (question_id);

-- ---------------------------------------------------------------------------
-- Calculation runs & attainment (append-only history; is_current marks latest)
-- ---------------------------------------------------------------------------
create table calculation_runs (
  id uuid primary key default gen_random_uuid(),
  run_type text not null check (run_type in ('DIRECT','INDIRECT','COURSE','PROGRAM')),
  offering_id uuid references course_offerings(id) on delete cascade,
  program_id uuid references programs(id) on delete cascade,
  academic_year_id uuid references academic_years(id),
  methodology_id uuid references attainment_methodologies(id),
  methodology_snapshot jsonb not null,
  inputs_summary jsonb not null default '{}',
  engine_version text not null,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  check (offering_id is not null or program_id is not null)
);
create index on calculation_runs (offering_id, run_type, created_at desc);
create index on calculation_runs (program_id, created_at desc);

create table direct_attainment (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references calculation_runs(id) on delete cascade,
  offering_id uuid not null references course_offerings(id) on delete cascade,
  co_id uuid not null references course_outcomes(id) on delete cascade,
  students_assessed int not null,
  students_meeting int not null,
  average_score_pct numeric(6,2),
  achievement_pct numeric(6,2),
  attainment_level int,
  threshold_pct numeric(5,2) not null,
  target_pct numeric(5,2) not null,
  target_source text not null,
  gap numeric(6,2),
  status text not null,
  formula text not null,
  inputs jsonb not null default '{}',
  is_current boolean not null default true,
  created_at timestamptz not null default now()
);
create index on direct_attainment (offering_id) where is_current;

create table indirect_attainment (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references calculation_runs(id) on delete cascade,
  offering_id uuid not null references course_offerings(id) on delete cascade,
  co_id uuid not null references course_outcomes(id) on delete cascade,
  respondents int not null,
  mean_rating numeric(6,3),
  scale_max int not null,
  indirect_pct numeric(6,2),
  formula text not null,
  inputs jsonb not null default '{}',
  is_current boolean not null default true,
  created_at timestamptz not null default now()
);
create index on indirect_attainment (offering_id) where is_current;

create table course_attainment (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references calculation_runs(id) on delete cascade,
  offering_id uuid not null references course_offerings(id) on delete cascade,
  co_id uuid not null references course_outcomes(id) on delete cascade,
  direct_pct numeric(6,2),
  indirect_pct numeric(6,2),
  direct_weight numeric(5,2) not null,
  indirect_weight numeric(5,2) not null,
  final_pct numeric(6,2),
  attainment_level int,
  target_pct numeric(5,2) not null,
  gap numeric(6,2),
  status text not null,
  formula text not null,
  inputs jsonb not null default '{}',
  is_current boolean not null default true,
  created_at timestamptz not null default now()
);
create index on course_attainment (offering_id) where is_current;

create table course_po_attainment (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references calculation_runs(id) on delete cascade,
  offering_id uuid not null references course_offerings(id) on delete cascade,
  po_id uuid not null references program_outcomes(id) on delete cascade,
  value_pct numeric(6,2),
  attainment_level int,
  mapping_sum numeric(7,2) not null,
  formula text not null,
  inputs jsonb not null default '{}',
  is_current boolean not null default true,
  created_at timestamptz not null default now()
);
create index on course_po_attainment (offering_id) where is_current;

create table course_pso_attainment (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references calculation_runs(id) on delete cascade,
  offering_id uuid not null references course_offerings(id) on delete cascade,
  pso_id uuid not null references program_specific_outcomes(id) on delete cascade,
  value_pct numeric(6,2),
  attainment_level int,
  mapping_sum numeric(7,2) not null,
  formula text not null,
  inputs jsonb not null default '{}',
  is_current boolean not null default true,
  created_at timestamptz not null default now()
);
create index on course_pso_attainment (offering_id) where is_current;

create table program_attainment (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references calculation_runs(id) on delete cascade,
  program_id uuid not null references programs(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id),
  aggregation_method text not null,
  courses_included int not null,
  provisional boolean not null,
  summary jsonb not null default '{}',
  is_current boolean not null default true,
  created_at timestamptz not null default now()
);
create index on program_attainment (program_id, academic_year_id) where is_current;

create table po_attainment (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references calculation_runs(id) on delete cascade,
  program_id uuid not null references programs(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id),
  po_id uuid not null references program_outcomes(id) on delete cascade,
  value_pct numeric(6,2),
  attainment_level int,
  target_pct numeric(5,2) not null,
  gap numeric(6,2),
  status text not null,
  contributing jsonb not null default '[]',
  formula text not null,
  is_current boolean not null default true,
  created_at timestamptz not null default now()
);
create index on po_attainment (program_id, academic_year_id) where is_current;

create table pso_attainment (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references calculation_runs(id) on delete cascade,
  program_id uuid not null references programs(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id),
  pso_id uuid not null references program_specific_outcomes(id) on delete cascade,
  value_pct numeric(6,2),
  attainment_level int,
  target_pct numeric(5,2) not null,
  gap numeric(6,2),
  status text not null,
  contributing jsonb not null default '[]',
  formula text not null,
  is_current boolean not null default true,
  created_at timestamptz not null default now()
);
create index on pso_attainment (program_id, academic_year_id) where is_current;

create table gap_analysis (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references calculation_runs(id) on delete cascade,
  level text not null check (level in ('CO','COURSE','PO','PSO','PROGRAM')),
  offering_id uuid references course_offerings(id) on delete cascade,
  program_id uuid references programs(id) on delete cascade,
  academic_year_id uuid references academic_years(id),
  entity_id uuid,
  entity_code text not null,
  target numeric(6,2) not null,
  actual numeric(6,2),
  gap numeric(6,2),
  classification text not null check (classification in ('ACHIEVED','NEAR_TARGET','BELOW_TARGET','CRITICAL','INCOMPLETE')),
  is_current boolean not null default true,
  created_at timestamptz not null default now()
);
create index on gap_analysis (offering_id) where is_current;
create index on gap_analysis (program_id) where is_current;

-- ---------------------------------------------------------------------------
-- Continuous improvement & evidence
-- ---------------------------------------------------------------------------
create table action_plans (
  id uuid primary key default gen_random_uuid(),
  gap_id uuid references gap_analysis(id) on delete set null,
  offering_id uuid references course_offerings(id) on delete cascade,
  program_id uuid references programs(id) on delete cascade,
  level text not null check (level in ('CO','COURSE','PO','PSO','PROGRAM')),
  entity_code text not null,
  root_cause text not null,
  corrective_action text not null,
  responsible_user_id uuid references users(id),
  target_date date,
  status text not null default 'PLANNED' check (status in ('PLANNED','IN_PROGRESS','IMPLEMENTED','REVIEWED','CLOSED')),
  source text not null default 'MANUAL' check (source in ('MANUAL','AI_ACCEPTED','AI_MODIFIED')),
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (offering_id is not null or program_id is not null)
);
create index on action_plans (offering_id);
create index on action_plans (program_id);

create table evidence (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid references course_offerings(id) on delete cascade,
  program_id uuid references programs(id) on delete cascade,
  academic_year_id uuid references academic_years(id),
  evidence_type text not null check (evidence_type in ('SYLLABUS','LESSON_PLAN','QUESTION_PAPER','MARKS','STUDENT_WORK','LAB_RECORD','ASSIGNMENT','FEEDBACK','ATTAINMENT_REPORT','ACTION_TAKEN_REPORT','OTHER')),
  title text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  storage_path text not null,
  sha256 text not null,
  version int not null default 1,
  uploaded_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  check (offering_id is not null or program_id is not null)
);
create index on evidence (offering_id);

alter table syllabus add constraint syllabus_source_evidence_fk foreign key (source_evidence_id) references evidence(id) on delete set null;

create table reports (
  id uuid primary key default gen_random_uuid(),
  report_type text not null,
  format text not null check (format in ('PDF','XLSX','CSV')),
  scope jsonb not null default '{}',
  file_name text not null,
  generated_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- AI governance
-- ---------------------------------------------------------------------------
create table ai_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  feature text not null,
  offering_id uuid references course_offerings(id) on delete set null,
  program_id uuid references programs(id) on delete set null,
  provider text not null,
  model text,
  input_metadata jsonb not null default '{}',
  response jsonb,
  status text not null check (status in ('SUCCESS','ERROR','NOT_CONFIGURED')),
  error text,
  latency_ms int,
  created_at timestamptz not null default now()
);
create index on ai_interactions (user_id, created_at desc);

create table ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  interaction_id uuid references ai_interactions(id) on delete set null,
  offering_id uuid references course_offerings(id) on delete cascade,
  feature text not null,
  payload jsonb not null,
  final_value jsonb,
  status text not null default 'PENDING' check (status in ('PENDING','ACCEPTED','PARTIALLY_ACCEPTED','MODIFIED','REJECTED')),
  created_by uuid not null references users(id),
  decided_by uuid references users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on ai_suggestions (offering_id, feature);

-- ---------------------------------------------------------------------------
-- Workflow, versioning, notifications, audit
-- ---------------------------------------------------------------------------
create table approval_workflows (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references course_offerings(id) on delete cascade,
  action text not null check (action in ('SUBMIT','RESUBMIT','APPROVE_STAGE','RETURN','APPROVE','LOCK','REVISION_REQUESTED','REVISION_APPROVED','REVISION_REJECTED')),
  from_status text not null,
  to_status text not null,
  stage text,
  actor_id uuid not null references users(id),
  actor_role text not null,
  comments text,
  version int not null,
  created_at timestamptz not null default now()
);
create index on approval_workflows (offering_id, created_at);

create table revision_requests (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references course_offerings(id) on delete cascade,
  reason text not null check (length(trim(reason)) >= 10),
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED')),
  requested_by uuid not null references users(id),
  decided_by uuid references users(id),
  decided_at timestamptz,
  decision_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on revision_requests (offering_id);

create table offering_versions (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references course_offerings(id) on delete cascade,
  version int not null,
  label text not null,
  snapshot jsonb not null,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  unique (offering_id, version)
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  body text not null,
  link text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index on notifications (user_id, is_read, created_at desc);

create table audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid,
  role text,
  action text not null,
  entity text not null,
  entity_id uuid,
  offering_id uuid,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);
create index on audit_logs (entity, entity_id);
create index on audit_logs (offering_id, created_at desc);
create index on audit_logs (created_at desc);

-- updated_at triggers
do $$
declare t text;
begin
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb on tb.table_name = c.table_name and tb.table_schema = c.table_schema
    where c.table_schema = 'public' and c.column_name = 'updated_at' and tb.table_type = 'BASE TABLE'
  loop
    execute format('create trigger touch_updated_at before update on %I for each row execute function app.touch_updated_at()', t);
  end loop;
end $$;
