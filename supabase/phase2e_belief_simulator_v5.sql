-- TestAudience V5: belief -> offer -> copy -> behaviour.
-- Safe to run repeatedly. Existing rows and V4 activation data are preserved.

alter table public.lms_motives
  add column if not exists current_belief text not null default '',
  add column if not exists desired_belief text not null default '',
  add column if not exists core_insight text not null default '',
  add column if not exists evidence text[] not null default '{}',
  add column if not exists validation_status text not null default 'untested',
  add column if not exists audience_fit smallint check(audience_fit between 0 and 100),
  add column if not exists current_belief_alignment smallint check(current_belief_alignment between 0 and 100),
  add column if not exists insight_novelty smallint check(insight_novelty between 0 and 100),
  add column if not exists perceived_truth smallint check(perceived_truth between 0 and 100),
  add column if not exists worldview_shift smallint check(worldview_shift between 0 and 100),
  add column if not exists identity_compatibility smallint check(identity_compatibility between 0 and 100),
  add column if not exists evidence_strength smallint check(evidence_strength between 0 and 100),
  add column if not exists analysis_summary text not null default '',
  add column if not exists recommendation text not null default '',
  add column if not exists analysis_source text,
  add column if not exists model_name text;

update public.lms_motives
set current_belief=coalesce(nullif(current_belief,''),hypothesis,''),
    desired_belief=coalesce(desired_belief,''),core_insight=coalesce(core_insight,''),evidence=coalesce(evidence,'{}')
where current_belief='' or current_belief is null;

alter table public.lms_offers
  add column if not exists urgency text not null default '',
  add column if not exists cta text not null default '';

alter table public.lms_messages
  add column if not exists ps text not null default '';

alter table public.lms_message_semantics
  add column if not exists current_belief_alignment smallint not null default 0 check(current_belief_alignment between 0 and 100),
  add column if not exists insight_novelty smallint not null default 0 check(insight_novelty between 0 and 100),
  add column if not exists perceived_truth smallint not null default 0 check(perceived_truth between 0 and 100),
  add column if not exists worldview_shift smallint not null default 0 check(worldview_shift between 0 and 100),
  add column if not exists identity_compatibility smallint not null default 0 check(identity_compatibility between 0 and 100),
  add column if not exists evidence_strength smallint not null default 0 check(evidence_strength between 0 and 100),
  add column if not exists offer_clarity smallint not null default 0 check(offer_clarity between 0 and 100),
  add column if not exists offer_fit smallint not null default 0 check(offer_fit between 0 and 100),
  add column if not exists offer_desirability smallint not null default 0 check(offer_desirability between 0 and 100),
  add column if not exists offer_credibility smallint not null default 0 check(offer_credibility between 0 and 100),
  add column if not exists offer_urgency smallint not null default 0 check(offer_urgency between 0 and 100),
  add column if not exists offer_risk smallint not null default 0 check(offer_risk between 0 and 100),
  add column if not exists offer_roi smallint not null default 0 check(offer_roi between 0 and 100),
  add column if not exists copy_subject smallint not null default 0 check(copy_subject between 0 and 100),
  add column if not exists hook_strength smallint not null default 0 check(hook_strength between 0 and 100),
  add column if not exists readability smallint not null default 0 check(readability between 0 and 100),
  add column if not exists authenticity smallint not null default 0 check(authenticity between 0 and 100),
  add column if not exists story_flow smallint not null default 0 check(story_flow between 0 and 100),
  add column if not exists diagnosis text not null default '';

alter table public.lms_simulation_responses
  add column if not exists belief_shift smallint not null default 0 check(belief_shift between 0 and 100),
  add column if not exists trust_score smallint not null default 0 check(trust_score between 0 and 100),
  add column if not exists self_recognition smallint not null default 0 check(self_recognition between 0 and 100),
  add column if not exists offer_fit smallint not null default 0 check(offer_fit between 0 and 100),
  add column if not exists purchase_intent smallint not null default 0 check(purchase_intent between 0 and 100),
  add column if not exists referral_intent smallint not null default 0 check(referral_intent between 0 and 100),
  add column if not exists behavior text not null default 'ignore',
  add column if not exists current_belief text not null default '',
  add column if not exists belief_after text not null default '',
  add column if not exists recommendation text not null default '';

create or replace function public.lms_run_local_simulation(p_sim_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_sim public.lms_simulations%rowtype;
  v_message public.lms_messages%rowtype;
  v_motive public.lms_motives%rowtype;
  v_sem public.lms_message_semantics%rowtype;
  v_has_v5 boolean:=false;
  v_total int:=0;
begin
  select * into v_sim from lms_simulations where id=p_sim_id;
  if not found then raise exception 'Simulation not found'; end if;
  if v_sim.user_id<>auth.uid() then raise exception 'Access denied'; end if;
  if v_sim.status not in('ready_for_simulation','failed') then raise exception 'Simulation status % cannot be run',v_sim.status; end if;
  select * into v_message from lms_messages where id=v_sim.message_id;
  if v_message.motive_id is not null then select * into v_motive from lms_motives where id=v_message.motive_id; end if;
  select * into v_sem from lms_message_semantics where message_id=v_sim.message_id;
  if not found then raise exception 'Message has no assessment. Analyze it in Message Lab first.'; end if;
  v_has_v5:=(v_sem.current_belief_alignment+v_sem.insight_novelty+v_sem.perceived_truth+v_sem.offer_fit+v_sem.copy_subject)>0;

  update lms_simulations set status='running',started_at=now(),completed_at=null,model_name='belief-simulator-v5' where id=p_sim_id;
  delete from lms_simulation_responses where simulation_id=p_sim_id;

  with eligible as (
    select p.*,case when p.skepticism>=75 or p.bullshit_tolerance<=25 then 'hard' when p.skepticism<=40 then 'open' else 'balanced' end resistance_bucket
    from lms_people p where
      (coalesce(v_sim.audience_filter->>'audience','')='' or p.audience_segment=v_sim.audience_filter->>'audience') and
      (coalesce(v_sim.audience_filter->>'country','')='' or p.country=v_sim.audience_filter->>'country') and
      (coalesce(v_sim.audience_filter->>'region','')='' or p.global_region=v_sim.audience_filter->>'region') and
      (coalesce(v_sim.audience_filter->>'industry','')='' or p.industry=v_sim.audience_filter->>'industry') and
      (coalesce(v_sim.audience_filter->>'power','')='' or p.purchasing_power=v_sim.audience_filter->>'power') and
      (coalesce(v_sim.audience_filter->>'ageMin','')='' or p.age>=(v_sim.audience_filter->>'ageMin')::int) and
      (coalesce(v_sim.audience_filter->>'ageMax','')='' or p.age<=(v_sim.audience_filter->>'ageMax')::int)
  ), strata as (
    select e.*,count(*)over() total_n,count(*)over(partition by audience_segment,global_region,resistance_bucket) stratum_n,
      row_number()over(partition by audience_segment,global_region,resistance_bucket order by md5(e.id::text||p_sim_id::text)) rn from eligible e
  ), sampled as (
    select * from strata where v_sim.sample_size>=total_n or rn<=greatest(1,round(v_sim.sample_size::numeric*stratum_n/total_n)::int)
    order by md5(id::text||p_sim_id::text) limit v_sim.sample_size
  ), person_stage as (
    select s.*,
      ((('x'||substr(md5(s.id::text||v_sim.message_id::text),1,4))::bit(16)::int%31)-15) jitter,
      ((('x'||substr(md5(s.id::text||v_sim.message_id::text||':read'),1,4))::bit(16)::int%31)-15) read_jitter,
      case when v_has_v5 then v_sem.current_belief_alignment else 50 end belief_alignment,
      case when v_has_v5 then v_sem.insight_novelty else v_sem.novelty end belief_novelty,
      case when v_has_v5 then v_sem.perceived_truth else v_sem.credibility end truth,
      case when v_has_v5 then v_sem.worldview_shift else 50 end shift_potential,
      case when v_has_v5 then v_sem.identity_compatibility else v_sem.identity_relevance end identity_fit,
      case when v_has_v5 then v_sem.evidence_strength else v_sem.credibility end evidence_score,
      case when v_has_v5 then v_sem.offer_fit else v_sem.personal_relevance end semantic_offer_fit,
      case when v_has_v5 then v_sem.offer_credibility else v_sem.credibility end offer_trust,
      case when v_has_v5 then v_sem.offer_roi else v_sem.usefulness end roi_score,
      case when v_has_v5 then v_sem.offer_risk else 100-v_sem.risk_reduction end risk_score,
      case when v_has_v5 then v_sem.copy_subject else v_sem.subject_open_pull end subject_score
    from sampled s
  ), belief_stage as (
    select p.*,
      greatest(0,least(100,round(belief_alignment*.55+v_sem.personal_relevance*.20+case when audience_segment='corporate_refugee' then challenge_deficit*.15 else perceived_need_for_change*.15 end+identity_fit*.10+jitter*.25)))::int self_score,
      greatest(0,least(100,round(shift_potential*.27+truth*.21+belief_novelty*.15+identity_fit*.14+evidence_score*.13+curiosity*.10-skepticism*.08+jitter*.25)))::int shift_score
    from person_stage p
  ), offer_stage as (
    select b.*,
      greatest(0,least(100,round(truth*.30+evidence_score*.25+offer_trust*.20+v_sem.credibility*.12+(100-skepticism)*.13+jitter*.18)))::int trust_value,
      greatest(0,least(100,round(semantic_offer_fit*.38+v_sem.offer_desirability*.14+v_sem.personal_relevance*.14+self_score*.12+willingness_to_travel*.08+discretionary_spending_power*.08-price_sensitivity*.06+jitter*.20)))::int offer_value
    from belief_stage b
  ), behaviour_stage as (
    select o.*,
      greatest(0,least(100,round(subject_score*.34+email_attention*.24+v_sem.curiosity_gap*.12+curiosity*.08-v_sem.sales_smell*.10-skepticism*.06+jitter*.35)))::int attention,
      greatest(0,least(100,round(v_sem.hook_strength*.18+v_sem.readability*.16+v_sem.narrative_pull*.16+v_sem.usefulness*.14+curiosity*.12+story_response*.10-v_sem.sales_smell*.10-skepticism*.05+read_jitter*.40)))::int read_pull,
      greatest(0,least(100,round(shift_score*.18+trust_value*.22+offer_value*.25+roi_score*.15+v_sem.cta_strength*.08+discretionary_spending_power*.08-risk_score*.10-price_sensitivity*.08-approval_complexity*.05+jitter*.18)))::int buy_score,
      greatest(0,least(100,round(shift_score*.27+belief_novelty*.20+trust_value*.20+v_sem.social_proof*.10+networking_motivation*.13+self_score*.10+jitter*.20)))::int refer_score
    from offer_stage o
  ), scored as (
    select z.*,(attention>=44) opened_flag,(attention>=44 and read_pull>=52) read_flag,
      greatest(0,least(100,round(shift_score*.20+trust_value*.18+offer_value*.22+read_pull*.12+self_score*.12+buy_score*.16)))::int interest,
      greatest(0,least(100,round(trust_value*.60+offer_trust*.25+v_sem.specificity*.15)))::int credibility_score
    from behaviour_stage z
  ), activated as (
    select x.*,case when not opened_flag then 0 when not read_flag then 1 when self_score<38 then 2 when shift_score<45 then 3 when interest<42 then 4 when interest<49 then 5 when interest<56 then 6 when interest<64 or credibility_score<48 then 7 when interest<72 or buy_score<55 then 8 when interest<80 or buy_score<66 then 9 else 10 end::smallint activation
    from scored x
  ), final as (
    select a.*,case when not opened_flag then 'ignore' when buy_score>=75 then 'purchase' when buy_score>=62 then 'book_call' when refer_score>=65 then 'forward' when shift_score>=55 then 'save' when activation>=7 then 'tell_me_more' else 'ignore' end behaviour_value
    from activated a
  )
  insert into lms_simulation_responses(simulation_id,person_id,response_class,activation_score,opened,read_enough,interest_score,credibility_score,relevance_score,novelty_score,emotional_resonance_score,primary_objection,secondary_objection,response_text,reasoning_summary,belief_shift,trust_score,self_recognition,offer_fit,purchase_intent,referral_intent,behavior,current_belief,belief_after,recommendation)
  select p_sim_id,id,case when activation<=4 then 'ignore' when activation<=6 then 'read_only' when activation<=9 then 'tell_me_more' else 'sign_me_up' end,
    activation,opened_flag,read_flag,interest,credibility_score,self_score,belief_novelty,v_sem.emotional_resonance,
    case when self_score<40 then 'The assumed motive does not feel like my problem' when evidence_score<45 then 'The insight is not sufficiently supported' when offer_value<45 then 'The offer does not logically follow' when v_sem.readability<45 then 'The message makes the idea difficult to follow' else 'The proposition needs more conviction' end,
    case when trust_value<45 then 'I do not trust the evidence enough' when risk_score>65 then 'The perceived risk is too high' else null end,
    case behaviour_value when 'ignore' then 'Not relevant enough.' when 'save' then 'I want to keep this.' when 'forward' then 'Someone I know should see this.' when 'tell_me_more' then 'Tell me more.' when 'book_call' then 'I would discuss this.' else 'I would buy this.' end,
    format('v5: belief %s, trust %s, offer %s, purchase %s, referral %s, activation %s.',shift_score,trust_value,offer_value,buy_score,refer_score,activation),
    shift_score,trust_value,self_score,offer_value,buy_score,refer_score,behaviour_value,coalesce(v_motive.current_belief,''),
    case when shift_score>=60 then coalesce(nullif(v_motive.desired_belief,''),v_motive.current_belief,'') else coalesce(v_motive.current_belief,'') end,
    case when self_score<45 then 'Revisit the hypothesis' when evidence_score<50 then 'Strengthen the evidence' when offer_value<50 then 'Redesign the offer' when read_pull<52 then 'Improve the copy' else 'Reduce action friction' end
  from final;

  get diagnostics v_total=row_count;
  update lms_simulations set status='completed',completed_at=now(),model_name='belief-simulator-v5',sample_size=v_total where id=p_sim_id;
  return jsonb_build_object('simulation_id',p_sim_id,'responses',v_total,'engine','belief-simulator-v5');
exception when others then update lms_simulations set status='failed',completed_at=now() where id=p_sim_id;raise;
end;$$;

revoke all on function public.lms_run_local_simulation(uuid) from public;
grant execute on function public.lms_run_local_simulation(uuid) to authenticated;

drop function if exists public.lms_simulation_summary(uuid);
create function public.lms_simulation_summary(p_sim_id uuid)
returns table(
  total_responses bigint,ignore_count bigint,read_only_count bigint,tell_me_more_count bigint,sign_me_up_count bigint,
  success_rate numeric,open_rate numeric,read_rate numeric,avg_activation numeric,
  level_0 bigint,level_1 bigint,level_2 bigint,level_3 bigint,level_4 bigint,level_5 bigint,level_6 bigint,level_7 bigint,level_8 bigint,level_9 bigint,level_10 bigint,
  avg_interest numeric,avg_credibility numeric,avg_relevance numeric,avg_novelty numeric,avg_emotional_resonance numeric,
  avg_belief_shift numeric,avg_trust numeric,avg_self_recognition numeric,avg_offer_fit numeric,avg_purchase_intent numeric,avg_referral_intent numeric,
  save_rate numeric,forward_rate numeric,book_rate numeric,purchase_rate numeric
) language plpgsql stable security definer set search_path=public as $$
begin
  if not exists(select 1 from lms_simulations where id=p_sim_id and user_id=auth.uid()) then raise exception 'Access denied';end if;
  return query select count(*),count(*)filter(where coalesce(activation_score,0)<=4),count(*)filter(where activation_score between 5 and 6),count(*)filter(where activation_score between 7 and 9),count(*)filter(where activation_score=10),
    round(100.0*count(*)filter(where activation_score>=7)/nullif(count(*),0),1),round(100.0*count(*)filter(where opened)/nullif(count(*),0),1),round(100.0*count(*)filter(where read_enough)/nullif(count(*),0),1),round(avg(activation_score),2),
    count(*)filter(where activation_score=0),count(*)filter(where activation_score=1),count(*)filter(where activation_score=2),count(*)filter(where activation_score=3),count(*)filter(where activation_score=4),count(*)filter(where activation_score=5),count(*)filter(where activation_score=6),count(*)filter(where activation_score=7),count(*)filter(where activation_score=8),count(*)filter(where activation_score=9),count(*)filter(where activation_score=10),
    round(avg(interest_score),1),round(avg(credibility_score),1),round(avg(relevance_score),1),round(avg(novelty_score),1),round(avg(emotional_resonance_score),1),round(avg(belief_shift),1),round(avg(trust_score),1),round(avg(self_recognition),1),round(avg(offer_fit),1),round(avg(purchase_intent),1),round(avg(referral_intent),1),
    round(100.0*count(*)filter(where behavior='save')/nullif(count(*),0),1),round(100.0*count(*)filter(where behavior='forward')/nullif(count(*),0),1),round(100.0*count(*)filter(where behavior='book_call')/nullif(count(*),0),1),round(100.0*count(*)filter(where behavior='purchase')/nullif(count(*),0),1)
  from lms_simulation_responses where simulation_id=p_sim_id;
end;$$;

revoke all on function public.lms_simulation_summary(uuid) from public;
grant execute on function public.lms_simulation_summary(uuid) to authenticated;
