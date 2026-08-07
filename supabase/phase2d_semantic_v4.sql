-- Lead Magnet Simulator V4
-- One semantic LLM reading per message; all Mind reactions stay local.

create table if not exists public.lms_message_semantics(
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references public.lms_messages(id) on delete cascade,
  curiosity_gap smallint not null check(curiosity_gap between 0 and 100),
  specificity smallint not null check(specificity between 0 and 100),
  credibility smallint not null check(credibility between 0 and 100),
  novelty smallint not null check(novelty between 0 and 100),
  intellectual_tension smallint not null check(intellectual_tension between 0 and 100),
  personal_relevance smallint not null check(personal_relevance between 0 and 100),
  usefulness smallint not null check(usefulness between 0 and 100),
  urgency smallint not null check(urgency between 0 and 100),
  emotional_resonance smallint not null check(emotional_resonance between 0 and 100),
  sales_smell smallint not null check(sales_smell between 0 and 100),
  risk_reduction smallint not null check(risk_reduction between 0 and 100),
  social_proof smallint not null check(social_proof between 0 and 100),
  identity_relevance smallint not null check(identity_relevance between 0 and 100),
  fear_pressure smallint not null check(fear_pressure between 0 and 100),
  opportunity_pull smallint not null check(opportunity_pull between 0 and 100),
  proposition_clarity smallint not null check(proposition_clarity between 0 and 100),
  cta_strength smallint not null check(cta_strength between 0 and 100),
  narrative_pull smallint not null check(narrative_pull between 0 and 100),
  subject_open_pull smallint not null check(subject_open_pull between 0 and 100),
  summary text not null default '',
  key_themes text[] not null default '{}',
  analysis_source text not null default 'llm' check(analysis_source in('llm','manual')),
  model_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lms_message_semantics enable row level security;
drop policy if exists "lms own message semantics" on public.lms_message_semantics;
create policy "lms own message semantics" on public.lms_message_semantics
for all to authenticated
using(exists(select 1 from public.lms_messages m where m.id=message_id and m.user_id=auth.uid()))
with check(exists(select 1 from public.lms_messages m where m.id=message_id and m.user_id=auth.uid()));

create index if not exists lms_message_semantics_message_idx on public.lms_message_semantics(message_id);

create or replace function public.lms_run_local_simulation(p_sim_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_sim public.lms_simulations%rowtype;
  v_sem public.lms_message_semantics%rowtype;
  v_total int:=0;
begin
  select * into v_sim from lms_simulations where id=p_sim_id;
  if not found then raise exception 'Simulation not found'; end if;
  if v_sim.user_id<>auth.uid() then raise exception 'Access denied'; end if;
  if v_sim.status not in('ready_for_simulation','failed') then raise exception 'Simulation status % cannot be run',v_sim.status; end if;

  select s.* into v_sem from lms_message_semantics s where s.message_id=v_sim.message_id;
  if not found then raise exception 'Message has no semantic profile. Analyze it in Message Lab first.'; end if;

  update lms_simulations set status='running',started_at=now(),completed_at=null,model_name='synthetic-mind-engine-v4' where id=p_sim_id;
  delete from lms_simulation_responses where simulation_id=p_sim_id;

  with eligible as (
    select p.*,
      case when p.skepticism>=75 or p.bullshit_tolerance<=25 then 'hard' when p.skepticism<=40 then 'open' else 'balanced' end resistance_bucket
    from lms_people p
    where (coalesce(v_sim.audience_filter->>'audience','')='' or p.audience_segment=v_sim.audience_filter->>'audience')
      and (coalesce(v_sim.audience_filter->>'country','')='' or p.country=v_sim.audience_filter->>'country')
      and (coalesce(v_sim.audience_filter->>'region','')='' or p.global_region=v_sim.audience_filter->>'region')
      and (coalesce(v_sim.audience_filter->>'industry','')='' or p.industry=v_sim.audience_filter->>'industry')
      and (coalesce(v_sim.audience_filter->>'power','')='' or p.purchasing_power=v_sim.audience_filter->>'power')
      and (coalesce(v_sim.audience_filter->>'ageMin','')='' or p.age>=(v_sim.audience_filter->>'ageMin')::int)
      and (coalesce(v_sim.audience_filter->>'ageMax','')='' or p.age<=(v_sim.audience_filter->>'ageMax')::int)
  ), strata as (
    select e.*,count(*) over() total_n,count(*) over(partition by audience_segment,global_region,resistance_bucket) stratum_n,
      row_number() over(partition by audience_segment,global_region,resistance_bucket order by md5(e.id::text||p_sim_id::text)) rn
    from eligible e
  ), sampled as (
    select * from strata where v_sim.sample_size>=total_n or rn<=greatest(1,round(v_sim.sample_size::numeric*stratum_n/total_n)::int)
    order by md5(id::text||p_sim_id::text) limit v_sim.sample_size
  ), psych as (
    select s.*,
      ((('x'||substr(md5(s.id::text||v_sim.message_id::text),1,4))::bit(16)::int%31)-15) jitter,
      greatest(0,least(100,round(
        8 + email_attention*.18 + v_sem.subject_open_pull*.32 + curiosity*.06 + v_sem.intellectual_tension*.04 + v_sem.personal_relevance*.03
        - skepticism*.06 - v_sem.sales_smell*.05 - case when seniority in('executive','senior_leadership','partner') then 5 else 1 end
      )))::int base_attention,
      greatest(0,least(100,round(
        10 + curiosity*.10 + v_sem.usefulness*.15 + v_sem.narrative_pull*.15 + v_sem.intellectual_tension*.12 + v_sem.specificity*.08
        + v_sem.curiosity_gap*.10 + v_sem.credibility*.05 - v_sem.sales_smell*.12 - skepticism*.06
      )))::int base_read_pull
    from sampled s
  ), meaning as (
    select p.*,
      greatest(0,least(100,base_attention+jitter*.55))::int attention,
      greatest(0,least(100,base_read_pull+jitter*.35))::int read_pull,
      greatest(0,least(100,round(
        case
          when audience_segment='cxo' then v_sem.personal_relevance*.30+v_sem.usefulness*.24+v_sem.risk_reduction*.16+v_sem.urgency*.08+decision_authority*.10+curiosity*.06
          when audience_segment='consultant' then v_sem.personal_relevance*.27+v_sem.usefulness*.29+v_sem.social_proof*.10+v_sem.intellectual_tension*.10+curiosity*.10
          else v_sem.personal_relevance*.18+v_sem.identity_relevance*.24+v_sem.opportunity_pull*.18+v_sem.emotional_resonance*.10+challenge_deficit*.12+reinvention_readiness*.10
        end - v_sem.sales_smell*.08 + jitter*.30
      )))::int relevance,
      greatest(0,least(100,round(v_sem.credibility*.48+v_sem.specificity*.20+v_sem.social_proof*.12+(100-skepticism)*.14-v_sem.sales_smell*.10+jitter*.22)))::int credibility_score,
      greatest(0,least(100,round(v_sem.novelty*.50+v_sem.intellectual_tension*.20+v_sem.curiosity_gap*.12+curiosity*.10-v_sem.sales_smell*.06+jitter*.25)))::int novelty_score,
      greatest(0,least(100,round(v_sem.emotional_resonance*.42+v_sem.identity_relevance*.18+v_sem.narrative_pull*.15+v_sem.opportunity_pull*.10+story_response*.08-v_sem.sales_smell*.06+jitter*.20)))::int emotional_score
    from psych p
  ), scored as (
    select m.*,
      (attention>=44) opened_flag,
      (attention>=44 and read_pull>=45) read_flag,
      greatest(0,least(100,round(attention*.13+read_pull*.15+relevance*.25+credibility_score*.17+novelty_score*.08+emotional_score*.06+
        v_sem.usefulness*.08+v_sem.urgency*.04+willingness_to_travel*.03+discretionary_spending_power*.03-price_sensitivity*.05-approval_complexity*.04)))::int interest,
      greatest(0,least(100,round(8+v_sem.cta_strength*.13+v_sem.proposition_clarity*.10+v_sem.risk_reduction*.10+v_sem.urgency*.07+
        willingness_to_travel*.12+discretionary_spending_power*.12+decision_authority*.06-price_sensitivity*.14-approval_complexity*.10-v_sem.sales_smell*.05+jitter*.18)))::int action_readiness
    from meaning m
  ), activated as (
    select x.*,
      case
        when not opened_flag then 0
        when not read_flag then 1
        when relevance<38 then 2
        when relevance<45 then 3
        when interest<42 then 4
        when interest<49 then 5
        when interest<56 then 6
        when interest<64 or credibility_score<48 then 7
        when interest<72 or action_readiness<55 then 8
        when interest<80 or action_readiness<66 then 9
        else 10
      end::smallint activation
    from scored x
  )
  insert into lms_simulation_responses(simulation_id,person_id,response_class,activation_score,opened,read_enough,interest_score,credibility_score,relevance_score,novelty_score,emotional_resonance_score,primary_objection,secondary_objection,response_text,reasoning_summary)
  select p_sim_id,id,
    case when activation<=4 then 'ignore' when activation<=6 then 'read_only' when activation<=9 then 'tell_me_more' else 'sign_me_up' end,
    activation,opened_flag,read_flag,interest,credibility_score,relevance,novelty_score,emotional_score,
    case activation
      when 0 then 'The subject did not earn an open'
      when 1 then 'The opening did not earn enough reading time'
      when 2 then 'This feels more relevant to someone else'
      when 3 then 'I can see relevance, but not for my current stage'
      when 4 then 'Potentially interesting, but not now'
      when 5 then 'I need to think about it'
      when 6 then 'I may want more information later'
      when 7 then 'Tell me more before I decide'
      when 8 then 'This sounds genuinely interesting'
      when 9 then 'This deserves a conversation'
      else 'The value, timing and friction are strong enough for me to commit' end,
    case when v_sem.sales_smell>=65 then 'It still feels too much like marketing' when skepticism>=78 and v_sem.credibility<65 then 'I need stronger proof' when action_readiness<45 then 'The practical friction is still too high' else null end,
    case activation when 0 then 'Not interesting.' when 1 then 'Maybe interesting for someone else.' when 2 then 'Maybe interesting for someone I know.' when 3 then 'Maybe interesting at a different stage in my life.' when 4 then 'Maybe interesting somewhere in the future.' when 5 then 'Let me think about it.' when 6 then 'Maybe I want more information in the future.' when 7 then 'Tell me more.' when 8 then 'Sounds interesting.' when 9 then 'Let''s talk.' else 'OK, I am in.' end,
    format('v4 semantic: activation %s/10; open %s; read %s; attention %s, pull %s, relevance %s, credibility %s, interest %s, action %s. Semantic source: %s.',activation,opened_flag,read_flag,attention,read_pull,relevance,credibility_score,interest,action_readiness,v_sem.analysis_source)
  from activated;

  get diagnostics v_total=row_count;
  update lms_simulations set status='completed',completed_at=now(),model_name='synthetic-mind-engine-v4',sample_size=v_total where id=p_sim_id;
  return jsonb_build_object('simulation_id',p_sim_id,'responses',v_total,'engine','synthetic-mind-engine-v4');
exception when others then
  update lms_simulations set status='failed',completed_at=now() where id=p_sim_id;
  raise;
end;
$$;

revoke all on function public.lms_run_local_simulation(uuid) from public;
grant execute on function public.lms_run_local_simulation(uuid) to authenticated;
