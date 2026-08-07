-- Lead Magnet Simulator Phase 2B
-- Zero-API Synthetic Mind Engine. Run once in Supabase SQL Editor.

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
  v_text text;
  v_total int := 0;
begin
  select * into v_sim from public.lms_simulations where id = p_sim_id;
  if not found then raise exception 'Simulation not found'; end if;
  if v_sim.user_id <> auth.uid() then raise exception 'Access denied'; end if;

  if v_sim.status not in ('ready_for_simulation','failed') then
    raise exception 'Simulation status % cannot be run', v_sim.status;
  end if;

  select * into v_message from public.lms_messages where id = v_sim.message_id;
  select * into v_offer from public.lms_offers where id = v_sim.offer_id;
  if v_message.motive_id is not null then
    select * into v_motive from public.lms_motives where id = v_message.motive_id;
  end if;

  v_text := lower(coalesce(v_message.subject_line,'') || ' ' || coalesce(v_message.body,'') || ' ' || coalesce(v_motive.description,'') || ' ' || coalesce(v_motive.hypothesis,''));

  update public.lms_simulations
  set status='running', started_at=now(), model_name='synthetic-mind-engine-v1'
  where id=p_sim_id;

  delete from public.lms_simulation_responses where simulation_id=p_sim_id;

  with eligible as (
    select p.*,
      case when p.skepticism >= 75 or p.bullshit_tolerance <= 25 then 'hard'
           when p.skepticism <= 40 then 'open' else 'balanced' end as resistance_bucket
    from public.lms_people p
    where (coalesce(v_sim.audience_filter->>'audience','')='' or p.audience_segment=v_sim.audience_filter->>'audience')
      and (coalesce(v_sim.audience_filter->>'country','')='' or p.country=v_sim.audience_filter->>'country')
      and (coalesce(v_sim.audience_filter->>'region','')='' or p.global_region=v_sim.audience_filter->>'region')
      and (coalesce(v_sim.audience_filter->>'industry','')='' or p.industry=v_sim.audience_filter->>'industry')
      and (coalesce(v_sim.audience_filter->>'power','')='' or p.purchasing_power=v_sim.audience_filter->>'power')
      and (coalesce(v_sim.audience_filter->>'ageMin','')='' or p.age >= (v_sim.audience_filter->>'ageMin')::int)
      and (coalesce(v_sim.audience_filter->>'ageMax','')='' or p.age <= (v_sim.audience_filter->>'ageMax')::int)
  ),
  strata as (
    select e.*,
      count(*) over() as total_n,
      count(*) over(partition by audience_segment,global_region,resistance_bucket) as stratum_n,
      row_number() over(partition by audience_segment,global_region,resistance_bucket order by md5(e.id::text||p_sim_id::text)) as rn
    from eligible e
  ),
  sampled as (
    select * from strata
    where v_sim.sample_size >= total_n
       or rn <= greatest(1,round(v_sim.sample_size::numeric*stratum_n/total_n)::int)
    order by md5(id::text||p_sim_id::text)
    limit v_sim.sample_size
  ),
  features as (
    select s.*,
      (case when v_text ~ '(apple|cupertino|silicon valley|shenzhen|china|ces|sxsw)' then 12 else 0 end) as specificity_bonus,
      (case when v_text ~ '([0-9]{1,3}%|three months|90.day|since 20|\$|€)' then 10 else 0 end) as evidence_bonus,
      (case when v_text ~ '(unlock|transform your life|game.?changer|revolutionary|world.?class|synergy|journey of transformation)' then 14 else 0 end) as hype_penalty,
      (case when v_text ~ '(challenge|next chapter|there must be more|reinvent|possibility)' then 1 else 0 end) as refugee_signal,
      (case when v_text ~ '(strategy|board|decision|leadership|future|disruption)' then 1 else 0 end) as cxo_signal,
      (case when v_text ~ '(client|advisor|consult|framework|advice|perspective)' then 1 else 0 end) as consultant_signal,
      ((('x'||substr(md5(s.id::text||p_sim_id::text),1,4))::bit(16)::int % 17)-8) as jitter
    from sampled s
  ),
  scored as (
    select f.*,
      greatest(0,least(100, round(
        35 + curiosity*.18 + intellectual_stimulation_need*.18 + experiential_learning_preference*.12
        + specificity_bonus + evidence_bonus*.4 - hype_penalty*(1-bullshit_tolerance/100.0)
        + case when audience_segment='corporate_refugee' and refugee_signal=1 then challenge_deficit*.18 else 0 end
        + case when audience_segment='cxo' and cxo_signal=1 then decision_authority*.12 else 0 end
        + case when audience_segment='consultant' and consultant_signal=1 then curiosity*.12 else 0 end
        + jitter
      )))::int as relevance,
      greatest(0,least(100, round(45 + evidence_bonus + specificity_bonus*.5 + (100-skepticism)*.18 - hype_penalty + jitter*.3)))::int as credibility,
      greatest(0,least(100, round(30 + novelty_seeking*.35 + curiosity*.2 + specificity_bonus - hype_penalty*.5 + jitter)))::int as novelty,
      greatest(0,least(100, round(25 + story_response*.28 + emotional_messaging_response*.18 + case when audience_segment='corporate_refugee' and refugee_signal=1 then unused_potential_feeling*.25 else 0 end + jitter)))::int as emotional
    from features f
  ),
  final as (
    select q.*,
      greatest(0,least(100,round(
        relevance*.34 + credibility*.23 + novelty*.14 + emotional*.12
        + willingness_to_travel*.07 + discretionary_spending_power*.08
        - price_sensitivity*.08 - approval_complexity*.04
      )))::int as interest
    from scored q
  )
  insert into public.lms_simulation_responses(
    simulation_id,person_id,response_class,interest_score,credibility_score,relevance_score,novelty_score,
    emotional_resonance_score,primary_objection,secondary_objection,response_text,reasoning_summary
  )
  select p_sim_id,id,
    case when interest>=78 and credibility>=58 and relevance>=65 then 'sign_me_up'
         when interest>=61 and relevance>=55 then 'tell_me_more'
         when interest>=42 then 'read_only' else 'ignore' end,
    interest,credibility,relevance,novelty,emotional,
    case when relevance<50 then 'Not relevant enough to my current priorities'
         when credibility<50 then 'I am not sufficiently convinced by the claim'
         when price_sensitivity>75 then 'The value does not yet justify the likely cost'
         when willingness_to_travel<45 then 'Travel/time commitment is a barrier'
         when approval_complexity>75 then 'Internal approval would be difficult'
         when skepticism>78 then 'I need something more specific and less promotional'
         else 'I need a clearer reason to act now' end,
    case when hype_penalty>0 and bullshit_tolerance<35 then 'The language feels generic or over-sold' else null end,
    case when interest>=78 and credibility>=58 and relevance>=65 then 'This is relevant enough that I would consider committing. Show me the concrete details.'
         when interest>=61 and relevance>=55 then 'Interesting. Tell me more, especially what makes this different from information I can get elsewhere.'
         when interest>=42 then 'I would read this, but I am not ready to take an action.'
         else 'This would not earn my attention right now.' end,
    format('Local model: relevance %s, credibility %s, novelty %s, resonance %s; profile skepticism %s, curiosity %s.',relevance,credibility,novelty,emotional,skepticism,curiosity)
  from final;

  get diagnostics v_total = row_count;

  update public.lms_simulations
  set status='completed', completed_at=now(), model_name='synthetic-mind-engine-v1', sample_size=v_total
  where id=p_sim_id;

  return jsonb_build_object('simulation_id',p_sim_id,'responses',v_total,'engine','synthetic-mind-engine-v1');
exception when others then
  update public.lms_simulations set status='failed', completed_at=now() where id=p_sim_id;
  raise;
end;
$$;

revoke all on function public.lms_run_local_simulation(uuid) from public;
grant execute on function public.lms_run_local_simulation(uuid) to authenticated;
