-- =============================================================================
-- Row Level Security. The application never relies on frontend checks: every
-- request runs as obe_app with app.user_id set, and these policies decide.
-- =============================================================================

grant select, insert, update, delete on all tables in schema public to obe_app;
grant usage, select on all sequences in schema public to obe_app;
grant execute on all functions in schema app to obe_app;

-- Password hashes are never readable by the application role.
revoke select on users from obe_app;
grant select (id, institution_id, email, full_name, designation, school_id, department_id, is_active, last_login_at, created_at, updated_at) on users to obe_app;
revoke update on users from obe_app;
grant update (full_name, designation, school_id, department_id, is_active) on users to obe_app;

-- Audit log is append-only (written by security-definer triggers/functions).
revoke insert, update, delete on audit_logs from obe_app;
-- Workflow history & versions are written only by workflow functions.
revoke insert, update, delete on approval_workflows from obe_app;
revoke insert, update, delete on offering_versions from obe_app;
revoke insert, update, delete on notifications from obe_app;
grant update (is_read) on notifications to obe_app;
-- Feedback is only written through app.submit_feedback().
revoke insert, update, delete on feedback_submissions, feedback_responses from obe_app;

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Reference data: readable by any authenticated user, written by admins
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['institutions','schools','departments','academic_years','semesters','roles','permissions','role_permissions'] loop
    execute format('create policy read_all on %I for select using (app.uid() is not null)', t);
    execute format('create policy admin_write on %I for all using (app.is_admin()) with check (app.is_admin())', t);
  end loop;
end $$;

create policy read_all on batches for select using (app.uid() is not null);
create policy write_batches on batches for all
  using (app.is_admin() or (department_id is not null and app.is_hod_of(department_id)))
  with check (app.is_admin() or (department_id is not null and app.is_hod_of(department_id)));

create policy read_all on institution_settings for select using (app.uid() is not null);
create policy iqac_write on institution_settings for update using (app.is_iqac()) with check (app.is_iqac());
create policy admin_insert on institution_settings for insert with check (app.is_admin());

create policy read_all on attainment_methodologies for select using (app.uid() is not null);
create policy write_methodology on attainment_methodologies for all
  using (app.is_iqac() or (program_id is not null and app.can_manage_program(program_id)))
  with check (app.is_iqac() or (program_id is not null and app.can_manage_program(program_id)));

-- ---------------------------------------------------------------------------
-- Users & roles
-- ---------------------------------------------------------------------------
create policy staff_read_users on users for select
  using (id = app.uid() or app.is_staff());
create policy admin_write_users on users for all using (app.is_admin()) with check (app.is_admin());

create policy staff_read_roles on user_roles for select using (user_id = app.uid() or app.is_staff());
create policy admin_write_roles on user_roles for all using (app.is_admin()) with check (app.is_admin());

-- ---------------------------------------------------------------------------
-- Programs & outcomes
-- ---------------------------------------------------------------------------
-- Policies reference the row's own columns (not lookups by id) so that
-- INSERT ... RETURNING works for the creating user.
create policy read_program on programs for select using (
  app.can_read_department(department_id) or app.is_pc_of(id) or app.can_read_program(id)
  or exists (select 1 from courses c join course_offerings o on o.course_id = c.id where c.program_id = programs.id and app.is_enrolled(o.id)));
create policy create_program on programs for insert with check (app.can_create_program(department_id));
create policy update_program on programs for update using (app.can_manage_program(id)) with check (app.can_manage_program(id));
create policy delete_program on programs for delete using (app.is_admin());

create policy read_pc on program_coordinators for select using (app.can_read_program(program_id));
create policy write_pc on program_coordinators for all
  using (app.is_admin() or app.is_hod_of(app.program_department(program_id)))
  with check (app.is_admin() or app.is_hod_of(app.program_department(program_id)));

create policy read_po on program_outcomes for select using (app.can_read_program(program_id));
create policy write_po on program_outcomes for all using (app.can_manage_program(program_id)) with check (app.can_manage_program(program_id));
create policy read_pso on program_specific_outcomes for select using (app.can_read_program(program_id));
create policy write_pso on program_specific_outcomes for all using (app.can_manage_program(program_id)) with check (app.can_manage_program(program_id));

-- ---------------------------------------------------------------------------
-- Courses, coordinators, offerings, allocation
-- ---------------------------------------------------------------------------
create policy read_course on courses for select using (
  app.can_read_program(program_id) or app.is_cc_of(id)
  or exists (select 1 from course_offerings o where o.course_id = courses.id and app.is_enrolled(o.id)));
create policy create_course on courses for insert with check (app.can_manage_program(program_id));
create policy update_course on courses for update using (app.can_manage_program(program_id)) with check (app.can_manage_program(program_id));
create policy delete_course on courses for delete using (app.is_admin());

create policy read_cc on course_coordinators for select using (app.can_read_course(course_id));
create policy write_cc on course_coordinators for all
  using (app.can_manage_program(app.course_program(course_id)))
  with check (app.can_manage_program(app.course_program(course_id)));

create policy read_offering on course_offerings for select using (
  app.is_assigned_faculty(id) or app.is_cc_of(course_id) or app.can_read_program(app.course_program(course_id)) or app.is_enrolled(id));
create policy create_offering on course_offerings for insert with check (app.can_allocate_course(course_id));
create policy update_offering on course_offerings for update
  using (app.can_allocate_course(course_id) or app.can_edit_offering(id))
  with check (app.can_allocate_course(course_id) or app.can_edit_offering(id));
create policy delete_offering on course_offerings for delete using (app.is_admin());

create policy read_fa on faculty_assignments for select using (app.can_read_offering(offering_id) or app.is_enrolled(offering_id));
create policy write_fa on faculty_assignments for all
  using (app.can_allocate_course(app.offering_course(offering_id)))
  with check (app.can_allocate_course(app.offering_course(offering_id)));

create policy read_corr on correction_requests for select using (app.can_read_offering(offering_id));
create policy create_corr on correction_requests for insert with check (app.can_edit_offering(offering_id) and requested_by = app.uid());
create policy resolve_corr on correction_requests for update
  using (app.can_manage_program(app.course_program(app.offering_course(offering_id))))
  with check (app.can_manage_program(app.course_program(app.offering_course(offering_id))));

-- ---------------------------------------------------------------------------
-- Offering academic content: read = reviewers/assigned; write = assigned faculty & CC
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'syllabus','syllabus_units','course_objectives','course_targets','co_po_mappings','co_pso_mappings',
    'assessments','assessment_questions','question_co_mappings','marks_uploads','student_marks',
    'direct_attainment','indirect_attainment','course_po_attainment','course_pso_attainment']
  loop
    execute format('create policy read_content on %I for select using (app.can_read_offering(offering_id))', t);
    execute format('create policy write_content on %I for all using (app.can_edit_offering(offering_id)) with check (app.can_edit_offering(offering_id))', t);
  end loop;
end $$;

-- COs are visible to enrolled students (feedback is generated from them)
create policy read_content on course_outcomes for select using (app.can_read_offering(offering_id) or app.is_enrolled(offering_id));
create policy write_content on course_outcomes for all using (app.can_edit_offering(offering_id)) with check (app.can_edit_offering(offering_id));

-- Final course attainment is visible to students only if the institution allows it
create policy read_content on course_attainment for select using (
  app.can_read_offering(offering_id)
  or (app.is_enrolled(offering_id) and coalesce(app.setting_bool('students_can_view_attainment'), false)));
create policy write_content on course_attainment for all using (app.can_edit_offering(offering_id)) with check (app.can_edit_offering(offering_id));

create policy read_calc on calculation_runs for select using (
  (offering_id is not null and app.can_read_offering(offering_id))
  or (program_id is not null and app.can_read_program(program_id)));
create policy write_calc on calculation_runs for insert with check (
  (offering_id is not null and app.can_edit_offering(offering_id))
  or (offering_id is null and program_id is not null and (app.can_manage_program(program_id) or app.is_iqac())));

-- ---------------------------------------------------------------------------
-- Students & enrollment
-- ---------------------------------------------------------------------------
create policy read_students on students for select using (
  user_id = app.uid()
  or app.is_institution_reader()
  or (department_id is not null and app.can_read_department(department_id))
  or exists (select 1 from users u where u.id = app.uid() and u.department_id = students.department_id and app.is_staff())
  or exists (select 1 from enrollments e where e.student_id = students.id and app.can_read_offering(e.offering_id)));
create policy admin_write_students on students for all using (app.is_admin()) with check (app.is_admin());

create policy read_enrollment on enrollments for select using (app.can_read_offering(offering_id) or student_id = app.current_student_id());
create policy write_enrollment on enrollments for all
  using (app.can_edit_offering(offering_id) or app.can_allocate_course(app.offering_course(offering_id)))
  with check (app.can_edit_offering(offering_id) or app.can_allocate_course(app.offering_course(offering_id)));

-- ---------------------------------------------------------------------------
-- Feedback
-- ---------------------------------------------------------------------------
create policy read_template on feedback_templates for select using (app.can_read_offering(offering_id) or app.is_enrolled(offering_id));
create policy write_template on feedback_templates for all using (app.can_edit_offering(offering_id)) with check (app.can_edit_offering(offering_id));
create policy read_fq on feedback_questions for select using (app.can_read_offering(offering_id) or app.is_enrolled(offering_id));
create policy write_fq on feedback_questions for all using (app.can_edit_offering(offering_id)) with check (app.can_edit_offering(offering_id));
create policy read_submission on feedback_submissions for select using (app.can_read_offering(offering_id) or student_id = app.current_student_id());
create policy read_response on feedback_responses for select using (app.can_read_offering(offering_id));

-- ---------------------------------------------------------------------------
-- Program attainment & gaps
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['program_attainment','po_attainment','pso_attainment'] loop
    execute format('create policy read_prog_att on %I for select using (app.can_read_program(program_id))', t);
    execute format('create policy write_prog_att on %I for all using (app.can_manage_program(program_id) or app.is_iqac()) with check (app.can_manage_program(program_id) or app.is_iqac())', t);
  end loop;
end $$;

create policy read_gap on gap_analysis for select using (
  (offering_id is not null and app.can_read_offering(offering_id))
  or (offering_id is null and program_id is not null and app.can_read_program(program_id)));
create policy write_gap on gap_analysis for all using (
  (offering_id is not null and app.can_edit_offering(offering_id))
  or (offering_id is null and program_id is not null and (app.can_manage_program(program_id) or app.is_iqac())))
  with check (
  (offering_id is not null and app.can_edit_offering(offering_id))
  or (offering_id is null and program_id is not null and (app.can_manage_program(program_id) or app.is_iqac())));

create policy read_ap on action_plans for select using (
  (offering_id is not null and app.can_read_offering(offering_id))
  or (program_id is not null and app.can_read_program(program_id))
  or responsible_user_id = app.uid());
create policy write_ap on action_plans for all using (
  (offering_id is not null and (app.can_edit_offering(offering_id) or app.can_review_offering(offering_id)))
  or (program_id is not null and (app.can_manage_program(program_id) or app.is_iqac())))
  with check (
  (offering_id is not null and (app.can_edit_offering(offering_id) or app.can_review_offering(offering_id)))
  or (program_id is not null and (app.can_manage_program(program_id) or app.is_iqac())));

-- ---------------------------------------------------------------------------
-- Evidence & reports
-- ---------------------------------------------------------------------------
create policy read_evidence on evidence for select using (
  (offering_id is not null and app.can_read_offering(offering_id))
  or (program_id is not null and app.can_read_program(program_id)));
create policy create_evidence on evidence for insert with check (
  uploaded_by = app.uid() and (
    (offering_id is not null and app.can_edit_offering(offering_id))
    or (offering_id is null and program_id is not null and app.can_manage_program(program_id))));
create policy delete_evidence on evidence for delete using (
  uploaded_by = app.uid() and (offering_id is null or app.offering_is_editable(offering_id)));

create policy read_reports on reports for select using (generated_by = app.uid() or app.is_iqac());
create policy create_reports on reports for insert with check (generated_by = app.uid());

-- ---------------------------------------------------------------------------
-- AI governance
-- ---------------------------------------------------------------------------
create policy read_ai on ai_interactions for select using (user_id = app.uid() or app.is_iqac());
create policy create_ai on ai_interactions for insert with check (user_id = app.uid());
create policy read_sugg on ai_suggestions for select using (created_by = app.uid() or (offering_id is not null and app.can_read_offering(offering_id)) or app.is_iqac());
create policy create_sugg on ai_suggestions for insert with check (created_by = app.uid());
create policy decide_sugg on ai_suggestions for update using (
  created_by = app.uid() or (offering_id is not null and app.can_edit_offering(offering_id)))
  with check (created_by = app.uid() or (offering_id is not null and app.can_edit_offering(offering_id)));

-- ---------------------------------------------------------------------------
-- Workflow history, versions, revisions, notifications, audit
-- ---------------------------------------------------------------------------
create policy read_wf on approval_workflows for select using (app.can_read_offering(offering_id));
create policy read_versions on offering_versions for select using (app.can_read_offering(offering_id));
create policy read_revisions on revision_requests for select using (app.can_read_offering(offering_id));
create policy read_notif on notifications for select using (user_id = app.uid());
create policy update_notif on notifications for update using (user_id = app.uid()) with check (user_id = app.uid());
create policy read_audit on audit_logs for select using (
  app.is_iqac()
  or (offering_id is not null and app.can_review_offering(offering_id)));
