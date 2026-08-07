-- Lead Magnet Simulator Phase 2C
-- Executable migration for Synthetic Mind Engine v3.

alter table public.lms_simulation_responses
  add column if not exists activation_score smallint check (activation_score between 0 and 10),
  add column if not exists opened boolean not null default false,
  add column if not exists read_enough boolean not null default false;

create or replace function public.lms_run_local_simulation(p_sim_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_sim public.lms_simulations%rowtype;
  v_message public.lms_messages%rowtype;
  v_motive public.lms_motives%rowtype;
  v_subject text;
  v_body text;
  v_context text;
  v_total int:=0;
begin
  select * into v_sim from lms_simulations where id=p_sim_id;
  if not found then raise exception 'Simulation not found'; end if;
  if v_sim.user_id<>auth.uid() then raise exception 'Access denied'; end if;
  if v_sim.status not in('ready_for_simulation','failed') then raise exception 'Simulation status % cannot be run',v_sim.status; end if;

  select * into v_message from lms_messages where id=v_sim.message_id;
  if v_message.motive_id is not null then select * into v_motive from lms_motives where id=v_message.motive_id; end if;
  v_subject:=lower(coalesce(v_message.subject_line,''));
  v_body:=lower(coalesce(v_message.body,''));
  v_context:=v_subject||' '||v_body||' '||lower(coalesce(v_motive.description,''))||' '||lower(coalesce(v_motive.hypothesis,''));

  update lms_simulations set status='running',started_at=now(),completed_at=null,model_name='synthetic-mind-engine-v3' where id=p_sim_id;
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
  ), features as (
    select s.*,
      case when v_subject ~ '(apple|three months|90.day|china|shenzhen|silicon valley|decision|future|client|next chapter|challenge)' then 14 else 0 end subject_specificity,
      case when length(v_subject) between 18 and 72 then 4 else -5 end subject_length,
      case when v_subject ~ '(newsletter|invitation|innovation tour|september 2026|join us|update)' then 12 else 0 end subject_generic_penalty,
      case when v_body ~ '(a senior|during a|i learned|i saw|told me|private briefing|conversation|meeting)' then 12 else 0 end story_bonus,
      case when v_body ~ '(three months|90.day|five years|[0-9]{1,3}%|since 20[0-9]{2}|\$[0-9]|€[0-9])' then 10 else 0 end evidence_bonus,
      case when v_body ~ '(apple|cupertino|silicon valley|shenzhen|flextronics|pvh|tommy hilfiger|calvin klein|ces|sxsw)' then 7 else 0 end specificity_bonus,
      case when v_body ~ '(why|because|which means|the implication|what changed|by the time|already|instead)' then 8 else 0 end information_gap_bonus,
      case when v_body ~ '(join us|gain insights|emerging technologies|future of leadership|business leaders|forefront of|innovation tour|learn more about the program|new business models)' then 18 else 0 end brochure_penalty,
      case when v_context ~ '(unlock|transform your life|game.?changer|revolutionary|world.?class|synergy|journey of transformation)' then 18 else 0 end hype_penalty,
      case when v_body ~ '(challenge|next chapter|there must be more|reinvent|unused potential|possibility)' then 1 else 0 end refugee_signal,
      case when v_body ~ '(strategy|board|decision|leadership|uncertainty|cadence|competitive)' then 1 else 0 end cxo_signal,
      case when v_body ~ '(client|advisor|consult|advice|perspective|recommendation)' then 1 else 0 end consultant_signal,
      case when v_body ~ '(september 28|october 2|five-day|5-day|ten participants|max 10|direct conversations|private|small group)' then 7 else 0 end concrete_offer_bonus,
      ((('x'||substr(md5(s.id::text||p_sim_id::text),1,4))::bit(16)::int%31)-15) jitter
    from sampled s
  ), funnel as (
    select f.*,
      greatest(0,least(100,round(9+email_attention*.17+curiosity*.08+subject_specificity+subject_length-subject_generic_penalty-skepticism*.08-case when seniority in('executive','senior_leadership','partner') then 7 else 2 end+jitter*.55)))::int attention,
      greatest(0,least(100,round(16+curiosity*.13+intellectual_stimulation_need*.11+story_response*.07+story_bonus+evidence_bonus*.45+information_gap_bonus-skepticism*.10-brochure_penalty-hype_penalty*(1-bullshit_tolerance/100.0)+jitter*.55)))::int read_pull,
      greatest(0,least(100,round(17+intellectual_stimulation_need*.13+experiential_learning_preference*.10+specificity_bonus+concrete_offer_bonus
        +case when audience_segment='corporate_refugee' and refugee_signal=1 then challenge_deficit*.18 else 0 end
        +case when audience_segment='cxo' and cxo_signal=1 then decision_authority*.11 else 0 end
        +case when audience_segment='consultant' and consultant_signal=1 then curiosity*.11 else 0 end-brochure_penalty*.65+jitter*.4)))::int relevance,
      greatest(0,least(100,round(26+evidence_bonus+specificity_bonus+story_bonus*.4+(100-skepticism)*.11-hype_penalty-brochure_penalty*.35+jitter*.25)))::int credibility,
      greatest(0,least(100,round(16+novelty_seeking*.18+curiosity*.09+story_bonus*.5+information_gap_bonus+specificity_bonus-brochure_penalty*.8-hype_penalty*.5+jitter*.4)))::int novelty,
      greatest(0,least(100,round(16+story_response*.16+emotional_messaging_response*.10+story_bonus*.5+case when audience_segment='corporate_refugee' and refugee_signal=1 then unused_potential_feeling*.18 else 0 end-brochure_penalty*.4+jitter*.3)))::int emotional
    from features f
  ), scored as (
    select q.*,(attention>=44) opened_flag,(attention>=44 and read_pull>=45) read_flag,
      greatest(0,least(100,round(attention*.15+read_pull*.18+relevance*.24+credibility*.18+novelty*.08+emotional*.06+willingness_to_travel*.04+discretionary_spending_power*.04-price_sensitivity*.06-approval_complexity*.04)))::int interest,
      greatest(0,least(100,round(12+willingness_to_travel*.13+discretionary_spending_power*.13+decision_authority*.07+concrete_offer_bonus-price_sensitivity*.15-approval_complexity*.11+jitter*.2)))::int action_readiness
    from funnel q
  ), activated as (
    select x.*,case
      when not opened_flag then 0 when not read_flag then 1 when relevance<38 then 2 when relevance<45 then 3 when interest<42 then 4 when interest<49 then 5 when interest<56 then 6
      when interest<64 or credibility<48 then 7 when interest<72 or action_readiness<55 then 8 when interest<80 or action_readiness<66 then 9 else 10 end::smallint activation
    from scored x
  )
  insert into lms_simulation_responses(simulation_id,person_id,response_class,activation_score,opened,read_enough,interest_score,credibility_score,relevance_score,novelty_score,emotional_resonance_score,primary_objection,secondary_objection,response_text,reasoning_summary)
  select p_sim_id,id,
    case when activation<=4 then 'ignore' when activation<=6 then 'read_only' when activation<=9 then 'tell_me_more' else 'sign_me_up' end,
    activation,opened_flag,read_flag,interest,credibility,relevance,novelty,emotional,
    case activation when 0 then 'The subject line did not earn an open' when 1 then 'Maybe interesting for someone else, but not worth my time' when 2 then 'Maybe interesting for someone I know' when 3 then 'Potentially relevant at a different stage in my life or career' when 4 then 'Potentially interesting sometime in the future' when 5 then 'I would need time to think about it' when 6 then 'I may want more information later, but not now' when 7 then 'Tell me more before I decide whether this deserves time' when 8 then 'This sounds genuinely interesting' when 9 then 'This is relevant enough to justify a conversation' else 'The value and timing are strong enough for me to commit' end,
    case when brochure_penalty>0 then 'The message sounds like familiar innovation marketing' when skepticism>78 then 'I need stronger proof and specificity' else null end,
    case activation when 0 then 'Not interesting.' when 1 then 'Maybe interesting for someone else.' when 2 then 'Maybe interesting for someone I know.' when 3 then 'Maybe interesting at a different stage in my life.' when 4 then 'Maybe interesting somewhere in the future.' when 5 then 'Let me think about it.' when 6 then 'Maybe I want more information in the future.' when 7 then 'Tell me more.' when 8 then 'Sounds interesting.' when 9 then 'Let''s talk.' else 'OK, I am in.' end,
    format('v3: activation %s/10; opened %s; read %s; attention %s, pull %s, relevance %s, credibility %s, interest %s, action %s.',activation,opened_flag,read_flag,attention,read_pull,relevance,credibility,interest,action_readiness)
  from activated;

  get diagnostics v_total=row_count;
  update lms_simulations set status='completed',completed_at=now(),model_name='synthetic-mind-engine-v3',sample_size=v_total where id=p_sim_id;
  return jsonb_build_object('simulation_id',p_sim_id,'responses',v_total,'engine','synthetic-mind-engine-v3');
exception when others then
  update lms_simulations set status='failed',completed_at=now() where id=p_sim_id;
  raise;
end;
$$;

revoke all on function public.lms_run_local_simulation(uuid) from public;
grant execute on function public.lms_run_local_simulation(uuid) to authenticated;

drop function if exists public.lms_simulation_summary(uuid);
create function public.lms_simulation_summary(p_sim_id uuid)
returns table(
  total_responses bigint,ignore_count bigint,read_only_count bigint,tell_me_more_count bigint,sign_me_up_count bigint,
  success_rate numeric,open_rate numeric,read_rate numeric,avg_activation numeric,
  level_0 bigint,level_1 bigint,level_2 bigint,level_3 bigint,level_4 bigint,level_5 bigint,level_6 bigint,level_7 bigint,level_8 bigint,level_9 bigint,level_10 bigint,
  avg_interest numeric,avg_credibility numeric,avg_relevance numeric,avg_novelty numeric,avg_emotional_resonance numeric
)
language plpgsql stable security definer set search_path=public
as $$
begin
  if not exists(select 1 from lms_simulations where id=p_sim_id and user_id=auth.uid()) then raise exception 'Access denied'; end if;
  return query select count(*),count(*)filter(where coalesce(activation_score,0)<=4),count(*)filter(where activation_score between 5 and 6),count(*)filter(where activation_score between 7 and 9),count(*)filter(where activation_score=10),
    round(100.0*count(*)filter(where activation_score>=7)/nullif(count(*),0),1),round(100.0*count(*)filter(where opened)/nullif(count(*),0),1),round(100.0*count(*)filter(where read_enough)/nullif(count(*),0),1),round(avg(activation_score),2),
    count(*)filter(where activation_score=0),count(*)filter(where activation_score=1),count(*)filter(where activation_score=2),count(*)filter(where activation_score=3),count(*)filter(where activation_score=4),count(*)filter(where activation_score=5),count(*)filter(where activation_score=6),count(*)filter(where activation_score=7),count(*)filter(where activation_score=8),count(*)filter(where activation_score=9),count(*)filter(where activation_score=10),
    round(avg(interest_score),1),round(avg(credibility_score),1),round(avg(relevance_score),1),round(avg(novelty_score),1),round(avg(emotional_resonance_score),1)
  from lms_simulation_responses where simulation_id=p_sim_id;
end;
$$;

revoke all on function public.lms_simulation_summary(uuid) from public;
grant execute on function public.lms_simulation_summary(uuid) to authenticated;
