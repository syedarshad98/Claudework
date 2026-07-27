-- ── Recommendation library ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recommendation_library (
  id SERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  scope VARCHAR(20) NOT NULL,
  category VARCHAR(100) NOT NULL,
  co2e_saving_min NUMERIC(10,2),
  co2e_saving_max NUMERIC(10,2),
  co2e_saving_unit VARCHAR(50) DEFAULT 'tCO2e/year',
  cost_band VARCHAR(20) NOT NULL CHECK (cost_band IN ('low','medium','high')),
  time_to_impact VARCHAR(20) NOT NULL CHECK (time_to_impact IN ('quick_win','medium_term','long_term')),
  gri_reference VARCHAR(50),
  tcfd_reference VARCHAR(50),
  sasb_reference VARCHAR(50),
  applies_to_sectors TEXT[],
  trigger_condition VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ── Company recommendations (gap analysis results) ─────────────────────────────
CREATE TABLE IF NOT EXISTS company_recommendations (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  recommendation_id INTEGER NOT NULL REFERENCES recommendation_library(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new','saved','in_progress','completed','dismissed')),
  gap_score NUMERIC(6,2),
  surfaced_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(company_id, recommendation_id)
);

CREATE INDEX IF NOT EXISTS idx_comp_recs_company ON company_recommendations(company_id);
CREATE INDEX IF NOT EXISTS idx_comp_recs_status  ON company_recommendations(company_id, status);

-- ── De-duplicate pre-existing triplicated rows before enforcing uniqueness ──────
-- The seed INSERT below always carried an `ON CONFLICT DO NOTHING` clause, but
-- with no target column list it had nothing to actually conflict against — this
-- table had no unique constraint besides the auto-generated `id`, which never
-- collides on insert. Every fresh-process restart that hit
-- routes/recommendations.js's lazy migration for the first time re-inserted a
-- full second, then third, copy of all ~43 rows with new ids. Confirmed live:
-- 129 rows for 43 distinct titles, exactly 3 identical copies of each,
-- discovered during Phase 5's frontend smoke test. Keeps the lowest id per
-- title, drops the rest; any company_recommendations row pointing at a
-- dropped duplicate cascade-deletes (ON DELETE CASCADE) and is re-created
-- cleanly, with a fresh 'new' status, the next time GET /api/recommendations
-- runs its gap analysis for that company — confirmed live before running this
-- that every existing company_recommendations row was already status='new'
-- (the default), so nothing meaningful is lost by this cleanup today.
DELETE FROM recommendation_library rl
 WHERE EXISTS (
   SELECT 1 FROM recommendation_library rl2
    WHERE rl2.title = rl.title AND rl2.id < rl.id
 );

CREATE UNIQUE INDEX IF NOT EXISTS idx_recommendation_library_title
  ON recommendation_library (title);

-- ── Seed recommendation_library (40+ entries) ──────────────────────────────────
INSERT INTO recommendation_library
  (title, description, scope, category, co2e_saving_min, co2e_saving_max,
   cost_band, time_to_impact, gri_reference, tcfd_reference, sasb_reference,
   applies_to_sectors, trigger_condition)
VALUES

-- ═══════ SCOPE 2 — above median ═══════════════════════════════════════════════
('Switch to a renewable energy tariff',
 'Move your electricity supply to a certified 100% renewable tariff. This is typically the single fastest way to reduce Scope 2 market-based emissions at near-zero capital cost.',
 'scope2','Energy',15.00,40.00,'low','quick_win','GRI 302-1','TCFD Metrics','IF-RE-130a.1',
 ARRAY['Manufacturing','Retail','Technology','Healthcare','Hospitality','Construction','Transport & Logistics','Professional Services'],
 'scope2_above_median'),

('Install LED lighting across all sites',
 'Replace fluorescent and halogen fittings with LED alternatives. Typically reduces lighting electricity consumption by 60–75%, with payback under 3 years.',
 'scope2','Energy',3.00,12.00,'low','quick_win','GRI 302-4',NULL,NULL,
 ARRAY['Manufacturing','Retail','Hospitality','Healthcare','Construction'],
 'scope2_above_median'),

('Deploy smart metering and sub-metering',
 'Install smart meters and sub-meters to identify energy waste hotspots in real time. Companies typically cut energy use by 5–15% within 6 months of deployment.',
 'scope2','Energy',4.00,18.00,'low','quick_win','GRI 302-4','TCFD Metrics',NULL,
 ARRAY['Manufacturing','Retail','Hospitality','Healthcare','Construction','Technology'],
 'scope2_above_median'),

('Commission a Building Energy Management System (BEMS)',
 'A BEMS automates heating, cooling and lighting schedules to match actual occupancy. Medium investment with 10–25% energy reduction across multi-site operations.',
 'scope2','Energy',8.00,30.00,'medium','medium_term','GRI 302-4','TCFD Metrics',NULL,
 ARRAY['Manufacturing','Retail','Hospitality','Healthcare','Construction'],
 'scope2_above_median'),

('Install rooftop solar PV',
 'On-site solar generation reduces grid electricity purchases. Typical commercial rooftop system delivers 20–40 tCO2e reduction per year depending on roof area and orientation.',
 'scope2','Energy',20.00,60.00,'high','long_term','GRI 302-4','TCFD Strategy','IF-RE-130a.1',
 ARRAY['Manufacturing','Retail','Hospitality','Healthcare','Construction','Transport & Logistics'],
 'scope2_above_median'),

('Introduce power-factor correction equipment',
 'Poor power factor increases apparent power demand and energy bills. Power factor correction capacitors typically reduce electricity consumption by 3–8% with 1–2 year payback.',
 'scope2','Energy',2.00,8.00,'medium','medium_term','GRI 302-4',NULL,NULL,
 ARRAY['Manufacturing','Construction','Transport & Logistics'],
 'scope2_above_median'),

-- ═══════ SCOPE 2 — high absolute ══════════════════════════════════════════════
('Conduct a comprehensive energy audit',
 'Engage an accredited energy auditor to map all consumption sources and identify priority reduction opportunities. Required under UK ESOS for qualifying companies.',
 'scope2','Energy',5.00,20.00,'low','quick_win','GRI 302-4','TCFD Metrics',NULL,
 ARRAY['Manufacturing','Retail','Hospitality','Healthcare','Construction','Transport & Logistics','Professional Services','Technology'],
 'scope2_high_absolute'),

('Negotiate a Power Purchase Agreement (PPA)',
 'A long-term PPA locks in renewable electricity at a fixed price, providing both carbon and cost certainty. Suitable for companies with annual electricity spend above £500k.',
 'scope2','Energy',40.00,120.00,'low','long_term','GRI 302-4','TCFD Strategy','IF-RE-130a.1',
 ARRAY['Manufacturing','Retail','Healthcare','Construction','Transport & Logistics'],
 'scope2_high_absolute'),

-- ═══════ SCOPE 1 — above median ═══════════════════════════════════════════════
('Conduct an energy efficiency audit of heating systems',
 'Older boilers and HVAC systems are often 30–40% less efficient than modern equivalents. An audit identifies upgrade opportunities with the fastest payback.',
 'scope1','Fuel & Combustion',5.00,20.00,'low','quick_win','GRI 302-4',NULL,NULL,
 ARRAY['Manufacturing','Retail','Hospitality','Healthcare','Construction','Professional Services'],
 'scope1_above_median'),

('Replace gas boilers with heat pumps',
 'Air or ground-source heat pumps can reduce heating-related emissions by 50–70% versus gas boilers. Capital-intensive but eligible for UK Boiler Upgrade Scheme grants.',
 'scope1','Fuel & Combustion',15.00,55.00,'high','long_term','GRI 302-4','TCFD Strategy',NULL,
 ARRAY['Manufacturing','Retail','Hospitality','Healthcare','Construction','Professional Services'],
 'scope1_above_median'),

('Transition fleet to electric vehicles',
 'Replace diesel/petrol company vehicles with BEVs or PHEVs. Scope 1 emissions drop to zero for BEVs; significant savings on fuel costs over vehicle lifetime.',
 'scope1','Fleet & Transport',20.00,80.00,'high','long_term','GRI 305-1','TCFD Metrics','TR-RO-110a.2',
 ARRAY['Manufacturing','Retail','Construction','Transport & Logistics','Hospitality'],
 'scope1_above_median'),

('Optimise fleet routing with telematics',
 'GPS-based route optimisation and driver behaviour monitoring typically reduces fuel consumption by 10–20% with minimal capital investment.',
 'scope1','Fleet & Transport',5.00,25.00,'low','quick_win','GRI 305-1',NULL,'TR-RO-110a.2',
 ARRAY['Manufacturing','Retail','Construction','Transport & Logistics','Hospitality'],
 'scope1_above_median'),

('Switch refrigerants to low-GWP alternatives',
 'Replace high-GWP refrigerants (e.g. R-410A, R-134a) with HFO or natural refrigerant alternatives during scheduled maintenance cycles.',
 'scope1','Process Emissions',8.00,35.00,'medium','medium_term','GRI 305-1','TCFD Metrics',NULL,
 ARRAY['Manufacturing','Retail','Hospitality','Healthcare'],
 'scope1_above_median'),

('Introduce a no-idling policy for company vehicles',
 'Idle reduction policies typically cut fuel consumption by 5–10% for fleet-heavy operations at near-zero cost. Enforce via driver training and telematics alerts.',
 'scope1','Fleet & Transport',2.00,10.00,'low','quick_win','GRI 305-1',NULL,NULL,
 ARRAY['Transport & Logistics','Construction','Manufacturing','Retail'],
 'scope1_above_median'),

('Upgrade compressed air systems',
 'Compressed air is one of the most energy-intensive industrial utilities, with 20–30% of energy typically lost to leaks. Leak detection and system upgrades offer fast payback.',
 'scope1','Process Emissions',6.00,22.00,'medium','medium_term','GRI 302-4',NULL,NULL,
 ARRAY['Manufacturing','Construction'],
 'scope1_above_median'),

-- ═══════ SCOPE 3 — above median ═══════════════════════════════════════════════
('Engage top 10 suppliers on emissions reporting',
 'Work with your highest-spend suppliers to baseline their Scope 1 & 2 emissions and set reduction commitments. Start with top 10 by spend as these typically represent 80%+ of supplier emissions.',
 'scope3','Supply Chain',10.00,50.00,'low','medium_term','GRI 308-1','TCFD Strategy','CG-EC-430a.1',
 ARRAY['Manufacturing','Retail','Construction','Healthcare','Hospitality','Technology','Professional Services','Transport & Logistics'],
 'scope3_above_median'),

('Commission a full supply chain emissions assessment',
 'A Scope 3 Category 1 assessment maps emissions across your entire supplier base. Required for credible science-based targets and increasingly demanded by institutional investors.',
 'scope3','Supply Chain',25.00,100.00,'medium','medium_term','GRI 308-2','TCFD Strategy','CG-EC-430a.1',
 ARRAY['Manufacturing','Retail','Construction','Healthcare','Hospitality','Technology','Professional Services','Transport & Logistics'],
 'scope3_above_median'),

('Set supplier code of conduct with emissions clauses',
 'Embed emissions reduction requirements into procurement contracts. Companies with strong supplier codes reduce Scope 3 by 15–25% over 3–5 years versus those without.',
 'scope3','Supply Chain',15.00,60.00,'low','medium_term','GRI 308-1','TCFD Strategy',NULL,
 ARRAY['Manufacturing','Retail','Construction','Healthcare','Hospitality','Technology','Professional Services'],
 'scope3_above_median'),

('Shift to lower-emission product packaging',
 'Switch to recycled-content, reduced-weight or biodegradable packaging. Emissions from packaging typically represent 5–15% of Scope 3 for consumer-facing businesses.',
 'scope3','Purchased Goods',5.00,20.00,'medium','medium_term','GRI 301-2',NULL,NULL,
 ARRAY['Manufacturing','Retail','Hospitality'],
 'scope3_above_median'),

('Move freight to rail or sea where feasible',
 'Rail emits ~14x less CO2e per tonne-km than road freight; sea ~5x less for long distances. Modal shift for long-haul routes can significantly reduce Scope 3 Category 4 emissions.',
 'scope3','Logistics',15.00,70.00,'low','medium_term','GRI 305-3','TCFD Metrics','TR-RO-110a.2',
 ARRAY['Manufacturing','Retail','Construction','Transport & Logistics'],
 'scope3_above_median'),

('Implement a sustainable business travel policy',
 'Set a clear hierarchy (video call > rail > flight) with mandatory pre-approval for flights. Companies that formalise travel policies typically cut travel emissions by 20–40%.',
 'scope3','Business Travel',5.00,20.00,'low','quick_win','GRI 305-3','TCFD Metrics',NULL,
 ARRAY['Technology','Professional Services','Healthcare','Manufacturing','Retail'],
 'scope3_above_median'),

-- ═══════ No renewable energy ═══════════════════════════════════════════════════
('Register for the REGO (Renewable Energy Guarantee of Origin) scheme',
 'Purchase REGOs to evidence renewable electricity consumption for Scope 2 market-based reporting. Low-cost first step while transitioning to direct green tariffs or PPAs.',
 'scope2','Energy',10.00,35.00,'low','quick_win','GRI 302-4',NULL,'IF-RE-130a.1',
 ARRAY['Manufacturing','Retail','Technology','Healthcare','Hospitality','Construction','Transport & Logistics','Professional Services'],
 'no_renewable_energy'),

('Join a renewable energy community scheme',
 'Participate in local or virtual community energy projects to source renewable electricity without the full capital commitment of on-site generation.',
 'scope2','Energy',5.00,25.00,'low','medium_term','GRI 302-4','TCFD Strategy',NULL,
 ARRAY['Technology','Professional Services','Healthcare','Retail','Hospitality'],
 'no_renewable_energy'),

-- ═══════ High business travel ══════════════════════════════════════════════════
('Introduce a hybrid/remote working policy',
 'Formal hybrid working reduces employee commuting and business travel emissions. Each employee working from home 2 days per week saves approximately 0.5–1.5 tCO2e/year.',
 'scope3','Commuting & Travel',2.00,8.00,'low','quick_win','GRI 305-3',NULL,NULL,
 ARRAY['Technology','Professional Services','Healthcare','Retail','Manufacturing'],
 'high_business_travel'),

('Replace short-haul flights with rail travel',
 'Mandate Eurostar/rail for journeys under 500km where journey time is under 4 hours. Rail emits 90%+ less CO2e than short-haul flights on equivalent routes.',
 'scope3','Business Travel',3.00,15.00,'low','quick_win','GRI 305-3','TCFD Metrics',NULL,
 ARRAY['Technology','Professional Services','Manufacturing','Retail','Healthcare'],
 'high_business_travel'),

('Roll out enterprise video conferencing tools',
 'Investment in high-quality video conferencing infrastructure reduces the need for internal meetings requiring travel. Payback typically under 6 months for companies with regular inter-site travel.',
 'scope3','Business Travel',4.00,18.00,'low','quick_win','GRI 305-3',NULL,NULL,
 ARRAY['Technology','Professional Services','Manufacturing','Healthcare','Retail'],
 'high_business_travel'),

('Introduce a carbon budget per business trip',
 'Assign a CO2e budget to each proposed business trip, requiring approval from a line manager when exceeded. Behavioural change reduces discretionary travel by 20–35%.',
 'scope3','Business Travel',3.00,12.00,'low','quick_win','GRI 305-3',NULL,NULL,
 ARRAY['Technology','Professional Services','Healthcare','Manufacturing','Retail'],
 'high_business_travel'),

-- ═══════ Target at risk ════════════════════════════════════════════════════════
('Adopt science-based targets (SBTi)',
 'Commit to net-zero through the Science Based Targets initiative. SBTi targets provide a credible, externally validated decarbonisation pathway and are increasingly required by customers and investors.',
 'scope1,scope2,scope3','Strategy',0.00,0.00,'low','medium_term','GRI 305-4','TCFD Strategy',NULL,
 ARRAY['Manufacturing','Retail','Technology','Healthcare','Hospitality','Construction','Transport & Logistics','Professional Services'],
 'target_at_risk'),

('Commission an independent carbon footprint verification',
 'Third-party verification of your emissions inventory builds credibility and often identifies measurement errors that are inflating reported figures.',
 'scope1,scope2,scope3','Reporting',0.00,0.00,'medium','quick_win','GRI 305-4','TCFD Governance',NULL,
 ARRAY['Manufacturing','Retail','Technology','Healthcare','Hospitality','Construction','Transport & Logistics','Professional Services'],
 'target_at_risk'),

('Review and tighten annual reduction milestones',
 'Revisit your interim reduction targets to ensure year-by-year milestones are achievable and aligned with your net-zero commitment. Consider engaging a climate consultant to stress-test the pathway.',
 'scope1,scope2,scope3','Strategy',0.00,0.00,'low','quick_win','GRI 305-4','TCFD Strategy',NULL,
 ARRAY['Manufacturing','Retail','Technology','Healthcare','Hospitality','Construction','Transport & Logistics','Professional Services'],
 'target_at_risk'),

-- ═══════ Target behind ════════════════════════════════════════════════════════
('Accelerate decarbonisation with high-impact quick wins',
 'Your emissions reduction is currently behind your target trajectory. Prioritise the highest-impact, lowest-cost actions immediately — starting with energy tariff switching and efficiency measures.',
 'scope1,scope2,scope3','Strategy',10.00,40.00,'low','quick_win','GRI 305-4','TCFD Strategy',NULL,
 ARRAY['Manufacturing','Retail','Technology','Healthcare','Hospitality','Construction','Transport & Logistics','Professional Services'],
 'target_behind'),

('Consider purchasing verified carbon offsets (interim measure)',
 'High-quality offsets (Gold Standard or Verra VCU) can bridge the gap while structural reductions are being implemented. Use only as a transitional measure alongside genuine emission cuts.',
 'scope1,scope2,scope3','Offsetting',0.00,0.00,'medium','quick_win','GRI 305-4','TCFD Metrics',NULL,
 ARRAY['Manufacturing','Retail','Technology','Healthcare','Hospitality','Construction','Transport & Logistics','Professional Services'],
 'target_behind'),

-- ═══════ Missing supplier audit ═══════════════════════════════════════════════
('Introduce a supplier sustainability scorecard',
 'Develop a simple scorecard to assess suppliers on emissions reporting, certifications and reduction commitments. Share with procurement teams to embed sustainability in vendor selection.',
 'scope3','Supply Chain',5.00,25.00,'low','medium_term','GRI 308-1','TCFD Strategy',NULL,
 ARRAY['Manufacturing','Retail','Construction','Healthcare','Hospitality','Technology','Professional Services','Transport & Logistics'],
 'missing_supplier_audit'),

('Commission a supplier carbon audit programme',
 'Engage an auditing firm to conduct on-site carbon audits of your top suppliers. Typically reduces Scope 3 Category 1 emissions by 8–20% within 2 years.',
 'scope3','Supply Chain',10.00,40.00,'medium','medium_term','GRI 308-2','TCFD Strategy','CG-EC-430a.1',
 ARRAY['Manufacturing','Retail','Construction','Healthcare','Hospitality'],
 'missing_supplier_audit'),

('Join the CDP Supply Chain Programme',
 'Request emissions disclosures from suppliers via the CDP Supply Chain platform. Over 280 major buyers use CDP to drive emissions reductions across their value chains.',
 'scope3','Supply Chain',8.00,30.00,'low','medium_term','GRI 308-2','TCFD Strategy',NULL,
 ARRAY['Manufacturing','Retail','Construction','Healthcare','Technology','Professional Services'],
 'missing_supplier_audit'),

-- ═══════ No modern slavery policy ══════════════════════════════════════════════
('Publish a Modern Slavery Act statement',
 'UK companies with annual turnover above £36m are legally required to publish an annual modern slavery statement. Publish yours to demonstrate compliance and manage reputational risk.',
 'scope3','Social Governance',0.00,0.00,'low','quick_win','GRI 414-1',NULL,'CG-EC-430a.1',
 ARRAY['Manufacturing','Retail','Construction','Healthcare','Hospitality','Technology','Professional Services','Transport & Logistics'],
 'no_modern_slavery_policy'),

('Embed modern slavery due diligence in procurement',
 'Integrate modern slavery risk screening into your supplier onboarding process. Use tools such as Sedex or EcoVadis to identify high-risk suppliers by geography and sector.',
 'scope3','Social Governance',0.00,0.00,'low','medium_term','GRI 414-2',NULL,NULL,
 ARRAY['Manufacturing','Retail','Construction','Healthcare','Hospitality'],
 'no_modern_slavery_policy'),

-- ═══════ No anti-bribery policy ════════════════════════════════════════════════
('Adopt an Anti-Bribery and Corruption (ABC) Policy',
 'A documented ABC policy compliant with the UK Bribery Act 2010 protects the company from prosecution and is a prerequisite for many public sector and international contracts.',
 'scope1,scope2,scope3','Governance',0.00,0.00,'low','quick_win','GRI 205-2',NULL,NULL,
 ARRAY['Manufacturing','Retail','Construction','Healthcare','Hospitality','Technology','Professional Services','Transport & Logistics'],
 'no_anti_bribery_policy'),

('Roll out mandatory anti-bribery training',
 'Annual training for all employees with customer-facing or procurement roles significantly reduces bribery risk and is evidence of "adequate procedures" under the UK Bribery Act.',
 'scope1,scope2,scope3','Governance',0.00,0.00,'low','quick_win','GRI 205-2',NULL,NULL,
 ARRAY['Manufacturing','Retail','Construction','Healthcare','Hospitality','Technology','Professional Services','Transport & Logistics'],
 'no_anti_bribery_policy'),

-- ═══════ All sectors ══════════════════════════════════════════════════════════
('Publish an annual ESG report aligned to GRI Standards',
 'A GRI-aligned report demonstrates transparency to investors, customers and regulators, and is increasingly a procurement requirement. Start with a GRI-referenced summary report.',
 'scope1,scope2,scope3','Reporting',0.00,0.00,'low','medium_term','GRI 1',NULL,NULL,
 ARRAY['Manufacturing','Retail','Technology','Healthcare','Hospitality','Construction','Transport & Logistics','Professional Services'],
 'all_sectors'),

('Set up an internal carbon price',
 'An internal carbon price (shadow price) of £30–100/tCO2e applied to business decisions steers investment towards low-carbon options without direct cost to the P&L.',
 'scope1,scope2,scope3','Strategy',0.00,0.00,'low','medium_term','GRI 305-4','TCFD Strategy',NULL,
 ARRAY['Manufacturing','Retail','Technology','Healthcare','Hospitality','Construction','Transport & Logistics','Professional Services'],
 'all_sectors'),

('Train finance and procurement teams on carbon accounting',
 'Embedding carbon literacy in financial decision-making ensures that ESG considerations are evaluated alongside cost and risk in all major procurement and investment decisions.',
 'scope1,scope2,scope3','Reporting',0.00,0.00,'low','quick_win','GRI 305-4','TCFD Governance',NULL,
 ARRAY['Manufacturing','Retail','Technology','Healthcare','Hospitality','Construction','Transport & Logistics','Professional Services'],
 'all_sectors'),

('Disclose climate-related financial risks under TCFD',
 'TCFD disclosures are now mandatory for many UK listed companies and FCA-regulated entities. Voluntary disclosure ahead of regulatory deadlines demonstrates good governance.',
 'scope1,scope2,scope3','Reporting',0.00,0.00,'low','medium_term',NULL,'TCFD Governance',NULL,
 ARRAY['Manufacturing','Retail','Technology','Healthcare','Hospitality','Construction','Transport & Logistics','Professional Services'],
 'all_sectors')

ON CONFLICT (title) DO NOTHING;
