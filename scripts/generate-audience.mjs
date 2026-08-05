import { createClient } from '@supabase/supabase-js';
import { faker } from '@faker-js/faker';
import 'dotenv/config';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
const supabase = createClient(URL, KEY, { auth: { persistSession: false } });

const TARGET = 100000;
const BATCH = 500;
const segments = ['cxo', 'consultant', 'corporate_refugee'];
const segmentCounts = { cxo: 33334, consultant: 33333, corporate_refugee: 33333 };

const markets = [
  ['Europe',38,['Germany','United Kingdom','Austria','Switzerland','France','Netherlands','Sweden','Denmark','Norway','Finland','Belgium','Ireland','Italy','Spain','Portugal']],
  ['North America',30,['United States','Canada']],
  ['Middle East',12,['United Arab Emirates','Saudi Arabia','Qatar','Israel','Bahrain','Kuwait','Oman']],
  ['Asia-Pacific',10,['Singapore','Japan','South Korea','Australia','New Zealand','Hong Kong','Taiwan']],
  ['Latin America',6,['Brazil','Mexico','Chile','Argentina','Uruguay','Costa Rica']],
  ['Africa',4,['South Africa','Kenya','Rwanda','Mauritius','Ghana']]
];

const industries = ['Technology','Financial Services','Industrial & Manufacturing','Professional Services','Healthcare','Consumer & Retail','Energy','Mobility','Media & Communications','Real Estate','Hospitality & Travel','Education','Life Sciences'];
const functions = ['Executive Management','Strategy','Innovation','Transformation','People & Culture','Operations','Commercial','Technology','Organizational Development'];
const tensions = {
  cxo:['Our strategy is moving slower than the environment around us.','I need better signals about what matters next.','My leadership team needs a shared view of the future.','AI is changing our assumptions faster than our planning cycle.','We are optimizing today while the category is being reinvented.'],
  consultant:['My clients increasingly know the same public information I do.','I need first-hand signals that improve the quality of my advice.','Traditional consulting frameworks are losing their shelf life.','Clients want answers while the underlying assumptions keep changing.','I need intellectual proximity to where new models are being built.'],
  corporate_refugee:['I have reached the level I worked toward and it no longer feels like enough.','I know how the corporate game works; I am no longer sure I want to keep playing it.','My experience is being consumed by processes that do not feel consequential.','I want a genuinely difficult new challenge, but I do not yet know what it is.','There must be more I can do with the next decade of my life.']
};
const aspirations = {
  cxo:['See around corners','Lead meaningful transformation','Make better strategic decisions','Build a future-ready organization'],
  consultant:['Become a more valuable advisor','Develop original perspective','Stay ahead of client questions','Build a differentiated practice'],
  corporate_refugee:['Find a worthy next chapter','Build something consequential','Use accumulated experience differently','Discover a challenge worth committing to']
};

function score(mean, spread=18){ return Math.max(0,Math.min(100,Math.round(faker.number.float({min:mean-spread,max:mean+spread})))); }
function weightedMarket(){ const x=faker.number.int({min:1,max:100}); let n=0; for(const m of markets){ n+=m[1]; if(x<=n)return m; } return markets[0]; }
function ageFor(s){ return s==='cxo'?faker.number.int({min:38,max:55}):s==='corporate_refugee'?faker.number.int({min:38,max:55}):faker.number.int({min:30,max:55}); }
function titleFor(s){ if(s==='cxo') return faker.helpers.arrayElement(['CEO','President','Managing Director','Chief Strategy Officer','Chief Innovation Officer','Chief People Officer','Chief Transformation Officer','EVP','SVP','Business Unit President']); if(s==='consultant') return faker.helpers.arrayElement(['Independent Consultant','Principal Consultant','Managing Partner','Partner','Senior Advisor','Strategy Consultant','Leadership Advisor','Innovation Consultant']); return faker.helpers.arrayElement(['SVP','Vice President','Managing Director','Senior Director','Partner','General Manager','Business Unit Leader','Regional President']); }
function persona(segment){
  const market=weightedMarket(); const country=faker.helpers.arrayElement(market[2]); const refugee=segment==='corporate_refugee'; const cxo=segment==='cxo';
  const first=faker.person.firstName(); const last=faker.person.lastName(); const age=ageFor(segment); const tension=faker.helpers.arrayElement(tensions[segment]); const aspiration=faker.helpers.arrayElement(aspirations[segment]);
  const hard=faker.datatype.boolean({probability:.13});
  return {
    first_name:first,last_name:last,gender:faker.helpers.arrayElement(['male','female']),age,country,city:faker.location.city(),global_region:market[0],
    purchasing_power:faker.helpers.weightedArrayElement([{value:'mid',weight:15},{value:'upper_mid',weight:35},{value:'high',weight:38},{value:'very_high',weight:12}]),audience_segment:segment,
    job_title:titleFor(segment),seniority:cxo?'executive':refugee?'senior_leadership':faker.helpers.arrayElement(['senior','principal','partner']),industry:faker.helpers.arrayElement(industries),functional_area:faker.helpers.arrayElement(functions),company_type:faker.helpers.arrayElement(['private','public','family_owned','professional_services','scaleup']),company_size:faker.helpers.arrayElement(['50-249','250-999','1000-4999','5000-19999','20000+']),annual_income_band:faker.helpers.arrayElement(['100k-149k','150k-249k','250k-499k','500k+']),
    decision_authority:score(cxo?85:refugee?70:65),budget_authority:score(cxo?82:refugee?62:58),innovation_responsibility:score(70),leadership_responsibility:score(cxo?88:75),international_exposure:score(78),
    curiosity:score(refugee?88:76),ambition:score(80),openness_to_change:score(refugee?82:70),risk_tolerance:score(refugee?67:58),skepticism:score(hard?90:refugee?80:65),novelty_seeking:score(72),status_sensitivity:score(52),evidence_need:score(refugee?80:70),fomo_sensitivity:score(38),uncertainty_tolerance:score(65),
    career_satisfaction:score(refugee?66:72),corporate_frustration:score(refugee?76:45),perceived_need_for_change:score(refugee?82:58),perceived_disruption_pressure:score(72),primary_tension:tension,secondary_tension:faker.helpers.arrayElement(tensions[segment]),aspiration,
    experiential_learning_preference:score(hard?42:75),networking_motivation:score(62),intellectual_stimulation_need:score(refugee?91:78),international_travel_frequency:faker.helpers.arrayElement(['occasional','quarterly','monthly','frequent']),willingness_to_travel:score(75),silicon_valley_exposure:faker.helpers.arrayElement(['none','media_only','visited','worked_with_ecosystem']),china_exposure:faker.helpers.arrayElement(['none','media_only','business_travel','substantial']),
    price_sensitivity:score(42),discretionary_spending_power:score(74),likely_payer:faker.helpers.arrayElement(cxo?['company','company','self','mixed']:refugee?['self','self','mixed']:['self','client','company','mixed']),approval_complexity:score(cxo?55:refugee?20:35),typical_decision_speed:score(62),
    email_attention:score(58),long_form_tolerance:score(54),emotional_messaging_response:score(45),rational_messaging_response:score(75),provocative_messaging_response:score(66),story_response:score(68),
    biography:`${first} is a ${age}-year-old ${titleFor(segment)} in ${country}. ${tension} ${aspiration} is increasingly important.`,generation_version:'v1',
    challenge_deficit:score(refugee?84:48),agency_frustration:score(refugee?80:42),unused_potential_feeling:score(refugee?86:50),reinvention_readiness:score(refugee?67:40),direction_clarity:score(refugee?28:65),bullshit_tolerance:score(refugee?15:30),professional_confidence:score(refugee?88:78),perceived_options:score(refugee?57:64)
  };
}

let generated=0;
for(const segment of segments){
  let remaining=segmentCounts[segment];
  while(remaining>0){
    const n=Math.min(BATCH,remaining); const rows=Array.from({length:n},()=>persona(segment));
    const { error }=await supabase.from('lms_people').insert(rows);
    if(error) throw error;
    generated+=n; remaining-=n; console.log(`${generated}/${TARGET} generated`);
  }
}
console.log(`Done: ${generated} synthetic people.`);
