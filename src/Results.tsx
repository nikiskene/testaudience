import{useEffect,useState}from'react';
import{getSimulationSummary,listSimulations}from'./phase2Api';
import type{Simulation,SimulationSummary}from'./types';

const labels=['Not interesting','For someone else','For someone I know','Different life stage','Future interest','Let me think','Maybe info later','Tell me more','Sounds interesting','Let’s talk','OK, I am in'];

export default function Results(){
  const[sims,setSims]=useState<Simulation[]>([]),[selected,setSelected]=useState(''),[summary,setSummary]=useState<SimulationSummary|null>(null),[error,setError]=useState('');
  useEffect(()=>{listSimulations().then(x=>{setSims(x);setSelected(x[0]?.id??'')}).catch(e=>setError(e.message))},[]);
  useEffect(()=>{if(!selected){setSummary(null);return}getSimulationSummary(selected).then(setSummary).catch(e=>setError(e.message))},[selected]);
  const total=summary?.total_responses??0;
  const pct=(n:number)=>total?Math.round(n/total*1000)/10:0;
  return <><div className="page-head"><div><h1>Results</h1><p>Activation 7–10 is success. Everything below 7 is a loss.</p></div><select value={selected} onChange={e=>setSelected(e.target.value)}>{sims.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
    {error&&<div className="error">{error}</div>}
    {!selected?<div className="empty">No simulations yet.</div>:!summary?<div className="empty">Loading…</div>:total===0?<div className="empty">This simulation has no responses yet.</div>:<>
      <div className="cards result-cards"><Metric label="Audience tested" value={total}/><Metric label="Open rate" value={`${summary.open_rate}%`}/><Metric label="Read rate" value={`${summary.read_rate}%`}/><Metric label="Avg activation" value={`${summary.avg_activation}/10`}/><Metric label="Activation rate 7–10" value={`${summary.success_rate}%`}/></div>
      <div className="card activation-table">{labels.map((label,i)=>{const n=summary[`level_${i}` as keyof SimulationSummary] as number;return <div className={i>=7?'activation-row success-level':'activation-row'} key={i}><b>{i}</b><span className="activation-label">{label}</span><div className="activation-bar"><i style={{width:`${pct(n)}%`}}/></div><strong className="activation-pct">{pct(n)}%</strong></div>})}</div>
      <div className="cards"><Metric label="Interest" value={summary.avg_interest}/><Metric label="Credibility" value={summary.avg_credibility}/><Metric label="Relevance" value={summary.avg_relevance}/><Metric label="Novelty" value={summary.avg_novelty}/><Metric label="Emotional resonance" value={summary.avg_emotional_resonance}/></div>
    </>}
  </>;
}
function Metric({label,value}:{label:string;value:string|number}){return <div className="card"><span>{label}</span><strong>{value}</strong></div>}
