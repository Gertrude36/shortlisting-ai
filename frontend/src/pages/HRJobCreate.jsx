import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import {
  Briefcase, ArrowLeft, Zap, Plus, X, Info,
  GraduationCap, Award, Wrench, Clock, Star, FileText, MapPin, Users, Timer, BarChart2
} from 'lucide-react'
import toast from 'react-hot-toast'
import Navbar from '../components/Navbar'
import api from '../api/axios'

// ── Brand tokens (matches GI Recruitment Network) ───────────
const B = {
  navy:        '#0f172a',
  navyMid:     '#1e293b',
  blue:        '#2563eb',
  blueDark:    '#1d4ed8',
  blueLight:   '#3b82f6',
  blueXLight:  '#dbeafe',
  violet:      '#7c3aed',
  violetLight: '#ede9fe',
  amber:       '#d97706',
  amberLight:  '#fef3c7',
  sky:         '#0284c7',
  skyLight:    '#e0f2fe',
  emerald:     '#059669',
  emeraldLight:'#d1fae5',
  red:         '#dc2626',
  redLight:    '#fee2e2',
  text:        '#0f172a',
  textMid:     '#334155',
  textLight:   '#64748b',
  border:      '#cbd5e1',
  borderLight: '#e2e8f0',
  bg:          '#f8fafc',
  white:       '#ffffff',
}

const JOB_LEVELS = [
  '1.I','1.II','1.III','2.I','2.II','2.III',
  '3.I','3.II','3.III','4.I','4.II','4.III',
  '5.I','5.II','5.III','6.I','6.II','6.III',
  '7.I','7.II','7.III',
]

// ============================================================
// 40 JOB TEMPLATES from Rwanda Career Hub dataset
// ============================================================
const RWANDA_JOBS_DATA = [
  { title: "Registered Nurse", domain: "Health", emoji: "💉", description: "Deliver high-quality patient care within a multidisciplinary clinical team at our health facility.", about_role: "Assess, plan, implement, and evaluate patient care plans in collaboration with physicians and allied health professionals.", responsibilities: ["Conduct comprehensive patient assessments and document findings accurately in EHR systems","Develop, implement, and evaluate individualised nursing care plans","Administer medications, IV therapy, and therapeutic treatments as prescribed","Monitor patient vitals and respond promptly to any deterioration in condition","Perform wound care, catheterisation, and other clinical procedures","Coordinate patient care with physicians, specialists, and allied health staff","Educate patients and families on diagnoses, medications, and discharge planning","Respond to medical emergencies and participate in resuscitation efforts","Maintain accurate and timely nursing documentation compliant with MoH standards","Participate in infection prevention and control programmes"], education: "Bachelor's / Advanced Diploma", fields: "Nursing, Midwifery, Health Sciences", exp_min: 1, exp_max: 20, skills: ["Clinical patient assessment","Medication administration","IV therapy & venipuncture","Wound care","BLS / CPR","EHR / DHIS2","Infection prevention","Patient education","Emergency triage"], certs: ["Valid Practising Certificate — RNMC","Basic Life Support (BLS)"], preferred: ["ACLS / PALS","ICU / critical care experience","Oncology or psychiatric nursing"], employment_type: "Full-time" },
  { title: "Medical Doctor (GP)", domain: "Health", emoji: "🩺", description: "Provide comprehensive primary healthcare services across our network of health centres.", about_role: "Diagnose and treat acute and chronic conditions and work collaboratively within a multidisciplinary team aligned with Rwanda's Community Health Policy.", responsibilities: ["Diagnose and treat patients with acute and chronic medical conditions","Conduct antenatal, postnatal, and child health clinics","Prescribe medications in line with the National Essential Medicines List","Refer complex cases to specialists and follow up on outcomes","Participate in disease surveillance and mandatory reporting to RBC","Mentor clinical officers and nurses on evidence-based practice","Maintain accurate medical records in the hospital information system","Participate in morning rounds and case conferences","Implement community health and disease prevention initiatives"], education: "MBChB / MD / MBBS", fields: "Medicine, Medical Sciences, Clinical Medicine", exp_min: 2, exp_max: 25, skills: ["Clinical diagnosis","Prescription management","Emergency medicine","Antenatal care","Minor surgical procedures","HMIS / DHIS2","Disease surveillance","Evidence-based decision making"], certs: ["Valid Medical Licence — RMDC","Completion of mandatory internship","BLS & ACLS"], preferred: ["MMed in Family Medicine","Certificate in Tropical Medicine (DTM&H)","HIV/AIDS clinical management experience"], employment_type: "Full-time" },
  { title: "Pharmacist", domain: "Health", emoji: "💊", description: "Manage pharmaceutical services, ensure safe drug dispensing, and provide expert medication counselling.", about_role: "Oversee all pharmacy operations including procurement, storage, dispensing, and pharmacovigilance, in compliance with Rwanda FDA regulations.", responsibilities: ["Dispense prescribed medications accurately and counsel patients","Review prescriptions for accuracy, safety, and drug interactions","Manage pharmaceutical inventory including ordering and stock control","Implement and monitor pharmacovigilance and ADR reporting","Ensure compliance with Rwanda FDA regulations and cold-chain requirements","Provide clinical pharmacy support to physicians","Conduct regular medicine audits and reconciliation","Train and supervise pharmacy technicians"], education: "Bachelor of Pharmacy / PharmD", fields: "Pharmacy, Pharmaceutical Sciences, Clinical Pharmacy", exp_min: 1, exp_max: 15, skills: ["Drug dispensing & counselling","Prescription review","Pharmaceutical stock management","Pharmacovigilance & ADR reporting","Cold-chain compliance","Drug interaction analysis","Pharmacy information systems"], certs: ["Valid Practising Licence — Rwanda Pharmacy Council","Rwanda FDA Registration"], preferred: ["Postgraduate Certificate in Clinical Pharmacy","HIV/ARV pharmacy management","Good Pharmacy Practice (GPP)"], employment_type: "Full-time" },
  { title: "Public Health Officer / Epidemiologist", domain: "Health", emoji: "🦠", description: "Lead disease surveillance, outbreak investigation, and community health intervention programmes.", about_role: "Coordinate epidemiological monitoring, health data analysis, and multi-sectoral disease control initiatives aligned with Rwanda's Health Sector Strategic Plan.", responsibilities: ["Conduct disease surveillance using DHIS2, EWARN, and sentinel site data","Investigate disease outbreaks and implement containment strategies","Analyse public health data and produce technical reports for MoH/RBC","Design and evaluate community health promotion interventions","Coordinate immunisation, nutrition, and WASH programme implementation","Liaise with WHO, CDC, and partner agencies on IHR compliance","Train district health teams on surveillance and data collection"], education: "Master of Public Health / MSc Epidemiology", fields: "Public Health, Epidemiology, Environmental Health, Global Health", exp_min: 2, exp_max: 15, skills: ["Epidemiological surveillance (DHIS2, EWARN, IDSR)","Outbreak investigation","Statistical analysis (SPSS, STATA, R)","Health programme design & evaluation","Community mobilisation","Health data management & GIS","IHR compliance & emergency preparedness"], certs: ["Environmental Health Officers Council registration","FETP certificate (advantage)"], preferred: ["CDC STOP / WHO FETP graduate","PEPFAR or USAID programme experience","GIS proficiency (ArcGIS / QGIS)","One Health framework knowledge"], employment_type: "Full-time" },
  { title: "Medical Laboratory Scientist", domain: "Health", emoji: "🔬", description: "Perform diagnostic laboratory testing, maintain quality standards, and support evidence-based clinical decisions.", about_role: "Conduct clinical laboratory analyses in haematology, biochemistry, microbiology, and serology, adhering to ISO 15189 quality standards.", responsibilities: ["Perform haematology, biochemistry, urinalysis, and serology tests","Process and culture microbiology specimens for pathogen identification","Conduct HIV, TB, and malaria rapid diagnostic testing","Maintain laboratory equipment through calibration and preventive maintenance","Implement and monitor internal and external quality control programmes","Record and report test results accurately within turnaround times","Train and supervise laboratory technicians and interns"], education: "BSc Biomedical Laboratory Sciences", fields: "Biomedical Laboratory Sciences, Medical Laboratory Technology, Biochemistry, Microbiology", exp_min: 1, exp_max: 15, skills: ["Haematology & blood bank procedures","Clinical biochemistry & immunoassay","Microbiology culture & sensitivity","HIV, TB (GeneXpert), malaria diagnostics","Laboratory quality management (ISO 15189)","Good Laboratory Practice (GLP)","LIMS"], certs: ["Valid Practising Licence — RAHPC","Biosafety Level 2 (BSL-2) training"], preferred: ["ISO 15189 internal auditor training","GeneXpert / molecular diagnostics","SLIPTA/SLMTA accreditation experience"], employment_type: "Full-time" },
  { title: "Secondary School Teacher (Sciences)", domain: "Education", emoji: "🧪", description: "Deliver engaging, competency-based instruction in Physics, Chemistry, or Biology at O and A Level.", about_role: "Implement Rwanda Education Board (REB) competency-based curriculum (CBC), facilitate laboratory practicals, and contribute to holistic academic development.", responsibilities: ["Plan and deliver high-quality lessons aligned with REB CBC curriculum","Conduct laboratory practicals and enforce safety protocols","Prepare students for national examinations (O-Level, A-Level)","Develop and grade continuous assessment tests","Maintain class registers, mark books, and progress reports","Provide remedial support and mentoring to underperforming students","Integrate ICT and smart classroom tools in teaching"], education: "Bachelor of Education (Science) / B.Sc + PGDE", fields: "Education, Physics, Chemistry, Biology, Mathematics", exp_min: 1, exp_max: 20, skills: ["CBC lesson planning & delivery","Laboratory management & safety","Student assessment & feedback","Classroom management","ICT integration in teaching","Exam preparation & question setting","Inclusive education"], certs: ["REB Teacher Registration Certificate","Valid Teaching Licence — REB"], preferred: ["STEM / Science Olympiad coaching","Inclusive education training","e-learning platforms (Moodle, Google Classroom)"], employment_type: "Full-time" },
  { title: "University Lecturer", domain: "Education", emoji: "🎓", description: "Contribute to teaching, research, and community engagement at our higher education institution.", about_role: "Deliver undergraduate and postgraduate courses, supervise student research, publish academic work, and contribute to curriculum development.", responsibilities: ["Design, deliver, and improve undergraduate and postgraduate courses","Supervise dissertations, Master's theses, and PhD research","Conduct and publish original research in peer-reviewed journals","Develop and submit research grant proposals","Participate in curriculum review and academic quality assurance","Set and mark examinations and provide timely student feedback","Engage in community outreach and knowledge transfer"], education: "Master's degree (PhD required for senior lecturer)", fields: "Relevant academic discipline as advertised", exp_min: 3, exp_max: 30, skills: ["University-level course design","Academic research & scientific writing","Student supervision & mentoring","Curriculum development & QA","Grant writing","E-learning (Moodle)","Statistical analysis & research methodology"], certs: ["Higher Education Council (HEC) Rwanda registration","PhD registration (Professor grade)"], preferred: ["Scopus/ISI indexed publications","Postgraduate teaching certificate","International research collaborations"], employment_type: "Full-time" },
  { title: "ECD Specialist", domain: "Education", emoji: "🧒", description: "Design, implement, and evaluate early childhood development programmes for children aged 0–6.", about_role: "Work with Integrated Child Development Centres, schools, and communities to ensure holistic child development through nutrition, psychosocial stimulation, and quality pre-primary education.", responsibilities: ["Design and implement developmentally appropriate ECD curricula","Train and mentor ECD facilitators, parents, and community volunteers","Monitor children's developmental milestones and flag delays","Conduct community sensitisation on early childhood nutrition","Liaise with MoH, MINEDUC, and MIGEPROF on ECD policy","Produce programme reports and M&E data for donors and government"], education: "Bachelor of Education (Early Childhood) / BSc Child Development", fields: "Early Childhood Education, Child Development, Psychology, Social Sciences", exp_min: 2, exp_max: 15, skills: ["ECD curriculum design","Child developmental assessment (ASQ)","Parent & community engagement","Child protection & safeguarding","ECD centre management","Training facilitation","Programme M&E","Nutritional counselling"], certs: ["Child Safeguarding / Child Protection Certification","First Aid Certification"], preferred: ["Nurturing Care Framework (WHO/UNICEF/World Bank)","UNICEF / Save the Children / World Vision experience","Inclusive ECD for children with disabilities"], employment_type: "Full-time" },
  { title: "Software Engineer", domain: "Technology", emoji: "👨‍💻", description: "Design, develop, and maintain high-quality, scalable software systems powering our core digital products.", about_role: "Own the full development lifecycle — from requirements analysis and architecture to implementation, testing, and production deployment — within an agile team.", responsibilities: ["Design and implement scalable backend and frontend services","Write clean, well-tested, and thoroughly documented code","Participate in architecture decisions and technical design reviews","Conduct and respond to code reviews","Investigate, debug, and resolve production incidents","Contribute to CI/CD pipeline improvements and DevOps practices","Mentor junior engineers and share technical knowledge"], education: "BSc Computer Science / Software Engineering", fields: "Computer Science, Software Engineering, Information Technology", exp_min: 2, exp_max: 12, skills: ["Python / Java / Node.js","React / Vue.js","PostgreSQL / MongoDB","RESTful API design","Git version control","Docker & containerisation","TDD / unit testing","AWS / GCP / Azure","Agile / Scrum"], certs: [], preferred: ["AWS Certified Developer / Solutions Architect","Kubernetes (CKA/CKAD)","Open-source contributions","Microservices architecture","GraphQL"], employment_type: "Full-time" },
  { title: "Data Analyst", domain: "Technology", emoji: "📊", description: "Transform complex datasets into clear, actionable insights that drive strategic business decisions.", about_role: "Work with stakeholders to define analytical requirements, build data pipelines, create dashboards, and present findings that directly influence strategy.", responsibilities: ["Collect, clean, and validate large datasets","Write complex SQL queries and Python/R scripts","Build interactive dashboards in Tableau or Power BI","Conduct statistical analyses to identify trends and anomalies","Define and track KPIs with product and programme teams","Develop and maintain automated reporting pipelines","Collaborate with data engineers to improve data quality"], education: "BSc Statistics / Mathematics / Data Science", fields: "Statistics, Mathematics, Computer Science, Data Science, Economics", exp_min: 1, exp_max: 10, skills: ["SQL (PostgreSQL, MySQL, BigQuery)","Python (pandas, NumPy, matplotlib)","Tableau / Power BI","Statistical analysis & hypothesis testing","Advanced Excel","ETL processes & data pipelines","Storytelling with data"], certs: [], preferred: ["Google Professional Data Analytics Certificate","Tableau Desktop Specialist","Snowflake / BigQuery / Redshift","scikit-learn basics","Power BI PL-300"], employment_type: "Full-time" },
  { title: "Cybersecurity Analyst", domain: "Technology", emoji: "🛡️", description: "Protect our digital infrastructure, monitor threats, and ensure compliance with Rwanda's National Cyber Security Policy.", about_role: "Monitor security events, conduct vulnerability assessments, lead incident response, and implement security controls aligned with NCSA standards.", responsibilities: ["Monitor SIEM tools for security events and anomalies","Conduct vulnerability assessments and penetration testing","Lead incident response, digital forensics, and post-incident analysis","Implement and enforce information security policies","Perform security code reviews and advise on secure coding","Coordinate with NCSA Rwanda on national cyber threat intelligence","Train staff on phishing awareness and cyber hygiene"], education: "BSc Cybersecurity / Computer Science", fields: "Cybersecurity, Information Security, Computer Science", exp_min: 2, exp_max: 12, skills: ["SIEM (Splunk, QRadar, Microsoft Sentinel)","Penetration testing (Metasploit, Nessus, Burp Suite)","Incident response & digital forensics","Network security (firewalls, IDS/IPS)","IAM","Cloud security (AWS/Azure/GCP)","OWASP Top 10","ISO 27001 / NIST / GDPR"], certs: ["CompTIA Security+ or CySA+","Certified Ethical Hacker (CEH)"], preferred: ["CISSP","CISM","OSCP","Engagement with Rwanda NCSA / CERT-RW"], employment_type: "Full-time" },
  { title: "ICT Support Technician", domain: "Technology", emoji: "🖥️", description: "Provide first and second-line technical support, maintain IT infrastructure, and ensure business continuity.", about_role: "Resolve hardware, software, and network issues for staff, configure and maintain workstations, and support digital transformation initiatives.", responsibilities: ["Provide first and second-line IT helpdesk support","Install, configure, and maintain computers and network equipment","Troubleshoot Windows, Linux, and macOS issues","Manage LAN/WAN network infrastructure and Wi-Fi","Administer Active Directory, Office 365, and email systems","Maintain IT asset inventory","Back up critical data and test disaster recovery procedures"], education: "BSc Information Technology / Diploma IT", fields: "Information Technology, Computer Science, Electronics, Telecommunications", exp_min: 1, exp_max: 10, skills: ["Hardware troubleshooting & repair","Windows & Linux OS administration","Network configuration (LAN, WAN, TCP/IP)","Microsoft Office 365 & Active Directory","Help desk ticketing systems","Basic cybersecurity","VoIP telephony","Software installation & patch management"], certs: ["CompTIA A+ or CompTIA Network+","Microsoft 365 Certified Fundamentals (MS-900)"], preferred: ["CCNA","ITIL Foundation","Experience with Rwanda RISA / e-Government systems","Driving licence"], employment_type: "Full-time" },
  { title: "Accountant", domain: "Finance", emoji: "📒", description: "Manage financial records, ensure regulatory compliance, and support strategic financial planning.", about_role: "Maintain the integrity of financial reporting systems, manage month-end and year-end close processes, and provide financial analysis to support management.", responsibilities: ["Prepare, review, and analyse monthly, quarterly, and annual financial statements","Manage accounts payable, receivable, and general ledger entries","Perform bank reconciliations and resolve discrepancies","Prepare and file corporate tax returns, VAT, and PAYE via RRA e-Declarations","Support internal and external audit processes","Develop and monitor departmental budgets and forecasts","Implement and strengthen internal financial controls"], education: "BCom Accounting / BSc Accounting & Finance", fields: "Accounting, Finance, Business Administration, Economics", exp_min: 2, exp_max: 15, skills: ["Financial reporting (IFRS/GAAP)","General ledger management","Tax compliance (RRA — VAT, PAYE, CIT)","Bank reconciliation","Advanced Excel (pivot tables, financial models)","QuickBooks / Sage / SAP / Oracle","Budgeting & financial forecasting","Cash flow management"], certs: ["CPA — Rwanda (iCPAR)","ACCA (full or part qualification)"], preferred: ["CIMA / CMA designation","SAP ERP or Oracle Financials experience","IFRS specialist certification","CFA Level I+"], employment_type: "Full-time" },
  { title: "Internal Auditor", domain: "Finance", emoji: "🔎", description: "Independently assess the adequacy of internal controls, risk management, and governance processes.", about_role: "Plan and execute risk-based audit assignments, identify control weaknesses, and make recommendations that improve operational effectiveness and compliance.", responsibilities: ["Develop and execute the annual risk-based internal audit plan","Conduct operational, financial, and compliance audit assignments","Evaluate design and effectiveness of internal controls","Identify risks, control gaps, and process inefficiencies","Document audit findings and draft evidence-based audit reports","Follow up on implementation of prior audit recommendations","Liaise with OAG and external auditors"], education: "BCom Accounting / BSc Finance", fields: "Accounting, Finance, Auditing, Business Administration", exp_min: 3, exp_max: 15, skills: ["Risk-based internal auditing","Internal control assessment (COSO)","Financial & compliance audit execution","Audit report writing","Rwanda PFM regulations","Fraud risk assessment","Data analysis (ACL, IDEA, Excel)","IPSAS & IFRS","CAATs"], certs: ["CPA Rwanda (iCPAR)","Certified Internal Auditor (CIA)"], preferred: ["Certified Fraud Examiner (CFE)","ACCA","World Bank / Global Fund / USAID audit experience","IT audit (CISA)"], employment_type: "Full-time" },
  { title: "Procurement Officer", domain: "Finance", emoji: "📦", description: "Manage the end-to-end procurement process and maintain compliance with RPPA regulations.", about_role: "Oversee tender and contract processes, maintain the procurement plan, and coordinate with technical departments for timely acquisition of goods, works, and services.", responsibilities: ["Prepare and execute the annual procurement plan","Manage all tender processes: RFQ, RFP, open, restricted, and direct procurement","Use the RPPA e-procurement platform (Umucyo) for all transactions","Evaluate bids, prepare evaluation reports, and recommend contract awards","Draft, review, and manage supplier contracts","Coordinate with Finance for payment processing","Ensure compliance with Rwanda Procurement Law No. 17/2016"], education: "BBA Supply Chain Management / BCom Procurement", fields: "Procurement, Supply Chain Management, Business Administration, Logistics", exp_min: 2, exp_max: 12, skills: ["Rwanda Public Procurement Law & RPPA regulations","RPPA e-procurement platform (Umucyo)","Tender management & bid evaluation","Contract drafting & management","Supplier evaluation & due diligence","Procurement planning","Market surveys & price analysis"], certs: ["CIPS Level 4+","RPPA Procurement Practitioner Certificate (Rwanda)"], preferred: ["CIPS Level 6","World Bank / PEFA procurement frameworks","Incoterms & international trade","Donor-funded project procurement (AfDB, USAID, EU)"], employment_type: "Full-time" },
  { title: "Microfinance Loan Officer", domain: "Finance", emoji: "🏦", description: "Appraise loan applications, manage a loan portfolio, and provide financial advisory services to individuals and SMEs.", about_role: "Mobilise members, process loan applications, conduct credit analysis, and recover disbursed loans while promoting financial inclusion.", responsibilities: ["Mobilise potential borrowers and promote savings and credit products","Receive, review, and appraise loan applications","Conduct field visits to verify business operations and collateral","Perform credit risk analysis and prepare loan appraisal reports","Present loan applications to the credit committee","Disburse approved loans and ensure documentation is complete","Conduct regular follow-up visits to monitor loan use and repayment"], education: "BBA / BCom Finance / BSc Economics", fields: "Business Administration, Finance, Economics, Cooperative Management, Banking", exp_min: 1, exp_max: 10, skills: ["Credit appraisal & risk analysis","Loan portfolio management","Financial statement analysis for SMEs","Collateral assessment & valuation","Loan recovery & delinquency management","Community mobilisation","Rwanda SACCO regulatory framework (BNR)","Microfinance information systems"], certs: ["Certificate in Cooperative Management (preferred)"], preferred: ["Microfinance best practices (MicroSave, Smart Campaign)","Motorcycle riding licence","BNR microfinance prudential norms","Umurenge SACCO experience"], employment_type: "Full-time" },
  { title: "Agronomist", domain: "Agriculture", emoji: "🌾", description: "Provide technical support on crop production, soil management, and agricultural extension services.", about_role: "Support smallholder farmers and commercial operations to improve productivity through evidence-based agronomic practices aligned with Rwanda's PSTA IV.", responsibilities: ["Conduct field assessments and soil analysis","Train and advise farmers on improved crop varieties and agronomic practices","Implement demonstration plots for new technologies","Monitor crop performance and identify pest and disease issues","Facilitate access to certified seeds, fertilisers, and agricultural inputs","Map farm land using GIS tools","Coordinate with RAB, MINAGRI, and district agricultural officers","Support formation and strengthening of farmer cooperatives"], education: "BSc Agronomy / BSc Agriculture", fields: "Agronomy, Agriculture, Crop Science, Soil Science, Plant Science", exp_min: 2, exp_max: 15, skills: ["Crop management & agronomy advisory","Soil health assessment & fertiliser recommendations","IPM — pest & disease management","Agricultural extension training","GIS & remote sensing (QGIS/ArcGIS)","Seasonal crop monitoring","Post-harvest handling","KoBoToolbox data collection","Rwanda crop value chains (maize, beans, potato, coffee, tea)"], certs: ["RAB registration (preferred)"], preferred: ["GIS / Remote Sensing certificate","Conservation Agriculture / Climate-Smart Agriculture","Motorcycle riding licence","One Acre Fund / ACDI/VOCA / IFDC experience"], employment_type: "Full-time" },
  { title: "Veterinary Officer", domain: "Agriculture", emoji: "🐄", description: "Provide professional animal health services, disease surveillance, and veterinary public health support.", about_role: "Diagnose and treat animal diseases, conduct health inspections, implement disease control programs, and ensure compliance with veterinary public health standards.", responsibilities: ["Diagnose and treat diseases in livestock and companion animals","Conduct disease surveillance and report outbreaks to authorities","Perform post-mortem examinations and interpret laboratory results","Administer vaccinations and supervise disease prevention programs","Inspect meat, dairy, and animal products for public health compliance","Advise farmers on animal nutrition, breeding, and husbandry","Participate in One Health initiatives"], education: "Bachelor of Veterinary Medicine (BVM) / BVSc", fields: "Veterinary Medicine, Animal Health, Animal Science", exp_min: 2, exp_max: 15, skills: ["Animal diagnosis & treatment","Surgical procedures","Livestock disease surveillance","Zoonotic disease control & One Health","Meat & dairy inspection","Vaccination program management","Laboratory sample collection","Livestock production advisory"], certs: ["Valid Practising Licence — Rwanda Veterinary Council","Certificate of Competence in Animal Health"], preferred: ["Postgraduate Epidemiology or Public Health","GIS-based disease mapping","HACCP / food safety systems","FAO/OIE disease reporting (WAHIS)"], employment_type: "Full-time" },
  { title: "Agricultural Extension Officer", domain: "Agriculture", emoji: "🌱", description: "Deliver training, advisory, and demonstration services to smallholder farmers across Rwanda.", about_role: "Build the capacity of farmer groups and cooperatives, promoting adoption of improved technologies and climate-smart practices within district agriculture structures.", responsibilities: ["Conduct farmer training sessions and field demonstrations","Mobilise and organise farmers into cooperatives and farmer field schools","Advise farmers on certified seed varieties, fertiliser use, and agronomic practices","Facilitate linkages between farmers and input suppliers and buyers","Collect agricultural data and report seasonal production statistics","Implement Crop Intensification Programme (CIP) activities","Support farmer access to government subsidies and input vouchers"], education: "BSc Agriculture / Advanced Diploma in Agriculture", fields: "Agriculture, Agronomy, Rural Development, Animal Science", exp_min: 0, exp_max: 10, skills: ["Farmer training & field facilitation","Crop demonstration plot management","Agricultural record keeping","Cooperative mobilisation","Kinyarwanda communication (essential)","Rwanda seasonal farming calendar","Post-harvest handling advisory","KoBoToolbox / smartphone data collection"], certs: ["Motorcycle riding licence — Category A (required)"], preferred: ["FFS Facilitation certificate","MINAGRI Crop Intensification Programme knowledge","Climate-Smart Agriculture training","One Acre Fund / TechnoServe experience"], employment_type: "Full-time" },
  { title: "Civil Engineer", domain: "Engineering", emoji: "🏗️", description: "Manage the design, supervision, and delivery of roads, buildings, and water systems across Rwanda.", about_role: "Provide technical leadership on construction projects, ensure compliance with RHA and RTDA standards, and manage contractors to deliver on time and within budget.", responsibilities: ["Design and review structural, road, and hydraulic engineering drawings","Prepare Bills of Quantities, cost estimates, and technical specifications","Supervise construction works and inspect quality of materials","Conduct topographic surveys and site feasibility assessments","Ensure compliance with Rwanda Building Code, RTDA, and RHA standards","Manage contractors, subcontractors, and construction schedules","Prepare progress reports and handover certificates"], education: "BSc Civil Engineering / MSc Civil Engineering", fields: "Civil Engineering, Structural Engineering, Environmental Engineering, Construction Management", exp_min: 2, exp_max: 20, skills: ["Structural design & analysis (SAP2000, ETABS)","AutoCAD, Civil 3D, and BIM (Revit)","Construction supervision & quality control","BoQ preparation & cost estimation","MS Project / project scheduling","Topographic surveying & GIS","FIDIC contract administration","Rwanda Building Code & RTDA standards","HSE compliance on site"], certs: ["REAB — Professional Engineer registration","Construction site health and safety certificate"], preferred: ["PMP certification","FIDIC contract administration training","World Bank / AfDB infrastructure project experience","ESIA knowledge"], employment_type: "Full-time" },
  { title: "Electrical Engineer", domain: "Engineering", emoji: "⚡", description: "Design, install, and maintain electrical power systems supporting Rwanda's national electrification agenda.", about_role: "Design electrical distribution networks, supervise installation works, and ensure compliance with RURA technical standards.", responsibilities: ["Design medium and low voltage distribution networks and substations","Prepare single-line diagrams, cable schedules, and protection relay settings","Supervise electrical installation works on construction sites","Conduct load flow analysis and short-circuit analysis","Commission electrical systems and conduct acceptance testing","Perform routine and preventive maintenance of electrical equipment","Participate in energy audits and demand-side management programmes"], education: "BSc Electrical Engineering / Power Systems", fields: "Electrical Engineering, Electronic Engineering, Power Systems, Mechatronics", exp_min: 2, exp_max: 18, skills: ["Power system design (MV/LV distribution)","AutoCAD Electrical & ETAP / DIgSILENT","Protection relay setting & testing","Generator & UPS commissioning","Transformer installation & maintenance","Energy audit & power quality analysis","Rwanda Grid Code & RURA standards","IEC & IEEE electrical standards"], certs: ["REAB — Professional Engineer registration","Electrical installation work licence (RURA)"], preferred: ["Renewable energy (solar PV / hydro) experience","SCADA & energy management systems","World Bank/AfDB electrification project experience","PMP"], employment_type: "Full-time" },
  { title: "Environmental Officer", domain: "Engineering", emoji: "🌍", description: "Conduct environmental assessments, monitor compliance, and ensure all projects meet REMA requirements.", about_role: "Lead EIA/SEA processes, implement environmental management plans, and engage with communities and regulatory bodies to ensure responsible operations.", responsibilities: ["Conduct Environmental Impact Assessments (EIA) and Strategic Environmental Assessments (SEA)","Develop and implement Environmental Management Plans (EMP)","Monitor environmental compliance on construction and operational sites","Liaise with REMA, RDB, and district environment officers","Implement waste management and water quality monitoring programmes","Conduct stakeholder engagement and grievance mechanism management","Train project staff on environmental and social safeguards"], education: "BSc Environmental Science / MSc Environmental Management", fields: "Environmental Science, Natural Resources Management, Geography, Environmental Engineering", exp_min: 2, exp_max: 15, skills: ["EIA / SEA","Environmental compliance monitoring","GIS & remote sensing (QGIS, ArcGIS)","Waste & pollution management","Water quality monitoring","Stakeholder engagement","ISO 14001 EMS","Biodiversity & ecosystem assessment","Rwanda Environmental Law & REMA regulations"], certs: ["REMA-approved EIA Practitioner registration","World Bank ESF training (preferred)"], preferred: ["ISO 14001 Lead Auditor","IFC Performance Standards experience","REDD+ / carbon finance training","Drone operation certification"], employment_type: "Full-time" },
  { title: "Human Resources Officer", domain: "Government", emoji: "👥", description: "Manage talent acquisition, employee relations, performance management, and HR compliance.", about_role: "Support the full employee lifecycle — from recruitment and onboarding to performance reviews, training, and offboarding — in alignment with Rwanda Labour Law.", responsibilities: ["Manage end-to-end recruitment including job posting, screening, and onboarding","Maintain and update HRIS and employee records","Coordinate performance appraisal cycles","Handle employee relations, grievances, and disciplinary procedures","Develop HR policies in line with Rwanda Labour Law No. 66/2018","Coordinate training and development programmes","Ensure statutory compliance (RSSB, maternity leave, medical insurance)"], education: "BA Human Resource Management / BBA (HR)", fields: "Human Resource Management, Business Administration, Organisational Psychology", exp_min: 2, exp_max: 12, skills: ["Talent acquisition & end-to-end recruitment","HRIS systems (IPPIS, SAP HR, BambooHR)","Performance management & appraisal","Rwanda Labour Law No. 66/2018 & RSSB compliance","Employee relations & conflict resolution","Payroll processing & statutory deductions","Training needs analysis & L&D coordination","HR policy development","Workforce analytics"], certs: ["PHR (preferred)","SHRM-CP (preferred)"], preferred: ["CHRP designation","RPSC recruitment process experience","CIPD Level 5+","Employment Equity & D&I training"], employment_type: "Full-time" },
  { title: "District Executive Secretary", domain: "Government", emoji: "🏛️", description: "Provide strategic administrative leadership and coordinate decentralised service delivery at district level.", about_role: "As the chief executive of the district, coordinate all departments, serve as secretary to the District Council, and oversee performance-based financing and Imihigo commitments.", responsibilities: ["Coordinate implementation of national development programmes at district level","Serve as Secretary to the District Council and Executive Committee","Oversee district budget management, PFM compliance, and expenditure controls","Manage Imihigo performance contracts and quarterly reporting","Coordinate all district sectors including health, education, agriculture, and infrastructure","Represent the district in inter-governmental coordination forums","Ensure implementation of the National Strategy for Transformation (NST1)"], education: "Master of Public Administration / MPA", fields: "Public Administration, Political Science, Law, Business Administration, Governance", exp_min: 5, exp_max: 30, skills: ["Public administration & decentralised governance","Policy implementation & programme management","Budget oversight & PFM","Imihigo performance contract management","Community engagement & umuganda coordination","Inter-agency coordination","Rwanda decentralisation laws & MINALOC policies","Leadership & organisational management"], certs: ["Rwanda Public Service Commission (RPSC) competitive examination clearance"], preferred: ["Rwanda Leadership Academy / RMA certificate","MINALOC or central government ministry experience","Demonstrated Imihigo performance achievement","PFM training (MINECOFIN)"], employment_type: "Full-time" },
  { title: "Project Manager", domain: "NGO", emoji: "📋", description: "Lead cross-functional teams and deliver high-impact development initiatives on time, within scope, and on budget.", about_role: "Own end-to-end project delivery — from inception planning through execution, monitoring, and donor reporting — for a major donor-funded programme.", responsibilities: ["Define and document project scope, goals, deliverables, and success metrics","Develop comprehensive project plans including WBS, timelines, and resource allocation","Lead, motivate, and coordinate multi-disciplinary project teams","Identify, assess, and proactively mitigate project risks","Manage project budget, track expenditures, and report to donors","Prepare high-quality narrative and financial reports for donors (USAID, EU, DFID)","Coordinate baseline studies, mid-term reviews, and end-of-project evaluations"], education: "Master's degree (Business, Development Studies, or relevant field)", fields: "Business Administration, Development Studies, Project Management, Social Sciences", exp_min: 3, exp_max: 20, skills: ["Project planning & scheduling (MS Project, Jira, Asana)","Logical Framework Analysis (LFA) & Theory of Change","Donor reporting (USAID, EU, DFID, Global Fund)","Budget management & cost control","Stakeholder management","Risk management","MEAL framework design","Team leadership & conflict resolution"], certs: ["PMP (preferred)","PRINCE2 Practitioner (preferred)"], preferred: ["Certified Scrum Master (CSM)","USAID / EU / DFID project management experience","Budget management experience >$1M","NST1 knowledge"], employment_type: "Full-time" },
  { title: "MEAL Officer", domain: "NGO", emoji: "📈", description: "Strengthen evidence-based programme management by designing and implementing robust M&E systems.", about_role: "Oversee data collection, analysis, and reporting to ensure programmes meet targets and contribute to organisational learning and accountability.", responsibilities: ["Design and update MEAL frameworks, indicator tracking matrices, and data collection tools","Coordinate baseline, mid-term, and end-line surveys and evaluations","Manage data collection tools using KoBoToolbox, ODK, or CommCare","Analyse quantitative and qualitative data and produce technical reports","Conduct data quality assessments and verification exercises","Prepare MEAL sections of donor progress reports","Facilitate programme learning events and after-action reviews"], education: "BSc Statistics / BA Development Studies / BSc Economics", fields: "Statistics, Development Studies, Economics, Public Health, Social Sciences", exp_min: 2, exp_max: 12, skills: ["MEAL framework design (LogFrame, Theory of Change, DMEL)","Quantitative analysis (SPSS, STATA, R)","Qualitative analysis (NVivo, Atlas.ti)","KoBoToolbox / ODK / CommCare","Data visualisation (Power BI, Tableau)","Survey design & sampling methodology","Donor reporting formats","DHIS2","Community accountability & PSEA"], certs: [], preferred: ["M&E / MEAL diploma","PEPFAR M&E training","GIS proficiency","Rwanda HIMS / DHIS2 / NISR data systems"], employment_type: "Full-time" },
  { title: "Social Worker / Case Manager", domain: "NGO", emoji: "🤝", description: "Provide professional psychosocial support, case management, and child protection services to vulnerable individuals and families.", about_role: "Identify, assess, and support vulnerable individuals including children, GBV survivors, and families in extreme poverty within MIGEPROF structures or NGOs.", responsibilities: ["Conduct vulnerability assessments and develop individual case management plans","Provide direct psychosocial support and counselling to clients","Manage caseloads for child protection, GBV, and extreme poverty beneficiaries","Make appropriate referrals to health services, legal aid, and social assistance","Facilitate support group sessions for survivors and vulnerable families","Conduct home visits to monitor client progress","Liaise with Isange One Stop Centres, district social affairs officers, and police"], education: "BA Social Work / BSc Psychology", fields: "Social Work, Psychology, Sociology, Social Sciences, Community Development", exp_min: 1, exp_max: 12, skills: ["Case management & psychosocial support","Child protection & safeguarding","GBV response & survivor-centred approach","Community assessment & social mapping","Motivational interviewing & counselling","Referral pathway management","Social protection (Ubudehe, VUP)","Kinyarwanda fluency"], certs: ["Rwanda Social Workers Council registration (preferred)","Child Safeguarding and Protection certification"], preferred: ["Psychological First Aid (PFA)","GBV Case Management certificate (UNHCR/IRC)","MIGEPROF / MINISANTE / ONE UN Rwanda experience","Rwanda Integrated Child Protection System (ICPS)"], employment_type: "Full-time" },
  { title: "Nutrition Officer", domain: "NGO", emoji: "🥗", description: "Design, implement, and evaluate nutrition programmes aimed at reducing malnutrition in Rwanda.", about_role: "Coordinate community and facility-based nutrition interventions aligned with Rwanda's Multi-Sector Nutrition Policy.", responsibilities: ["Implement CMAM (Community-based Management of Acute Malnutrition) protocols","Conduct MUAC screening, growth monitoring, and promotion (GMP) sessions","Train and support community health workers on nutrition SBCC","Facilitate cooking demonstrations and dietary diversity education","Coordinate supplementary and therapeutic feeding programmes","Collect and analyse nutrition surveillance data and report to CNLG/MoH","Liaise with health facilities, districts, and WFP/UNICEF on supply chains"], education: "BSc Nutrition & Dietetics / BSc Food Science & Nutrition", fields: "Nutrition, Dietetics, Food Science, Public Health, Agriculture", exp_min: 1, exp_max: 12, skills: ["CMAM & therapeutic feeding (RUTF)","Anthropometric measurement & MUAC screening","Nutrition SBCC design","Growth monitoring & promotion (GMP)","Nutrition surveillance (DHIS2)","Community mobilisation","Emergency nutrition response","IYCF counselling","Micronutrient supplementation"], certs: ["Rwanda Allied Health Professions Council — Nutrition/Dietetics licence"], preferred: ["SQUEAC / SMART survey methodology","WFP / UNICEF / Action Against Hunger experience","Nutrition-Sensitive Agriculture training","SPHERE standards & humanitarian nutrition"], employment_type: "Full-time" },
  { title: "Hotel Manager", domain: "Hospitality", emoji: "🏨", description: "Lead all aspects of hotel operations, deliver exceptional guest experiences, and drive revenue growth.", about_role: "Oversee front office, housekeeping, food and beverage, and maintenance departments, ensuring compliance with RDB tourism standards.", responsibilities: ["Provide strategic and operational leadership for all hotel departments","Drive revenue management, rate optimisation, and occupancy targets","Recruit, train, and manage hotel staff","Monitor and maintain hotel quality standards in line with RDB classifications","Handle VIP guest relations and resolve complex guest complaints","Manage hotel P&L, budgeting, and operational cost controls","Ensure compliance with Rwanda tourism, health, and safety regulations"], education: "BSc Hospitality Management / BBA Tourism", fields: "Hospitality Management, Tourism, Hotel Management, Business Administration", exp_min: 5, exp_max: 25, skills: ["Hotel operations management (front office, housekeeping, F&B)","Revenue management & yield optimisation","Hotel PMS systems (Opera, Protel, Mews)","Financial management, P&L, and budgeting","Guest experience management","Staff recruitment, training, and performance management","Rwanda RDB hotel classification standards","MICE & event management","HACCP compliance"], certs: ["RDB Tourism Operator Certification","Food handler / hygiene certification"], preferred: ["International hotel brand experience (Marriott, Radisson, Accor)","Revenue management certification (CRME)","Fluency in French, English, and Swahili","MICE conference management"], employment_type: "Full-time" },
  { title: "Tour Guide", domain: "Hospitality", emoji: "🦍", description: "Lead exceptional visitor experiences across Rwanda's iconic destinations including Volcanoes, Nyungwe, and Akagera.", about_role: "Conduct guided tours for local and international visitors, providing expert knowledge of Rwanda's wildlife, history, culture, and ecosystems.", responsibilities: ["Lead guided tours including gorilla trekking, birdwatching, and cultural visits","Provide accurate, engaging commentary on wildlife, culture, and history","Ensure the safety and comfort of tourists throughout all activities","Coordinate logistics with safari lodges, RDB rangers, and transport providers","Promote responsible tourism and conservation values","Handle tourist queries, emergencies, and complaints professionally","Uphold RDB code of conduct for licensed tour guides"], education: "Diploma / BA Tourism & Hospitality", fields: "Tourism, Hospitality, Wildlife Management, Cultural Studies, Environmental Science", exp_min: 1, exp_max: 15, skills: ["Tour guiding & visitor experience facilitation","Knowledge of Rwanda's national parks (Volcanoes, Nyungwe, Akagera)","Wildlife identification & natural history interpretation","Rwanda cultural heritage & genocide memorial interpretation","Customer service & public speaking","Multilingual communication (English, French, Swahili essential)","First aid & emergency response","Conservation & responsible tourism"], certs: ["RDB Licensed Tour Guide Certificate","Wilderness First Aid (WFA) or First Responder"], preferred: ["Additional language (Spanish, German, Chinese)","Ornithology or primate behaviour training","Drone operation licence","MICE & cultural diplomacy tours"], employment_type: "Full-time" },
  { title: "Legal Counsel", domain: "Legal", emoji: "⚖️", description: "Provide expert legal advice, manage litigation, and ensure compliance with Rwandan law and international regulations.", about_role: "Serve as the principal legal adviser, drafting and reviewing contracts, managing disputes, and advising leadership on legal risks related to all organisational activities.", responsibilities: ["Provide authoritative legal advice to management on all legal matters","Draft, review, and negotiate contracts, MoUs, and legal agreements","Manage litigation and represent the organisation in court or arbitration","Advise on labour law compliance and employment contract disputes","Ensure regulatory compliance with Rwanda laws, RURA, RDB, and sector regulations","Conduct legal due diligence for partnerships, mergers, and procurement","Brief the Board on legislative changes affecting the organisation"], education: "Bachelor of Laws (LLB) / Master of Laws (LLM)", fields: "Law, Legal Studies, Commercial Law, International Law", exp_min: 3, exp_max: 20, skills: ["Rwanda contract law & commercial law","Legal drafting & contract review","Litigation & dispute resolution","Labour law & employment disputes","Corporate governance & compliance","Legal research & case preparation","Negotiation & ADR","Rwanda Civil Procedure Code","Anti-corruption & compliance frameworks"], certs: ["Rwanda Bar Association (RBA) admission","Notary licence (if applicable)"], preferred: ["LLM in Commercial or International Law","KIAC arbitration certification","Bilingual — English and French","Financial sector / NGO / public sector legal practice"], employment_type: "Full-time" },
  { title: "Communications & PR Officer", domain: "Media", emoji: "📣", description: "Manage our brand reputation, media relations, and internal and external communications strategy.", about_role: "Lead content creation, media engagement, digital campaigns, and stakeholder communication to strengthen visibility and credibility in Rwanda and beyond.", responsibilities: ["Develop and implement the annual communications and PR strategy","Write and distribute press releases, media advisories, and organisational statements","Manage relationships with local and international media","Create content for social media platforms (Twitter/X, LinkedIn, Facebook, Instagram)","Produce newsletters, annual reports, brochures, and digital publications","Manage the organisation's website content and SEO","Develop crisis communication protocols and messaging"], education: "BA Journalism & Mass Communication / BA Public Relations", fields: "Journalism, Mass Communication, Public Relations, Communications, Media Studies", exp_min: 2, exp_max: 12, skills: ["Press release & media advisory writing","Social media strategy & content creation","Website management (WordPress CMS)","Photography & basic videography","Adobe Creative Suite / Canva","Media monitoring & press clipping","Speech writing & editorial support","Crisis communication & reputation management","SEO & digital marketing basics","Bilingual content (English & Kinyarwanda)"], certs: ["Rwanda Media Commission (RMC) accreditation"], preferred: ["Google Digital Marketing & E-Commerce Certificate","Crisis Communications certification","International development / government communications experience","Podcast production or broadcast media experience"], employment_type: "Full-time" },
  { title: "Renewable Energy Engineer (Solar)", domain: "Energy", emoji: "☀️", description: "Support Rwanda's universal electrification targets through design and installation of solar PV and off-grid systems.", about_role: "Design, install, commission, and maintain solar PV systems from household kits to mini-grid installations serving rural communities.", responsibilities: ["Design on-grid and off-grid solar PV systems including load assessment and sizing","Prepare technical drawings, single-line diagrams, and equipment specifications","Manage installation works including panel mounting, battery storage, and inverters","Commission, test, and hand over solar installations","Conduct energy audits and recommend energy efficiency improvements","Train technicians and beneficiaries on system operation and maintenance","Liaise with RURA and REG on grid-connection approvals and net metering"], education: "BSc Electrical Engineering / BSc Renewable Energy Engineering", fields: "Electrical Engineering, Renewable Energy, Energy Systems, Mechanical Engineering", exp_min: 2, exp_max: 15, skills: ["Solar PV system design & sizing (PVSyst, HOMER)","AutoCAD Electrical","Battery storage systems (Li-ion, lead-acid)","Off-grid & mini-grid system design","Energy audit & load analysis","RURA grid connection & net metering","System commissioning & acceptance testing","O&M planning"], certs: ["REAB registration","NABCEP Solar PV Installation Professional (preferred)","RURA electrical installation work licence"], preferred: ["Mini-grid project implementation in rural Rwanda","Energy Access programmes (ESMAP, SREP, REA)","Drone operation licence for site surveys","BESS design competency"], employment_type: "Full-time" },
  { title: "Architect", domain: "Other", emoji: "📐", description: "Lead the design and supervision of residential, commercial, and public building projects in Rwanda.", about_role: "Manage the full design cycle from concept to construction completion, ensuring all projects comply with RHA building code and Kigali City Master Plan.", responsibilities: ["Develop concept designs, design development drawings, and construction documents","Lead BIM modelling using Revit or ArchiCAD for complex projects","Coordinate with structural, MEP, and landscape engineers","Prepare planning applications and building permit submissions to RHA/City of Kigali","Conduct site inspections and quality supervision during construction","Prepare Bills of Quantities and tender documentation","Ensure compliance with green building and energy efficiency standards"], education: "Bachelor of Architecture (B.Arch) / Master of Architecture", fields: "Architecture, Urban Design, Urban Planning, Architectural Engineering", exp_min: 2, exp_max: 20, skills: ["Architectural design & documentation","AutoCAD & Revit BIM / ArchiCAD","3D visualisation (SketchUp, Lumion, 3ds Max)","Building Code compliance (RHA, Kigali Master Plan)","Construction supervision & quality control","BoQ preparation","Green building design (EDGE certification)","Project coordination with MEP & structural engineers"], certs: ["Rwanda Architects Association (RAA) — Professional Architect","REAB registration"], preferred: ["EDGE Green Building certification","LEED AP","Affordable / social housing experience","Urban design & master planning"], employment_type: "Full-time" },
  { title: "Supply Chain & Logistics Manager", domain: "Other", emoji: "🚚", description: "Oversee end-to-end supply chain operations, optimise procurement and distribution, and ensure timely delivery.", about_role: "Lead a team responsible for sourcing, warehousing, inventory management, transport, and customs clearance, ensuring cost efficiency across the supply chain.", responsibilities: ["Develop and implement supply chain strategy","Manage procurement, vendor selection, and contract negotiation","Oversee inventory management, warehouse operations, and stock controls","Coordinate international freight, customs clearance, and import/export compliance","Manage logistics providers and last-mile delivery","Implement supply chain ERP systems (SAP, Oracle)","Ensure compliance with Rwanda Revenue Authority (RRA) customs regulations"], education: "BSc Supply Chain Management / BCom Logistics", fields: "Supply Chain Management, Logistics, Business Administration, Procurement", exp_min: 3, exp_max: 18, skills: ["End-to-end supply chain management","Procurement & strategic sourcing","Inventory management & warehouse operations","International freight & customs clearance (Rwanda RRA)","ERP systems (SAP MM, Oracle SCM)","Supplier relationship management","Demand forecasting & planning","Supply chain risk management","Incoterms & international trade"], certs: ["CIPS Level 5 — Advanced Diploma","APICS CSCP (preferred)"], preferred: ["CIPS Level 6","Six Sigma Green Belt","Humanitarian supply chain experience (UNHCR, WFP)","EAC trade facilitation & Customs Union protocols"], employment_type: "Full-time" },
  { title: "Graphic Designer", domain: "Other", emoji: "🎨", description: "Create compelling visual content for print and digital platforms, strengthening brand identity and communications impact.", about_role: "Translate strategic communications briefs into high-quality designs across brand materials, social media, publications, and marketing collateral.", responsibilities: ["Design digital and print materials including brochures, reports, and social media graphics","Maintain and enforce brand identity guidelines across all visual outputs","Create infographics, data visualisations, and impact report layouts","Design presentations, PowerPoint templates, and pitch decks","Edit photos and produce short motion graphics or animations","Manage and organise the digital asset library","Prepare print-ready files and liaise with printers"], education: "BA Graphic Design / BA Visual Communication", fields: "Graphic Design, Visual Communication, Fine Arts, Multimedia Design", exp_min: 1, exp_max: 10, skills: ["Adobe Illustrator, Photoshop & InDesign (essential)","Canva Pro","Brand identity management","Infographic & data visualisation design","Typography & layout principles","Print production & pre-press","Basic video editing (Adobe Premiere)","Motion graphics (After Effects)","Digital asset management"], certs: [], preferred: ["Adobe Certified Professional (ACP)","UI/UX design (Figma or Adobe XD)","3D design / product visualisation","Photography skills"], employment_type: "Full-time" },
  { title: "Fleet & Transport Manager", domain: "Other", emoji: "🚗", description: "Oversee the full lifecycle management of our vehicle fleet, ensuring safety, regulatory compliance, and cost efficiency.", about_role: "Manage drivers, vehicle maintenance, fuel systems, and Rwanda National Police compliance, supporting field operations across multiple districts.", responsibilities: ["Manage a diverse fleet of vehicles including 4WDs, motorcycles, and trucks","Develop and implement preventive maintenance schedules for all vehicles","Coordinate vehicle registration, insurance, and Rwanda National Police inspections","Manage driver recruitment, licensing, and defensive driving training","Implement a fleet management information system (FMIS)","Manage fuel consumption, fuel cards, and anti-fraud controls","Oversee accident reporting, investigation, and insurance claims processing"], education: "BSc Automotive Engineering / BBA (Logistics) / BSc Mechanical Engineering", fields: "Automotive Engineering, Mechanical Engineering, Logistics, Business Administration", exp_min: 3, exp_max: 15, skills: ["Fleet lifecycle management","Preventive maintenance scheduling","Rwanda RNP vehicle inspection & compliance","Driver management & safety training","Fuel management & fraud prevention","Fleet management software & GPS tracking","Accident investigation & insurance claims","Budget management & cost analysis"], certs: ["Valid Rwanda Category B+ driving licence","Defensive driving instructor certification (preferred)"], preferred: ["NAFA or IAM Roadsmart Fleet Management certification","Fleet management for NGOs / UN agencies / government","Rwanda PFM asset management regulations","Electric vehicle (EV) fleet management training"], employment_type: "Full-time" }
];

// Helper: parse education string to required_education_levels
function parseEducationLevel(eduStr) {
  if (!eduStr) return "Bachelor's";
  const lower = eduStr.toLowerCase();
  if (lower.includes('phd')) return 'PhD';
  if (lower.includes('master')) return "Master's";
  if (lower.includes('bachelor')) return "Bachelor's";
  if (lower.includes('diploma')) return 'Diploma';
  return "Bachelor's";
}

// Helper: generate required_degrees array from fields and education level
function generateDegreesFromFields(fieldsStr, eduLevel) {
  const fields = fieldsStr.split(',').map(f => f.trim()).filter(f => f);
  const degrees = [];
  const level = eduLevel.includes("Master") ? "Master's" : eduLevel.includes("Diploma") ? "Diploma" : eduLevel.includes("PhD") ? "PhD" : "Bachelor's";
  
  fields.forEach(field => {
    if (level === "Bachelor's") degrees.push(`Bachelor's degree in ${field}`);
    else if (level === "Master's") degrees.push(`Master's degree in ${field}`);
    else if (level === "Diploma") degrees.push(`Advanced Diploma in ${field}`);
    else if (level === "PhD") degrees.push(`PhD in ${field}`);
  });
  if (degrees.length === 0) degrees.push(`${level} in relevant discipline`);
  return degrees;
}

// Build JOB_TEMPLATES from Rwanda dataset
const JOB_TEMPLATES = {};
RWANDA_JOBS_DATA.forEach(job => {
  const eduLevel = parseEducationLevel(job.education);
  JOB_TEMPLATES[job.title] = {
    description: job.description,
    about_role: job.about_role,
    responsibilities: job.responsibilities,
    employment_type: job.employment_type || 'Full-time',
    required_education_levels: eduLevel,
    required_degrees: generateDegreesFromFields(job.fields, eduLevel),
    required_fields: job.fields,
    required_min_experience: job.exp_min,
    required_max_experience: job.exp_max,
    required_skills: job.skills,
    required_certifications: job.certs,
    preferred_qualifications: job.preferred,
  };
});

const JOB_TITLES = Object.keys(JOB_TEMPLATES);

// ── Tag Input ────────────────────────────────────────────────
function TagInput({ label, hint, icon, tags, onChange, placeholder, color = B.blue }) {
  const [input, setInput] = useState('')
  const add    = () => { const v = input.trim(); if (v && !tags.includes(v)) onChange([...tags, v]); setInput('') }
  const remove = (i) => onChange(tags.filter((_, idx) => idx !== i))
  const onKey  = e => {
    if (e.key === 'Enter')    { e.preventDefault(); add() }
    if (e.key === 'Backspace' && !input && tags.length) remove(tags.length - 1)
  }
  return (
    <div>
      <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 7 }}>
        {icon && <span style={{ color }}>{icon}</span>}
        {label}
        {hint && (
          <span style={{ color: B.textLight, fontWeight: 500, textTransform: 'none', fontSize: '.72rem', marginLeft: 4, letterSpacing: 0 }}>
            {hint}
          </span>
        )}
      </label>
      <div
        style={{
          minHeight:    52,
          padding:      '8px 12px',
          border:       `2px solid ${B.border}`,
          borderRadius: 8,
          background:   B.white,
          display:      'flex',
          flexWrap:     'wrap',
          gap:          6,
          alignItems:   'center',
          cursor:       'text',
        }}
        onClick={e => e.currentTarget.querySelector('input')?.focus()}
      >
        {tags.map((t, i) => (
          <span key={i} style={{
            display:     'inline-flex',
            alignItems:  'center',
            gap:         5,
            padding:     '4px 12px',
            borderRadius:99,
            background:  color + '20',
            border:      `1.5px solid ${color}60`,
            color:       color,
            fontSize:    '0.8rem',
            fontWeight:  700,
          }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>{t}</span>
            <button
              type="button"
              onClick={() => remove(i)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color, padding: 0, display: 'flex', alignItems: 'center' }}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKey}
          onBlur={add}
          placeholder={tags.length === 0 ? placeholder : 'Add more…'}
          style={{
            flex:       1,
            minWidth:   160,
            border:     'none',
            outline:    'none',
            background: 'transparent',
            fontSize:   '0.9rem',
            color:      B.text,
            fontFamily: 'inherit',
          }}
        />
      </div>
      <div style={{ fontSize: '.72rem', color: B.textLight, marginTop: 5, display: 'flex', alignItems: 'center', gap: 4 }}>
        Press{' '}
        <kbd style={{
          padding:      '1px 6px',
          background:   B.bg,
          border:       `1px solid ${B.border}`,
          borderRadius: 4,
          fontSize:     '.7rem',
          color:        B.textMid,
          fontWeight:   600,
        }}>Enter</kbd>
        {' '}or click away to add
      </div>
    </div>
  )
}

// ── Section Header ───────────────────────────────────────────
function SectionHeader({ icon, title, subtitle, color = B.blue, step }) {
  return (
    <div style={{
      display:       'flex',
      alignItems:    'flex-start',
      gap:           14,
      paddingBottom: 16,
      borderBottom:  `2px solid ${B.borderLight}`,
      marginBottom:  20,
    }}>
      {step && (
        <div style={{
          width:          28,
          height:         28,
          borderRadius:   '50%',
          background:     color,
          color:          B.white,
          fontSize:       '.75rem',
          fontWeight:     900,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          flexShrink:     0,
          marginTop:      4,
        }}>
          {step}
        </div>
      )}
      <div style={{
        width:          40,
        height:         40,
        borderRadius:   10,
        flexShrink:     0,
        background:     color + '18',
        border:         `1.5px solid ${color}40`,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
      }}>
        <span style={{ color }}>{icon}</span>
      </div>
      <div>
        <div style={{ fontWeight: 800, fontSize: '1rem', color: B.text, letterSpacing: '-.01em' }}>{title}</div>
        {subtitle && <div style={{ fontSize: '.78rem', color: B.textLight, marginTop: 3 }}>{subtitle}</div>}
      </div>
    </div>
  )
}

// ── Info Banner ──────────────────────────────────────────────
function InfoBanner({ children, color = B.blue, bg, border }) {
  return (
    <div style={{
      padding:      '11px 16px',
      background:   bg  || color + '10',
      border:       `1.5px solid ${border || color + '40'}`,
      borderRadius: 8,
      fontSize:     '0.82rem',
      color:        color,
      display:      'flex',
      gap:          9,
      alignItems:   'flex-start',
      fontWeight:   500,
      lineHeight:   1.6,
    }}>
      <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{children}</span>
    </div>
  )
}

function fmtDeadlinePreview(dtStr) {
  if (!dtStr) return ''
  try {
    return new Date(dtStr).toLocaleString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return dtStr }
}

// Shared styles
const inputStyle = {
  width:        '100%',
  padding:      '11px 14px',
  borderRadius: 8,
  border:       `2px solid ${B.border}`,
  background:   B.white,
  color:        B.text,
  fontSize:     '0.95rem',
  fontWeight:   500,
  boxSizing:    'border-box',
  outline:      'none',
  fontFamily:   'inherit',
  transition:   'border-color .15s',
}

const labelStyle = {
  display:       'block',
  fontSize:      '0.78rem',
  fontWeight:    800,
  color:         B.textMid,
  textTransform: 'uppercase',
  letterSpacing: '.07em',
  marginBottom:  8,
}

export default function HRJobCreate() {
  const navigate   = useNavigate()
  const [loading,   setLoading]   = useState(false)
  const [activeTab, setActiveTab] = useState('form')

  const defaultDeadline = () => {
    const d   = new Date()
    d.setDate(d.getDate() + 14)
    d.setHours(17, 0, 0, 0)
    const pad = n => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const [form, setForm] = useState({
    title: '', description: '', about_role: '', responsibilities: [],
    location: '', employment_type: 'Full-time', job_level: '', number_of_posts: 1,
    deadline: defaultDeadline(),
    required_education_levels: "Bachelor's", required_degrees: [],
    required_fields: '', required_min_experience: 0, required_max_experience: 10,
    required_skills: [], required_certifications: [], preferred_qualifications: [],
  })

  const handle    = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  const setArr    = key => val => setForm(f => ({ ...f, [key]: val }))
  const serialize = val => Array.isArray(val) ? val.join(', ') : (val || '')

  const applyTemplate = (title) => {
    const tpl = JOB_TEMPLATES[title]
    if (!tpl) {
      setForm(f => ({ ...f, title }))
      return
    }
    setForm(f => ({
      ...f, title,
      description:               tpl.description,
      about_role:                tpl.about_role,
      responsibilities:          tpl.responsibilities          || [],
      employment_type:           tpl.employment_type           || 'Full-time',
      required_education_levels: tpl.required_education_levels || "Bachelor's",
      required_degrees:          tpl.required_degrees          || [],
      required_fields:           tpl.required_fields           || '',
      required_min_experience:   tpl.required_min_experience   ?? 0,
      required_max_experience:   tpl.required_max_experience   ?? 10,
      required_skills:           tpl.required_skills           || [],
      required_certifications:   tpl.required_certifications   || [],
      preferred_qualifications:  tpl.preferred_qualifications  || [],
    }))
    toast.success(`Template loaded for "${title}" — review and customise before posting`, { duration: 4000 })
  }

  const submit = async e => {
    e.preventDefault()
    if (!form.required_skills.length)  { toast.error('Add at least one required skill'); return }
    if (!form.required_fields.trim())  { toast.error('Required fields of study cannot be empty'); return }
    if (!form.required_degrees.length) { toast.error('Add at least one required degree'); return }
    if (!form.responsibilities.length) { toast.error('Add at least one responsibility'); return }
    if (!form.deadline)                { toast.error('Please set an application deadline'); return }

    const deadlineWithSeconds = form.deadline.length === 16
      ? form.deadline + ':00'
      : form.deadline

    setLoading(true)
    try {
      await api.post('/jobs', {
        title:                     form.title,
        description:               form.description,
        about_role:                form.about_role,
        responsibilities:          serialize(form.responsibilities),
        location:                  form.location,
        employment_type:           form.employment_type,
        job_level:                 form.job_level,
        number_of_posts:           Number(form.number_of_posts),
        deadline:                  deadlineWithSeconds,
        required_education_levels: serialize(form.required_degrees) || form.required_education_levels,
        required_fields:           form.required_fields,
        required_min_experience:   Number(form.required_min_experience),
        required_max_experience:   Number(form.required_max_experience),
        required_skills:           serialize(form.required_skills),
        required_certifications:   serialize(form.required_certifications),
        preferred_qualifications:  serialize(form.preferred_qualifications),
      })
      toast.success('Job posted successfully!')
      navigate('/hr')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create job')
    } finally {
      setLoading(false)
    }
  }

  const cardStyle = {
    background:   B.white,
    border:       `1.5px solid ${B.borderLight}`,
    borderRadius: 14,
    padding:      '28px 30px',
    display:      'flex',
    flexDirection:'column',
    gap:          20,
    boxShadow:    '0 1px 6px rgba(15,23,42,.06)',
  }

  return (
    <>
      <Helmet><title>Post a Job — GI Recruitment Network</title></Helmet>
      <div className="page-wrapper" style={{ background: B.bg, minHeight: '100vh' }}>
        <Navbar />

        <div style={{
          background: `linear-gradient(135deg, ${B.navy} 0%, #1e3a5f 45%, ${B.blue} 100%)`,
          padding:    '44px 20px 40px',
          color:      B.white,
          borderBottom: `3px solid ${B.blueLight}`,
        }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <button
              onClick={() => navigate('/hr')}
              style={{
                display:      'inline-flex',
                alignItems:   'center',
                gap:          7,
                padding:      '8px 16px',
                borderRadius: 7,
                border:       '2px solid rgba(255,255,255,0.45)',
                background:   'rgba(255,255,255,0.12)',
                color:        B.white,
                fontWeight:   700,
                fontSize:     '0.82rem',
                cursor:       'pointer',
                marginBottom: 22,
                letterSpacing:'.02em',
              }}
            >
              <ArrowLeft size={14} /> Back to Dashboard
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{
                width:          56,
                height:         56,
                borderRadius:   14,
                background:     'rgba(255,255,255,0.18)',
                border:         '2px solid rgba(255,255,255,0.3)',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
              }}>
                <Briefcase size={26} color={B.white} />
              </div>
              <div>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 900, color: B.white, margin: 0, letterSpacing: '-.02em' }}>
                  Post a New Job
                </h1>
                <p style={{ color: '#93c5fd', fontSize: '0.88rem', margin: '4px 0 0', fontWeight: 500 }}>
                  Detailed requirements help the AI accurately shortlist the right candidates
                </p>
              </div>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 20px' }}>
          <div style={{
            display:      'flex',
            gap:          0,
            marginBottom: 28,
            background:   B.white,
            borderRadius: 10,
            padding:      5,
            width:        'fit-content',
            border:       `1.5px solid ${B.borderLight}`,
            boxShadow:    '0 1px 4px rgba(15,23,42,.07)',
          }}>
            {['form', 'preview'].map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                style={{
                  padding:      '9px 24px',
                  borderRadius: 7,
                  border:       'none',
                  cursor:       'pointer',
                  fontWeight:   700,
                  fontSize:     '0.85rem',
                  letterSpacing:'.02em',
                  background:   activeTab === tab ? B.blue    : 'transparent',
                  color:        activeTab === tab ? B.white   : B.textLight,
                  boxShadow:    activeTab === tab ? '0 2px 8px rgba(37,99,235,.35)' : 'none',
                  transition:   'all .18s',
                }}
              >
                {tab === 'form' ? '✏️  Edit Form' : '👁  Preview'}
              </button>
            ))}
          </div>

          <div style={{
            display:             'grid',
            gridTemplateColumns: activeTab === 'preview' ? '1fr' : '1fr 380px',
            gap:                 28,
            alignItems:          'start',
          }}>
            {activeTab === 'form' && (
              <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                <div style={{
                  padding:      '16px 20px',
                  background:   `linear-gradient(135deg, ${B.navy} 0%, #1e3a5f 100%)`,
                  borderRadius: 12,
                  display:      'flex',
                  alignItems:   'center',
                  gap:          14,
                  boxShadow:    '0 2px 10px rgba(15,23,42,.18)',
                }}>
                  <div style={{
                    width:          40,
                    height:         40,
                    borderRadius:   10,
                    background:     B.blue,
                    display:        'flex',
                    alignItems:     'center',
                    justifyContent: 'center',
                    flexShrink:     0,
                    boxShadow:      '0 2px 8px rgba(37,99,235,.5)',
                  }}>
                    <Zap size={18} color={B.white} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: '0.85rem', color: B.white, marginBottom: 8, letterSpacing: '.02em' }}>
                      ⚡ Quick-Start with a Template
                    </div>
                    <select
                      style={{
                        width:        '100%',
                        padding:      '9px 12px',
                        borderRadius: 7,
                        border:       `2px solid rgba(255,255,255,0.25)`,
                        background:   'rgba(255,255,255,0.12)',
                        fontSize:     '0.88rem',
                        color:        B.white,
                        cursor:       'pointer',
                        fontFamily:   'inherit',
                        fontWeight:   600,
                      }}
                      value={JOB_TITLES.includes(form.title) ? form.title : ''}
                      onChange={e => { if (e.target.value) applyTemplate(e.target.value) }}
                    >
                      <option value="" style={{ color: B.text, background: B.white }}>— Select a template to auto-fill all fields —</option>
                      {JOB_TITLES.map(t => <option key={t} value={t} style={{ color: B.text, background: B.white }}>{t}</option>)}
                    </select>
                  </div>
                </div>

                <div style={cardStyle}>
                  <SectionHeader step="1" icon={<Briefcase size={20} />} title="Basic Information" subtitle="Core details displayed on the job listing" color={B.blue} />
                  <div>
                    <label style={labelStyle}>Job Title <span style={{ color: B.red }}>*</span></label>
                    <input style={inputStyle} name="title" placeholder="e.g. Accountant, Software Engineer, Registered Nurse" value={form.title} onChange={handle} required />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                    <div>
                      <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}><MapPin size={13} color={B.textLight} /> Location</label>
                      <input style={inputStyle} name="location" placeholder="e.g. Kigali, Rwanda / Remote" value={form.location} onChange={handle} />
                    </div>
                    <div>
                      <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}><Users size={13} color={B.textLight} /> Employment Type</label>
                      <select style={inputStyle} name="employment_type" value={form.employment_type} onChange={handle}>
                        <option>Full-time</option><option>Part-time</option><option>Contract</option><option>Internship</option><option>Consultancy</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                    <div>
                      <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}><BarChart2 size={13} color={B.violet} /> Job Level</label>
                      <select style={inputStyle} name="job_level" value={form.job_level} onChange={handle}>
                        <option value="">— Select Level —</option>
                        {JOB_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}><Users size={13} color={B.violet} /> Number of Posts <span style={{ color: B.red }}>*</span></label>
                      <input style={inputStyle} type="number" name="number_of_posts" min="1" max="100" value={form.number_of_posts} onChange={handle} required />
                    </div>
                  </div>
                  <div>
                    <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}><Timer size={13} color={B.red} /> Application Deadline <span style={{ color: B.red }}>*</span><span style={{ color: B.textLight, fontWeight: 500, fontSize: '.72rem', textTransform: 'none', letterSpacing: 0 }}> — exact date & time when the position closes</span></label>
                    <input style={{ ...inputStyle, borderColor: B.red + '60' }} type="datetime-local" name="deadline" min={(() => { const now = new Date(); const pad = n => String(n).padStart(2,'0'); return `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}` })()} value={form.deadline} onChange={handle} required />
                    {form.deadline && <div style={{ marginTop: 8, padding: '8px 14px', borderRadius: 7, background: '#fff7ed', border: '1.5px solid #fed7aa', fontSize: '0.8rem', color: '#9a3412', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><Timer size={13} /> Closes on {fmtDeadlinePreview(form.deadline)}</div>}
                  </div>
                </div>

                <div style={cardStyle}>
                  <SectionHeader step="2" icon={<FileText size={20} />} title="Role Description" subtitle="Help candidates understand the position in full detail" color={B.violet} />
                  <div>
                    <label style={labelStyle}>Short Overview <span style={{ color: B.red }}>*</span></label>
                    <textarea style={{ ...inputStyle, minHeight: 88, resize: 'vertical', lineHeight: 1.7 }} name="description" rows={3} placeholder="A concise 2–3 sentence summary shown on the listings page…" value={form.description} onChange={handle} required />
                  </div>
                  <div>
                    <label style={labelStyle}>About the Role</label>
                    <textarea style={{ ...inputStyle, minHeight: 120, resize: 'vertical', lineHeight: 1.7 }} name="about_role" rows={5} placeholder="Detailed description of what the role entails, the team, work environment…" value={form.about_role} onChange={handle} />
                  </div>
                  <TagInput label="Key Responsibilities" hint="— press Enter after each" icon={<FileText size={14} />} tags={form.responsibilities} onChange={setArr('responsibilities')} placeholder="e.g. Prepare monthly financial statements" color={B.violet} />
                </div>

                <div style={cardStyle}>
                  <SectionHeader step="3" icon={<GraduationCap size={20} />} title="Education Requirements" subtitle="Specify exact degrees and academic levels required" color={B.sky} />
                  <InfoBanner color={B.sky}>Add each accepted degree in full — e.g. <strong>"Bachelor of Science in Accounting"</strong>. The AI matches these exactly against applicant submissions.</InfoBanner>
                  <TagInput label="Accepted Degrees / Qualifications" hint="— one per entry, press Enter" icon={<GraduationCap size={14} />} tags={form.required_degrees} onChange={setArr('required_degrees')} placeholder="e.g. Bachelor of Commerce in Accounting" color={B.sky} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                    <div>
                      <label style={labelStyle}>Minimum Education Level <span style={{ color: B.red }}>*</span></label>
                      <select style={inputStyle} name="required_education_levels" value={form.required_education_levels} onChange={handle}>
                        <option value="Diploma">Diploma</option><option value="Bachelor's">Bachelor's Degree</option><option value="Master's">Master's Degree</option><option value="PhD">PhD / Doctorate</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Fields of Study <span style={{ color: B.red }}>*</span> <span style={{ color: B.textLight, fontWeight: 500, fontSize: '.71rem', textTransform: 'none', letterSpacing: 0 }}>(comma-separated)</span></label>
                      <input style={inputStyle} name="required_fields" placeholder="e.g. Accounting, Finance, Business Administration" value={form.required_fields} onChange={handle} required />
                    </div>
                  </div>
                </div>

                <div style={cardStyle}>
                  <SectionHeader step="4" icon={<Clock size={20} />} title="Experience Requirements" subtitle="Set the acceptable years of professional experience" color={B.amber} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                    <div><label style={labelStyle}>Minimum Experience (years) <span style={{ color: B.red }}>*</span></label><input style={inputStyle} type="number" name="required_min_experience" min="0" max="30" value={form.required_min_experience} onChange={handle} required /></div>
                    <div><label style={labelStyle}>Maximum Experience (years) <span style={{ color: B.red }}>*</span></label><input style={inputStyle} type="number" name="required_max_experience" min="0" max="50" value={form.required_max_experience} onChange={handle} required /></div>
                  </div>
                  <div style={{ padding: '12px 16px', background: '#fffbeb', border: '2px solid #fcd34d', borderRadius: 8, fontSize: '0.82rem', color: '#78350f', display: 'flex', gap: 10, alignItems: 'center', fontWeight: 600 }}><Info size={16} style={{ flexShrink: 0, color: B.amber }} />Applicants with fewer than <strong style={{ background: B.amber, color: B.white, padding: '1px 9px', borderRadius: 99, fontSize: '0.85rem' }}>{form.required_min_experience} yr{form.required_min_experience !== 1 ? 's' : ''}</strong> of experience will be <strong>automatically disqualified</strong>.</div>
                </div>

                <div style={cardStyle}>
                  <SectionHeader step="5" icon={<Wrench size={20} />} title="Required Skills" subtitle="The AI matches these directly against applicants' CVs" color={B.violet} />
                  <InfoBanner color={B.violet}>Be specific — write <strong>"Anaesthesia monitoring"</strong> not just <em>"Medical skills"</em>. Applicants matching fewer than <strong>30%</strong> of skills are automatically disqualified.</InfoBanner>
                  <TagInput label="Required Skills" hint="— press Enter after each" icon={<Wrench size={14} />} tags={form.required_skills} onChange={setArr('required_skills')} placeholder="e.g. Financial reporting (IFRS/GAAP)" color={B.violet} />
                </div>

                <div style={cardStyle}>
                  <SectionHeader step="6" icon={<Award size={20} />} title="Certifications & Licences" subtitle="Professional certifications and licences required or preferred" color={B.amber} />
                  <TagInput label="Required Certifications / Licences" hint="— press Enter after each" icon={<Award size={14} />} tags={form.required_certifications} onChange={setArr('required_certifications')} placeholder="e.g. Certified Public Accountant (CPA)" color={B.amber} />
                  <TagInput label="Preferred / Nice-to-Have Qualifications" hint="— press Enter after each" icon={<Star size={14} />} tags={form.preferred_qualifications} onChange={setArr('preferred_qualifications')} placeholder="e.g. CFA Level I or above" color={B.emerald} />
                </div>

                <div style={{ display: 'flex', gap: 14, paddingBottom: 48 }}>
                  <button type="button" onClick={() => navigate('/hr')} style={{ flex: 1, padding: '14px', borderRadius: 10, border: `2px solid ${B.border}`, background: B.white, color: B.textMid, fontWeight: 700, cursor: 'pointer', fontSize: '0.95rem', letterSpacing: '.01em' }}>Cancel</button>
                  <button type="submit" disabled={loading} style={{ flex: 2, padding: '14px', borderRadius: 10, border: 'none', background: loading ? '#93c5fd' : `linear-gradient(135deg, ${B.blue} 0%, ${B.blueDark} 100%)`, color: B.white, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer', fontSize: '1rem', letterSpacing: '.02em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, boxShadow: loading ? 'none' : '0 4px 14px rgba(37,99,235,.45)' }}>{loading ? <><div className="spinner" style={{ width: 18, height: 18 }} /> Posting Job…</> : <><Briefcase size={18} /> Post Job</>}</button>
                </div>
              </form>
            )}

            {activeTab === 'form' && (
              <div style={{ position: 'sticky', top: 24 }}>
                <div style={{ background: B.white, border: `1.5px solid ${B.borderLight}`, borderRadius: 14, padding: '24px', maxHeight: 'calc(100vh - 80px)', overflowY: 'auto', boxShadow: '0 2px 10px rgba(15,23,42,.07)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.72rem', fontWeight: 800, color: B.blue, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 16, paddingBottom: 12, borderBottom: `2px solid ${B.borderLight}` }}>👁 Live Preview</div>
                  <div style={{ fontSize: '0.85rem', lineHeight: 1.75 }}>
                    {form.title && <div style={{ fontWeight: 900, fontSize: '1.05rem', color: B.text, marginBottom: 10 }}>{form.title}</div>}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                      {form.job_level && <span style={{ padding: '3px 12px', borderRadius: 99, background: B.blueXLight, border: `1.5px solid ${B.blue}40`, color: B.blueDark, fontSize: '.75rem', fontWeight: 800 }}>Level {form.job_level}</span>}
                      {form.number_of_posts && <span style={{ padding: '3px 12px', borderRadius: 99, background: B.violetLight, border: `1.5px solid ${B.violet}40`, color: B.violet, fontSize: '.75rem', fontWeight: 800 }}>{form.number_of_posts} Post{form.number_of_posts > 1 ? 's' : ''}</span>}
                      {form.employment_type && <span style={{ padding: '3px 12px', borderRadius: 99, background: B.bg, border: `1.5px solid ${B.border}`, color: B.textMid, fontSize: '.75rem', fontWeight: 700 }}>{form.employment_type}</span>}
                    </div>
                    {form.deadline && <div style={{ fontSize: '.77rem', color: '#9a3412', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600 }}><Timer size={12} /> Closes: {fmtDeadlinePreview(form.deadline)}</div>}
                    {form.description && <p style={{ color: B.textMid, marginBottom: 12, lineHeight: 1.7 }}>{form.description}</p>}
                    {form.required_skills.length > 0 && <><div style={{ fontSize: '.72rem', fontWeight: 800, color: B.textLight, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 7 }}>Skills</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{form.required_skills.slice(0,6).map((s,i) => <span key={i} style={{ padding: '3px 10px', borderRadius: 99, background: B.violetLight, border: `1.5px solid ${B.violet}40`, color: B.violet, fontSize: '.73rem', fontWeight: 700 }}>{s}</span>)}{form.required_skills.length > 6 && <span style={{ fontSize: '.73rem', color: B.textLight, alignSelf: 'center' }}>+{form.required_skills.length - 6} more</span>}</div></>}
                    <button type="button" onClick={() => setActiveTab('preview')} style={{ marginTop: 18, width: '100%', padding: '10px', borderRadius: 8, border: `2px solid ${B.blue}`, background: 'transparent', color: B.blue, fontWeight: 700, cursor: 'pointer', fontSize: '0.82rem' }}>View Full Preview →</button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'preview' && (
              <div style={{ background: B.white, border: `1.5px solid ${B.borderLight}`, borderRadius: 14, padding: '40px 44px', maxWidth: 760, margin: '0 auto', width: '100%', boxShadow: '0 2px 12px rgba(15,23,42,.08)' }}>
                <div style={{ fontSize: '.72rem', fontWeight: 800, color: B.blue, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 22 }}>Job Posting Preview</div>
                {form.title && <h2 style={{ fontSize: '1.65rem', fontWeight: 900, color: B.text, marginBottom: 14, letterSpacing: '-.02em' }}>{form.title}</h2>}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
                  {form.location && <span style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 14px', borderRadius: 99, background: B.bg, border: `1.5px solid ${B.border}`, color: B.textMid, fontSize: '.8rem', fontWeight: 700 }}><MapPin size={12} /> {form.location}</span>}
                  {form.employment_type && <span style={{ padding: '4px 14px', borderRadius: 99, background: B.blueXLight, border: `1.5px solid ${B.blue}40`, color: B.blueDark, fontSize: '.8rem', fontWeight: 700 }}>{form.employment_type}</span>}
                  {form.job_level && <span style={{ padding: '4px 14px', borderRadius: 99, background: B.violetLight, border: `1.5px solid ${B.violet}40`, color: B.violet, fontSize: '.8rem', fontWeight: 700 }}>Level {form.job_level}</span>}
                  {form.number_of_posts && <span style={{ padding: '4px 14px', borderRadius: 99, background: B.emeraldLight, border: `1.5px solid ${B.emerald}40`, color: B.emerald, fontSize: '.8rem', fontWeight: 700 }}>{form.number_of_posts} Opening{form.number_of_posts > 1 ? 's' : ''}</span>}
                </div>
                {form.deadline && <div style={{ padding: '10px 16px', borderRadius: 8, background: '#fff7ed', border: '1.5px solid #fed7aa', color: '#9a3412', fontSize: '0.83rem', fontWeight: 700, display: 'flex', gap: 7, alignItems: 'center', marginBottom: 22 }}><Timer size={14} /> Application Deadline: {fmtDeadlinePreview(form.deadline)}</div>}
                {form.description && <p style={{ color: B.textMid, lineHeight: 1.8, fontSize: '0.95rem', marginBottom: 22 }}>{form.description}</p>}
                {form.about_role && <><h3 style={{ fontSize: '1rem', fontWeight: 800, color: B.text, marginBottom: 10, marginTop: 26 }}>About the Role</h3><p style={{ color: B.textMid, lineHeight: 1.8, fontSize: '0.92rem', marginBottom: 16 }}>{form.about_role}</p></>}
                {form.responsibilities.length > 0 && <><h3 style={{ fontSize: '1rem', fontWeight: 800, color: B.text, marginBottom: 10, marginTop: 26 }}>Key Responsibilities</h3><ul style={{ margin: 0, paddingLeft: 22, color: B.textMid, lineHeight: 1.9, fontSize: '0.9rem' }}>{form.responsibilities.map((r,i) => <li key={i}>{r}</li>)}</ul></>}
                {form.required_skills.length > 0 && <><h3 style={{ fontSize: '1rem', fontWeight: 800, color: B.text, marginBottom: 12, marginTop: 26 }}>Required Skills</h3><div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>{form.required_skills.map((s,i) => <span key={i} style={{ padding: '5px 14px', borderRadius: 99, background: B.violetLight, border: `1.5px solid ${B.violet}50`, color: B.violet, fontSize: '0.82rem', fontWeight: 700 }}>{s}</span>)}</div></>}
                <div style={{ marginTop: 36, paddingTop: 24, borderTop: `2px solid ${B.borderLight}`, display: 'flex', gap: 14 }}>
                  <button onClick={() => setActiveTab('form')} style={{ padding: '11px 22px', borderRadius: 8, border: `2px solid ${B.border}`, background: B.white, color: B.textMid, fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}>← Back to Edit</button>
                  <button disabled={loading} onClick={submit} style={{ padding: '11px 28px', borderRadius: 8, border: 'none', background: `linear-gradient(135deg, ${B.blue} 0%, ${B.blueDark} 100%)`, color: B.white, fontWeight: 800, cursor: 'pointer', fontSize: '0.9rem', boxShadow: '0 4px 14px rgba(37,99,235,.4)', display: 'flex', alignItems: 'center', gap: 8 }}><Briefcase size={16} />{loading ? 'Posting…' : 'Post This Job'}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}