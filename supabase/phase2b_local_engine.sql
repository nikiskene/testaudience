-- Lead Magnet Simulator Phase 2B
-- Synthetic Mind Engine v2: gated attention/action funnel.

create or replace function public.lms_run_local_simulation(p_sim_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sim public.lms_simulations%rowtype;
  v_message public.lms_messages%rowtype;
  v_offer public.lms_offers%rowtype;
  v_motive public.lms_motives%rowtype;
  v_body text;
  v_subject text;
  v_context text;
  v_total int := 0;
begin
  select * into v_sim from public.lms_simulations where id=p_sim_id;
  if not found then raise exception 'Simulation not found'; end if;
  if v_sim.user_id <> auth.uid() then raise exception 'Access denied'; end if;
  if v_sim.status not in ('ready_for_simulation','failed') then raise exception 'Simulation status % cannot be run',v_sim.status; end if;

  select * into v_message from public.lms_messages where id=v_sim.message_id;
  select * into v_offer from public.lms_offers where id=v_sim.offer_id;
  if v_message.motive_id is not null then select * into v_motive from public.lms_motives where id=v_message.motive_id; end if;

  v_subject:=lower(coalesce(v_message.subject_line,''));
  v_body:=lower(coalesce(v_message.body,''));
  v_context:=v_subject||' '||v_body||' '||lower(coalesce(v_motive.description,''))||' '||lower(coalesce(v_motive.hypothesis,''));

  update public.lms_simulations set status='running',started_at=now(),completed_at=null,model_name='synthetic-mind-engine-v2' where id=p_sim_id;
  delete from public.lms_simulation_responses where simulation_id=p_sim_id;

  with eligible as (
    select p.*,
      case when p.skepticism>=75 or p.bullshit_tolerance<=25 then 'hard' when p.skepticism<=40 then 'open' else 'balanced' end resistance_bucket
    from public.lms_people p
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
      ((('x'||substr(md5(s.id::text||p_sim_id::text),1,4))::bit(16)::int%25)-12) jitter
    from sampled s
  ), stages as (
    select f.*,
      greatest(0,least(100,round(
        18 + curiosity*.16 + novelty_seeking*.12 + story_response*.08 + story_bonus + evidence_bonus*.45 + information_gap_bonus
        - skepticism*.12 - brochure_penalty - hype_penalty*(1-bullshit_tolerance/100.0) + jitter
      )))::int attention,
      greatest(0,least(100,round(
        18 + intellectual_stimulation_need*.14 + experiential_learning_preference*.12 + specificity_bonus + concrete_offer_bonus
        + case when audience_segment='corporate_refugee' and refugee_signal=1 then challenge_deficit*.18 else 0 end
        + case when audience_segment='cxo' and cxo_signal=1 then decision_authority*.12 else 0 end
        + case when audience_segment='consultant' and consultant_signal=1 then curiosity*.12 else 0 end
        - brochure_penalty*.65 + jitter*.45
      )))::int relevance,
      greatest(0,least(100,round(
        28 + evidence_bonus + specificity_bonus + story_bonus*.45 + (100-skepticism)*.12 - hype_penalty - brochure_penalty*.35 + jitter*.3
      )))::int credibility,
      greatest(0,least(100,round(
        18 + novelty_seeking*.20 + curiosity*.10 + story_bonus*.5 + information_gap_bonus + specificity_bonus - brochure_penalty*.8 - hype_penalty*.5 + jitter*.5
      )))::int novelty,
      greatest(0,least(100,round(
        18 + story_response*.18 + emotional_messaging_response*.12 + story_bonus*.55
        + case when audience_segment='corporate_refugee' and refugee_signal=1 then unused_potential_feeling*.20 else 0 end
        - brochure_penalty*.4 + jitter*.4
      )))::int emotional
    from features f
  ), gated as (
    select g.*,
      greatest(0,least(100,round(
        attention*.24 + relevance*.25 + credibility*.19 + novelty*.10 + emotional*.07 + information_gap_bonus*.6
        + willingness_to_travel*.05 + discretionary_spending_power*.05 - price_sensitivity*.07 - approval_complexity*.05
      )))::int interest,
      greatest(0,least(100,round(
        16 + willingness_to_travel*.14 + discretionary_spending_power*.14 + decision_authority*.08 + concrete_offer_bonus
        - price_sensitivity*.16 - approval_complexity*.12 + jitter*.25
      )))::int action_readiness
    from stages g
  )
  insert into public.lms_simulation_responses(simulation_id,person_id,response_class,interest_score,credibility_score,relevance_score,novelty_score,emotional_resonance_score,primary_objection,secondary_objection,response_text,reasoning_summary)
  select p_sim_id,id,
    case
      when attention<43 then 'ignore'
      when relevance<45 or credibility<40 then 'read_only'
      when interest>=70 and action_readiness>=62 and attention>=62 and relevance>=62 and credibility>=58 and information_gap_bonus>0 then 'sign_me_up'
      when interest>=54 and attention>=50 and relevance>=50 and credibility>=45 and (information_gap_bonus>0 or story_bonus>0 or evidence_bonus>0) then 'tell_me_more'
      else 'read_only'
    end,
    interest,credibility,relevance,novelty,emotional,
    case
      when attention<43 then 'The message did not earn enough attention'
      when brochure_penalty>0 then 'This sounds too much like standard innovation-tour marketing'
      when relevance<45 then 'Not relevant enough to my current priorities'
      when credibility<40 then 'The claim is not sufficiently substantiated'
      when information_gap_bonus=0 then 'There is no strong unanswered question pulling me forward'
      when willingness_to_travel<45 then 'Travel and time commitment are a barrier'
      when price_sensitivity>75 then 'The value does not yet justify the likely cost'
      when approval_complexity>75 then 'Internal approval would be difficult'
      else 'Interesting, but there is not yet enough reason to act now' end,
    case when hype_penalty>0 and bullshit_tolerance<40 then 'The language feels over-sold' when skepticism>78 then 'I need more concrete evidence' else null end,
    case
      when attention<43 then 'I would probably skip this.'
      when interest>=70 and action_readiness>=62 and attention>=62 and relevance>=62 and credibility>=58 and information_gap_bonus>0 then 'This feels unusually relevant and credible. I would seriously consider joining; show me the details.'
      when interest>=54 and attention>=50 and relevance>=50 and credibility>=45 and (information_gap_bonus>0 or story_bonus>0 or evidence_bonus>0) then 'You have my attention. Tell me more.'
      else 'I might read it, but I would not respond.' end,
    format('v2 funnel: attention %s, relevance %s, credibility %s, novelty %s, resonance %s, action readiness %s; skepticism %s.',attention,relevance,credibility,novelty,emotional,action_readiness,skepticism)
  from gated;

  get diagnostics v_total=row_count;
  update public.lms_simulations set status='completed',completed_at=now(),model_name='synthetic-mind-engine-v2',sample_size=v_total where id=p_sim_id;
  return jsonb_build_object('simulation_id',p_sim_id,'responses',v_total,'engine','synthetic-mind-engine-v2');
exception when others then
  update public.lms_simulations set status='failed',completed_at=now() where id=p_sim_id;
  raise;
end;
$$;

revoke all on function public.lms_run_local_simulation(uuid) from public;
grant execute on function public.lms_run_local_simulation(uuid) to authenticated;
