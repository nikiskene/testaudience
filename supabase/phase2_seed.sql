-- Lead Magnet Simulator Phase 2 initial offers. Safe to run repeatedly.
insert into public.lms_offers(name,short_name,description,offer_type,location,start_date,end_date,status,target_segments)
select * from (values
('Silicon Valley Inspiration Tour','Silicon Valley','Five-day Silicon Valley Inspiration Tour.','public_tour','Silicon Valley','2026-09-28'::date,'2026-10-02'::date,'active',array['cxo','consultant','corporate_refugee']::text[]),
('Shenzhen & Hong Kong Inspiration Tour','Shenzhen + Hong Kong','Five-day Shenzhen and Hong Kong Inspiration Tour.','public_tour','Shenzhen & Hong Kong','2026-11-23'::date,'2026-11-27'::date,'active',array['cxo','consultant']::text[]),
('Custom Inspiration Tour','Custom Tour','Bespoke fact-finding mission for leadership teams and organizations.','custom_tour','Custom',null::date,null::date,'active',array['cxo']::text[]),
('CES + Silicon Valley','CES + SV','Guided CES participation combined with Silicon Valley.','custom_tour','Las Vegas + Silicon Valley',null::date,null::date,'active',array['cxo','consultant']::text[]),
('SXSW + Silicon Valley','SXSW + SV','Guided SXSW participation combined with Silicon Valley.','custom_tour','Austin + Silicon Valley',null::date,null::date,'active',array['cxo','consultant','corporate_refugee']::text[])
) as v(name,short_name,description,offer_type,location,start_date,end_date,status,target_segments)
where not exists(select 1 from public.lms_offers o where o.name=v.name);
