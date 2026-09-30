-- =============================================================================
-- Course setup progress (drives completion %, checklist and dashboards).
-- SECURITY INVOKER: callers only see offerings RLS allows them to read.
-- =============================================================================

create or replace function app.offering_progress(p uuid) returns jsonb
language sql stable set search_path = public as $$
with o as (select * from course_offerings where id = p),
cos as (select id from course_outcomes where offering_id = p),
co_count as (select count(*)::int n from cos),
last_course_run as (
  select r.created_at from calculation_runs r where r.offering_id = p and r.run_type = 'COURSE'
  order by r.created_at desc limit 1),
fresh as (
  select coalesce((select lr.created_at >= o.calc_inputs_changed_at from last_course_run lr, o), false) ok),
prog as (select c.program_id from courses c join o on o.course_id = c.id),
settings as (select require_evidence, require_action_plan_for_gaps from institution_settings limit 1)
select jsonb_build_object(
  'profile', (select profile_confirmed_at is not null from o),
  'syllabus', exists (select 1 from syllabus where offering_id = p) and exists (select 1 from syllabus_units where offering_id = p),
  'objectives', exists (select 1 from course_objectives where offering_id = p),
  'cos', (select n from co_count) > 0,
  'bloom', (select n from co_count) > 0 and not exists (select 1 from course_outcomes where offering_id = p and bloom_level is null),
  'targets', exists (select 1 from course_targets where offering_id = p),
  'co_po', (select n from co_count) > 0 and not exists (
      select 1 from cos where not exists (select 1 from co_po_mappings m where m.co_id = cos.id and m.value > 0)),
  'co_pso', (select n from co_count) > 0 and (
      not exists (select 1 from program_specific_outcomes ps, prog where ps.program_id = prog.program_id)
      or exists (select 1 from co_pso_mappings where offering_id = p and value > 0)),
  'assessments', exists (select 1 from assessments where offering_id = p) and not exists (
      select 1 from assessments a where a.offering_id = p
      and a.max_marks <> coalesce((select sum(q.max_marks) from assessment_questions q where q.assessment_id = a.id), 0)),
  'question_mapping', exists (select 1 from assessment_questions where offering_id = p)
      and not exists (select 1 from assessment_questions q where q.offering_id = p
                      and not exists (select 1 from question_co_mappings m where m.question_id = q.id))
      and not exists (select 1 from cos where not exists (select 1 from question_co_mappings m where m.co_id = cos.id)),
  'students', exists (select 1 from enrollments where offering_id = p and status = 'ENROLLED'),
  'marks', exists (select 1 from student_marks where offering_id = p)
      and not exists (select 1 from assessment_questions q where q.offering_id = p
                      and not exists (select 1 from student_marks sm where sm.question_id = q.id)),
  'direct', (select ok from fresh) and (select count(*) from direct_attainment d where d.offering_id = p and d.is_current and d.achievement_pct is not null) = (select n from co_count) and (select n from co_count) > 0,
  'feedback', exists (select 1 from feedback_templates where offering_id = p and status in ('OPEN','CLOSED'))
      and exists (select 1 from feedback_submissions where offering_id = p),
  'indirect', (select ok from fresh) and (select count(*) from indirect_attainment i where i.offering_id = p and i.is_current and i.indirect_pct is not null) = (select n from co_count) and (select n from co_count) > 0,
  'final', (select ok from fresh) and (select count(*) from course_attainment ca where ca.offering_id = p and ca.is_current and ca.status <> 'INCOMPLETE') = (select n from co_count) and (select n from co_count) > 0,
  'po_pso', (select ok from fresh) and exists (select 1 from course_po_attainment where offering_id = p and is_current and value_pct is not null),
  'gaps', (select ok from fresh) and exists (select 1 from gap_analysis where offering_id = p and is_current),
  'action_plans', not coalesce((select require_action_plan_for_gaps from settings), true) or not exists (
      select 1 from gap_analysis g where g.offering_id = p and g.is_current and g.classification in ('BELOW_TARGET','CRITICAL')
      and not exists (select 1 from action_plans ap where ap.offering_id = p and ap.level = g.level and ap.entity_code = g.entity_code)),
  'evidence', not coalesce((select require_evidence from settings), true) or exists (select 1 from evidence where offering_id = p),
  'stale', not (select ok from fresh) and exists (select 1 from last_course_run)
)
$$;

grant execute on function app.offering_progress(uuid) to obe_app;
