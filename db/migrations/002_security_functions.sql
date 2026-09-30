-- =============================================================================
-- Identity, scope helpers, audit, locking, workflow transitions
-- =============================================================================

-- Runtime role. Every request transaction executes `SET LOCAL ROLE obe_app`,
-- so row level security applies no matter which login the pool uses.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'obe_app') then
    create role obe_app nologin nobypassrls;
  end if;
end $$;
grant obe_app to current_user;
grant usage on schema public, app to obe_app;

-- ---------------------------------------------------------------------------
-- Identity: app.user_id (set by the server per transaction) or, when used via
-- Supabase PostgREST, the JWT `sub` claim.
-- ---------------------------------------------------------------------------
create or replace function app.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('app.user_id', true), '')::uuid,
    nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
  )
$$;

create or replace function app.active_role() returns text
language sql stable as $$
  select nullif(current_setting('app.active_role', true), '')
$$;

create or replace function app.has_role(p_roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_roles where user_id = app.uid() and role_code = any(p_roles))
$$;

create or replace function app.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select app.has_role(array['SUPER_ADMIN'])
$$;

create or replace function app.is_iqac() returns boolean
language sql stable security definer set search_path = public as $$
  select app.has_role(array['SUPER_ADMIN','IQAC_ADMIN'])
$$;

-- Institution-wide read access (IQAC, Director, Reviewer, Super Admin)
create or replace function app.is_institution_reader() returns boolean
language sql stable security definer set search_path = public as $$
  select app.has_role(array['SUPER_ADMIN','IQAC_ADMIN','DIRECTOR','REVIEWER'])
$$;

create or replace function app.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_roles where user_id = app.uid() and role_code <> 'STUDENT')
      or exists (select 1 from program_coordinators where user_id = app.uid() and is_active)
      or exists (select 1 from course_coordinators where user_id = app.uid() and is_active)
      or exists (select 1 from faculty_assignments where user_id = app.uid() and is_active)
$$;

create or replace function app.is_hod_of(p_department uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_roles where user_id = app.uid() and role_code = 'HOD' and department_id = p_department)
$$;

create or replace function app.is_dean_of(p_school uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_roles where user_id = app.uid() and role_code = 'DEAN' and school_id = p_school)
$$;

create or replace function app.can_read_department(p_department uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select app.is_institution_reader()
      or app.is_hod_of(p_department)
      or exists (select 1 from departments d where d.id = p_department and app.is_dean_of(d.school_id))
$$;

create or replace function app.program_department(p_program uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select department_id from programs where id = p_program
$$;

create or replace function app.is_pc_of(p_program uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from program_coordinators where program_id = p_program and user_id = app.uid() and is_active)
$$;

create or replace function app.is_cc_of(p_course uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from course_coordinators where course_id = p_course and user_id = app.uid() and is_active)
$$;

create or replace function app.can_create_program(p_department uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select app.is_admin() or app.is_hod_of(p_department)
$$;

-- Program-level management (courses, POs/PSOs, targets): HOD of the department or PC of the program
create or replace function app.can_manage_program(p_program uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select app.is_admin() or app.is_pc_of(p_program) or app.is_hod_of(app.program_department(p_program))
$$;

create or replace function app.can_read_program(p_program uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select app.can_read_department(app.program_department(p_program))
      or app.is_pc_of(p_program)
      or exists (select 1 from course_coordinators cc join courses c on c.id = cc.course_id
                 where c.program_id = p_program and cc.user_id = app.uid() and cc.is_active)
      or exists (select 1 from faculty_assignments fa join course_offerings o on o.id = fa.offering_id
                 join courses c on c.id = o.course_id
                 where c.program_id = p_program and fa.user_id = app.uid() and fa.is_active)
$$;

create or replace function app.course_program(p_course uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select program_id from courses where id = p_course
$$;

create or replace function app.offering_course(p_offering uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select course_id from course_offerings where id = p_offering
$$;

create or replace function app.is_assigned_faculty(p_offering uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from faculty_assignments where offering_id = p_offering and user_id = app.uid() and is_active)
$$;

create or replace function app.current_student_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from students where user_id = app.uid() and app.uid() is not null
$$;

create or replace function app.is_enrolled(p_offering uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from enrollments e where e.offering_id = p_offering and e.status = 'ENROLLED'
                 and e.student_id = app.current_student_id())
$$;

-- Course allocation (create offerings, assign faculty): Course Coordinator or Program Coordinator
create or replace function app.can_allocate_course(p_course uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select app.is_admin() or app.is_cc_of(p_course) or app.is_pc_of(app.course_program(p_course))
$$;

create or replace function app.can_read_course(p_course uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select app.can_read_program(app.course_program(p_course)) or app.is_cc_of(p_course)
      or exists (select 1 from course_offerings o join enrollments e on e.offering_id = o.id
                 where o.course_id = p_course and e.student_id = app.current_student_id())
$$;

-- Read an offering's academic data (NOT students — they use app.is_enrolled on selected tables)
create or replace function app.can_read_offering(p_offering uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select app.is_assigned_faculty(p_offering)
      or app.is_cc_of(app.offering_course(p_offering))
      or app.can_read_program(app.course_program(app.offering_course(p_offering)))
$$;

-- Edit an offering's academic data: assigned faculty or the course coordinator.
-- (Status-based locking is enforced separately by trigger.)
create or replace function app.can_edit_offering(p_offering uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select app.is_assigned_faculty(p_offering) or app.is_cc_of(app.offering_course(p_offering))
$$;

create or replace function app.can_review_offering(p_offering uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select app.is_admin()
      or app.is_cc_of(app.offering_course(p_offering))
      or app.is_pc_of(app.course_program(app.offering_course(p_offering)))
      or app.is_hod_of(app.program_department(app.course_program(app.offering_course(p_offering))))
$$;

create or replace function app.setting_bool(p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select (to_jsonb(s) ->> p_key)::boolean from institution_settings s limit 1
$$;

-- ---------------------------------------------------------------------------
-- Authentication lookup (password hashes are not readable by obe_app)
-- ---------------------------------------------------------------------------
create or replace function app.auth_lookup(p_email text)
returns table (id uuid, password_hash text, is_active boolean)
language sql stable security definer set search_path = public as $$
  select u.id, u.password_hash, u.is_active from users u where lower(u.email) = lower(p_email)
$$;

create or replace function app.record_login(p_user uuid) returns void
language sql security definer set search_path = public as $$
  update users set last_login_at = now() where id = p_user;
$$;

create or replace function app.set_password(p_user uuid, p_hash text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.is_admin() then raise exception 'Only a super admin can set passwords' using errcode = '42501'; end if;
  update users set password_hash = p_hash where id = p_user;
end $$;

-- ---------------------------------------------------------------------------
-- Audit logging
-- ---------------------------------------------------------------------------
create or replace function app.log_event(p_action text, p_entity text, p_entity_id uuid, p_offering uuid, p_old jsonb, p_new jsonb)
returns void language sql security definer set search_path = public as $$
  insert into audit_logs (user_id, role, action, entity, entity_id, offering_id, old_value, new_value)
  values (app.uid(), app.active_role(), p_action, p_entity, p_entity_id, p_offering, p_old, p_new);
$$;

create or replace function app.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) - 'password_hash' else null end;
  v_new jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) - 'password_hash' else null end;
  v_row jsonb := coalesce(v_new, v_old);
  v_offering uuid;
begin
  if tg_op = 'UPDATE' and (v_old - 'updated_at') = (v_new - 'updated_at') then
    return null;
  end if;
  v_offering := case
    when tg_table_name = 'course_offerings' then (v_row ->> 'id')::uuid
    when v_row ? 'offering_id' then (v_row ->> 'offering_id')::uuid
    else null end;
  insert into audit_logs (user_id, role, action, entity, entity_id, offering_id, old_value, new_value)
  values (app.uid(), app.active_role(), tg_op, tg_table_name, (v_row ->> 'id')::uuid, v_offering, v_old, v_new);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'institutions','schools','departments','users','user_roles','institution_settings','attainment_methodologies',
    'academic_years','semesters','batches','programs','program_coordinators','program_outcomes','program_specific_outcomes',
    'courses','course_coordinators','course_offerings','faculty_assignments','correction_requests',
    'syllabus','syllabus_units','course_objectives','course_outcomes','course_targets','co_po_mappings','co_pso_mappings',
    'assessments','assessment_questions','question_co_mappings','enrollments','feedback_templates','feedback_questions',
    'action_plans','evidence','ai_suggestions','revision_requests','students']
  loop
    execute format('create trigger audit_row after insert or update or delete on %I for each row execute function app.audit_row()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Academic data locking: content may only change while the offering is
-- DRAFT or RETURNED. Enforced in the database, not only in the UI.
-- ---------------------------------------------------------------------------
create or replace function app.offering_is_editable(p_offering uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select status in ('DRAFT','RETURNED') from course_offerings where id = p_offering
$$;

create or replace function app.enforce_offering_editable() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_offering uuid := case when tg_op = 'DELETE' then old.offering_id else new.offering_id end;
  v_status text;
begin
  select status into v_status from course_offerings where id = v_offering;
  if v_status is null then
    return case when tg_op = 'DELETE' then old else new end;  -- offering itself being deleted
  end if;
  if v_status not in ('DRAFT','RETURNED') then
    raise exception 'Course offering is % — academic data is locked. Request a revision to make changes.', v_status
      using errcode = 'P0001', hint = 'LOCKED';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

-- Marks the attainment inputs as changed so stale calculations are detected.
create or replace function app.touch_calc_inputs() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_offering uuid := case when tg_op = 'DELETE' then old.offering_id else new.offering_id end;
begin
  update course_offerings set calc_inputs_changed_at = clock_timestamp() where id = v_offering;
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'syllabus','syllabus_units','course_objectives','course_outcomes','course_targets','co_po_mappings','co_pso_mappings',
    'assessments','assessment_questions','question_co_mappings','enrollments','student_marks','marks_uploads',
    'feedback_templates','feedback_questions','direct_attainment','indirect_attainment','course_attainment',
    'course_po_attainment','course_pso_attainment']
  loop
    execute format('create trigger enforce_editable before insert or update or delete on %I for each row execute function app.enforce_offering_editable()', t);
  end loop;
  foreach t in array array[
    'course_outcomes','course_targets','co_po_mappings','co_pso_mappings','assessments','assessment_questions',
    'question_co_mappings','enrollments','student_marks','feedback_responses']
  loop
    execute format('create trigger touch_calc_inputs after insert or update or delete on %I for each row execute function app.touch_calc_inputs()', t);
  end loop;
end $$;

-- gap analysis rows for an offering are locked too
create or replace function app.enforce_gap_editable() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_offering uuid := case when tg_op = 'DELETE' then old.offering_id else new.offering_id end;
begin
  if v_offering is not null and not app.offering_is_editable(v_offering) then
    raise exception 'Course offering is locked — gap analysis cannot change.' using errcode = 'P0001', hint = 'LOCKED';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger enforce_editable before insert or update or delete on gap_analysis
  for each row execute function app.enforce_gap_editable();

-- Status may only change through app.transition_offering()
create or replace function app.guard_offering_status() returns trigger
language plpgsql as $$
begin
  if (new.status is distinct from old.status or new.review_stage is distinct from old.review_stage
      or new.version is distinct from old.version or new.locked_at is distinct from old.locked_at)
     and coalesce(current_setting('app.in_transition', true), '') <> 'on' then
    raise exception 'Workflow status can only be changed through the approval workflow' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_offering_status before update on course_offerings
  for each row execute function app.guard_offering_status();

-- Protected profile fields (code/program/semester/credits live on courses; the
-- offering keys cannot be moved once academic work has started).
create or replace function app.guard_offering_keys() returns trigger
language plpgsql as $$
begin
  if (new.course_id, new.academic_year_id, new.semester_id, new.batch_id, new.section)
     is distinct from (old.course_id, old.academic_year_id, old.semester_id, old.batch_id, old.section) then
    raise exception 'Offering identity fields are protected' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_offering_keys before update on course_offerings
  for each row execute function app.guard_offering_keys();

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create or replace function app.notify(p_user uuid, p_title text, p_body text, p_link text) returns void
language sql security definer set search_path = public as $$
  insert into notifications (user_id, title, body, link) values (p_user, p_title, p_body, p_link);
$$;

-- ---------------------------------------------------------------------------
-- Versioned snapshot of all academic data of an offering
-- ---------------------------------------------------------------------------
create or replace function app.build_offering_snapshot(p_offering uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'offering', (select to_jsonb(o) from course_offerings o where o.id = p_offering),
    'course', (select to_jsonb(c) from courses c join course_offerings o on o.course_id = c.id where o.id = p_offering),
    'syllabus', (select to_jsonb(s) from syllabus s where s.offering_id = p_offering),
    'syllabus_units', coalesce((select jsonb_agg(to_jsonb(u) order by u.unit_no) from syllabus_units u where u.offering_id = p_offering), '[]'),
    'objectives', coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order) from course_objectives x where x.offering_id = p_offering), '[]'),
    'course_outcomes', coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order) from course_outcomes x where x.offering_id = p_offering), '[]'),
    'course_targets', (select to_jsonb(t) from course_targets t where t.offering_id = p_offering),
    'co_po', coalesce((select jsonb_agg(jsonb_build_object('co', co.code, 'po', po.code, 'value', m.value, 'source', m.source))
                       from co_po_mappings m join course_outcomes co on co.id = m.co_id join program_outcomes po on po.id = m.po_id
                       where m.offering_id = p_offering), '[]'),
    'co_pso', coalesce((select jsonb_agg(jsonb_build_object('co', co.code, 'pso', p.code, 'value', m.value, 'source', m.source))
                        from co_pso_mappings m join course_outcomes co on co.id = m.co_id join program_specific_outcomes p on p.id = m.pso_id
                        where m.offering_id = p_offering), '[]'),
    'assessments', coalesce((select jsonb_agg(to_jsonb(a) || jsonb_build_object('questions',
                        coalesce((select jsonb_agg(to_jsonb(q) || jsonb_build_object('cos',
                            (select coalesce(jsonb_agg(co.code), '[]') from question_co_mappings qm join course_outcomes co on co.id = qm.co_id where qm.question_id = q.id))
                          order by q.sort_order) from assessment_questions q where q.assessment_id = a.id), '[]'))
                      order by a.sort_order) from assessments a where a.offering_id = p_offering), '[]'),
    'course_attainment', coalesce((select jsonb_agg(to_jsonb(ca)) from course_attainment ca where ca.offering_id = p_offering and ca.is_current), '[]'),
    'course_po_attainment', coalesce((select jsonb_agg(to_jsonb(x)) from course_po_attainment x where x.offering_id = p_offering and x.is_current), '[]'),
    'course_pso_attainment', coalesce((select jsonb_agg(to_jsonb(x)) from course_pso_attainment x where x.offering_id = p_offering and x.is_current), '[]'),
    'enrolled_count', (select count(*) from enrollments e where e.offering_id = p_offering and e.status = 'ENROLLED'),
    'snapshot_at', now()
  )
$$;

-- ---------------------------------------------------------------------------
-- Approval workflow state machine
-- DRAFT → SUBMITTED → UNDER_REVIEW → (RETURNED → RESUBMITTED →) APPROVED → LOCKED
-- Stages: COURSE_COORDINATOR → PROGRAM_COORDINATOR → HOD (if configured)
-- ---------------------------------------------------------------------------
create or replace function app.transition_offering(p_offering uuid, p_action text, p_comment text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  o course_offerings%rowtype;
  v_course courses%rowtype;
  v_program programs%rowtype;
  v_hod_required boolean := coalesce(app.setting_bool('hod_approval_required'), true);
  v_new_status text;
  v_new_stage text;
  v_actor_role text;
  v_label text;
  v_ay text;
  r record;
begin
  if app.uid() is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select * into o from course_offerings where id = p_offering for update;
  if not found then raise exception 'Offering not found' using errcode = 'P0002'; end if;
  select * into v_course from courses where id = o.course_id;
  select * into v_program from programs where id = v_course.program_id;

  perform set_config('app.in_transition', 'on', true);

  if p_action = 'SUBMIT' then
    if o.status not in ('DRAFT','RETURNED') then
      raise exception 'Only draft or returned courses can be submitted (current: %)', o.status using errcode = 'P0001';
    end if;
    if not app.can_edit_offering(p_offering) then
      raise exception 'Only assigned faculty can submit this course' using errcode = '42501';
    end if;
    if not exists (select 1 from course_attainment where offering_id = p_offering and is_current) then
      raise exception 'Final course attainment must be calculated before submission' using errcode = 'P0001';
    end if;
    v_new_status := case when o.status = 'RETURNED' then 'RESUBMITTED' else 'SUBMITTED' end;
    v_new_stage := case when exists (select 1 from course_coordinators where course_id = o.course_id and is_active)
                        then 'COURSE_COORDINATOR' else 'PROGRAM_COORDINATOR' end;
    v_actor_role := 'FACULTY';
    -- close the feedback window while the offering is still editable
    update feedback_templates set status = 'CLOSED', closed_at = now() where offering_id = p_offering and status = 'OPEN';
    update course_offerings set status = v_new_status, review_stage = v_new_stage, submitted_at = now() where id = p_offering;
    insert into approval_workflows (offering_id, action, from_status, to_status, stage, actor_id, actor_role, comments, version)
    values (p_offering, case when o.status = 'RETURNED' then 'RESUBMIT' else 'SUBMIT' end, o.status, v_new_status, v_new_stage, app.uid(), v_actor_role, p_comment, o.version);
    for r in (select user_id from course_coordinators where course_id = o.course_id and is_active and v_new_stage = 'COURSE_COORDINATOR'
              union select user_id from program_coordinators where program_id = v_program.id and is_active and v_new_stage = 'PROGRAM_COORDINATOR') loop
      perform app.notify(r.user_id, 'Course submitted for review', v_course.code || ' ' || v_course.name || ' awaits your review.', '/reviews');
    end loop;

  elsif p_action in ('APPROVE','RETURN') then
    if o.status not in ('SUBMITTED','RESUBMITTED','UNDER_REVIEW') then
      raise exception 'Course is not awaiting review (current: %)', o.status using errcode = 'P0001';
    end if;
    -- Actor must be the reviewer for the current stage
    if o.review_stage = 'COURSE_COORDINATOR' and (app.is_cc_of(o.course_id) or app.is_admin()) then
      v_actor_role := 'COURSE_COORDINATOR';
    elsif o.review_stage = 'PROGRAM_COORDINATOR' and (app.is_pc_of(v_program.id) or app.is_admin()) then
      v_actor_role := 'PROGRAM_COORDINATOR';
    elsif o.review_stage = 'HOD' and (app.is_hod_of(v_program.department_id) or app.is_admin()) then
      v_actor_role := 'HOD';
    else
      raise exception 'You are not the reviewer for the current stage (%)', o.review_stage using errcode = '42501';
    end if;

    if p_action = 'RETURN' then
      if coalesce(length(trim(p_comment)), 0) < 5 then
        raise exception 'A comment explaining the required corrections is mandatory' using errcode = 'P0001';
      end if;
      update course_offerings set status = 'RETURNED', review_stage = null where id = p_offering;
      insert into approval_workflows (offering_id, action, from_status, to_status, stage, actor_id, actor_role, comments, version)
      values (p_offering, 'RETURN', o.status, 'RETURNED', o.review_stage, app.uid(), v_actor_role, p_comment, o.version);
      for r in (select distinct user_id from faculty_assignments where offering_id = p_offering and is_active) loop
        perform app.notify(r.user_id, 'Course returned for revision', v_course.code || ': ' || p_comment, '/workspace/' || p_offering || '/submission');
      end loop;
      return 'RETURNED';
    end if;

    -- APPROVE: advance stage or finish
    v_new_stage := case o.review_stage
      when 'COURSE_COORDINATOR' then 'PROGRAM_COORDINATOR'
      when 'PROGRAM_COORDINATOR' then case when v_hod_required then 'HOD' else null end
      else null end;

    if v_new_stage is not null then
      update course_offerings set status = 'UNDER_REVIEW', review_stage = v_new_stage where id = p_offering;
      insert into approval_workflows (offering_id, action, from_status, to_status, stage, actor_id, actor_role, comments, version)
      values (p_offering, 'APPROVE_STAGE', o.status, 'UNDER_REVIEW', o.review_stage, app.uid(), v_actor_role, p_comment, o.version);
      for r in (select user_id from program_coordinators where program_id = v_program.id and is_active and v_new_stage = 'PROGRAM_COORDINATOR'
                union select user_id from user_roles where role_code = 'HOD' and department_id = v_program.department_id and v_new_stage = 'HOD') loop
        perform app.notify(r.user_id, 'Course awaiting your approval', v_course.code || ' ' || v_course.name || ' passed ' || o.review_stage || ' review.', '/reviews');
      end loop;
      return 'UNDER_REVIEW';
    end if;

    -- Final approval → APPROVED → LOCKED with immutable version snapshot
    update course_offerings set status = 'APPROVED', review_stage = null, approved_at = now() where id = p_offering;
    insert into approval_workflows (offering_id, action, from_status, to_status, stage, actor_id, actor_role, comments, version)
    values (p_offering, 'APPROVE', o.status, 'APPROVED', o.review_stage, app.uid(), v_actor_role, p_comment, o.version);
    update course_offerings set status = 'LOCKED', locked_at = now() where id = p_offering;
    insert into approval_workflows (offering_id, action, from_status, to_status, stage, actor_id, actor_role, comments, version)
    values (p_offering, 'LOCK', 'APPROVED', 'LOCKED', null, app.uid(), v_actor_role, 'Locked on final approval', o.version);
    select name into v_ay from academic_years where id = o.academic_year_id;
    v_label := v_ay || ' Version ' || o.version;
    insert into offering_versions (offering_id, version, label, snapshot, created_by)
    values (p_offering, o.version, v_label, app.build_offering_snapshot(p_offering), app.uid())
    on conflict (offering_id, version) do update set snapshot = excluded.snapshot, label = excluded.label, created_at = now();
    for r in (select distinct user_id from faculty_assignments where offering_id = p_offering and is_active) loop
      perform app.notify(r.user_id, 'Course approved and locked', v_course.code || ' ' || v_label || ' approved.', '/workspace/' || p_offering || '/submission');
    end loop;
    return 'LOCKED';

  else
    raise exception 'Unknown workflow action %', p_action using errcode = 'P0001';
  end if;

  return v_new_status;
end $$;

-- Revision of approved/locked data: request (faculty) and decide (PC/HOD).
create or replace function app.request_revision(p_offering uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_status text; v_course courses%rowtype; r record;
begin
  select status into v_status from course_offerings where id = p_offering;
  if v_status <> 'LOCKED' then raise exception 'Revisions can only be requested for locked courses' using errcode = 'P0001'; end if;
  if not app.can_edit_offering(p_offering) then raise exception 'Only assigned faculty can request a revision' using errcode = '42501'; end if;
  if coalesce(length(trim(p_reason)), 0) < 10 then raise exception 'A reason (at least 10 characters) is required' using errcode = 'P0001'; end if;
  if exists (select 1 from revision_requests where offering_id = p_offering and status = 'PENDING') then
    raise exception 'A revision request is already pending' using errcode = 'P0001';
  end if;
  insert into revision_requests (offering_id, reason, requested_by) values (p_offering, p_reason, app.uid()) returning id into v_id;
  insert into approval_workflows (offering_id, action, from_status, to_status, stage, actor_id, actor_role, comments, version)
  select p_offering, 'REVISION_REQUESTED', 'LOCKED', 'LOCKED', null, app.uid(), 'FACULTY', p_reason, version from course_offerings where id = p_offering;
  select c.* into v_course from courses c join course_offerings o on o.course_id = c.id where o.id = p_offering;
  for r in (select user_id from program_coordinators where program_id = v_course.program_id and is_active) loop
    perform app.notify(r.user_id, 'Revision requested', v_course.code || ': ' || p_reason, '/reviews');
  end loop;
  return v_id;
end $$;

create or replace function app.decide_revision(p_request uuid, p_approve boolean, p_comment text) returns text
language plpgsql security definer set search_path = public as $$
declare rr revision_requests%rowtype; o course_offerings%rowtype; v_role text;
begin
  select * into rr from revision_requests where id = p_request for update;
  if not found or rr.status <> 'PENDING' then raise exception 'Revision request is not pending' using errcode = 'P0001'; end if;
  select * into o from course_offerings where id = rr.offering_id for update;
  if app.is_pc_of(app.course_program(o.course_id)) then v_role := 'PROGRAM_COORDINATOR';
  elsif app.is_hod_of(app.program_department(app.course_program(o.course_id))) then v_role := 'HOD';
  elsif app.is_admin() then v_role := 'SUPER_ADMIN';
  else raise exception 'Only the Program Coordinator or HOD can decide revision requests' using errcode = '42501'; end if;

  update revision_requests set status = case when p_approve then 'APPROVED' else 'REJECTED' end,
    decided_by = app.uid(), decided_at = now(), decision_comment = p_comment where id = p_request;
  perform set_config('app.in_transition', 'on', true);
  if p_approve then
    update course_offerings set status = 'DRAFT', review_stage = null, version = version + 1, locked_at = null where id = o.id;
    insert into approval_workflows (offering_id, action, from_status, to_status, stage, actor_id, actor_role, comments, version)
    values (o.id, 'REVISION_APPROVED', 'LOCKED', 'DRAFT', null, app.uid(), v_role, p_comment, o.version + 1);
    perform app.notify(rr.requested_by, 'Revision approved', 'You can now edit version ' || (o.version + 1) || '. The approved version is preserved.', '/workspace/' || o.id);
    return 'DRAFT';
  else
    insert into approval_workflows (offering_id, action, from_status, to_status, stage, actor_id, actor_role, comments, version)
    values (o.id, 'REVISION_REJECTED', 'LOCKED', 'LOCKED', null, app.uid(), v_role, p_comment, o.version);
    perform app.notify(rr.requested_by, 'Revision rejected', coalesce(p_comment, ''), '/workspace/' || o.id || '/submission');
    return 'LOCKED';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Student feedback submission (atomic, duplicate-proof, anonymous responses)
-- p_ratings: {"<feedback_question_id>": rating, ...}
-- ---------------------------------------------------------------------------
create or replace function app.submit_feedback(p_template uuid, p_ratings jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  t feedback_templates%rowtype;
  v_student uuid := app.current_student_id();
  v_set uuid := gen_random_uuid();
  q record;
  v_rating int;
begin
  if v_student is null then raise exception 'Only students can submit course feedback' using errcode = '42501'; end if;
  select * into t from feedback_templates where id = p_template;
  if not found then raise exception 'Feedback form not found' using errcode = 'P0002'; end if;
  if t.status <> 'OPEN' then raise exception 'Feedback is not open for this course' using errcode = 'P0001'; end if;
  if not exists (select 1 from enrollments where offering_id = t.offering_id and student_id = v_student and status = 'ENROLLED') then
    raise exception 'You are not enrolled in this course' using errcode = '42501';
  end if;
  if exists (select 1 from feedback_submissions where template_id = p_template and student_id = v_student) then
    raise exception 'Feedback already submitted' using errcode = '23505';
  end if;
  insert into feedback_submissions (template_id, offering_id, student_id) values (p_template, t.offering_id, v_student);
  for q in select id from feedback_questions where template_id = p_template loop
    v_rating := (p_ratings ->> q.id::text)::int;
    if v_rating is null or v_rating < 1 or v_rating > t.scale_max then
      raise exception 'Every question requires a rating between 1 and %', t.scale_max using errcode = 'P0001';
    end if;
    insert into feedback_responses (template_id, offering_id, question_id, response_set, rating)
    values (p_template, t.offering_id, q.id, v_set, v_rating);
  end loop;
  perform app.log_event('FEEDBACK_SUBMITTED', 'feedback_templates', p_template, t.offering_id, null, null);
end $$;
