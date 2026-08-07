import { supabase } from './supabase';
import type { Filters, Message, Motive, Offer, Simulation, SimulationSummary } from './types';

export async function listOffers(){const{data,error}=await supabase.from('lms_offers').select('*').order('created_at');if(error)throw error;return(data??[])as Offer[]}
export async function listMotives(){const{data,error}=await supabase.from('lms_motives').select('*').order('created_at');if(error)throw error;return(data??[])as Motive[]}
export async function listMessages(){const{data,error}=await supabase.from('lms_messages').select('*').order('created_at',{ascending:false});if(error)throw error;return(data??[])as Message[]}
export async function listSimulations(){const{data,error}=await supabase.from('lms_simulations').select('*').order('created_at',{ascending:false});if(error)throw error;return(data??[])as Simulation[]}

export async function saveOffer(row:Partial<Offer>){const payload={...row,target_segments:row.target_segments??[]};const q=row.id?supabase.from('lms_offers').update(payload).eq('id',row.id):supabase.from('lms_offers').insert(payload);const{error}=await q;if(error)throw error}
export async function saveMotive(row:Partial<Motive>){const payload={...row,target_segments:row.target_segments??[]};const q=row.id?supabase.from('lms_motives').update(payload).eq('id',row.id):supabase.from('lms_motives').insert(payload);const{error}=await q;if(error)throw error}
export async function archive(table:'lms_offers'|'lms_motives',id:string){const{error}=await supabase.from(table).update({status:'archived'}).eq('id',id);if(error)throw error}

export async function saveMessage(row:{offer_id:string;motive_id:string|null;name:string;subject_line:string;body:string;parent_message_id?:string|null;version_number?:number}){const{data,error}=await supabase.from('lms_messages').insert({...row,version_number:row.version_number??1,parent_message_id:row.parent_message_id??null}).select('*').single();if(error)throw error;return data as Message}
export async function createRevision(message:Message){return saveMessage({offer_id:message.offer_id,motive_id:message.motive_id,name:message.name,subject_line:message.subject_line,body:message.body,parent_message_id:message.parent_message_id??message.id,version_number:message.version_number+1})}

export async function audienceCount(filters:Filters){const{data,error}=await supabase.rpc('lms_audience_count',{p_filters:{audience:filters.audience||null,country:filters.country||null,region:filters.region||null,industry:filters.industry||null,purchasing_power:filters.power||null,ageMin:filters.ageMin||null,ageMax:filters.ageMax||null}});if(error)throw error;return Number(data??0)}
export async function createSimulation(row:{message_id:string;offer_id:string;name:string;filters:Filters;audience_size:number;sample_size:number}){const{data,error}=await supabase.from('lms_simulations').insert({message_id:row.message_id,offer_id:row.offer_id,name:row.name,audience_filter:row.filters,audience_size:row.audience_size,sample_size:row.sample_size,status:'ready_for_simulation'}).select('*').single();if(error)throw error;return data as Simulation}
export async function getSimulationSummary(id:string){const{data,error}=await supabase.rpc('lms_simulation_summary',{p_sim_id:id}).single();if(error)throw error;return data as SimulationSummary}
