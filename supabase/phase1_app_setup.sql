-- Run once in Supabase SQL Editor before using the web app.
alter table public.lms_people enable row level security;
drop policy if exists "lms authenticated read people" on public.lms_people;
create policy "lms authenticated read people" on public.lms_people for select to authenticated using (true);
create or replace function public.lms_dashboard_stats() returns table(total_minds bigint,countries bigint,industries bigint,avg_curiosity numeric,avg_skepticism numeric,high_power_share numeric) language sql stable security definer set search_path=public as $$ select count(*),count(distinct country),count(distinct industry),avg(curiosity),avg(skepticism),100.0*count(*) filter(where purchasing_power in('high','very_high'))/nullif(count(*),0) from public.lms_people $$;
revoke all on function public.lms_dashboard_stats() from public; grant execute on function public.lms_dashboard_stats() to authenticated;
create or replace function public.lms_distinct_values(p_column text) returns table(value text) language plpgsql stable security definer set search_path=public as $$ begin if p_column not in('country','global_region','industry') then raise exception 'Unsupported column'; end if; return query execute format('select distinct %I::text from public.lms_people where %I is not null order by 1',p_column,p_column); end; $$;
revoke all on function public.lms_distinct_values(text) from public; grant execute on function public.lms_distinct_values(text) to authenticated;
