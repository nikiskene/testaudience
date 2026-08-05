import { supabase } from './supabase';
import type { Filters, Mind } from './types';
export async function getMinds(page:number,filters:Filters){
 const from=(page-1)*100; let q=supabase.from('lms_people').select('id,first_name,last_name,audience_segment,job_title,country,industry,age,curiosity,challenge_deficit,agency_frustration,bullshit_tolerance',{count:'exact'});
 const s=filters.search.replace(/[,%()]/g,' ').trim(); if(s) q=q.or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%,country.ilike.%${s}%,city.ilike.%${s}%,job_title.ilike.%${s}%,biography.ilike.%${s}%`);
 if(filters.audience) q=q.eq('audience_segment',filters.audience); if(filters.country) q=q.eq('country',filters.country); if(filters.region) q=q.eq('global_region',filters.region); if(filters.industry) q=q.eq('industry',filters.industry); if(filters.power) q=q.eq('purchasing_power',filters.power); if(filters.ageMin) q=q.gte('age',Number(filters.ageMin)); if(filters.ageMax) q=q.lte('age',Number(filters.ageMax));
 const {data,error,count}=await q.order('last_name').range(from,from+99); if(error) throw error; return {rows:(data??[]) as Mind[],total:count??0};
}
export async function getMind(id:string){const {data,error}=await supabase.from('lms_people').select('*').eq('id',id).single();if(error)throw error;return data as Mind;}
export async function getStats(){const {data,error}=await supabase.rpc('lms_dashboard_stats').single();if(error)throw error;return data as Record<string,number>;}
export async function getOptions(column:'country'|'global_region'|'industry'){const {data,error}=await supabase.rpc('lms_distinct_values',{p_column:column});if(error)throw error;return (data??[]).map((x:{value:string})=>x.value);}
