import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import {
  Briefcase, ArrowLeft, Zap, X, Info,
  GraduationCap, Award, Wrench, Clock, Star, FileText, MapPin, Users, Timer, BarChart2
} from 'lucide-react'
import toast from 'react-hot-toast'
import Navbar from '../components/Navbar'
import api from '../api/axios'

// ── Brand tokens ─────────────────────────────────────────────
const B = {
  navy: '#0f172a', navyMid: '#1e293b',
  blue: '#2563eb', blueDark: '#1d4ed8', blueLight: '#3b82f6', blueXLight: '#dbeafe',
  violet: '#7c3aed', violetLight: '#ede9fe',
  amber: '#d97706', amberLight: '#fef3c7',
  sky: '#0284c7', skyLight: '#e0f2fe',
  emerald: '#059669', emeraldLight: '#d1fae5',
  red: '#dc2626', redLight: '#fee2e2',
  text: '#0f172a', textMid: '#334155', textLight: '#64748b',
  border: '#cbd5e1', borderLight: '#e2e8f0',
  bg: '#f8fafc', white: '#ffffff',
}

const JOB_LEVELS = [
  '1.I','1.II','1.III','2.I','2.II','2.III',
  '3.I','3.II','3.III','4.I','4.II','4.III',
  '5.I','5.II','5.III','6.I','6.II','6.III',
  '7.I','7.II','7.III',
]

// ── Degree tier detection ─────────────────────────────────────
function degreeTier(degreeStr) {
  const d = (degreeStr || '').toLowerCase()
  if (d.includes('phd') || d.includes('doctor of philosophy')) return 4
  if (
    d.includes('master') || d.includes('msc') || d.includes('mba') ||
    d.includes('mpa') || d.includes('llm') || d.includes('med') || d.includes('mph')
  ) return 3
  if (
    d.includes('bachelor') || d.includes('bsc') || d.includes('ba ') || d.startsWith('ba ') ||
    d.includes('b.com') || d.includes('bba') || d.includes('llb') || d.includes('mbchb') ||
    d.includes('mbbs') || d.includes('bvm') || d.includes('bvsc') || d.includes('b.arch') ||
    d.includes('b.pharm') || d.includes('pharmd') || d.includes('dvm') || d.includes('b.eng')
  ) return 2
  if (d.includes('diploma') || d.includes('advanced diploma') || d.includes('pgde') || d.includes('pgdip')) return 1
  return 2
}

const TIER_LABELS = { 1: 'Diploma', 2: "Bachelor's", 3: "Master's", 4: 'PhD' }
const TIER_COLORS = {
  1: { bg: '#fef3c7', border: '#d97706', text: '#78350f' },
  2: { bg: '#dbeafe', border: '#2563eb', text: '#1e3a8a' },
  3: { bg: '#ede9fe', border: '#7c3aed', text: '#4c1d95' },
  4: { bg: '#d1fae5', border: '#059669', text: '#064e3b' },
}

// ── Per-degree experience calculation ─────────────────────────
function calcExpForDegree(tier, baseMin, baseMax) {
  const adjustments = { 4: -3, 3: -1, 2: 0, 1: 3 }
  const adj = adjustments[tier] ?? 0
  const adjusted = Math.max(0, baseMin + adj)
  return Math.min(adjusted, baseMax)
}

// ── Serialize for backend ONLY — never shown to users ─────────
function serializeDegreesWithExp(degrees, baseMin, baseMax) {
  return degrees
    .map(d => {
      const tier = degreeTier(d)
      const exp = calcExpForDegree(tier, baseMin, baseMax)
      return `${d} [min ${exp} yr${exp !== 1 ? 's' : ''}]`
    })
    .join(' | ')
}

// ── Experience badge label — human-readable ───────────────────
function expLabel(exp) {
  if (exp === 0) return '0 Years of relevant experience'
  return `${exp} Year${exp !== 1 ? 's' : ''} of relevant experience`
}

// ── 60 JOB TEMPLATES ─────────────────────────────────────────
const RWANDA_JOBS_DATA = [
  // ═══════════════════ HEALTH ═══════════════════
  {
    title: "Registered Nurse", domain: "Health", emoji: "💉",
    education_level: "Bachelor's",
    degrees: ["Bachelor of Science in Nursing","Bachelor of Science in Midwifery","Advanced Diploma in Nursing","Advanced Diploma in Midwifery"],
    description: "Deliver direct, high-quality nursing care within a multidisciplinary clinical team across inpatient and outpatient settings, implementing nursing care plans in line with MoH protocols.",
    about_role: "The Registered Nurse will assess, plan, implement, and evaluate patient care using the nursing process (ADPIE), collaborate with physicians and allied health professionals, and promote patient safety and dignity across all clinical areas.",
    responsibilities: [
      "Conduct comprehensive patient assessments (history, physical examination, vital signs) and document findings in the hospital information system (HIS/DHIS2)",
      "Develop, implement, and continuously evaluate individualised nursing care plans in line with clinical protocols",
      "Administer prescribed medications, intravenous therapy, and therapeutic treatments safely, documenting all interventions",
      "Monitor patient vital signs, fluid balance, and clinical progress; escalate deterioration promptly using early warning score (EWS) tools",
      "Perform clinical procedures: wound dressing, urinary catheterisation, nasogastric tube insertion, venipuncture, and blood transfusion monitoring",
      "Educate patients and families on diagnoses, medications, home care, and preventive health practices",
      "Respond to ward emergencies and participate actively in Basic Life Support and resuscitation efforts",
      "Maintain infection prevention and control (IPC) standards including hand hygiene audits and PPE compliance",
      "Mentor nursing students and health care assistants during clinical placements",
      "Complete accurate, legible, and timely nursing documentation compliant with RNMC professional standards",
    ],
    fields: "Nursing, Midwifery, Health Sciences",
    exp_min: 1, exp_max: 15,
    skills: ["Patient assessment and nursing process (ADPIE)","Medication administration and IV therapy","Wound care and aseptic technique","Basic Life Support (BLS) and CPR","Vital signs monitoring and early warning score (EWS)","Electronic health records (HIS / DHIS2)","Infection prevention and control (IPC)","Patient and family health education","Emergency triage and clinical prioritisation"],
    certs: ["Valid Practising Certificate — Rwanda Nurses and Midwives Council (RNMC)","Basic Life Support (BLS) — current certification"],
    preferred: ["Advanced Cardiovascular Life Support (ACLS) or PALS","Post-basic certificate in ICU, oncology, or psychiatric nursing","HMIS/DHIS2 data entry and reporting experience"],
    employment_type: "Full-time",
  },
  {
    title: "Medical Doctor — General Practitioner", domain: "Health", emoji: "🩺",
    education_level: "Bachelor's",
    degrees: ["MBChB (Bachelor of Medicine and Bachelor of Surgery)","MBBS (Bachelor of Medicine, Bachelor of Surgery)","MD (Doctor of Medicine)"],
    description: "Provide comprehensive primary healthcare — including diagnosis, treatment, antenatal care, and preventive medicine — across health centres aligned with Rwanda's Community Health Policy.",
    about_role: "The General Practitioner will diagnose and manage acute and chronic conditions, conduct RMNCAH clinics, lead ward rounds, prescribe medicines from the Rwanda National Essential Medicines List (NEML), and mentor junior clinical staff.",
    responsibilities: [
      "Diagnose and manage acute and chronic medical, surgical, and obstetric conditions using evidence-based protocols",
      "Conduct antenatal care (ANC), postnatal care (PNC), and integrated under-five child health clinics",
      "Prescribe medications strictly in accordance with the Rwanda National Essential Medicines List (NEML)",
      "Refer complex cases to appropriate specialists and ensure structured follow-up",
      "Lead morning ward rounds, case conferences, and structured clinical handovers",
      "Participate in disease surveillance and submit mandatory case reports to RBC and MoH",
      "Implement community health and disease prevention initiatives at facility level",
      "Maintain accurate, confidential medical records in the electronic hospital information system",
      "Provide clinical supervision and mentoring to clinical officers, nurses, and intern medical staff",
    ],
    fields: "Medicine, Clinical Medicine, Medical Sciences",
    exp_min: 2, exp_max: 20,
    skills: ["Clinical diagnosis and evidence-based treatment","Prescription management aligned to Rwanda NEML","Emergency medicine and resuscitation (ACLS)","Antenatal and postnatal care management","Minor surgical procedures (suturing, wound debridement, I&D)","HMIS / DHIS2 data management and mandatory disease reporting","HIV/AIDS clinical management and ART initiation","Integrated Management of Childhood Illness (IMCI)"],
    certs: ["Valid Medical Practising Licence — Rwanda Medical and Dental Council (RMDC)","Completion of mandatory one-year clinical internship","BLS and ACLS — current certification"],
    preferred: ["MMed in Family Medicine or Internal Medicine","Diploma in Tropical Medicine and Hygiene (DTM&H)","HIV/AIDS and TB co-management clinical training","Rwanda IMCI facilitator training"],
    employment_type: "Full-time",
  },
  {
    title: "Pharmacist", domain: "Health", emoji: "💊",
    education_level: "Bachelor's",
    degrees: ["Bachelor of Pharmacy (B.Pharm)","PharmD (Doctor of Pharmacy)","Bachelor of Science in Pharmaceutical Sciences"],
    description: "Manage pharmaceutical services from procurement through dispensing, provide expert medication counselling, and ensure compliance with Rwanda FDA and Rwanda Pharmacy Council standards.",
    about_role: "The Pharmacist will ensure rational use of medicines, maintain pharmaceutical stock integrity, provide clinical pharmacy support to prescribers, operate pharmacovigilance systems, and supervise pharmacy technical staff.",
    responsibilities: [
      "Dispense prescription and OTC medications accurately; counsel patients on correct use, dosage, storage, and side effects",
      "Review all prescriptions for therapeutic appropriateness, correct dosage, and drug-drug interactions before dispensing",
      "Manage pharmaceutical procurement, inventory control, and stock reconciliation following MoH push-pull supply chain protocols",
      "Implement pharmacovigilance activities including adverse drug reaction (ADR) detection, documentation, and reporting to Rwanda FDA",
      "Maintain cold-chain compliance for temperature-sensitive medicines: vaccines, insulin, and ARV regimens",
      "Provide clinical pharmacy support and formulary guidance to physicians, nurses, and patients",
      "Conduct quarterly medicine expiry audits, stock counts, and wastage root cause investigations",
      "Train, supervise, and assess pharmacy technicians and pharmacy students on placement",
    ],
    fields: "Pharmacy, Pharmaceutical Sciences, Clinical Pharmacy",
    exp_min: 1, exp_max: 15,
    skills: ["Drug dispensing, labelling, and patient counselling","Prescription review and drug interaction screening","Pharmaceutical inventory management (eLMIS / OFAG)","Pharmacovigilance and ADR reporting to Rwanda FDA","Cold-chain management and temperature monitoring","Rational drug use (RDU) promotion","HIV/ARV regimen management and adherence counselling"],
    certs: ["Valid Practising Licence — Rwanda Pharmacy Council","Rwanda FDA registration — authorised dispenser"],
    preferred: ["Postgraduate Diploma or Certificate in Clinical Pharmacy","HIV/ARV pharmacy management training (ICAP or MSH experience)","Good Pharmacy Practice (GPP) certification","Supply chain management training (CHPS / USAID | DELIVER)"],
    employment_type: "Full-time",
  },
  {
    title: "Public Health Officer / Epidemiologist", domain: "Health", emoji: "🦠",
    education_level: "Master's",
    degrees: ["Master of Public Health (MPH)","MSc Epidemiology","MSc Global Health","Master of Science in Environmental Health"],
    description: "Lead disease surveillance, outbreak investigation, health data analysis, and community health intervention programmes aligned with Rwanda's Health Sector Strategic Plan (HSSP IV).",
    about_role: "The Public Health Officer will coordinate epidemiological monitoring through IDSR and DHIS2, investigate outbreaks, produce actionable health intelligence, and build district health team capacity.",
    responsibilities: [
      "Operate disease surveillance systems including IDSR, EWARN, and DHIS2 sentinel site dashboards",
      "Investigate notified disease outbreaks: confirm diagnosis, trace contacts, and coordinate containment measures",
      "Analyse public health datasets to identify trends, disparities, and emerging risks; produce technical reports for MoH/RBC",
      "Design, implement, and evaluate community health promotion and disease prevention interventions",
      "Coordinate national immunisation, nutrition surveillance, and WASH programme activities at district level",
      "Liaise with WHO, CDC Africa, and international partners on IHR compliance and emergency preparedness",
      "Train and supervise district health teams on data collection, surveillance, and outbreak response",
      "Produce donor reports, government Imihigo performance reports, and peer-reviewed publications",
    ],
    fields: "Public Health, Epidemiology, Environmental Health, Global Health",
    exp_min: 3, exp_max: 15,
    skills: ["Epidemiological surveillance: IDSR, EWARN, DHIS2","Outbreak investigation and containment coordination","Quantitative statistical analysis: SPSS, STATA, or R","Health programme design, implementation, and evaluation","Community mobilisation and SBCC strategy","Health data management and GIS mapping: QGIS or ArcGIS","IHR compliance and emergency preparedness","Scientific and technical report writing"],
    certs: ["Master of Public Health (MPH) or MSc Epidemiology — required","Rwanda Environmental Health Officers Council registration (where applicable)"],
    preferred: ["FETP (Field Epidemiology Training Programme) — WHO or CDC","PEPFAR or USAID-funded programme experience","ArcGIS or QGIS certificate","One Health zoonotic disease surveillance training"],
    employment_type: "Full-time",
  },
  {
    title: "Medical Laboratory Scientist", domain: "Health", emoji: "🔬",
    education_level: "Bachelor's",
    degrees: ["Bachelor of Science in Biomedical Laboratory Sciences","Bachelor of Science in Medical Laboratory Technology","Bachelor of Science in Biochemistry and Molecular Biology","Bachelor of Science in Microbiology"],
    description: "Perform diagnostic laboratory analyses in haematology, clinical biochemistry, microbiology, and serology to support evidence-based clinical decision-making and maintain ISO 15189 quality standards.",
    about_role: "The Medical Laboratory Scientist will conduct clinical analyses, manage quality control programmes, maintain laboratory instrumentation, and produce accurate results within stipulated turnaround times.",
    responsibilities: [
      "Perform haematology, clinical biochemistry, urinalysis, and serology analyses using automated and manual methods",
      "Process and culture microbiology specimens for pathogen identification and antimicrobial sensitivity testing",
      "Conduct HIV rapid testing, GeneXpert MTB/RIF (TB), and malaria rapid diagnostic tests (RDTs)",
      "Calibrate, perform preventive maintenance, and troubleshoot analytical instruments",
      "Implement and monitor internal quality control (IQC); participate in external quality assurance (EQA) schemes",
      "Record and report test results accurately in the LIMS within agreed turnaround times",
      "Ensure biosafety compliance: waste segregation, decontamination, and specimen handling",
      "Train and supervise laboratory technicians, assistants, and students on rotation",
    ],
    fields: "Biomedical Laboratory Sciences, Medical Laboratory Technology, Biochemistry, Microbiology",
    exp_min: 1, exp_max: 15,
    skills: ["Haematology analysis: CBC, coagulation, blood group and cross-match","Clinical biochemistry and immunoassay: glucose, lipids, LFTs, hormones","Microbiology culture, isolation, and antimicrobial sensitivity testing","HIV, GeneXpert MTB/RIF (TB), and malaria RDT diagnostics","Laboratory quality management: ISO 15189 / SLIPTA","Good Laboratory Practice (GLP) and biosafety BSL-2","Laboratory Information Management System (LIMS / OpenELIS)"],
    certs: ["Valid Practising Licence — Rwanda Allied Health Professions Council (RAHPC), Laboratory category","Biosafety Level 2 (BSL-2) safety training"],
    preferred: ["ISO 15189 internal auditor training","GeneXpert and molecular diagnostics competency","SLIPTA / SLMTA accreditation improvement experience","Haemovigilance and blood transfusion services training"],
    employment_type: "Full-time",
  },
  {
    title: "Midwife", domain: "Health", emoji: "👶",
    education_level: "Bachelor's",
    degrees: ["Bachelor of Science in Midwifery","Bachelor of Science in Nursing and Midwifery","Advanced Diploma in Midwifery"],
    description: "Provide skilled midwifery care throughout the antenatal, intrapartum, and postnatal continuum, promoting safe motherhood and optimal newborn outcomes in line with Rwanda RMNCAH policies.",
    about_role: "The Midwife will manage normal deliveries autonomously, detect and manage obstetric complications, provide family planning services, and conduct RMNCAH community outreach.",
    responsibilities: [
      "Conduct antenatal assessments: history, physical examination, fundal height measurement, and fetal heart auscultation",
      "Manage normal labour and delivery: monitor labour progress using partograph, provide supportive care, and conduct normal vaginal deliveries",
      "Detect and manage obstetric complications (preeclampsia, PPH, obstructed labour) and initiate emergency management protocols",
      "Perform immediate newborn care: APGAR scoring, cord care, kangaroo mother care (KMC), and early initiation of breastfeeding",
      "Provide family planning counselling and initiate contraceptive methods including IUD insertion and implant provision",
      "Manage postnatal care for mothers and neonates for at least 48 hours post-delivery",
      "Register all births and maternal/neonatal deaths in CRVS and DHIS2",
      "Conduct community outreach for ANC mobilisation and skilled birth attendance promotion",
    ],
    fields: "Midwifery, Nursing and Midwifery, Health Sciences",
    exp_min: 1, exp_max: 15,
    skills: ["Antenatal care assessment and risk stratification","Active management of third stage labour (AMTSL)","Obstetric emergency management: PPH, eclampsia, neonatal asphyxia","Newborn resuscitation and immediate newborn care","Family planning methods and LARC counselling","Partograph documentation and use","Breastfeeding support and IYCF counselling","DHIS2 / HMIS data entry and RMNCAH reporting"],
    certs: ["Valid Practising Certificate — Rwanda Nurses and Midwives Council (RNMC), Midwifery category","Basic Emergency Obstetric and Newborn Care (BEmONC) — current certification"],
    preferred: ["Comprehensive Emergency Obstetric and Newborn Care (CEmONC) training","Advanced midwifery postgraduate certificate","Kangaroo Mother Care (KMC) certification","IYCF counsellor certification"],
    employment_type: "Full-time",
  },
  // ═══════════════════ EDUCATION ═══════════════════
  {
    title: "Secondary School Teacher — Sciences", domain: "Education", emoji: "🧪",
    education_level: "Bachelor's",
    degrees: ["Bachelor of Education in Science (Physics)","Bachelor of Education in Science (Chemistry)","Bachelor of Education in Science (Biology)","Bachelor of Science in Physics + PGDE","Bachelor of Science in Chemistry + PGDE","Bachelor of Science in Biology + PGDE"],
    description: "Deliver engaging, competency-based Science instruction in Physics, Chemistry, or Biology at O-Level and A-Level, preparing students for national examinations and lifelong STEM engagement.",
    about_role: "The Science Teacher will implement the REB CBC Science curriculum, facilitate laboratory practicals, assess learning continuously, and contribute to school improvement under the National Curriculum Framework.",
    responsibilities: [
      "Plan and deliver high-quality, differentiated lessons aligned to the REB CBC Science curriculum at O-Level and A-Level",
      "Design, set up, and facilitate laboratory practicals while enforcing laboratory safety regulations",
      "Set, administer, and mark continuous assessment tests (CATs), mid-terms, and end-of-term examinations",
      "Maintain class registers, mark books, lesson plans, and termly schemes of work",
      "Prepare students systematically for NESA O-Level and A-Level national examinations",
      "Provide academic mentoring and remedial tuition for underperforming students",
      "Integrate ICT tools and digital learning resources into science lessons",
      "Participate in subject department meetings, professional development days, and peer observation programmes",
    ],
    fields: "Education (Science), Physics, Chemistry, Biology, Mathematics",
    exp_min: 1, exp_max: 20,
    skills: ["CBC lesson planning and delivery for mixed-ability classes","Laboratory management, setup, and safety enforcement","Student assessment design, marking, and constructive feedback","Classroom management and positive behaviour support","ICT integration: smart boards, Google Classroom, Moodle","National examination preparation and past paper analysis","Inclusive education and special educational needs accommodation"],
    certs: ["Bachelor of Education (Science) or BSc + PGDE — required","Valid Teaching Licence — Rwanda Education Board (REB)","REB Teacher Registration Certificate"],
    preferred: ["STEM / Science Olympiad coaching experience","Inclusive education training or certificate","E-learning platform administration experience","International science competition preparation experience"],
    employment_type: "Full-time",
  },
  {
    title: "University Lecturer", domain: "Education", emoji: "🎓",
    education_level: "Master's",
    degrees: ["Master's degree in the relevant discipline","PhD in the relevant discipline (required for Senior Lecturer and above)"],
    description: "Contribute to academic excellence through high-quality teaching, original research, postgraduate supervision, and community engagement at an accredited Rwandan higher education institution.",
    about_role: "The Lecturer will design and deliver undergraduate and postgraduate courses, supervise dissertations, conduct and publish peer-reviewed research, and participate in curriculum review and HEC-recognised quality assurance.",
    responsibilities: [
      "Design, deliver, and continuously improve undergraduate and postgraduate courses in the relevant discipline",
      "Supervise Bachelor's dissertations, Master's theses, and (where applicable) PhD research projects",
      "Conduct and publish original peer-reviewed research in Scopus- or ISI-indexed journals",
      "Develop and submit competitive research grant proposals to local and international funders",
      "Participate in departmental curriculum review and academic quality assurance processes",
      "Set, moderate, and mark examinations; provide timely, constructive student feedback",
      "Engage in community outreach, consultancy, and knowledge transfer activities",
      "Contribute to faculty governance, committees, and HEC institutional accreditation processes",
    ],
    fields: "Relevant academic discipline as advertised by the institution",
    exp_min: 3, exp_max: 30,
    skills: ["University-level course design and curriculum development","Academic research design and scientific writing","Student academic supervision and mentoring","Competitive research grant proposal writing","Quantitative and qualitative research methodology","E-learning platform administration: Moodle or Google Classroom","Academic quality assurance and programme review"],
    certs: ["Minimum Master's degree in relevant discipline — required for Lecturer","PhD in relevant discipline — required for Senior Lecturer and above","HEC Rwanda faculty registration"],
    preferred: ["Minimum two Scopus/ISI-indexed peer-reviewed publications","Postgraduate Teaching and Learning Certificate (PGCert HE)","Active international research collaboration or visiting fellowship","External examiner experience at an accredited institution"],
    employment_type: "Full-time",
  },
  {
    title: "Primary School Teacher", domain: "Education", emoji: "📚",
    education_level: "Bachelor's",
    degrees: ["Bachelor of Education (Primary)","Bachelor of Arts in Education (Primary)","Bachelor of Science in Education (Primary)"],
    description: "Deliver inclusive, competency-based instruction to primary pupils, nurturing foundational literacy, numeracy, and social development in line with the REB CBC framework.",
    about_role: "The Primary Teacher will plan and deliver lessons across all core subjects, create a safe and stimulating learning environment, assess and track pupil progress, and partner with parents and the community.",
    responsibilities: [
      "Plan and deliver differentiated daily lessons across all primary subjects following the REB CBC programme (P1–P6)",
      "Create a welcoming, inclusive, and safe classroom environment that celebrates every child's potential",
      "Conduct ongoing formative assessment, maintain mark books, and complete end-of-term pupil reports",
      "Identify pupils with learning difficulties or special educational needs; adapt instruction or escalate to the head teacher",
      "Maintain school registers, attendance records, and administrative documentation required by REB",
      "Organise and supervise co-curricular activities: reading clubs, maths clubs, and school sports",
      "Engage parents and guardians through parent-teacher meetings, home visits, and school events",
      "Participate in school improvement planning and staff professional development days",
    ],
    fields: "Primary Education, Education Studies, Liberal Arts with Education",
    exp_min: 0, exp_max: 20,
    skills: ["CBC lesson planning and classroom delivery (P1–P6)","Foundational literacy and numeracy instruction methods","Continuous assessment and pupil progress tracking","Inclusive and differentiated teaching strategies","Classroom management and positive discipline","Kinyarwanda and English — language of instruction proficiency","Parent and community engagement"],
    certs: ["Bachelor of Education (Primary) — required","Valid Teaching Licence — Rwanda Education Board (REB)","REB Teacher Registration Certificate"],
    preferred: ["Special Needs Education (SNE) or inclusive education certificate","EGRA / EGMA assessment training","School leadership or head of department experience","Digital literacy and ICT in primary education training"],
    employment_type: "Full-time",
  },
  {
    title: "ECD Specialist", domain: "Education", emoji: "🧒",
    education_level: "Bachelor's",
    degrees: ["Bachelor of Education in Early Childhood Education","Bachelor of Science in Child Development","Bachelor of Arts in Psychology","Bachelor of Science in Social Sciences with Child Development"],
    description: "Design, implement, and evaluate integrated Early Childhood Development programmes for children aged 0–6, ensuring holistic development across nutrition, psychosocial stimulation, and quality pre-primary education.",
    about_role: "The ECD Specialist will work with Integrated Child Development Centres, schools, MoH, MINEDUC, and MIGEPROF to deliver evidence-based ECD aligned with the National ECD Strategic Plan and WHO/UNICEF Nurturing Care Framework.",
    responsibilities: [
      "Design and implement developmentally appropriate ECD curricula and activity programmes for children aged 0–6",
      "Train, mentor, and conduct supportive supervision for ECD facilitators, community volunteers, and parents",
      "Monitor children's developmental milestones using validated tools (Ages and Stages Questionnaire — ASQ) and refer delays",
      "Conduct community sensitisation campaigns on early stimulation, responsive caregiving, and childhood nutrition",
      "Liaise with MoH, MINEDUC, and MIGEPROF at district and sector level to align ECD programme activities",
      "Collect, manage, and report ECD programme data and M&E indicators to donors and government partners",
      "Develop and facilitate parent group sessions on play-based learning, language development, and hygiene",
    ],
    fields: "Early Childhood Education, Child Development, Psychology, Social Sciences",
    exp_min: 2, exp_max: 15,
    skills: ["ECD curriculum design and play-based facilitation","Child developmental screening using Ages and Stages Questionnaire (ASQ)","Parent and caregiver group facilitation","Child protection, safeguarding, and Do No Harm principles","ECD centre management and facilitator supervision","Programme M&E and KoBoToolbox data collection","IYCF communication and nutrition counselling for caregivers"],
    certs: ["Bachelor of Education (Early Childhood) or BSc in Child Development — required","Child Safeguarding / Child Protection Certification","First Aid Certification"],
    preferred: ["WHO/UNICEF/World Bank Nurturing Care Framework training","Experience with UNICEF, Save the Children, or World Vision ECD programmes","Inclusive ECD for children with disabilities and developmental delays","Kinyarwanda fluency — essential for community-facing roles"],
    employment_type: "Full-time",
  },
  {
    title: "School Principal / Head Teacher", domain: "Education", emoji: "🏫",
    education_level: "Master's",
    degrees: ["Master of Education in Educational Leadership and Management","Master of Arts in Education Administration","Master of Education in School Management","Bachelor of Education + Postgraduate Diploma in Educational Management"],
    description: "Provide strategic, instructional, and administrative leadership to deliver an outstanding learning environment, high academic standards, and a school culture of excellence and inclusivity.",
    about_role: "The School Principal will lead the school's academic and operational functions, manage staff performance, ensure CBC curriculum implementation quality, engage the community, and maintain REB regulatory compliance.",
    responsibilities: [
      "Provide visionary leadership and manage the school's strategic plan, school improvement plan, and annual targets",
      "Ensure quality CBC curriculum implementation across all subjects and grade levels through instructional supervision",
      "Manage staff recruitment (with REB), induction, performance appraisal, and professional development",
      "Manage the school's budget, financial records, and assets in compliance with MINEDUC financial guidelines",
      "Foster a safe, inclusive, and supportive learning environment free from all forms of discrimination and violence",
      "Lead school self-evaluation processes and prepare for REB external inspection visits",
      "Engage parents, community leaders, and the School Board of Governors as active partners",
      "Produce accurate and timely school performance data, EMIS reports, and REB submissions",
    ],
    fields: "Educational Leadership, Education Administration, Education Management, Education",
    exp_min: 7, exp_max: 30,
    skills: ["Strategic school leadership and school improvement planning","Instructional supervision and curriculum quality assurance","Staff performance management and professional development","School financial management and resource allocation","REB regulatory compliance and EMIS reporting","Community and School Board of Governors engagement","Conflict resolution, pastoral care, and safeguarding leadership"],
    certs: ["Master of Education in Educational Leadership or equivalent — required","Valid Teaching Licence — Rwanda Education Board (REB)","REB Head Teacher Certification or equivalent leadership qualification"],
    preferred: ["Rwanda Education Board Head Teacher Development Programme (HTDP)","Child safeguarding lead training","School inspection preparation experience","Special Needs Education (SNE) inclusive school leadership experience"],
    employment_type: "Full-time",
  },
  // ═══════════════════ TECHNOLOGY ═══════════════════
  {
    title: "Software Engineer", domain: "Technology", emoji: "👨‍💻",
    education_level: "Bachelor's",
    degrees: ["Bachelor of Science in Computer Science","Bachelor of Science in Software Engineering","Bachelor of Science in Information Technology","Bachelor of Engineering in Computer Engineering"],
    description: "Design, develop, test, and maintain high-quality, scalable software systems powering mission-critical digital products and services.",
    about_role: "The Software Engineer will own end-to-end feature development within an agile team, participate in architecture decisions, write well-tested code, conduct peer code reviews, and continuously improve system reliability and performance.",
    responsibilities: [
      "Design and implement scalable, maintainable backend and frontend services based on product requirements",
      "Write clean, fully tested, and thoroughly documented code following team coding standards",
      "Participate in system architecture decisions and produce technical design documentation",
      "Conduct peer code reviews and provide constructive, actionable technical feedback",
      "Investigate, diagnose, and resolve production incidents and performance bottlenecks",
      "Contribute to CI/CD pipeline automation, DevOps tooling, and infrastructure as code",
      "Mentor junior engineers through pair programming, knowledge sharing, and structured feedback",
      "Collaborate with product managers, UX designers, and QA engineers throughout the product lifecycle",
    ],
    fields: "Computer Science, Software Engineering, Information Technology",
    exp_min: 2, exp_max: 12,
    skills: ["Backend development: Python, Java, or Node.js (TypeScript)","Frontend development: React.js or Vue.js","Databases: PostgreSQL, MySQL, or MongoDB","RESTful API design and OpenAPI documentation","Git version control: branching, PRs, and code review workflows","Containerisation: Docker; basic Kubernetes","Test-Driven Development (TDD) and automated testing","Cloud platforms: AWS, GCP, or Azure core services","Agile / Scrum: sprint planning, stand-ups, retrospectives"],
    certs: [],
    preferred: ["AWS Certified Developer — Associate or Solutions Architect","Kubernetes Administrator (CKA or CKAD)","Open-source contributions — provide GitHub/GitLab profile","Microservices or event-driven architecture experience","GraphQL API development experience"],
    employment_type: "Full-time",
  },
  {
    title: "Data Analyst", domain: "Technology", emoji: "📊",
    education_level: "Bachelor's",
    degrees: ["Bachelor of Science in Statistics","Bachelor of Science in Mathematics","Bachelor of Science in Data Science","Bachelor of Science in Computer Science","Bachelor of Science in Economics"],
    description: "Transform raw, complex datasets into clear, actionable insights and interactive dashboards that directly inform strategic and operational decisions.",
    about_role: "The Data Analyst will define analytical requirements with stakeholders, build data pipelines, design Power BI or Tableau dashboards, and deliver findings that enable data-driven decision-making across departments.",
    responsibilities: [
      "Collect, clean, validate, and transform large datasets from diverse internal and external sources",
      "Write optimised SQL queries and Python or R scripts for data extraction, transformation, and analysis",
      "Design and maintain interactive operational and executive dashboards in Tableau or Power BI",
      "Conduct statistical analyses including correlation, regression, and hypothesis testing",
      "Define, calculate, and track KPIs in collaboration with product, finance, and programme teams",
      "Develop, document, and automate recurring reporting pipelines",
      "Present analytical findings clearly to technical and non-technical audiences",
      "Collaborate with data engineers to identify and resolve data quality and pipeline issues",
    ],
    fields: "Statistics, Mathematics, Data Science, Computer Science, Economics",
    exp_min: 1, exp_max: 10,
    skills: ["Advanced SQL: joins, window functions, CTEs — PostgreSQL, MySQL, or BigQuery","Python data stack: pandas, NumPy, matplotlib, seaborn","Business Intelligence: Tableau or Microsoft Power BI","Statistical analysis and hypothesis testing","Advanced Excel: pivot tables, VLOOKUP, financial modelling","ETL processes and data pipeline development","Data storytelling and executive presentation skills"],
    certs: [],
    preferred: ["Google Professional Data Analytics Certificate","Tableau Desktop Specialist or Microsoft PL-300 (Power BI)","Cloud data warehousing: Snowflake, BigQuery, or Redshift","Machine learning fundamentals: scikit-learn","dbt (data build tool) for analytical engineering"],
    employment_type: "Full-time",
  },
  {
    title: "Cybersecurity Analyst", domain: "Technology", emoji: "🛡️",
    education_level: "Bachelor's",
    degrees: ["Bachelor of Science in Cybersecurity","Bachelor of Science in Information Security","Bachelor of Science in Computer Science","Bachelor of Science in Information Technology"],
    description: "Protect organisational digital infrastructure by monitoring threats, conducting vulnerability assessments, leading incident response, and ensuring compliance with Rwanda's National Cyber Security Policy.",
    about_role: "The Cybersecurity Analyst will operate the SOC, perform penetration testing, drive incident response, and coordinate with Rwanda NCSA on national threat intelligence sharing.",
    responsibilities: [
      "Monitor SIEM tools (Splunk, QRadar, or Microsoft Sentinel) for security events and anomalies in real time",
      "Conduct scheduled vulnerability assessments and penetration tests across network, application, and cloud infrastructure",
      "Lead structured incident response: containment, eradication, recovery, and post-incident documentation",
      "Develop, implement, and enforce information security policies, standards, and access control frameworks",
      "Perform security code reviews and advise development teams on OWASP secure coding practices",
      "Coordinate with Rwanda NCSA and CERT-RW on national threat intelligence and incident notifications",
      "Design and deliver phishing simulation exercises and staff cyber hygiene awareness training",
      "Maintain security documentation: risk register, incident logs, vulnerability tracker, and audit evidence",
    ],
    fields: "Cybersecurity, Information Security, Computer Science",
    exp_min: 2, exp_max: 12,
    skills: ["SIEM operations: Splunk, IBM QRadar, or Microsoft Sentinel","Penetration testing: Metasploit, Nessus, Burp Suite, Nmap","Incident response, digital forensics, and chain-of-custody","Network security: firewall management, IDS/IPS tuning","Identity and Access Management (IAM) and Privileged Access Management (PAM)","Cloud security: AWS, Azure, or GCP security services","OWASP Top 10 vulnerability classes and secure SDLC","Compliance frameworks: ISO 27001, NIST CSF, or GDPR"],
    certs: ["CompTIA Security+ or CySA+ — required","Certified Ethical Hacker (CEH) — required"],
    preferred: ["CISSP (Certified Information Systems Security Professional)","CISM (Certified Information Security Manager)","OSCP (Offensive Security Certified Professional)","Active engagement with Rwanda NCSA / CERT-RW"],
    employment_type: "Full-time",
  },
  {
    title: "ICT Support Technician", domain: "Technology", emoji: "🖥️",
    education_level: "Diploma",
    degrees: ["Advanced Diploma in Information Technology","Diploma in Computer Science","Diploma in Electronics and Telecommunications","Advanced Diploma in Networking and Systems Administration"],
    description: "Provide first and second-line technical support, maintain hardware and network infrastructure, and ensure business continuity of all ICT systems across the organisation.",
    about_role: "The ICT Support Technician will resolve hardware, software, and network issues, administer Microsoft 365 and Active Directory, manage the IT asset inventory, and support ongoing digital transformation initiatives.",
    responsibilities: [
      "Provide timely first and second-line IT helpdesk support via in-person, telephone, and ticketing system",
      "Install, configure, and maintain desktop computers, laptops, printers, and network peripherals",
      "Troubleshoot and resolve Windows 10/11, Linux, and macOS hardware and software issues",
      "Manage and maintain LAN/WAN network infrastructure, Wi-Fi access points, and managed switches",
      "Administer Microsoft Active Directory, Office 365 user accounts, group policies, and Exchange email",
      "Maintain an accurate, up-to-date IT asset inventory and equipment lifecycle records",
      "Perform daily data backup operations and test disaster recovery restoration procedures",
      "Document all support requests, resolutions, and system configuration changes in the ticketing system",
    ],
    fields: "Information Technology, Computer Science, Electronics, Telecommunications",
    exp_min: 1, exp_max: 10,
    skills: ["Hardware troubleshooting, component replacement, and repair","Windows 10/11 and Ubuntu Linux OS administration","TCP/IP networking: LAN/WAN, VLANs, DHCP, DNS","Microsoft Office 365 and Active Directory user management","IT helpdesk ticketing systems (Freshdesk or Jira Service Management)","Basic cybersecurity: antivirus, patch management, phishing awareness","VoIP telephony setup and troubleshooting","Data backup tools and disaster recovery testing"],
    certs: ["CompTIA A+ or CompTIA Network+ — required","Microsoft 365 Certified: Fundamentals (MS-900)"],
    preferred: ["Cisco CCNA — Networking","ITIL Foundation v4 — IT Service Management","Rwanda RISA / e-Government digital systems experience","Valid Rwanda driving licence — Category B"],
    employment_type: "Full-time",
  },
  {
    title: "Database Administrator (DBA)", domain: "Technology", emoji: "🗄️",
    education_level: "Bachelor's",
    degrees: ["Bachelor of Science in Computer Science","Bachelor of Science in Information Systems","Bachelor of Science in Software Engineering","Bachelor of Science in Information Technology"],
    description: "Design, implement, maintain, and secure enterprise database systems ensuring high availability, performance optimisation, and data integrity across all organisational applications.",
    about_role: "The DBA will administer production and development databases, implement backup and disaster recovery strategies, optimise query performance, enforce security policies, and support data migration and integration projects.",
    responsibilities: [
      "Install, configure, and administer relational databases: PostgreSQL, MySQL, Oracle, or SQL Server",
      "Design and maintain physical and logical database schemas, indexing strategies, and data models",
      "Implement and test automated database backup schedules and disaster recovery restoration procedures",
      "Monitor database performance, identify bottlenecks, and tune queries, indexes, and configuration parameters",
      "Manage database user accounts, roles, permissions, and row-level security per data access policies",
      "Plan and execute database migrations, version upgrades, and schema changes with minimal service disruption",
      "Support data integration between enterprise applications (ERP, HRIS, CRM) via ETL pipelines",
      "Produce database capacity planning reports and maintain database architecture documentation",
    ],
    fields: "Computer Science, Information Systems, Software Engineering",
    exp_min: 3, exp_max: 12,
    skills: ["Relational database administration: PostgreSQL, MySQL, or Oracle","SQL performance tuning: EXPLAIN ANALYZE, index optimisation","Database backup, recovery, replication, and high availability clustering","Database security: user roles, encryption at rest and in transit, audit logging","ETL scripting: Python, Bash, or PL/pgSQL","Database monitoring: pgAdmin, Percona Monitoring, or OEM","NoSQL administration: MongoDB or Redis","Linux OS administration for database server environments"],
    certs: [],
    preferred: ["Oracle Certified Professional (OCP) or PostgreSQL Associate Certification","AWS RDS / Azure SQL Database managed services experience","Data Warehouse platforms: Snowflake, BigQuery, or Redshift","ITIL Foundation — Change Management for database operations"],
    employment_type: "Full-time",
  },
  // ═══════════════════ FINANCE ═══════════════════
  {
    title: "Accountant", domain: "Finance", emoji: "📒",
    education_level: "Bachelor's",
    degrees: ["Bachelor of Commerce in Accounting","Bachelor of Science in Accounting and Finance","Bachelor of Business Administration in Accounting","Bachelor of Arts in Economics and Finance"],
    description: "Maintain the integrity of financial records, ensure full compliance with Rwanda Revenue Authority (RRA) tax obligations, and support strategic financial planning through accurate and timely reporting.",
    about_role: "The Accountant will manage the general ledger, oversee accounts payable and receivable, lead the month-end and year-end close process, and provide financial analysis to support management decisions.",
    responsibilities: [
      "Prepare, review, and analyse monthly, quarterly, and annual financial statements in compliance with IFRS/IPSAS",
      "Manage the full accounts payable and receivable cycle: invoice processing, payment runs, and debtor follow-up",
      "Perform monthly bank reconciliations and resolve all outstanding reconciling items within the reporting period",
      "Prepare and file corporate income tax (CIT), value-added tax (VAT), and PAYE declarations via the RRA e-Tax portal",
      "Support internal and external audit processes: prepare audit schedules and provide supporting documentation",
      "Develop, monitor, and report against departmental budgets and rolling forecasts",
      "Design and continuously strengthen internal financial controls",
      "Maintain the fixed assets register: additions, disposals, depreciation, and annual physical verification",
    ],
    fields: "Accounting, Finance, Business Administration, Economics",
    exp_min: 2, exp_max: 15,
    skills: ["Financial reporting under IFRS or IPSAS","General ledger management and chart of accounts","Rwanda RRA tax compliance: CIT, VAT, PAYE via e-Tax","Bank and balance sheet reconciliations","Advanced Excel: pivot tables, SUMIFS, financial modelling","Accounting software: QuickBooks, Sage, SAP FI, or Oracle Financials","Budgeting, forecasting, and variance analysis","Cash flow management and treasury operations"],
    certs: ["Bachelor of Commerce in Accounting or equivalent — required","CPA Rwanda (iCPAR) — required or actively pursuing final stages"],
    preferred: ["ACCA full qualification or final-stage student","CIMA or CMA designation","SAP ERP FI/CO or Oracle Financials implementation experience","IFRS specialist certificate"],
    employment_type: "Full-time",
  },
  {
    title: "Internal Auditor", domain: "Finance", emoji: "🔎",
    education_level: "Bachelor's",
    degrees: ["Bachelor of Commerce in Accounting","Bachelor of Science in Finance","Bachelor of Business Administration in Accounting","Bachelor of Commerce in Auditing"],
    description: "Independently assess the adequacy of internal controls, risk management processes, and governance structures to enhance organisational accountability and operational effectiveness.",
    about_role: "The Internal Auditor will plan and execute risk-based audit assignments, evaluate control design and effectiveness, identify weaknesses, and make evidence-based recommendations to management and the audit committee.",
    responsibilities: [
      "Develop and maintain the annual risk-based internal audit plan in consultation with management and the audit committee",
      "Execute operational, financial, compliance, and IT audit assignments per IIA International Standards",
      "Evaluate design and operating effectiveness of internal controls using the COSO framework",
      "Identify material risks, control gaps, fraud indicators, and process inefficiencies",
      "Document audit evidence, prepare working papers, and draft clear audit reports with risk-rated findings",
      "Track implementation of audit recommendations and report outstanding items to the audit committee",
      "Liaise with the Office of the Auditor General (OAG) and external auditors for coordinated coverage",
      "Conduct follow-up audits on high-risk findings and validate management action plan completion",
    ],
    fields: "Accounting, Finance, Auditing, Business Administration",
    exp_min: 3, exp_max: 15,
    skills: ["Risk-based internal audit planning and execution (IIA Standards)","Internal control assessment using COSO framework","Financial, compliance, and operational audit fieldwork","Audit report writing with risk ratings and recommendations","Rwanda PFM regulations — Law No. 37/2006","Fraud risk assessment and investigation techniques","Computer-assisted audit techniques (CAATs): ACL, IDEA, or Excel","IPSAS and IFRS standards"],
    certs: ["CPA Rwanda (iCPAR) — required","Certified Internal Auditor (CIA) — required or actively pursuing"],
    preferred: ["Certified Fraud Examiner (CFE)","ACCA full qualification","World Bank / Global Fund / USAID single audit standard experience","Certified Information Systems Auditor (CISA)"],
    employment_type: "Full-time",
  },
  {
    title: "Procurement Officer", domain: "Finance", emoji: "📦",
    education_level: "Bachelor's",
    degrees: ["Bachelor of Business Administration in Supply Chain Management","Bachelor of Commerce in Procurement","Bachelor of Science in Logistics and Supply Chain Management","Bachelor of Arts in Business Administration"],
    description: "Manage end-to-end procurement processes, ensure full compliance with Rwanda Public Procurement Authority (RPPA) regulations, and achieve value-for-money on all acquisitions of goods, works, and services.",
    about_role: "The Procurement Officer will develop and execute the annual procurement plan, manage all tendering and contracting through the RPPA Umucyo e-procurement platform, and maintain vendor relationships that support operational continuity.",
    responsibilities: [
      "Prepare, maintain, and execute the annual and quarterly procurement plans aligned to the organisational budget",
      "Manage complete tender processes: RFQs, RFPs, open competitive bidding, restricted, and direct procurement",
      "Use the RPPA Umucyo e-procurement platform for all procurement transactions and mandatory submissions",
      "Evaluate bids objectively, prepare evaluation reports with scoring matrices, and recommend contract awards",
      "Draft, review, negotiate, and administer supplier contracts, framework agreements, and purchase orders",
      "Conduct supplier pre-qualification, due diligence, and periodic performance evaluations",
      "Ensure compliance with Rwanda Procurement Law No. 17/2016 and its amendments",
      "Coordinate with Finance for budget confirmation, commitment recording, and payment processing",
    ],
    fields: "Procurement, Supply Chain Management, Business Administration, Logistics",
    exp_min: 2, exp_max: 12,
    skills: ["Rwanda Public Procurement Law No. 17/2016 and RPPA regulations","RPPA Umucyo e-procurement platform operations","Tender management, bid evaluation, and award documentation","Contract drafting, review, and administration","Supplier pre-qualification, evaluation, and performance management","Annual procurement planning linked to budget cycles","Market surveys, price benchmarking, and cost analysis"],
    certs: ["Bachelor's in Procurement, Supply Chain, or Business Administration — required","RPPA Procurement Practitioner Certificate — Rwanda — required","CIPS Level 4 Diploma in Procurement and Supply — required or actively pursuing"],
    preferred: ["CIPS Level 6 — Advanced or Professional Diploma","World Bank / AfDB procurement procedures training","Incoterms 2020 and international trade finance basics","Donor-funded procurement experience: AfDB, USAID, EU, Global Fund"],
    employment_type: "Full-time",
  },
  {
    title: "Microfinance Loan Officer", domain: "Finance", emoji: "🏦",
    education_level: "Bachelor's",
    degrees: ["Bachelor of Business Administration in Finance","Bachelor of Commerce in Banking and Finance","Bachelor of Science in Economics","Bachelor of Business Administration in Cooperative Management"],
    description: "Appraise individual and SME loan applications, manage a healthy loan portfolio, and provide financial advisory services that promote financial inclusion for Rwandan households and entrepreneurs.",
    about_role: "The Loan Officer will mobilise borrowers, conduct credit analyses, present loan applications to the credit committee, disburse approved loans, and implement proactive loan recovery strategies.",
    responsibilities: [
      "Mobilise prospective borrowers through community outreach, partnerships, and referral networks",
      "Receive, review, and pre-screen loan applications for completeness and eligibility",
      "Conduct field visits to verify business operations, assess cash flow, and evaluate offered collateral",
      "Prepare credit analysis reports including financial ratio analysis, repayment capacity, and risk rating",
      "Present loan applications with a clear recommendation to the credit committee",
      "Ensure timely disbursement and complete documentation for all approved loans",
      "Monitor loan portfolios proactively through follow-up calls and field visits to address early arrears",
      "Implement loan recovery actions: rescheduling, guarantor engagement, and legal referral as appropriate",
    ],
    fields: "Business Administration, Finance, Economics, Cooperative Management, Banking",
    exp_min: 1, exp_max: 10,
    skills: ["Credit appraisal and financial risk analysis for SMEs and individuals","Loan portfolio management and PAR monitoring","Basic financial statement analysis for micro and small enterprises","Collateral assessment: movable and immovable property valuation basics","Loan recovery and delinquency management techniques","Community mobilisation and financial literacy facilitation","Rwanda BNR microfinance regulatory framework and SACCO prudential norms","Microfinance information systems (MAMBU, TEMENOS, or similar)"],
    certs: ["Bachelor's in Finance, Economics, or Business Administration — required","Certificate in Cooperative or Microfinance Management — preferred"],
    preferred: ["MicroSave or Smart Campaign client protection principles training","Valid motorcycle riding licence — Category A (required for rural outreach)","BNR microfinance prudential norms training","Umurenge SACCO system experience"],
    employment_type: "Full-time",
  },
  {
    title: "Finance Manager", domain: "Finance", emoji: "💼",
    education_level: "Master's",
    degrees: ["Master of Science in Finance","Master of Business Administration (MBA) with Finance specialisation","Master of Commerce in Accounting","Master of Science in Accounting and Finance"],
    description: "Provide strategic financial leadership, oversee all financial operations, ensure regulatory compliance, and deliver high-quality financial intelligence to drive sound organisational decision-making.",
    about_role: "The Finance Manager will lead a finance team, manage the full accounting function, oversee budgeting and cash flow, ensure donor financial compliance, and serve as the primary liaison for auditors and financial regulators.",
    responsibilities: [
      "Lead and manage the finance team, setting performance targets and building team capability",
      "Oversee preparation, consolidation, and analysis of monthly management accounts and audited annual financial statements",
      "Develop and manage the annual organisational budget and multi-year financial projections",
      "Ensure full compliance with Rwanda tax laws (RRA), labour laws, and sector-specific financial regulations",
      "Manage treasury operations: cash flow forecasting, banking relationships, and foreign currency management",
      "Present financial performance reports and investment recommendations to the Board and senior management",
      "Oversee and coordinate the annual external audit; implement audit committee recommendations",
      "Strengthen and enforce internal financial controls and financial risk management frameworks",
    ],
    fields: "Accounting, Finance, Business Administration",
    exp_min: 6, exp_max: 20,
    skills: ["Strategic financial planning, budgeting, and multi-year forecasting","IFRS financial reporting and consolidation","Team leadership, coaching, and performance management","Treasury management and working capital optimisation","Rwanda tax compliance: CIT, VAT, PAYE, withholding tax","Donor financial management and reporting: USAID, EU, Global Fund","ERP financial systems: SAP, Oracle, or Microsoft Dynamics","Board-level financial presentation and stakeholder management"],
    certs: ["Master's in Finance, Accounting, or Business Administration — required","CPA Rwanda (iCPAR) full qualification — required"],
    preferred: ["ACCA or CIMA full qualification","CFA Charter holder or CFA Level II+","SAP ERP S/4HANA or Oracle Financials implementation experience","Executive leadership or management programme certificate"],
    employment_type: "Full-time",
  },
  // ═══════════════════ AGRICULTURE ═══════════════════
  {
    title: "Agronomist", domain: "Agriculture", emoji: "🌾",
    education_level: "Bachelor's",
    degrees: ["Bachelor of Science in Agronomy","Bachelor of Science in Agriculture","Bachelor of Science in Crop Science","Bachelor of Science in Soil Science","Bachelor of Science in Plant Science"],
    description: "Provide technical agronomic advisory, conduct soil health assessments, and support smallholder and commercial farmers to improve crop productivity using evidence-based practices aligned with Rwanda PSTA IV.",
    about_role: "The Agronomist will advise farmers and cooperatives on improved varieties, fertiliser application, pest and disease management, and climate-smart practices, while using GIS tools for spatial farm monitoring.",
    responsibilities: [
      "Conduct soil health assessments, fertility analyses, and develop site-specific fertiliser application recommendations",
      "Advise farmers and cooperatives on selection and use of RAB-certified improved seed varieties",
      "Design, establish, and manage demonstration plots for new agronomic technologies and improved varieties",
      "Identify, monitor, and recommend integrated pest and disease management (IPM) interventions",
      "Facilitate farmer access to certified inputs through input supply chains and government subsidy programmes",
      "Map farmland using QGIS/ArcGIS and produce seasonal crop monitoring reports",
      "Support formation, registration, and technical strengthening of farmer cooperatives and producer groups",
      "Coordinate with RAB, MINAGRI district agriculture offices, and development partners on programme activities",
    ],
    fields: "Agronomy, Agriculture, Crop Science, Soil Science, Plant Science",
    exp_min: 2, exp_max: 15,
    skills: ["Crop management and site-specific agronomic advisory","Soil health assessment and fertiliser recommendation (soil test interpretation)","Integrated Pest Management (IPM): pest and disease field diagnosis","Agricultural extension methodology and adult learning facilitation","GIS for farm mapping: QGIS or ArcGIS","Seasonal crop monitoring and yield estimation","Post-harvest handling, drying, and storage best practices","KoBoToolbox / ODK mobile data collection"],
    certs: ["Bachelor of Science in Agronomy or Agriculture — required","RAB (Rwanda Agriculture and Animal Resources Development Board) registration — preferred"],
    preferred: ["GIS / Remote Sensing Certificate: QGIS or ArcGIS","Conservation Agriculture or Climate-Smart Agriculture (CSA) training","Valid motorcycle riding licence — Category A","One Acre Fund, ACDI/VOCA, IFDC, or TechnoServe field experience"],
    employment_type: "Full-time",
  },
  {
    title: "Veterinary Officer", domain: "Agriculture", emoji: "🐄",
    education_level: "Bachelor's",
    degrees: ["Bachelor of Veterinary Medicine (BVM)","Bachelor of Veterinary Science (BVSc)","Doctor of Veterinary Medicine (DVM)"],
    description: "Provide professional animal health services to livestock and companion animals, conduct disease surveillance, and ensure veterinary public health standards are maintained across assigned zones.",
    about_role: "The Veterinary Officer will diagnose and treat animal diseases, manage vaccination campaigns, investigate disease outbreaks, conduct meat and dairy inspections, and contribute to One Health initiatives.",
    responsibilities: [
      "Diagnose and treat diseases in cattle, small ruminants, poultry, pigs, and companion animals using clinical examination and laboratory support",
      "Conduct structured disease surveillance and submit mandatory outbreak reports to RAB and MINAGRI",
      "Perform post-mortem examinations and collect specimens for submission to veterinary diagnostic laboratories",
      "Plan, manage cold chain for, and administer vaccination campaigns against notifiable diseases: FMD, LSD, CBPP, Newcastle disease",
      "Conduct ante-mortem and post-mortem meat inspections at abattoirs, slaughter slabs, and dairy facilities",
      "Advise farmers on animal nutrition, selective breeding, housing, and herd health management",
      "Participate in One Health coordination forums at district level",
      "Maintain disease records, veterinary prescriptions, and animal movement permits in RAB VAHIS",
    ],
    fields: "Veterinary Medicine, Animal Health, Animal Science",
    exp_min: 2, exp_max: 15,
    skills: ["Clinical examination and treatment of livestock and companion animals","Veterinary surgical procedures: wound suturing, caesarean, dehorning","Livestock disease surveillance and outbreak investigation","Zoonotic disease control and One Health coordination","Ante-mortem and post-mortem meat inspection","Vaccination programme management and cold-chain compliance","Veterinary laboratory sample collection and submission","Animal production systems advisory"],
    certs: ["Bachelor of Veterinary Medicine (BVM) or BVSc — required","Valid Practising Licence — Rwanda Veterinary Council","Certificate of Competence in Animal Health — Rwanda Veterinary Council"],
    preferred: ["Postgraduate Diploma in Epidemiology or Veterinary Public Health","GIS-based livestock disease mapping","HACCP and food safety systems for abattoir operations","FAO/OIE/WAHIS disease reporting experience"],
    employment_type: "Full-time",
  },
  {
    title: "Agricultural Extension Officer", domain: "Agriculture", emoji: "🌱",
    education_level: "Bachelor's",
    degrees: ["Bachelor of Science in Agriculture","Bachelor of Science in Agronomy","Advanced Diploma in Agriculture","Bachelor of Science in Rural Development","Bachelor of Science in Animal Science"],
    description: "Deliver practical training, field demonstrations, and advisory services to smallholder farmers, promoting adoption of improved crop technologies and climate-smart practices across assigned sectors.",
    about_role: "The Agricultural Extension Officer will mobilise farmers, facilitate farmer field schools, demonstrate improved varieties and technologies, and support district Crop Intensification Programme (CIP) implementation.",
    responsibilities: [
      "Plan, organise, and conduct farmer training sessions, field demonstrations, and farmer field schools (FFS)",
      "Mobilise and register farmers into cooperatives, savings groups, and input access schemes",
      "Advise farmers on certified seed varieties, correct fertiliser rates, and seasonal crop calendars",
      "Facilitate access to government subsidised inputs, crop insurance, and input voucher schemes",
      "Implement Rwanda Crop Intensification Programme (CIP) seasonal activities in assigned sectors",
      "Collect seasonal agricultural data (planted area, yield estimates) and submit reports to district authorities",
      "Facilitate market linkages between farmer groups, aggregators, and off-takers",
      "Conduct post-harvest handling demonstrations to reduce on-farm losses",
    ],
    fields: "Agriculture, Agronomy, Rural Development, Animal Science",
    exp_min: 0, exp_max: 10,
    skills: ["Farmer training facilitation and participatory learning methods","Demonstration plot establishment and seasonal management","Cooperative mobilisation and group dynamics facilitation","Agricultural record keeping and seasonal reporting","Kinyarwanda fluency — essential for community-facing delivery","Rwanda seasonal farming calendar and agro-ecological zone knowledge","Post-harvest handling, drying, and storage best practices","KoBoToolbox / ODK smartphone data collection"],
    certs: ["Bachelor of Science in Agriculture or Advanced Diploma in Agriculture — required","Valid motorcycle riding licence — Category A — required for field operations"],
    preferred: ["Farmer Field School (FFS) Facilitator certification","MINAGRI Crop Intensification Programme (CIP) technical training","Climate-Smart Agriculture (CSA) field application training","One Acre Fund or TechnoServe field officer experience"],
    employment_type: "Full-time",
  },
  {
    title: "Irrigation Engineer", domain: "Agriculture", emoji: "💧",
    education_level: "Bachelor's",
    degrees: ["Bachelor of Science in Agricultural Engineering","Bachelor of Science in Civil Engineering","Bachelor of Science in Water Resources Engineering","Bachelor of Science in Irrigation Engineering"],
    description: "Design, supervise construction, and manage operation and maintenance of irrigation systems to improve agricultural water use efficiency, supporting Rwanda's marshland and hillside irrigation programme.",
    about_role: "The Irrigation Engineer will lead technical design, construction supervision, and Water User Association training on efficient irrigation technologies, working with MINAGRI, RAB, and district officials.",
    responsibilities: [
      "Conduct site assessments: topographic surveys, soil permeability testing, and water source evaluation",
      "Design drip, sprinkler, and gravity-fed surface irrigation systems with hydraulic calculations and layout drawings",
      "Prepare Bills of Quantities, technical specifications, and construction drawings using AutoCAD Civil 3D",
      "Supervise construction of intake structures, distribution canals, pump stations, and field distribution networks",
      "Train farmers and Water User Associations (WUAs) on irrigation scheduling, operation, and routine maintenance",
      "Coordinate with RNRA, MINAGRI, and district authorities on water rights and environmental compliance",
      "Conduct post-construction performance assessments and produce technical rehabilitation reports",
    ],
    fields: "Agricultural Engineering, Civil Engineering, Water Resources Engineering, Irrigation Engineering",
    exp_min: 2, exp_max: 15,
    skills: ["Irrigation system design: drip, sprinkler, and gravity surface systems","Hydraulic calculations for distribution pipes, canals, and networks","AutoCAD Civil 3D and survey instruments: total station, GPS/GNSS","Bills of Quantities preparation and construction cost estimation","Irrigation scheduling and evapotranspiration (ET) calculations","Water User Association (WUA) formation and capacity building","Environmental and social safeguards for water infrastructure"],
    certs: ["Bachelor of Science in Agricultural, Civil, or Water Resources Engineering — required","REAB — Professional Engineer registration or trainee registration"],
    preferred: ["CROPWAT or EPANET irrigation software proficiency","World Bank / AfDB irrigation project implementation experience","ESIA knowledge for water infrastructure projects","Valid vehicle or motorcycle driving licence"],
    employment_type: "Full-time",
  },
  // ═══════════════════ ENGINEERING ═══════════════════
  {
    title: "Civil Engineer", domain: "Engineering", emoji: "🏗️",
    education_level: "Bachelor's",
    degrees: ["Bachelor of Science in Civil Engineering","Bachelor of Engineering in Civil Engineering","Bachelor of Science in Structural Engineering","Bachelor of Science in Construction Management"],
    description: "Lead technical design, supervision, and delivery of roads, drainage, buildings, and water supply infrastructure compliant with Rwanda Housing Authority (RHA) and RTDA standards.",
    about_role: "The Civil Engineer will manage construction projects from feasibility through to practical completion, supervise contractors, monitor quality and safety, and ensure on-time, on-budget delivery.",
    responsibilities: [
      "Design and review structural, road alignment, and hydraulic engineering drawings using AutoCAD, Civil 3D, and Revit",
      "Prepare detailed Bills of Quantities, cost estimates, and technical specifications for tender packages",
      "Supervise civil construction works and inspect quality of materials: concrete strength, compaction, pipe pressure testing",
      "Conduct topographic surveys, site feasibility assessments, and coordinate geotechnical investigations",
      "Ensure compliance with Rwanda Building Code, RTDA road design standards, and RHA regulations",
      "Manage contractors, subcontractors, and construction schedules using MS Project or Primavera P6",
      "Prepare monthly progress reports, site meeting minutes, and final handover and defects liability documentation",
      "Implement construction site health, safety, and environmental (HSE) management plans",
    ],
    fields: "Civil Engineering, Structural Engineering, Environmental Engineering, Construction Management",
    exp_min: 2, exp_max: 20,
    skills: ["Structural design and analysis: SAP2000, ETABS, or STAAD Pro","AutoCAD, Civil 3D, and BIM tools: Revit","Bills of Quantities preparation and cost estimation","Construction supervision and quality control: concrete, masonry, steel","Project scheduling: MS Project or Primavera P6","Topographic surveying: total station, GNSS/GPS, levelling","FIDIC contract administration principles","Site health, safety, and environmental (HSE) management"],
    certs: ["Bachelor of Science in Civil Engineering — required","REAB — Professional Engineer registration or trainee registration","Construction site health and safety certificate"],
    preferred: ["Project Management Professional (PMP)","FIDIC contract administration training","World Bank / AfDB infrastructure project experience","Environmental and Social Impact Assessment (ESIA) knowledge"],
    employment_type: "Full-time",
  },
  {
    title: "Electrical Engineer", domain: "Engineering", emoji: "⚡",
    education_level: "Bachelor's",
    degrees: ["Bachelor of Science in Electrical Engineering","Bachelor of Engineering in Electrical Engineering","Bachelor of Science in Power Systems Engineering","Bachelor of Science in Electrical and Electronic Engineering"],
    description: "Design, install, and maintain medium and low voltage electrical power systems to support Rwanda's national electrification agenda under REG and RURA regulatory oversight.",
    about_role: "The Electrical Engineer will design distribution networks, supervise installation works, perform commissioning and testing, and ensure compliance with RURA technical standards and the Rwanda Grid Code.",
    responsibilities: [
      "Design MV (11 kV, 33 kV) and LV (400 V) electrical distribution networks and substation layouts",
      "Prepare single-line diagrams (SLDs), cable schedules, and protection relay coordination studies",
      "Supervise electrical installation works: cabling, transformer energisation, and switchgear commissioning",
      "Conduct load flow analysis, short-circuit calculations, and protection settings using ETAP or DIgSILENT",
      "Commission electrical systems; conduct factory acceptance tests (FAT) and site acceptance tests (SAT)",
      "Perform preventive and corrective maintenance of transformers, generators, UPS, and LV switchboards",
      "Conduct energy audits and identify demand-side management and energy efficiency improvements",
      "Ensure designs and installations comply with Rwanda Grid Code, RURA standards, and IEC 60364",
    ],
    fields: "Electrical Engineering, Power Systems Engineering, Electronic Engineering, Mechatronics",
    exp_min: 2, exp_max: 18,
    skills: ["MV and LV power distribution network design","AutoCAD Electrical and ETAP or DIgSILENT PowerFactory","Protection relay setting, testing, and coordination","Generator, transformer, and UPS commissioning and maintenance","Energy audit methodology and power quality analysis","Rwanda Grid Code and RURA electrical installation standards","IEC and IEEE electrical standards","Electrical safety management on construction sites"],
    certs: ["Bachelor of Science in Electrical Engineering — required","REAB — Professional Electrical Engineer registration","RURA electrical installation work licence"],
    preferred: ["Renewable energy: solar PV on-grid and off-grid or micro-hydro","SCADA and energy management systems (EMS) experience","World Bank / AfDB electrification project experience","Project Management Professional (PMP)"],
    employment_type: "Full-time",
  },
  {
    title: "Environmental Officer", domain: "Engineering", emoji: "🌍",
    education_level: "Bachelor's",
    degrees: ["Bachelor of Science in Environmental Science","Bachelor of Science in Environmental Engineering","Bachelor of Science in Natural Resources Management","Bachelor of Arts in Geography and Environmental Studies"],
    description: "Lead Environmental and Social Impact Assessment (ESIA) processes, implement environmental management plans, and ensure all project activities comply with REMA regulations and international safeguard standards.",
    about_role: "The Environmental Officer will conduct EIAs, monitor environmental compliance on sites, engage communities and government authorities, and champion responsible environmental management.",
    responsibilities: [
      "Conduct Environmental and Social Impact Assessments (ESIA) and Strategic Environmental Assessments (SEA) for new projects",
      "Develop, implement, and monitor Environmental Management Plans (EMP) and Environmental and Social Management Frameworks (ESMF)",
      "Monitor environmental compliance during construction and operational phases: air, water, noise, and waste parameters",
      "Liaise with REMA, RDB, and district environment offices for regulatory approvals and compliance reporting",
      "Implement waste management plans, water quality monitoring, and spill contingency procedures",
      "Facilitate stakeholder consultations and manage community grievance mechanisms",
      "Train project staff, contractors, and subcontractors on environmental and social safeguards",
      "Produce quarterly environmental compliance monitoring reports for regulators and project financiers",
    ],
    fields: "Environmental Science, Natural Resources Management, Geography, Environmental Engineering",
    exp_min: 2, exp_max: 15,
    skills: ["ESIA and SEA methodology","Environmental compliance monitoring: air, water, soil, noise, biodiversity","GIS and remote sensing: QGIS or ArcGIS for environmental mapping","Waste management planning and pollution control","Water quality monitoring and sampling protocols","Stakeholder engagement and grievance mechanism design","ISO 14001 Environmental Management System implementation","Rwanda Environmental Law and REMA regulatory framework"],
    certs: ["Bachelor's in Environmental Science, Engineering, or Geography — required","REMA-approved EIA Practitioner registration — required"],
    preferred: ["ISO 14001 Lead Auditor certification","World Bank Environmental and Social Framework (ESF) training","REDD+ carbon finance or biodiversity offset project experience","Drone operation certificate for environmental site surveys"],
    employment_type: "Full-time",
  },
  {
    title: "WASH Engineer", domain: "Engineering", emoji: "🚰",
    education_level: "Bachelor's",
    degrees: ["Bachelor of Science in Civil Engineering","Bachelor of Science in Water Resources Engineering","Bachelor of Science in Environmental Engineering","Bachelor of Science in Sanitary Engineering"],
    description: "Design, supervise construction, and manage O&M of water supply systems, sanitation facilities, and hygiene promotion programmes in urban and rural settings across Rwanda.",
    about_role: "The WASH Engineer will lead technical design, construction supervision, and community Water User Committee training, ensuring WASAC and MININFRA compliance.",
    responsibilities: [
      "Design water supply systems: gravity-fed schemes, borehole pump systems, piped networks, and storage tanks",
      "Prepare engineering drawings, hydraulic designs, BoQs, and technical specifications",
      "Supervise construction of water supply and sanitation infrastructure and conduct quality inspections",
      "Conduct water quality testing and recommend appropriate treatment solutions",
      "Design sanitation solutions: VIP latrines, faecal sludge management, and wastewater treatment options",
      "Train Water User Committees (WUCs) on tariff setting, financial management, and O&M of water systems",
      "Implement hygiene promotion programmes in schools and health facilities",
      "Coordinate with WASAC, MININFRA, district WASH desks, and development partners",
    ],
    fields: "Civil Engineering, Water Resources Engineering, Environmental Engineering, Sanitary Engineering",
    exp_min: 2, exp_max: 15,
    skills: ["Water supply system design: gravity, pump, and piped networks using EPANET or WaterCAD","Sanitation systems design: latrines, FSM, wastewater treatment","AutoCAD and GIS for WASH infrastructure mapping","Water quality testing and chlorination procedures","Bills of Quantities and construction cost estimation","Water User Committee capacity building and tariff support","SPHERE standards and humanitarian WASH minimum standards"],
    certs: ["Bachelor of Science in Civil, Water Resources, or Environmental Engineering — required","REAB registration — required"],
    preferred: ["EPANET or WaterCAD hydraulic modelling proficiency","Rwanda WASAC technical standards training","World Bank / UNICEF / USAID WASH project experience","CLTS (Community Led Total Sanitation) facilitation training"],
    employment_type: "Full-time",
  },
  // ═══════════════════ GOVERNMENT ═══════════════════
  {
    title: "Human Resources Officer", domain: "Government", emoji: "👥",
    education_level: "Bachelor's",
    degrees: ["Bachelor of Arts in Human Resource Management","Bachelor of Business Administration in Human Resource Management","Bachelor of Science in Organisational Psychology","Bachelor of Arts in Industrial Psychology"],
    description: "Manage the full employee lifecycle — recruitment, onboarding, performance management, training, and offboarding — in compliance with Rwanda Labour Law and Rwanda Public Service Commission standards.",
    about_role: "The HR Officer will administer HR systems, coordinate recruitment, support line managers on performance management, ensure RSSB and labour law compliance, and build an engaged, high-performing workforce.",
    responsibilities: [
      "Manage end-to-end recruitment: job advertisement, shortlisting, interviews, reference checks, and onboarding",
      "Maintain and update HRIS and all employee records: contracts, leave, disciplinary files",
      "Coordinate annual and mid-year performance appraisal cycles and follow up on action plans",
      "Handle employee relations: grievance resolution, disciplinary hearings, and counselling under Rwanda Labour Law No. 66/2018",
      "Develop, update, and communicate HR policies and the employee handbook",
      "Process and validate monthly payroll; ensure accurate RSSB and medical insurance deductions",
      "Conduct Training Needs Analysis (TNA) and coordinate staff professional development programmes",
      "Maintain HR metrics: headcount, turnover rate, absenteeism, and training completion rates",
    ],
    fields: "Human Resource Management, Business Administration, Organisational Psychology",
    exp_min: 2, exp_max: 12,
    skills: ["End-to-end recruitment and structured interviewing","HRIS administration: IPPIS, SAP HR, or BambooHR","Performance management system administration","Rwanda Labour Law No. 66/2018 and RSSB regulatory compliance","Employee relations: grievance and disciplinary case management","Payroll processing: statutory deductions — PAYE, RSSB","Training needs analysis and L&D coordination","HR analytics and workforce reporting"],
    certs: ["Bachelor's in Human Resource Management or Business Administration — required"],
    preferred: ["PHR (Professional in Human Resources) or SHRM-CP","CIPD Level 5 Certificate in HRM","RPSC (Rwanda Public Service Commission) recruitment process experience","Employment Equity, Diversity, and Inclusion training"],
    employment_type: "Full-time",
  },
  {
    title: "Policy Analyst", domain: "Government", emoji: "📜",
    education_level: "Master's",
    degrees: ["Master of Arts in Public Policy","Master of Science in Economics","Master of Public Administration (MPA)","Master of Arts in Political Science","Master of Laws (LLM) in Public Law"],
    description: "Research, analyse, and formulate evidence-based policy recommendations that support Rwanda's National Strategy for Transformation (NST1) and sector development goals.",
    about_role: "The Policy Analyst will conduct rigorous policy research, evaluate existing programmes, produce high-quality policy briefs, and provide technical advice to senior leadership and inter-ministerial working groups.",
    responsibilities: [
      "Conduct in-depth literature reviews, data analyses, and stakeholder consultations to generate evidence for policy decisions",
      "Analyse impacts, trade-offs, and feasibility of proposed policy options using quantitative and qualitative methods",
      "Draft clear, concise policy briefs, Cabinet papers, legislative briefs, and sector position papers",
      "Monitor implementation of Rwanda government policies and track performance against NST1 indicators",
      "Engage with parliamentary committees, inter-ministerial working groups, and development partners on policy issues",
      "Represent the institution in policy dialogue forums, technical working groups, and regional meetings",
      "Mentor junior policy staff through coaching, training, and knowledge management",
    ],
    fields: "Public Policy, Political Science, Economics, Public Administration, Development Studies, Law",
    exp_min: 4, exp_max: 15,
    skills: ["Qualitative and quantitative policy research methods","Policy brief and Cabinet paper drafting","Political economy analysis and stakeholder mapping","Programme evaluation and theory of change assessment","Cost-benefit analysis and fiscal impact modelling","Statistical analysis: STATA, SPSS, or R","Rwanda government planning frameworks: MTEF, Imihigo, NST1"],
    certs: ["Master's degree in Public Policy, Economics, Law, or related discipline — required"],
    preferred: ["Rwanda Leadership Academy (RMA) or Rwanda School of Finance and Banking certificate","Parliamentary procedure and legislative drafting training","M&E or MEAL certification","Experience in MINECOFIN, MINALOC, or bilateral development organisation"],
    employment_type: "Full-time",
  },
  {
    title: "District Executive Secretary", domain: "Government", emoji: "🏛️",
    education_level: "Master's",
    degrees: ["Master of Public Administration (MPA)","Master of Arts in Governance and Leadership","Master of Business Administration (MBA)","Master of Laws (LLM) in Public Law and Governance"],
    description: "Provide strategic administrative leadership and coordinate decentralised service delivery at district level, serving as Chief Executive of the District under Rwanda's decentralisation framework.",
    about_role: "The District Executive Secretary will coordinate all district departments, serve as Secretary to the District Council and Executive Committee, oversee Imihigo performance contracts, and drive NST1 implementation at district level.",
    responsibilities: [
      "Coordinate implementation of national development programmes across all district sectors",
      "Serve as Secretary to the District Council and Executive Committee, preparing agendas and minutes",
      "Oversee district budget management, PFM compliance, and expenditure controls in line with MINECOFIN guidelines",
      "Manage Imihigo performance contracts, track progress, and submit quarterly reports to the President's Office",
      "Coordinate health, education, agriculture, infrastructure, and social protection sectors at district level",
      "Represent the district in inter-governmental coordination forums and with development partners",
      "Ensure implementation of the National Strategy for Transformation (NST1) and Rwanda Vision 2050",
      "Oversee Umuganda coordination, community mobilisation, and Ubudeehe social protection systems",
    ],
    fields: "Public Administration, Political Science, Law, Business Administration, Governance",
    exp_min: 7, exp_max: 30,
    skills: ["Public administration and decentralised governance leadership","Policy implementation and multi-sector programme management","District budget oversight and PFM compliance","Imihigo performance contract management and reporting","Community engagement: Umuganda, Ubudehe, Itorero coordination","Inter-agency and inter-governmental coordination","Rwanda Decentralisation Policy and MINALOC regulations","Leadership, change management, and strategic communication"],
    certs: ["Master's in Public Administration, Governance, or related field — required","Rwanda Public Service Commission (RPSC) competitive examination clearance"],
    preferred: ["Rwanda Leadership Academy (RMA) Senior Leadership Programme certificate","Central government ministry or cabinet-level experience","Demonstrated Imihigo performance achievement in prior post","PFM training certificate — MINECOFIN"],
    employment_type: "Full-time",
  },
  // ═══════════════════ NGO ═══════════════════
  {
    title: "Project Manager", domain: "NGO", emoji: "📋",
    education_level: "Master's",
    degrees: ["Master of Business Administration (MBA)","Master of Arts in Development Studies","Master of Science in Project Management","Master of Arts in International Development","Master of Public Administration (MPA)"],
    description: "Lead cross-functional teams to deliver high-impact development programmes on time, within scope, and on budget for a major donor-funded initiative operating across Rwanda.",
    about_role: "The Project Manager will own the full project lifecycle — from inception and work planning through to execution, monitoring, reporting, and close-out — for USAID, EU, DFID/FCDO, or multilateral donor programmes.",
    responsibilities: [
      "Define project scope, goals, deliverables, and success indicators in collaboration with donors and partners",
      "Develop comprehensive project work plans, Gantt charts, resource allocation plans, and risk registers",
      "Lead, motivate, and coordinate multi-disciplinary project teams across multiple districts",
      "Identify, assess, and proactively manage project risks and develop mitigation strategies",
      "Manage project budgets, track expenditure against budget lines, and maintain financial forecasts",
      "Prepare high-quality narrative and financial progress reports in compliance with donor standards",
      "Commission and manage baseline studies, mid-term reviews, and end-of-project evaluations",
      "Maintain productive relationships with government counterparts and district officials",
    ],
    fields: "Business Administration, Development Studies, Project Management, Social Sciences, International Development",
    exp_min: 4, exp_max: 20,
    skills: ["Project planning and WBS development: MS Project, Jira, or Asana","Logical Framework Analysis (LFA) and Theory of Change","Donor financial management and reporting: USAID ADS, EU PRAG, DFID Smart Rules","Budget management, expenditure tracking, and variance analysis","Stakeholder engagement and government relationship management","Risk management framework and risk register maintenance","MEAL framework design and programme learning facilitation","Team leadership, conflict resolution, and matrix management"],
    certs: ["Master's in Business, Development Studies, or relevant discipline — required","Project Management Professional (PMP) — required or actively pursuing"],
    preferred: ["PRINCE2 Practitioner","Certified Scrum Master (CSM)","Budget management experience exceeding USD 1 million","USAID ADS / EU PRAG compliance training"],
    employment_type: "Full-time",
  },
  {
    title: "MEAL Officer", domain: "NGO", emoji: "📈",
    education_level: "Bachelor's",
    degrees: ["Bachelor of Science in Statistics","Bachelor of Arts in Development Studies","Bachelor of Science in Economics","Bachelor of Science in Public Health","Bachelor of Arts in Social Sciences"],
    description: "Strengthen evidence-based programme management by designing and implementing robust Monitoring, Evaluation, Accountability, and Learning (MEAL) systems across all programme components.",
    about_role: "The MEAL Officer will oversee data collection, quality assurance, analysis, and reporting, ensuring programmes are on track and contributing to organisational learning and donor compliance.",
    responsibilities: [
      "Design and update MEAL frameworks, indicator tracking matrices, and data collection tools",
      "Coordinate baseline, mid-term, and end-line surveys including design, enumerator training, and quality assurance",
      "Configure and manage digital data collection platforms: KoBoToolbox, ODK, or CommCare",
      "Analyse programme data and produce technical M&E reports with findings and recommendations",
      "Conduct quarterly Data Quality Assessments (DQA) and verification against primary source documents",
      "Prepare MEAL sections of donor narrative reports: quarterly, semi-annual, and annual",
      "Facilitate programme learning events, after-action reviews, and communities of practice",
      "Manage community accountability and feedback mechanisms and document PSEA referrals",
    ],
    fields: "Statistics, Development Studies, Economics, Public Health, Social Sciences",
    exp_min: 2, exp_max: 12,
    skills: ["MEAL framework design: Logical Framework, Theory of Change, DMEL matrix","Quantitative analysis: SPSS, STATA, or R","Qualitative analysis: NVivo, Atlas.ti, or thematic coding in Excel","Digital data collection: KoBoToolbox, ODK, or CommCare","Data visualisation: Power BI, Tableau, or advanced Excel","Survey design, sampling methodology, and statistical inference","Donor reporting: USAID ADS, EU PRAG, Global Fund frameworks","Community accountability and PSEA referral mechanisms"],
    certs: ["Bachelor's in Statistics, Development Studies, Economics, or Social Sciences — required"],
    preferred: ["Postgraduate Diploma or Certificate in Monitoring and Evaluation","PEPFAR / DATIM M&E training","GIS proficiency for spatial programme analysis","Rwanda DHIS2, NISR, and HMIS data systems knowledge"],
    employment_type: "Full-time",
  },
  {
    title: "Social Worker / Case Manager", domain: "NGO", emoji: "🤝",
    education_level: "Bachelor's",
    degrees: ["Bachelor of Arts in Social Work","Bachelor of Science in Psychology","Bachelor of Arts in Sociology","Bachelor of Science in Social Sciences","Bachelor of Arts in Community Development"],
    description: "Provide professional psychosocial support, structured case management, and child protection services to vulnerable individuals and families including GBV survivors and households in extreme poverty.",
    about_role: "The Social Worker will identify, assess, and support vulnerable individuals through structured case management, referral pathways, and direct psychosocial interventions within Rwanda's integrated social protection system.",
    responsibilities: [
      "Conduct vulnerability assessments using standardised tools and develop individualised case management plans",
      "Provide psychosocial support and basic counselling using trauma-informed, strengths-based approaches",
      "Manage caseloads for child protection, GBV, and Ubudehe Category 1 extreme poverty beneficiaries",
      "Make timely referrals to health services, legal aid, Isange One Stop Centres, and social assistance programmes",
      "Facilitate survivor support group sessions for GBV survivors, PLHIV, and vulnerable families",
      "Conduct regular home visits to monitor client progress against case management plans",
      "Liaise with district social affairs officers, MIGEPROF, Rwanda National Police, and legal aid providers",
      "Maintain confidential case files and submit monthly caseload reports to the supervisor",
    ],
    fields: "Social Work, Psychology, Sociology, Social Sciences, Community Development",
    exp_min: 1, exp_max: 12,
    skills: ["Social case management methodology and care planning","Psychosocial support and basic trauma-informed counselling","Child protection, safeguarding, and mandatory reporting","GBV survivor-centred response methodology","Community vulnerability assessment and social mapping","Referral pathway navigation and inter-agency coordination","Rwanda social protection systems: Ubudehe, VUP, MIGEPROF","Kinyarwanda fluency — essential"],
    certs: ["Bachelor's in Social Work or Psychology — required","Rwanda Social Workers Council registration — preferred","Child Safeguarding and Protection Certification"],
    preferred: ["Psychological First Aid (PFA) certification","GBV Case Management Certificate (UNHCR/IRC)","MIGEPROF, MINISANTE, or UN Rwanda programme experience","Rwanda Integrated Child Protection System (ICPS) training"],
    employment_type: "Full-time",
  },
  {
    title: "Nutrition Officer", domain: "NGO", emoji: "🥗",
    education_level: "Bachelor's",
    degrees: ["Bachelor of Science in Nutrition and Dietetics","Bachelor of Science in Food Science and Nutrition","Bachelor of Science in Public Health Nutrition","Bachelor of Science in Agricultural Sciences with Nutrition"],
    description: "Design, implement, and evaluate nutrition programmes aimed at reducing malnutrition and improving dietary diversity in Rwanda, aligned with the Multi-Sector Nutrition Policy.",
    about_role: "The Nutrition Officer will coordinate community and facility-based nutrition interventions including CMAM, growth monitoring, and IYCF, and build capacity of community health workers and caregivers.",
    responsibilities: [
      "Implement CMAM (Community-based Management of Acute Malnutrition) protocols: SAM and MAM screening and treatment",
      "Conduct MUAC screening, growth monitoring and promotion (GMP) sessions, and refer malnourished children",
      "Train community health workers, volunteers, and caregivers on nutrition SBCC and IYCF practices",
      "Facilitate cooking demonstrations and dietary diversity education sessions at community level",
      "Coordinate supplementary and therapeutic feeding programmes and manage RUTF supply chains",
      "Collect and analyse nutrition surveillance data and submit reports to CNLG/MoH via DHIS2",
      "Liaise with health facilities, districts, WFP, and UNICEF on nutrition supply chain management",
    ],
    fields: "Nutrition, Dietetics, Food Science, Public Health, Agriculture",
    exp_min: 1, exp_max: 12,
    skills: ["CMAM and therapeutic feeding protocols (RUTF administration)","Anthropometric measurement: MUAC, MUAC screening, weight-for-height Z-scores","Nutrition SBCC design and facilitation","Growth monitoring and promotion (GMP)","Nutrition surveillance using DHIS2","Community mobilisation and CHW capacity building","Emergency nutrition response (SPHERE humanitarian standards)","IYCF counselling: breastfeeding, complementary feeding, micronutrient supplementation"],
    certs: ["Bachelor's in Nutrition, Dietetics, or Food Science — required","Rwanda Allied Health Professions Council — Nutrition/Dietetics licence"],
    preferred: ["SQUEAC / SMART survey methodology training","WFP, UNICEF, or Action Against Hunger programme experience","Nutrition-Sensitive Agriculture training","SPHERE standards and humanitarian nutrition response"],
    employment_type: "Full-time",
  },
  {
    title: "GBV Programme Officer", domain: "NGO", emoji: "💜",
    education_level: "Bachelor's",
    degrees: ["Bachelor of Arts in Social Work","Bachelor of Science in Psychology","Bachelor of Arts in Gender Studies","Bachelor of Arts in Development Studies","Bachelor of Arts in Sociology"],
    description: "Design, coordinate, and monitor gender-based violence prevention and response programmes that protect survivors and promote gender equality across Rwanda.",
    about_role: "The GBV Programme Officer will work with survivors, communities, health services, and government to strengthen GBV prevention, improve survivor access to quality services, and build community-level accountability systems.",
    responsibilities: [
      "Coordinate GBV prevention programmes at community level: awareness campaigns, community dialogues, and male engagement initiatives",
      "Ensure survivors have timely access to GBV response services: medical, psychosocial, legal, and economic reintegration",
      "Support and supervise community-based GBV case management teams",
      "Facilitate training of community health workers, police, teachers, and faith leaders on GBV prevention and survivor-centred response",
      "Strengthen referral pathways between Isange One Stop Centres, health facilities, and community structures",
      "Collect, analyse, and report GBV programme data in line with donor and government indicators",
      "Represent the organisation in District GBV coordination meetings and Inter-Agency GBV Sub-Clusters",
      "Conduct community participatory assessments to identify GBV risk factors and design prevention interventions",
    ],
    fields: "Social Work, Psychology, Gender Studies, Development Studies, Sociology",
    exp_min: 2, exp_max: 12,
    skills: ["GBV survivor-centred case management and psychosocial support","GBV prevention programming: community dialogues, male engagement, SBCC","Referral pathway management: Isange One Stop Centre, legal aid, medical services","Training design and facilitation for GBV prevention","M&E for GBV programmes: GBVIMS or similar data management","GBV inter-agency coordination and advocacy","PSEA policy implementation and community reporting mechanisms","Kinyarwanda fluency — essential"],
    certs: ["Bachelor's in Social Work, Psychology, or Gender Studies — required","GBV Case Management Certificate (UNHCR/IRC) — required","Child Safeguarding and Protection Certification"],
    preferred: ["GBV Information Management System (GBVIMS) training","MIGEPROF / ONE UN Rwanda / UNFPA programme experience","Psychological First Aid (PFA) certification","Men Engage or SASA! methodology training"],
    employment_type: "Full-time",
  },
  // ═══════════════════ HOSPITALITY ═══════════════════
  {
    title: "Hotel Manager", domain: "Hospitality", emoji: "🏨",
    education_level: "Bachelor's",
    degrees: ["Bachelor of Science in Hospitality Management","Bachelor of Arts in Tourism and Hospitality Management","Bachelor of Business Administration in Hotel Management","Bachelor of Science in Tourism Management"],
    description: "Lead all aspects of hotel operations, deliver exceptional guest experiences, drive revenue growth, and maintain RDB tourism classification standards.",
    about_role: "The Hotel Manager will oversee front office, housekeeping, food and beverage, and maintenance departments, manage staff performance, and ensure full compliance with Rwanda Development Board (RDB) tourism regulations.",
    responsibilities: [
      "Provide strategic and operational leadership across all hotel departments: front office, housekeeping, F&B, and maintenance",
      "Drive revenue management, room rate optimisation, and monthly occupancy targets",
      "Recruit, train, supervise, and appraise hotel staff; maintain departmental standard operating procedures",
      "Monitor and enforce hotel quality standards in compliance with RDB tourism classification requirements",
      "Handle VIP guest relations, resolve complex guest complaints, and develop guest loyalty programmes",
      "Manage hotel P&L, monthly budgets, and operational cost controls",
      "Ensure compliance with Rwanda tourism, fire safety, food hygiene, and public health regulations",
      "Develop and manage relationships with travel agencies, tour operators, and corporate accounts",
    ],
    fields: "Hospitality Management, Tourism, Hotel Management, Business Administration",
    exp_min: 5, exp_max: 25,
    skills: ["Hotel operations management: front office, housekeeping, F&B","Revenue management and yield optimisation","Property Management System (PMS): Opera, Protel, or Mews","Hotel P&L management, budgeting, and cost control","Guest experience management and complaint resolution","Staff recruitment, training, and performance management","Rwanda RDB hotel classification standards","HACCP food safety compliance"],
    certs: ["Bachelor's in Hospitality Management or Tourism — required","RDB Tourism Operator Certification","Food Handler / Hygiene Certification"],
    preferred: ["International hotel brand experience: Marriott, Radisson, Accor, or Serena","Revenue Management Certification (CRME)","Fluency in English, French, and Swahili","MICE (Meetings, Incentives, Conferences, Exhibitions) event management experience"],
    employment_type: "Full-time",
  },
  {
    title: "Tour Guide", domain: "Hospitality", emoji: "🦍",
    education_level: "Diploma",
    degrees: ["Advanced Diploma in Tourism and Hospitality","Diploma in Tourism Management","Bachelor of Arts in Tourism and Hospitality (advantage)"],
    description: "Lead outstanding visitor experiences across Rwanda's iconic destinations — including Volcanoes National Park gorilla trekking, Nyungwe Forest, and Akagera Safari — providing expert knowledge of wildlife, history, and culture.",
    about_role: "The Tour Guide will conduct guided tours for local and international visitors, coordinate logistics with lodges and RDB rangers, promote responsible tourism and conservation, and uphold the RDB Licensed Tour Guide Code of Conduct.",
    responsibilities: [
      "Lead guided tours including gorilla trekking, chimpanzee tracking, birdwatching, and cultural community visits",
      "Provide accurate, engaging, and professionally delivered commentary on Rwanda's wildlife, ecosystems, history, and culture",
      "Ensure the physical safety, comfort, and wellbeing of tourists throughout all tour activities",
      "Coordinate logistics with safari lodges, RDB park rangers, transport providers, and local communities",
      "Promote responsible tourism ethics, Leave No Trace principles, and wildlife conservation values",
      "Handle tourist queries, special dietary needs, medical situations, and complaints professionally",
      "Maintain up-to-date knowledge of Rwanda's wildlife, bird species, flora, and natural history",
      "Uphold RDB Licensed Tour Guide Code of Conduct and report any park violations",
    ],
    fields: "Tourism, Hospitality, Wildlife Management, Cultural Studies, Environmental Science",
    exp_min: 1, exp_max: 15,
    skills: ["Tour guiding and visitor experience facilitation","Knowledge of Rwanda National Parks: Volcanoes, Nyungwe, and Akagera","Wildlife identification, bird species recognition, and natural history interpretation","Rwanda cultural heritage, Imandwa ceremonies, and genocide memorial interpretation","Multilingual communication: English, French, and Swahili — required","Customer service, public speaking, and group management","First aid and emergency response in field settings","Conservation ethics and responsible tourism principles"],
    certs: ["RDB Licensed Tour Guide Certificate — required","Wilderness First Aid (WFA) or Wilderness First Responder (WFR)"],
    preferred: ["Additional European or Asian language: Spanish, German, or Chinese","Ornithology or primate behaviour specialist training","Drone operation licence for aerial photography tours","MICE and cultural diplomacy tour experience"],
    employment_type: "Full-time",
  },
  // ═══════════════════ LEGAL ═══════════════════
  {
    title: "Legal Counsel", domain: "Legal", emoji: "⚖️",
    education_level: "Bachelor's",
    degrees: ["Bachelor of Laws (LLB)","Bachelor of Laws with Honours (LLB Hons)","Bachelor of Arts in Law"],
    description: "Provide authoritative legal advice, manage litigation, draft and review contracts, and ensure full compliance with Rwandan law and applicable international regulations.",
    about_role: "The Legal Counsel will serve as the principal in-house legal adviser, manage organisational legal risk, represent the organisation in legal proceedings, and brief leadership and the Board on legal and regulatory developments.",
    responsibilities: [
      "Provide authoritative legal advice to management on all legal matters affecting the organisation",
      "Draft, review, and negotiate contracts, MoUs, partnership agreements, and service level agreements",
      "Manage litigation proceedings: brief external counsel, prepare court submissions, and represent the organisation in hearings",
      "Advise on Rwanda Labour Law compliance, employment contract drafting, and disciplinary matters",
      "Ensure regulatory compliance with applicable Rwanda laws, RURA, RDB, and sector-specific regulations",
      "Conduct legal due diligence for partnerships, mergers, acquisitions, and procurement processes",
      "Brief the Board and Executive Management on legislative changes and their organisational impact",
      "Maintain the legal filing system, contract register, and compliance calendar",
    ],
    fields: "Law, Legal Studies, Commercial Law, International Law",
    exp_min: 3, exp_max: 20,
    skills: ["Rwanda contract law and commercial law principles","Legal drafting: contracts, MoUs, and commercial agreements","Litigation management and court representation","Employment law and labour dispute resolution","Corporate governance and regulatory compliance","Legal research and case law analysis","Negotiation and Alternative Dispute Resolution (ADR)","Anti-corruption and compliance framework implementation"],
    certs: ["Bachelor of Laws (LLB) — required","Rwanda Bar Association (RBA) admission — required"],
    preferred: ["Master of Laws (LLM) in Commercial or International Law","KIAC (Kigali International Arbitration Centre) arbitration certification","Bilingual legal practice: English and French","Financial sector, NGO, or public sector legal practice experience"],
    employment_type: "Full-time",
  },
  // ═══════════════════ MEDIA ═══════════════════
  {
    title: "Communications and PR Officer", domain: "Media", emoji: "📣",
    education_level: "Bachelor's",
    degrees: ["Bachelor of Arts in Journalism and Mass Communication","Bachelor of Arts in Public Relations","Bachelor of Arts in Communications","Bachelor of Science in Media Studies","Bachelor of Arts in Marketing Communications"],
    description: "Manage the organisation's brand reputation, media relations, and internal and external communications strategy to strengthen visibility and credibility in Rwanda and beyond.",
    about_role: "The Communications and PR Officer will lead content creation, media engagement, digital campaigns, and stakeholder communication, serving as the primary liaison with journalists and media houses.",
    responsibilities: [
      "Develop and implement the annual communications and PR strategy aligned to organisational priorities",
      "Write and distribute press releases, media advisories, opinion pieces, and organisational statements",
      "Manage proactive relationships with Rwandan and international media houses and journalists",
      "Create and manage content across social media platforms: Twitter/X, LinkedIn, Facebook, and Instagram",
      "Produce newsletters, annual reports, brochures, and digital publications in English and Kinyarwanda",
      "Manage the organisation's website content, news updates, and basic SEO optimisation",
      "Develop crisis communication protocols, holding statements, and messaging frameworks",
      "Manage media monitoring, press clipping, and communications analytics reporting",
    ],
    fields: "Journalism, Mass Communication, Public Relations, Communications, Media Studies",
    exp_min: 2, exp_max: 12,
    skills: ["Press release, media advisory, and news story writing","Social media strategy and content creation across major platforms","Website content management: WordPress CMS","Photography and basic videography for digital content","Adobe Creative Suite or Canva Pro for design production","Media monitoring and press clipping tools","Speech writing and executive editorial support","Crisis communication and reputation management","Bilingual content production: English and Kinyarwanda"],
    certs: ["Bachelor's in Journalism, Communications, or PR — required","Rwanda Media Commission (RMC) accreditation — preferred"],
    preferred: ["Google Digital Marketing and E-Commerce Certificate","Crisis Communications certificate","International development or government communications experience","Podcast production or broadcast media experience"],
    employment_type: "Full-time",
  },
  // ═══════════════════ ENERGY ═══════════════════
  {
    title: "Renewable Energy Engineer — Solar PV", domain: "Energy", emoji: "☀️",
    education_level: "Bachelor's",
    degrees: ["Bachelor of Science in Electrical Engineering","Bachelor of Science in Renewable Energy Engineering","Bachelor of Science in Energy Systems Engineering","Bachelor of Engineering in Electrical Engineering"],
    description: "Design, install, commission, and maintain solar PV and off-grid energy systems, supporting Rwanda's universal electrification targets through REG, RURA, and off-grid energy programmes.",
    about_role: "The Solar PV Engineer will design on-grid and off-grid solar systems from household kits to mini-grid installations, manage installation teams, ensure RURA compliance, and train beneficiaries on operation and maintenance.",
    responsibilities: [
      "Design on-grid and off-grid solar PV systems: load assessment, system sizing, component specification",
      "Prepare technical drawings, single-line diagrams, and Bills of Quantities using AutoCAD Electrical",
      "Manage installation works: panel mounting, battery storage integration, inverter configuration, and cabling",
      "Commission, test, and formally hand over solar installations with full O&M documentation",
      "Conduct energy audits and recommend energy efficiency improvements for existing facilities",
      "Train technicians and beneficiaries on system operation, maintenance, and troubleshooting",
      "Liaise with RURA and REG on grid-connection approvals and net metering agreements",
      "Produce monthly project progress reports and technical installation completion certificates",
    ],
    fields: "Electrical Engineering, Renewable Energy Engineering, Energy Systems Engineering, Mechanical Engineering",
    exp_min: 2, exp_max: 15,
    skills: ["Solar PV system design and sizing: PVSyst or HOMER","AutoCAD Electrical for SLD preparation","Battery storage systems: lithium-ion and lead-acid","Off-grid and mini-grid system design and commissioning","Energy audit and load analysis methodology","RURA grid-connection and net metering regulatory process","System commissioning and site acceptance testing","O&M planning and preventive maintenance scheduling"],
    certs: ["Bachelor of Science in Electrical or Renewable Energy Engineering — required","REAB — Professional Engineer registration or trainee registration","RURA electrical installation work licence"],
    preferred: ["NABCEP Solar PV Installation Professional certification","Mini-grid project implementation in rural Rwanda","ESMAP / SREP / REA energy access programme experience","Battery Energy Storage System (BESS) design competency"],
    employment_type: "Full-time",
  },
  // ═══════════════════ OTHER ═══════════════════
  {
    title: "Architect", domain: "Other", emoji: "📐",
    education_level: "Bachelor's",
    degrees: ["Bachelor of Architecture (B.Arch)","Master of Architecture (M.Arch)","Bachelor of Arts in Architecture","Bachelor of Science in Architectural Engineering"],
    description: "Lead design and construction supervision of residential, commercial, and public building projects in Rwanda, ensuring compliance with RHA Building Code and Kigali City Master Plan.",
    about_role: "The Architect will manage the complete design lifecycle from concept through to construction completion, coordinate with structural and MEP engineers, and champion sustainable design principles.",
    responsibilities: [
      "Develop concept designs, design development drawings, and full construction documentation packages",
      "Lead BIM modelling using Revit or ArchiCAD for complex building projects",
      "Coordinate technical inputs with structural, MEP, and landscape engineering consultants",
      "Prepare planning applications and building permit submissions to RHA and the City of Kigali",
      "Conduct regular site inspections and quality supervision during all stages of construction",
      "Prepare Bills of Quantities and comprehensive tender documentation",
      "Ensure compliance with Rwanda Building Code, green building standards, and energy efficiency requirements",
      "Produce design visualisations and client presentations using SketchUp, Lumion, or 3ds Max",
    ],
    fields: "Architecture, Urban Design, Urban Planning, Architectural Engineering",
    exp_min: 2, exp_max: 20,
    skills: ["Architectural design and construction documentation","AutoCAD and BIM modelling: Revit or ArchiCAD","3D visualisation: SketchUp, Lumion, or 3ds Max","Rwanda Building Code and Kigali City Master Plan compliance","Construction supervision and quality control","Bills of Quantities preparation for building works","EDGE or LEED green building design principles","MEP and structural engineering coordination"],
    certs: ["Bachelor of Architecture (B.Arch) or equivalent — required","Rwanda Architects Association (RAA) — Professional Architect registration","REAB registration"],
    preferred: ["EDGE Green Building Certification — IFC","LEED Accredited Professional (LEED AP)","Affordable or social housing design experience","Urban design and master planning portfolio"],
    employment_type: "Full-time",
  },
  {
    title: "Supply Chain and Logistics Manager", domain: "Other", emoji: "🚚",
    education_level: "Bachelor's",
    degrees: ["Bachelor of Science in Supply Chain Management","Bachelor of Commerce in Logistics and Supply Chain","Bachelor of Business Administration in Operations Management","Bachelor of Science in Procurement and Logistics"],
    description: "Oversee end-to-end supply chain operations, optimise procurement and distribution processes, and ensure timely, cost-effective delivery of goods and services across all organisational functions.",
    about_role: "The Supply Chain Manager will lead procurement, warehousing, inventory management, transport, and customs clearance, implementing ERP-driven processes to achieve supply chain excellence.",
    responsibilities: [
      "Develop and implement a comprehensive supply chain strategy aligned to operational and budget objectives",
      "Manage strategic procurement, vendor selection, contract negotiation, and framework agreements",
      "Oversee inventory management, warehouse operations, bin card systems, and periodic stock counts",
      "Coordinate international freight, customs clearance, and import/export compliance with Rwanda Revenue Authority (RRA)",
      "Manage logistics service providers, last-mile delivery networks, and fleet coordination",
      "Implement and optimise supply chain ERP modules: SAP MM or Oracle SCM",
      "Monitor and report supply chain KPIs: order fill rate, lead time, stockout rate, inventory turnover",
      "Manage supply chain risk: supplier diversification, contingency planning, and business continuity",
    ],
    fields: "Supply Chain Management, Logistics, Business Administration, Procurement",
    exp_min: 4, exp_max: 18,
    skills: ["End-to-end supply chain strategy and operations management","Strategic sourcing, vendor selection, and contract negotiation","Inventory management and warehouse operations","International freight, customs clearance, and RRA import compliance","ERP supply chain modules: SAP MM or Oracle SCM","Supplier relationship management and performance monitoring","Demand forecasting and procurement planning","Supply chain risk management and contingency planning"],
    certs: ["Bachelor's in Supply Chain Management or Logistics — required","CIPS Level 5 — Advanced Diploma in Procurement and Supply"],
    preferred: ["CIPS Level 6 — Professional Diploma","APICS CSCP (Certified Supply Chain Professional)","Six Sigma Green Belt","Humanitarian supply chain experience: UNHCR, WFP, or ICRC"],
    employment_type: "Full-time",
  },
  {
    title: "Graphic Designer", domain: "Other", emoji: "🎨",
    education_level: "Bachelor's",
    degrees: ["Bachelor of Arts in Graphic Design","Bachelor of Arts in Visual Communication","Bachelor of Fine Arts in Design","Bachelor of Science in Multimedia Design and Technology"],
    description: "Create compelling, on-brand visual content for print and digital platforms, strengthening organisational identity and maximising communications impact across all audiences.",
    about_role: "The Graphic Designer will translate strategic communications briefs into high-quality designs across brand materials, social media, publications, and print collateral, maintaining brand consistency.",
    responsibilities: [
      "Design digital and print materials: brochures, flyers, banners, annual reports, and social media graphics",
      "Maintain and strictly enforce brand identity guidelines across all visual outputs",
      "Create infographics, data visualisations, and impact report layouts for donor and public audiences",
      "Design presentations, PowerPoint templates, and pitch deck master slides",
      "Edit photographs and produce short motion graphics and animations for digital platforms",
      "Manage and organise the organisation's digital asset library (DAM system)",
      "Prepare print-ready files and liaise with external printing vendors",
      "Collaborate with the Communications team to ensure visual content aligns with messaging strategy",
    ],
    fields: "Graphic Design, Visual Communication, Fine Arts, Multimedia Design",
    exp_min: 1, exp_max: 10,
    skills: ["Adobe Illustrator, Photoshop, and InDesign — advanced proficiency required","Canva Pro for rapid social media and presentation design","Brand identity management and design system maintenance","Infographic and data visualisation design","Typography, grid-based layout, and print production principles","Pre-press and print file preparation (bleed, CMYK, PDF/X)","Basic video editing: Adobe Premiere Pro or equivalent","Motion graphics: Adobe After Effects"],
    certs: ["Bachelor's in Graphic Design or Visual Communication — required"],
    preferred: ["Adobe Certified Professional (ACP) in any Adobe Creative Cloud application","UI/UX design using Figma or Adobe XD","3D design or product visualisation skills","Photography skills and photo editing portfolio"],
    employment_type: "Full-time",
  },
  {
    title: "Fleet and Transport Manager", domain: "Other", emoji: "🚗",
    education_level: "Bachelor's",
    degrees: ["Bachelor of Science in Automotive Engineering","Bachelor of Science in Mechanical Engineering","Bachelor of Business Administration in Logistics","Bachelor of Science in Transport Management"],
    description: "Oversee the full lifecycle management of the organisational vehicle fleet, ensuring operational readiness, driver safety, regulatory compliance, and cost efficiency across all field operations.",
    about_role: "The Fleet Manager will manage drivers, vehicle maintenance scheduling, fuel systems, and Rwanda National Police compliance, supporting multi-district field operations.",
    responsibilities: [
      "Manage a diverse vehicle fleet: 4WD field vehicles, motorcycles, and light trucks across multiple districts",
      "Develop and implement preventive maintenance schedules for all vehicles; manage repairs with approved service providers",
      "Coordinate vehicle registration, insurance renewals, and Rwanda National Police annual vehicle inspections",
      "Manage driver recruitment, licensing verification, and mandatory defensive driving training",
      "Implement and administer a Fleet Management Information System (FMIS) with GPS tracking",
      "Manage fuel card systems, monitor fuel consumption, and implement anti-fraud controls",
      "Process accident reports, conduct root cause investigations, and manage insurance claims",
      "Produce monthly fleet management reports: utilisation rate, maintenance costs, fuel efficiency, and incident summary",
    ],
    fields: "Automotive Engineering, Mechanical Engineering, Logistics, Business Administration, Transport Management",
    exp_min: 3, exp_max: 15,
    skills: ["Fleet lifecycle management: acquisition, maintenance, and disposal","Preventive maintenance scheduling and vehicle condition monitoring","Rwanda RNP vehicle inspection and registration compliance","Driver management, licensing, and defensive driving oversight","Fuel management: fuel cards, consumption tracking, and anti-fraud","Fleet management software and GPS vehicle tracking systems","Accident investigation, reporting, and insurance claims processing","Fleet budget management and cost per kilometre analysis"],
    certs: ["Valid Rwanda driving licence — Category B (minimum) — required","Bachelor's in Automotive Engineering, Mechanical Engineering, or Logistics — required"],
    preferred: ["NAFA or IAM Roadsmart Fleet Management certification","Defensive driving instructor certification","Fleet management experience in NGO, UN agency, or government","Electric vehicle (EV) fleet management and charging infrastructure training"],
    employment_type: "Full-time",
  },
  {
    title: "Monitoring Officer — Government Programmes", domain: "Other", emoji: "📊",
    education_level: "Bachelor's",
    degrees: ["Bachelor of Science in Statistics","Bachelor of Arts in Development Studies","Bachelor of Science in Economics","Bachelor of Public Administration","Bachelor of Science in Planning"],
    description: "Monitor implementation of government development programmes, track Imihigo performance indicators, and provide data-driven insights to support evidence-based policy and programme adjustments.",
    about_role: "The Monitoring Officer will collect, validate, and analyse programme data from district and sector levels, produce Imihigo progress reports, and coordinate M&E activities in compliance with MINECOFIN and MINALOC requirements.",
    responsibilities: [
      "Design and maintain programme monitoring frameworks, indicator definition sheets, and data collection schedules",
      "Conduct field monitoring visits to districts and sectors to verify programme implementation against targets",
      "Collect, validate, and enter programme data into government M&E systems (RISA EDPRS tracker, NISR, or IFMIS)",
      "Produce quarterly and annual Imihigo performance reports for Presidential oversight",
      "Analyse programme performance data and produce technical reports with findings, risks, and recommendations",
      "Conduct data quality assessments (DQA) on district-reported figures",
      "Facilitate mid-year and end-year programme review meetings with stakeholders",
      "Build capacity of district and sector M&E focal points on data collection and reporting",
    ],
    fields: "Statistics, Development Studies, Economics, Public Administration, Planning",
    exp_min: 2, exp_max: 12,
    skills: ["Programme monitoring framework design and indicator development","Field monitoring visit planning, conduct, and reporting","Government M&E systems: RISA, NISR, IFMIS, or EDPRS tracker","Imihigo performance reporting and tracking","Quantitative data analysis: Excel, SPSS, or STATA","Data quality assessment (DQA) methodology","Report writing for senior government audiences","Stakeholder coordination and capacity building facilitation"],
    certs: ["Bachelor's in Statistics, Development Studies, or Economics — required"],
    preferred: ["M&E or MEAL Diploma or Certificate","Rwanda Planning and Budgeting training: MTEF, Imihigo","MINECOFIN or MINALOC sector experience","GIS proficiency for spatial programme monitoring"],
    employment_type: "Full-time",
  },
  {
    title: "Community Development Officer", domain: "Other", emoji: "🌍",
    education_level: "Bachelor's",
    degrees: ["Bachelor of Arts in Community Development","Bachelor of Science in Social Sciences","Bachelor of Arts in Sociology","Bachelor of Arts in Rural Development","Bachelor of Science in Development Studies"],
    description: "Facilitate participatory community development processes, strengthen local governance structures, and support vulnerable households to improve their livelihoods and access to social services.",
    about_role: "The Community Development Officer will mobilise communities, facilitate participatory needs assessments, implement community action plans, coordinate social protection linkages, and build the capacity of local leadership structures.",
    responsibilities: [
      "Conduct participatory community needs assessments and facilitated community action planning sessions",
      "Mobilise community members, local leaders, and Women's Councils in sector and cell development activities",
      "Facilitate community savings and loans association (VSLA) formation and capacity building",
      "Link vulnerable households to government social protection programmes: VUP, Ubudehe, RSSB Mutuelle",
      "Coordinate implementation of community action plans with district social affairs offices",
      "Facilitate conflict resolution processes at community level using restorative approaches",
      "Conduct awareness campaigns on SGBV prevention, child protection, and community health",
      "Collect community data and maintain community registers in coordination with sector administrative structures",
    ],
    fields: "Community Development, Social Sciences, Sociology, Rural Development, Development Studies",
    exp_min: 1, exp_max: 10,
    skills: ["Participatory community assessment and action planning (PRA/PLA tools)","Community mobilisation and group facilitation","VSLA/SILC savings group formation and technical support","Social protection system navigation: VUP, Ubudehe, RSSB Mutuelle","Conflict resolution and community mediation","Awareness campaign design and facilitation","Community data collection and record management","Kinyarwanda fluency — essential"],
    certs: ["Bachelor's in Community Development, Social Sciences, or Sociology — required"],
    preferred: ["VSLA/SILC methodology certification (CARE International or FHH standard)","Rwanda social protection framework training","Valid motorcycle riding licence — Category A","Participatory rural appraisal (PRA) facilitation training"],
    employment_type: "Full-time",
  },
]

// ── Helpers ──────────────────────────────────────────────────
function getEducationLevel(level) {
  const map = { "Bachelor's": "Bachelor's", "Master's": "Master's", "Diploma": "Diploma", "PhD": "PhD" }
  return map[level] || "Bachelor's"
}

const JOB_TEMPLATES = {}
RWANDA_JOBS_DATA.forEach(job => {
  JOB_TEMPLATES[job.title] = {
    description:               job.description,
    about_role:                job.about_role,
    responsibilities:          job.responsibilities,
    employment_type:           job.employment_type || 'Full-time',
    required_education_levels: getEducationLevel(job.education_level),
    required_degrees:          job.degrees || [],
    required_fields:           job.fields,
    required_min_experience:   job.exp_min,
    required_max_experience:   job.exp_max,
    required_skills:           job.skills,
    required_certifications:   job.certs,
    preferred_qualifications:  job.preferred,
  }
})

const JOB_TITLES = Object.keys(JOB_TEMPLATES)
const DOMAIN_ORDER = ['Health','Education','Technology','Finance','Agriculture','Engineering','Government','NGO','Hospitality','Legal','Media','Energy','Other']
const titlesByDomain = {}
RWANDA_JOBS_DATA.forEach(j => {
  if (!titlesByDomain[j.domain]) titlesByDomain[j.domain] = []
  titlesByDomain[j.domain].push(j.title)
})

// ── Shared styles ─────────────────────────────────────────────
const inputStyle = {
  width: '100%', padding: '11px 14px', borderRadius: 8,
  border: `2px solid ${B.border}`, background: B.white, color: B.text,
  fontSize: '0.95rem', fontWeight: 500, boxSizing: 'border-box',
  outline: 'none', fontFamily: 'inherit', transition: 'border-color .15s',
}
const labelStyle = {
  display: 'block', fontSize: '0.78rem', fontWeight: 800,
  color: B.textMid, textTransform: 'uppercase',
  letterSpacing: '.07em', marginBottom: 8,
}

// ── TagInput ─────────────────────────────────────────────────
function TagInput({ label, hint, icon, tags, onChange, placeholder, color = B.blue }) {
  const [input, setInput] = useState('')
  const add    = () => { const v = input.trim(); if (v && !tags.includes(v)) onChange([...tags, v]); setInput('') }
  const remove = i => onChange(tags.filter((_, idx) => idx !== i))
  const onKey  = e => {
    if (e.key === 'Enter')    { e.preventDefault(); add() }
    if (e.key === 'Backspace' && !input && tags.length) remove(tags.length - 1)
  }
  return (
    <div>
      <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 7 }}>
        {icon && <span style={{ color }}>{icon}</span>}
        {label}
        {hint && <span style={{ color: B.textLight, fontWeight: 500, textTransform: 'none', fontSize: '.72rem', marginLeft: 4, letterSpacing: 0 }}>{hint}</span>}
      </label>
      <div
        style={{ minHeight: 52, padding: '8px 12px', border: `2px solid ${B.border}`, borderRadius: 8, background: B.white, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', cursor: 'text' }}
        onClick={e => e.currentTarget.querySelector('input')?.focus()}
      >
        {tags.map((t, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 99, background: color + '20', border: `1.5px solid ${color}60`, color, fontSize: '0.8rem', fontWeight: 700 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>{t}</span>
            <button type="button" onClick={() => remove(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color, padding: 0, display: 'flex', alignItems: 'center' }}>
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={onKey} onBlur={add}
          placeholder={tags.length === 0 ? placeholder : 'Add more…'}
          style={{ flex: 1, minWidth: 160, border: 'none', outline: 'none', background: 'transparent', fontSize: '0.9rem', color: B.text, fontFamily: 'inherit' }}
        />
      </div>
      <div style={{ fontSize: '.72rem', color: B.textLight, marginTop: 5, display: 'flex', alignItems: 'center', gap: 4 }}>
        Press <kbd style={{ padding: '1px 6px', background: B.bg, border: `1px solid ${B.border}`, borderRadius: 4, fontSize: '.7rem', color: B.textMid, fontWeight: 600 }}>Enter</kbd> or click away to add
      </div>
    </div>
  )
}

function SectionHeader({ icon, title, subtitle, color = B.blue, step }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, paddingBottom: 16, borderBottom: `2px solid ${B.borderLight}`, marginBottom: 20 }}>
      {step && <div style={{ width: 28, height: 28, borderRadius: '50%', background: color, color: B.white, fontSize: '.75rem', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 4 }}>{step}</div>}
      <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: color + '18', border: `1.5px solid ${color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color }}>{icon}</span>
      </div>
      <div>
        <div style={{ fontWeight: 800, fontSize: '1rem', color: B.text, letterSpacing: '-.01em' }}>{title}</div>
        {subtitle && <div style={{ fontSize: '.78rem', color: B.textLight, marginTop: 3 }}>{subtitle}</div>}
      </div>
    </div>
  )
}

function InfoBanner({ children, color = B.blue, bg, border: borderColor }) {
  return (
    <div style={{ padding: '11px 16px', background: bg || color + '10', border: `1.5px solid ${borderColor || color + '40'}`, borderRadius: 8, fontSize: '0.82rem', color, display: 'flex', gap: 9, alignItems: 'flex-start', fontWeight: 500, lineHeight: 1.6 }}>
      <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{children}</span>
    </div>
  )
}

function fmtDeadlinePreview(dtStr) {
  if (!dtStr) return ''
  try { return new Date(dtStr).toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
  catch { return dtStr }
}

// ── NumberedList — responsibilities, skills, certs ────────────
function NumberedList({ items }) {
  if (!items || !items.length) return null
  return (
    <div style={{ border: `1.5px solid ${B.borderLight}`, borderRadius: 10, overflow: 'hidden' }}>
      {items.map((item, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '14px 18px',
          background: i % 2 === 0 ? B.white : B.bg,
          borderTop: i > 0 ? `1px solid ${B.borderLight}` : 'none',
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
            border: `2px solid ${B.border}`, background: B.white,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.82rem', fontWeight: 800, color: B.textMid,
          }}>
            {i + 1}
          </div>
          <div style={{ fontSize: '0.88rem', color: B.text, fontWeight: 600, lineHeight: 1.5 }}>
            {typeof item === 'string' ? item : item.label}
          </div>
        </div>
      ))}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// ── QualificationsBlock — SINGLE clean Mifotra-style display ──
// Used in BOTH sidebar preview and full preview.
// NEVER shows [min N yrs] brackets or pipe characters to users.
//
// Props (two modes):
//   Mode A — live form array (HR preview):
//     degrees={string[]}  baseMin={number}  baseMax={number}
//   Mode B — parsed DB string (applicant view / any read-only view):
//     raw={string}   e.g. "Bachelor of Commerce [min 2 yrs] | Master's [min 1 yr]"
//   Both modes accept:
//     fields={string}   comma-separated fields of study (optional sub-label)
//     compact={boolean} smaller padding for sidebar
// ════════════════════════════════════════════════════════════════
function QualificationsBlock({ raw, degrees, baseMin = 0, baseMax = 20, fields, compact = false }) {
  // ── Build unified [{name, exp}] list ──────────────────────
  let rows = []

  if (raw && typeof raw === 'string') {
    // Parse the backend-serialized string:
    //   "Bachelor of Commerce [min 2 yrs] | Master of Science [min 1 yr]"
    rows = raw
      .split('|')
      .map(chunk => chunk.trim())
      .filter(Boolean)
      .map(chunk => {
        const m = chunk.match(/^(.*?)\s*\[min\s+(\d+)\s+yrs?\s*\]$/i)
        return m
          ? { name: m[1].trim(), exp: parseInt(m[2], 10) }
          : { name: chunk, exp: null }
      })
  } else if (Array.isArray(degrees) && degrees.length > 0) {
    rows = degrees.map(name => ({
      name,
      exp: calcExpForDegree(degreeTier(name), Number(baseMin), Number(baseMax)),
    }))
  }

  if (!rows.length) return null

  const rowPad = compact ? '12px 16px' : '16px 22px'

  return (
    <div>
      {/* Fields of study sub-label */}
      {fields && (
        <p style={{
          fontSize: compact ? '0.78rem' : '0.84rem',
          color: B.textLight,
          marginBottom: compact ? 10 : 12,
          lineHeight: 1.5,
        }}>
          Accepted fields of study:{' '}
          <strong style={{ color: B.textMid }}>{fields}</strong>
        </p>
      )}

      {/* ── Numbered rows — Mifotra style ── */}
      <div style={{ border: `1.5px solid ${B.borderLight}`, borderRadius: 10, overflow: 'hidden' }}>
        {rows.map((row, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: compact ? 14 : 18,
              padding: rowPad,
              background: i % 2 === 0 ? B.white : B.bg,
              borderTop: i > 0 ? `1px solid ${B.borderLight}` : 'none',
            }}
          >
            {/* Circle number */}
            <div style={{
              width:          compact ? 32 : 38,
              height:         compact ? 32 : 38,
              minWidth:       compact ? 32 : 38,
              borderRadius:   '50%',
              border:         `2px solid ${B.border}`,
              background:     B.white,
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              fontSize:       compact ? '0.78rem' : '0.85rem',
              fontWeight:     800,
              color:          B.textMid,
              marginTop:      2,
            }}>
              {i + 1}
            </div>

            {/* Degree name + dark experience badge */}
            <div>
              <div style={{
                fontSize:   compact ? '0.85rem' : '0.95rem',
                fontWeight: 700,
                color:      B.text,
                lineHeight: 1.4,
              }}>
                {row.name}
              </div>

              {/* Dark pill badge — exactly matching the Mifotra screenshot */}
              <span style={{
                display:       'inline-flex',
                alignItems:    'center',
                gap:           6,
                marginTop:     6,
                padding:       compact ? '3px 12px' : '4px 14px',
                borderRadius:  6,
                fontSize:      compact ? '0.72rem' : '0.78rem',
                fontWeight:    700,
                background:    B.navyMid,   // #1e293b — same dark slate as Mifotra
                color:         '#ffffff',
                whiteSpace:    'nowrap',
                letterSpacing: '.01em',
              }}>
                <Clock size={compact ? 10 : 12} />
                {row.exp === null
                  ? 'Experience: see job description'
                  : row.exp === 0
                    ? '0 Years of relevant experience'
                    : `${row.exp} Year${row.exp !== 1 ? 's' : ''} of relevant experience`
                }
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Footer note */}
      <p style={{
        fontSize:   compact ? '0.7rem' : '0.74rem',
        color:      B.textLight,
        marginTop:  8,
        lineHeight: 1.6,
      }}>
        Experience requirements vary by qualification level — higher degrees require fewer years of experience.
      </p>
    </div>
  )
}

// ── DegreeExpMatrix — HR-only admin table, shown in the form editor ──
function DegreeExpMatrix({ degrees, baseMin, baseMax }) {
  if (!degrees.length) return null
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: '.72rem', fontWeight: 800, color: B.textMid, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 10 }}>
        📊 Degree × Experience Matrix — auto-calculated
      </div>
      <div style={{ border: `1.5px solid ${B.borderLight}`, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 180px', background: B.navy, padding: '8px 14px', gap: 12 }}>
          <span style={{ fontSize: '.7rem', fontWeight: 800, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Accepted Degree</span>
          <span style={{ fontSize: '.7rem', fontWeight: 800, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '.06em', textAlign: 'center' }}>Level</span>
          <span style={{ fontSize: '.7rem', fontWeight: 800, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '.06em', textAlign: 'right' }}>Experience Required</span>
        </div>
        {degrees.map((d, i) => {
          const tier = degreeTier(d)
          const exp  = calcExpForDegree(tier, baseMin, baseMax)
          const colors = TIER_COLORS[tier]
          return (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '1fr 100px 180px',
              padding: '11px 14px', gap: 12, alignItems: 'center',
              background: i % 2 === 0 ? B.white : B.bg,
              borderTop: `1px solid ${B.borderLight}`,
            }}>
              <span style={{ fontSize: '0.83rem', color: B.text, fontWeight: 600 }}>{d}</span>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <span style={{ padding: '2px 9px', borderRadius: 99, fontSize: '0.7rem', fontWeight: 800, background: colors.bg, border: `1.5px solid ${colors.border}`, color: colors.text, whiteSpace: 'nowrap' }}>
                  {TIER_LABELS[tier]}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '4px 12px', borderRadius: 99, fontSize: '0.78rem', fontWeight: 800, whiteSpace: 'nowrap',
                  background: exp === 0 ? B.emeraldLight : exp <= 2 ? B.blueXLight : exp <= 5 ? B.amberLight : B.redLight,
                  border: `1.5px solid ${(exp === 0 ? B.emerald : exp <= 2 ? B.blue : exp <= 5 ? B.amber : B.red)}50`,
                  color: exp === 0 ? B.emerald : exp <= 2 ? B.blueDark : exp <= 5 ? B.amber : B.red,
                }}>
                  <Clock size={11} /> {expLabel(exp)}
                </span>
              </div>
            </div>
          )
        })}
        <div style={{ padding: '10px 14px', background: '#f8fafc', borderTop: `1px solid ${B.borderLight}`, fontSize: '.71rem', color: B.textLight, lineHeight: 1.7 }}>
          <strong style={{ color: B.textMid }}>Auto-adjustment rule:</strong>&nbsp;
          PhD → base−3 yrs · Master's → base−1 yr · Bachelor's → base yrs · Diploma → base+3 yrs (all capped at {baseMax} yrs max)
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────
export default function HRJobCreate() {
  const navigate   = useNavigate()
  const [loading,   setLoading]   = useState(false)
  const [activeTab, setActiveTab] = useState('form')

  const defaultDeadline = () => {
    const d = new Date()
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

  const handle = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  const setArr = key => val => setForm(f => ({ ...f, [key]: val }))
  const serialize = val => Array.isArray(val) ? val.join(', ') : (val || '')

  const applyTemplate = title => {
    const tpl = JOB_TEMPLATES[title]
    if (!tpl) { setForm(f => ({ ...f, title })); return }
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
    if (e && e.preventDefault) e.preventDefault()
    if (!form.required_skills.length)  { toast.error('Add at least one required skill'); return }
    if (!form.required_fields.trim())  { toast.error('Required fields of study cannot be empty'); return }
    if (!form.required_degrees.length) { toast.error('Add at least one required degree'); return }
    if (!form.responsibilities.length) { toast.error('Add at least one responsibility'); return }
    if (!form.deadline)                { toast.error('Please set an application deadline'); return }

    const deadlineWithSeconds = form.deadline.length === 16 ? form.deadline + ':00' : form.deadline
    setLoading(true)
    try {
      const enrichedDegrees = serializeDegreesWithExp(
        form.required_degrees,
        Number(form.required_min_experience),
        Number(form.required_max_experience),
      )
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
        required_education_levels: enrichedDegrees,
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
    background: B.white, border: `1.5px solid ${B.borderLight}`, borderRadius: 14,
    padding: '28px 30px', display: 'flex', flexDirection: 'column', gap: 20,
    boxShadow: '0 1px 6px rgba(15,23,42,.06)',
  }

  const nowMin = (() => {
    const now = new Date()
    const pad = n => String(n).padStart(2, '0')
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
  })()

  const bMin = Number(form.required_min_experience)
  const bMax = Number(form.required_max_experience)

  return (
    <>
      <Helmet><title>Post a Job — GI Recruitment Network</title></Helmet>
      <div className="page-wrapper" style={{ background: B.bg, minHeight: '100vh' }}>
        <Navbar />

        {/* Header */}
        <div style={{ background: `linear-gradient(135deg, ${B.navy} 0%, #1e3a5f 45%, ${B.blue} 100%)`, padding: '44px 20px 40px', color: B.white, borderBottom: `3px solid ${B.blueLight}` }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <button onClick={() => navigate('/hr')} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 7, border: '2px solid rgba(255,255,255,0.45)', background: 'rgba(255,255,255,0.12)', color: B.white, fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', marginBottom: 22, letterSpacing: '.02em' }}>
              <ArrowLeft size={14} /> Back to Dashboard
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(255,255,255,0.18)', border: '2px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Briefcase size={26} color={B.white} />
              </div>
              <div>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 900, color: B.white, margin: 0, letterSpacing: '-.02em' }}>Post a New Job</h1>
                <p style={{ color: '#93c5fd', fontSize: '0.88rem', margin: '4px 0 0', fontWeight: 500 }}>60 Rwanda-specific templates — experience adjusts automatically by degree level for fair AI shortlisting</p>
              </div>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 20px' }}>
          {/* Tab switcher */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 28, background: B.white, borderRadius: 10, padding: 5, width: 'fit-content', border: `1.5px solid ${B.borderLight}`, boxShadow: '0 1px 4px rgba(15,23,42,.07)' }}>
            {['form', 'preview'].map(tab => (
              <button key={tab} type="button" onClick={() => setActiveTab(tab)} style={{ padding: '9px 24px', borderRadius: 7, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', letterSpacing: '.02em', background: activeTab === tab ? B.blue : 'transparent', color: activeTab === tab ? B.white : B.textLight, boxShadow: activeTab === tab ? '0 2px 8px rgba(37,99,235,.35)' : 'none', transition: 'all .18s' }}>
                {tab === 'form' ? '✏️  Edit Form' : '👁  Preview'}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: activeTab === 'preview' ? '1fr' : '1fr 380px', gap: 28, alignItems: 'start' }}>

            {/* ════ FORM ════ */}
            {activeTab === 'form' && (
              <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

                {/* Template selector */}
                <div style={{ padding: '16px 20px', background: `linear-gradient(135deg, ${B.navy} 0%, #1e3a5f 100%)`, borderRadius: 12, display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 2px 10px rgba(15,23,42,.18)' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: B.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 2px 8px rgba(37,99,235,.5)' }}>
                    <Zap size={18} color={B.white} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: '0.85rem', color: B.white, marginBottom: 8, letterSpacing: '.02em' }}>⚡ Quick-Start — {JOB_TITLES.length} Rwanda job templates · experience scales automatically by degree level</div>
                    <select
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 7, border: '2px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.12)', fontSize: '0.88rem', color: B.white, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
                      value={JOB_TITLES.includes(form.title) ? form.title : ''}
                      onChange={e => { if (e.target.value) applyTemplate(e.target.value) }}
                    >
                      <option value="" style={{ color: B.text, background: B.white }}>— Select a template ({JOB_TITLES.length} positions across 13 sectors) —</option>
                      {DOMAIN_ORDER.map(domain => {
                        const titles = titlesByDomain[domain]
                        if (!titles) return null
                        const label = domain === 'Other' ? 'Cross-Cutting' : domain
                        return (
                          <optgroup key={domain} label={`── ${label} ──`}>
                            {titles.map(t => {
                              const job = RWANDA_JOBS_DATA.find(j => j.title === t)
                              return <option key={t} value={t} style={{ color: B.text, background: B.white }}>{job?.emoji} {t}</option>
                            })}
                          </optgroup>
                        )
                      })}
                    </select>
                  </div>
                </div>

                {/* Section 1: Basic Info */}
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
                    <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Timer size={13} color={B.red} /> Application Deadline <span style={{ color: B.red }}>*</span>
                      <span style={{ color: B.textLight, fontWeight: 500, fontSize: '.72rem', textTransform: 'none', letterSpacing: 0 }}>— exact date & time when the position closes</span>
                    </label>
                    <input style={{ ...inputStyle, borderColor: B.red + '60' }} type="datetime-local" name="deadline" min={nowMin} value={form.deadline} onChange={handle} required />
                    {form.deadline && (
                      <div style={{ marginTop: 8, padding: '8px 14px', borderRadius: 7, background: '#fff7ed', border: '1.5px solid #fed7aa', fontSize: '0.8rem', color: '#9a3412', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Timer size={13} /> Closes on {fmtDeadlinePreview(form.deadline)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Section 2: Role Description */}
                <div style={cardStyle}>
                  <SectionHeader step="2" icon={<FileText size={20} />} title="Role Description" subtitle="Help candidates fully understand the position" color={B.violet} />
                  <div>
                    <label style={labelStyle}>Short Overview <span style={{ color: B.red }}>*</span></label>
                    <textarea style={{ ...inputStyle, minHeight: 88, resize: 'vertical', lineHeight: 1.7 }} name="description" rows={3} placeholder="A concise 2–3 sentence summary shown on the listings page…" value={form.description} onChange={handle} required />
                  </div>
                  <div>
                    <label style={labelStyle}>About the Role</label>
                    <textarea style={{ ...inputStyle, minHeight: 120, resize: 'vertical', lineHeight: 1.7 }} name="about_role" rows={5} placeholder="Detailed description of the role, team, and work environment…" value={form.about_role} onChange={handle} />
                  </div>
                  <TagInput label="Key Responsibilities" hint="— press Enter after each" icon={<FileText size={14} />} tags={form.responsibilities} onChange={setArr('responsibilities')} placeholder="e.g. Prepare monthly financial statements" color={B.violet} />
                </div>

                {/* Section 3: Education */}
                <div style={cardStyle}>
                  <SectionHeader step="3" icon={<GraduationCap size={20} />} title="Education Requirements" subtitle="The system auto-adjusts required experience per degree tier — higher degree = fewer years required" color={B.sky} />
                  <InfoBanner color={B.sky}>
                    Enter each accepted degree exactly as it appears on a certificate — e.g. <strong>"Bachelor of Commerce in Accounting"</strong>. The system automatically sets a <strong>lower experience threshold for higher-level degrees</strong> (Master's/PhD) and a <strong>higher threshold for Diploma holders</strong>. See the live matrix below.
                  </InfoBanner>
                  <TagInput label="Accepted Degrees / Qualifications" hint="— one per entry, press Enter" icon={<GraduationCap size={14} />} tags={form.required_degrees} onChange={setArr('required_degrees')} placeholder="e.g. Bachelor of Commerce in Accounting" color={B.sky} />
                  {/* HR-only admin matrix — never shown to applicants */}
                  <DegreeExpMatrix degrees={form.required_degrees} baseMin={bMin} baseMax={bMax} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                    <div>
                      <label style={labelStyle}>Minimum Education Level <span style={{ color: B.red }}>*</span></label>
                      <select style={inputStyle} name="required_education_levels" value={form.required_education_levels} onChange={handle}>
                        <option value="Diploma">Diploma / Advanced Diploma</option>
                        <option value="Bachelor's">Bachelor's Degree</option>
                        <option value="Master's">Master's Degree</option>
                        <option value="PhD">PhD / Doctorate</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Fields of Study <span style={{ color: B.red }}>*</span> <span style={{ color: B.textLight, fontWeight: 500, fontSize: '.71rem', textTransform: 'none', letterSpacing: 0 }}>(comma-separated)</span></label>
                      <input style={inputStyle} name="required_fields" placeholder="e.g. Accounting, Finance, Business Administration" value={form.required_fields} onChange={handle} required />
                    </div>
                  </div>
                </div>

                {/* Section 4: Experience */}
                <div style={cardStyle}>
                  <SectionHeader step="4" icon={<Clock size={20} />} title="Base Experience Range" subtitle="Set the baseline for a Bachelor's degree — the matrix adjusts all other tiers automatically" color={B.amber} />
                  <InfoBanner color={B.amber}>
                    This is the <strong>base range for a Bachelor's degree holder</strong>. Master's/PhD applicants need fewer years; Diploma holders need more — see the live matrix above.
                  </InfoBanner>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                    <div>
                      <label style={labelStyle}>Base Minimum Experience (years) <span style={{ color: B.red }}>*</span></label>
                      <input style={inputStyle} type="number" name="required_min_experience" min="0" max="30" value={form.required_min_experience} onChange={handle} required />
                    </div>
                    <div>
                      <label style={labelStyle}>Maximum Experience (years) <span style={{ color: B.red }}>*</span></label>
                      <input style={inputStyle} type="number" name="required_max_experience" min="0" max="50" value={form.required_max_experience} onChange={handle} required />
                    </div>
                  </div>

                  {/* Experience summary panel */}
                  <div style={{ border: `1.5px solid ${B.borderLight}`, borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ padding: '10px 16px', background: B.navy, fontSize: '.72rem', fontWeight: 800, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: '.07em' }}>
                      Effective experience thresholds for this job
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
                      {[
                        { tier: 4, label: 'PhD',       exp: Math.max(0, bMin - 3) },
                        { tier: 3, label: "Master's",  exp: Math.max(0, bMin - 1) },
                        { tier: 2, label: "Bachelor's",exp: bMin },
                        { tier: 1, label: 'Diploma',   exp: Math.min(bMin + 3, bMax) },
                      ].map(({ tier, label, exp }, i) => {
                        const colors = TIER_COLORS[tier]
                        return (
                          <div key={tier} style={{ padding: '14px 16px', textAlign: 'center', borderLeft: i > 0 ? `1px solid ${B.borderLight}` : 'none', background: B.white }}>
                            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: colors.text, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>{label}</div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: colors.text, lineHeight: 1, marginBottom: 4 }}>{exp}</div>
                            <div style={{ fontSize: '0.72rem', color: B.textLight, fontWeight: 600 }}>yr{exp !== 1 ? 's' : ''} min</div>
                            <div style={{ marginTop: 8 }}>
                              <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: '0.68rem', fontWeight: 700, background: colors.bg, border: `1.5px solid ${colors.border}`, color: colors.text }}>
                                {exp === 0 ? 'Entry-level' : `≥ ${exp} yr${exp !== 1 ? 's' : ''}`}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* Section 5: Skills */}
                <div style={cardStyle}>
                  <SectionHeader step="5" icon={<Wrench size={20} />} title="Required Skills" subtitle="Concrete, specific skills the AI matches directly against applicant CVs" color={B.violet} />
                  <InfoBanner color={B.violet}>
                    Be specific — <strong>"GeneXpert MTB/RIF diagnostics"</strong> is better than <em>"laboratory skills"</em>. Applicants matching fewer than <strong>30%</strong> of listed skills are automatically disqualified.
                  </InfoBanner>
                  <TagInput label="Required Skills" hint="— press Enter after each" icon={<Wrench size={14} />} tags={form.required_skills} onChange={setArr('required_skills')} placeholder="e.g. GeneXpert MTB/RIF diagnostics" color={B.violet} />
                </div>

                {/* Section 6: Certifications */}
                <div style={cardStyle}>
                  <SectionHeader step="6" icon={<Award size={20} />} title="Certifications & Licences" subtitle="Professional certifications, licences, and professional body registrations" color={B.amber} />
                  <InfoBanner color={B.amber}>
                    Required certifications are <strong>mandatory</strong> — applicants without them will be screened out. Preferred qualifications are <strong>nice-to-have</strong> and used only for scoring.
                  </InfoBanner>
                  <TagInput label="Required Certifications / Licences" hint="— press Enter after each" icon={<Award size={14} />} tags={form.required_certifications} onChange={setArr('required_certifications')} placeholder="e.g. Valid Practising Licence — RNMC" color={B.amber} />
                  <TagInput label="Preferred / Nice-to-Have Qualifications" hint="— press Enter after each" icon={<Star size={14} />} tags={form.preferred_qualifications} onChange={setArr('preferred_qualifications')} placeholder="e.g. ACLS certification" color={B.emerald} />
                </div>

                {/* Submit */}
                <div style={{ display: 'flex', gap: 14, paddingBottom: 48 }}>
                  <button type="button" onClick={() => navigate('/hr')} style={{ flex: 1, padding: '14px', borderRadius: 10, border: `2px solid ${B.border}`, background: B.white, color: B.textMid, fontWeight: 700, cursor: 'pointer', fontSize: '0.95rem' }}>Cancel</button>
                  <button type="submit" disabled={loading} style={{ flex: 2, padding: '14px', borderRadius: 10, border: 'none', background: loading ? '#93c5fd' : `linear-gradient(135deg, ${B.blue} 0%, ${B.blueDark} 100%)`, color: B.white, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer', fontSize: '1rem', letterSpacing: '.02em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, boxShadow: loading ? 'none' : '0 4px 14px rgba(37,99,235,.45)' }}>
                    {loading ? <><div className="spinner" style={{ width: 18, height: 18 }} /> Posting Job…</> : <><Briefcase size={18} /> Post Job</>}
                  </button>
                </div>
              </form>
            )}

            {/* ════ LIVE PREVIEW SIDEBAR ════ */}
            {activeTab === 'form' && (
              <div style={{ position: 'sticky', top: 24 }}>
                <div style={{ background: B.white, border: `1.5px solid ${B.borderLight}`, borderRadius: 14, padding: '24px', maxHeight: 'calc(100vh - 80px)', overflowY: 'auto', boxShadow: '0 2px 10px rgba(15,23,42,.07)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.72rem', fontWeight: 800, color: B.blue, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 16, paddingBottom: 12, borderBottom: `2px solid ${B.borderLight}` }}>
                    👁 Live Preview
                  </div>
                  <div style={{ fontSize: '0.85rem', lineHeight: 1.75 }}>
                    {form.title && <div style={{ fontWeight: 900, fontSize: '1.05rem', color: B.text, marginBottom: 10 }}>{form.title}</div>}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                      {form.job_level && <span style={{ padding: '3px 12px', borderRadius: 99, background: B.blueXLight, border: `1.5px solid ${B.blue}40`, color: B.blueDark, fontSize: '.75rem', fontWeight: 800 }}>Level {form.job_level}</span>}
                      {form.number_of_posts && <span style={{ padding: '3px 12px', borderRadius: 99, background: B.violetLight, border: `1.5px solid ${B.violet}40`, color: B.violet, fontSize: '.75rem', fontWeight: 800 }}>{form.number_of_posts} Post{form.number_of_posts > 1 ? 's' : ''}</span>}
                      {form.employment_type && <span style={{ padding: '3px 12px', borderRadius: 99, background: B.bg, border: `1.5px solid ${B.border}`, color: B.textMid, fontSize: '.75rem', fontWeight: 700 }}>{form.employment_type}</span>}
                    </div>
                    {form.deadline && <div style={{ fontSize: '.77rem', color: '#9a3412', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600 }}><Timer size={12} /> Closes: {fmtDeadlinePreview(form.deadline)}</div>}
                    {form.description && <p style={{ color: B.textMid, marginBottom: 12, lineHeight: 1.7 }}>{form.description}</p>}

                    {/* ── Sidebar qualifications — clean Mifotra rows, compact ── */}
                    {form.required_degrees.length > 0 && (
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: '.72rem', fontWeight: 800, color: B.textLight, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>
                          Qualifications
                        </div>
                        <QualificationsBlock
                          degrees={form.required_degrees}
                          baseMin={bMin}
                          baseMax={bMax}
                          fields={form.required_fields}
                          compact={true}
                        />
                      </div>
                    )}

                    {form.required_skills.length > 0 && (
                      <>
                        <div style={{ fontSize: '.72rem', fontWeight: 800, color: B.textLight, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 7 }}>Required Skills</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {form.required_skills.slice(0, 6).map((s, i) => <span key={i} style={{ padding: '3px 10px', borderRadius: 99, background: B.violetLight, border: `1.5px solid ${B.violet}40`, color: B.violet, fontSize: '.73rem', fontWeight: 700 }}>{s}</span>)}
                          {form.required_skills.length > 6 && <span style={{ fontSize: '.73rem', color: B.textLight, alignSelf: 'center' }}>+{form.required_skills.length - 6} more</span>}
                        </div>
                      </>
                    )}
                    <button type="button" onClick={() => setActiveTab('preview')} style={{ marginTop: 18, width: '100%', padding: '10px', borderRadius: 8, border: `2px solid ${B.blue}`, background: 'transparent', color: B.blue, fontWeight: 700, cursor: 'pointer', fontSize: '0.82rem' }}>
                      View Full Preview →
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ════ FULL PREVIEW ════ */}
            {activeTab === 'preview' && (
              <div style={{ background: B.white, border: `1.5px solid ${B.borderLight}`, borderRadius: 14, padding: '40px 44px', maxWidth: 760, margin: '0 auto', width: '100%', boxShadow: '0 2px 12px rgba(15,23,42,.08)' }}>
                <div style={{ fontSize: '.72rem', fontWeight: 800, color: B.blue, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 22 }}>Job Posting Preview</div>
                {form.title && <h2 style={{ fontSize: '1.65rem', fontWeight: 900, color: B.text, marginBottom: 14, letterSpacing: '-.02em' }}>{form.title}</h2>}

                {/* Meta badges */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
                  {form.location && <span style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 14px', borderRadius: 99, background: B.bg, border: `1.5px solid ${B.border}`, color: B.textMid, fontSize: '.8rem', fontWeight: 700 }}><MapPin size={12} /> {form.location}</span>}
                  {form.employment_type && <span style={{ padding: '4px 14px', borderRadius: 99, background: B.blueXLight, border: `1.5px solid ${B.blue}40`, color: B.blueDark, fontSize: '.8rem', fontWeight: 700 }}>{form.employment_type}</span>}
                  {form.job_level && <span style={{ padding: '4px 14px', borderRadius: 99, background: B.violetLight, border: `1.5px solid ${B.violet}40`, color: B.violet, fontSize: '.8rem', fontWeight: 700 }}>Level {form.job_level}</span>}
                  {form.number_of_posts && <span style={{ padding: '4px 14px', borderRadius: 99, background: B.emeraldLight, border: `1.5px solid ${B.emerald}40`, color: B.emerald, fontSize: '.8rem', fontWeight: 700 }}>{form.number_of_posts} Opening{form.number_of_posts > 1 ? 's' : ''}</span>}
                </div>

                {/* Deadline */}
                {form.deadline && <div style={{ padding: '10px 16px', borderRadius: 8, background: '#fff7ed', border: '1.5px solid #fed7aa', color: '#9a3412', fontSize: '0.83rem', fontWeight: 700, display: 'flex', gap: 7, alignItems: 'center', marginBottom: 22 }}><Timer size={14} /> Application Deadline: {fmtDeadlinePreview(form.deadline)}</div>}

                {/* Description */}
                {form.description && <p style={{ color: B.textMid, lineHeight: 1.8, fontSize: '0.95rem', marginBottom: 22 }}>{form.description}</p>}
                {form.about_role && (
                  <>
                    <h3 style={{ fontSize: '1rem', fontWeight: 800, color: B.text, marginBottom: 10, marginTop: 26 }}>About the Role</h3>
                    <p style={{ color: B.textMid, lineHeight: 1.8, fontSize: '0.92rem', marginBottom: 16 }}>{form.about_role}</p>
                  </>
                )}

                {/* Key Responsibilities */}
                {form.responsibilities.length > 0 && (
                  <>
                    <h3 style={{ fontSize: '1rem', fontWeight: 800, color: B.text, marginBottom: 14, marginTop: 26 }}>Key Responsibilities</h3>
                    <NumberedList items={form.responsibilities} />
                  </>
                )}

                {/* ── QUALIFICATIONS — clean Mifotra-style, no brackets, no pipes ── */}
                {form.required_degrees.length > 0 && (
                  <div style={{ marginTop: 30 }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 800, color: B.text, marginBottom: 14 }}>Qualifications</h3>
                    <QualificationsBlock
                      degrees={form.required_degrees}
                      baseMin={bMin}
                      baseMax={bMax}
                      fields={form.required_fields}
                    />
                  </div>
                )}

                {/* Required Skills */}
                {form.required_skills.length > 0 && (
                  <>
                    <h3 style={{ fontSize: '1rem', fontWeight: 800, color: B.text, marginBottom: 12, marginTop: 26 }}>Required Competencies</h3>
                    <NumberedList items={form.required_skills} />
                  </>
                )}

                {/* Required Certifications */}
                {form.required_certifications.length > 0 && (
                  <>
                    <h3 style={{ fontSize: '1rem', fontWeight: 800, color: B.text, marginBottom: 12, marginTop: 26 }}>Required Certifications &amp; Licences</h3>
                    <NumberedList items={form.required_certifications} />
                  </>
                )}

                {/* Preferred Qualifications */}
                {form.preferred_qualifications.length > 0 && (
                  <>
                    <h3 style={{ fontSize: '1rem', fontWeight: 800, color: B.text, marginBottom: 12, marginTop: 26 }}>Preferred Qualifications</h3>
                    <NumberedList items={form.preferred_qualifications} />
                  </>
                )}

                {/* Actions */}
                <div style={{ marginTop: 36, paddingTop: 24, borderTop: `2px solid ${B.borderLight}`, display: 'flex', gap: 14 }}>
                  <button onClick={() => setActiveTab('form')} style={{ padding: '11px 22px', borderRadius: 8, border: `2px solid ${B.border}`, background: B.white, color: B.textMid, fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}>← Back to Edit</button>
                  <button disabled={loading} onClick={submit} style={{ padding: '11px 28px', borderRadius: 8, border: 'none', background: `linear-gradient(135deg, ${B.blue} 0%, ${B.blueDark} 100%)`, color: B.white, fontWeight: 800, cursor: 'pointer', fontSize: '0.9rem', boxShadow: '0 4px 14px rgba(37,99,235,.4)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Briefcase size={16} /> {loading ? 'Posting…' : 'Post This Job'}
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  )
}