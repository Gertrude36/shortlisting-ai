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

// ── Color system (projector-safe, high-contrast) ────────────────
const C = {
  navy:        '#0A1628',
  navyMid:     '#102040',
  blue:        '#1A56DB',
  blueDark:    '#1040B0',
  blueLight:   '#EBF2FF',
  blueBorder:  '#93C5FD',
  purple:      '#6D28D9',
  purpleLight: '#F3EEFF',
  purpleBorder:'#C4B5FD',
  amber:       '#B45309',
  amberLight:  '#FFFBEB',
  amberBorder: '#FCD34D',
  teal:        '#0E7490',
  tealLight:   '#ECFEFF',
  tealBorder:  '#67E8F9',
  green:       '#065F46',
  greenLight:  '#ECFDF5',
  greenBorder: '#6EE7B7',
  red:         '#B91C1C',
  redLight:    '#FEF2F2',
  white:       '#FFFFFF',
  gray50:      '#F8FAFC',
  gray100:     '#F1F5F9',
  gray200:     '#E2E8F0',
  gray300:     '#CBD5E1',
  gray400:     '#94A3B8',
  gray600:     '#475569',
  gray700:     '#334155',
  gray800:     '#1E293B',
  gray900:     '#0F172A',
}

const JOB_LEVELS = [
  '1.I','1.II','1.III','2.I','2.II','2.III',
  '3.I','3.II','3.III','4.I','4.II','4.III',
  '5.I','5.II','5.III','6.I','6.II','6.III',
  '7.I','7.II','7.III',
]

const JOB_TEMPLATES = {
  'Veterinary Officer': {
    description: 'We are seeking a qualified Veterinary Officer to provide professional animal health services, disease surveillance, and veterinary public health support across our operations.',
    about_role: 'The Veterinary Officer will be responsible for diagnosing and treating animal diseases, conducting health inspections, implementing disease control programs, and ensuring compliance with veterinary public health standards.',
    responsibilities: ['Diagnose and treat diseases in livestock and companion animals','Conduct disease surveillance and report outbreaks to relevant authorities','Perform post-mortem examinations and interpret laboratory results','Administer vaccinations and supervise disease prevention programs','Inspect meat, dairy, and animal products for public health compliance','Advise farmers on animal nutrition, breeding, and husbandry practices','Maintain veterinary records and prepare clinical and field reports','Collaborate with government agencies on zoonotic disease control'],
    required_education_levels: "Bachelor's, Master's, PhD",
    required_degrees: ['Bachelor of Veterinary Medicine (BVM)','Bachelor of Veterinary Science (BVSc)',"Bachelor's in Animal Health and Production",'Master of Veterinary Medicine (MVM)','Master of Science in Veterinary Epidemiology','PhD in Veterinary Sciences'],
    required_fields: 'Veterinary Medicine, Animal Health, Veterinary Science, Animal Science',
    required_min_experience: 2, required_max_experience: 15,
    required_skills: ['Animal diagnosis and treatment','Surgical procedures (soft tissue and orthopaedic)','Livestock disease surveillance','Zoonotic disease control','Meat and dairy inspection','Laboratory sample collection and interpretation','Vaccination program management','Veterinary record keeping','One Health approach','Emergency animal care'],
    required_certifications: ['Registered Veterinarian License (Veterinary Board)','Certificate of Competence in Animal Health'],
    preferred_qualifications: ['Postgraduate training in Epidemiology or Public Health','Experience with GIS-based disease mapping','Training in HACCP or food safety systems','Familiarity with FAO/OIE disease reporting standards'],
    employment_type: 'Full-time',
  },
  'Software Engineer': {
    description: 'We are looking for a talented Software Engineer to design, develop, and maintain high-quality, scalable software systems that power our core products.',
    about_role: 'As a Software Engineer you will own the full development lifecycle — from requirements analysis and architecture design to implementation, testing, and production deployment.',
    responsibilities: ['Design and implement scalable, maintainable backend and frontend services','Write clean, well-tested, and thoroughly documented code','Participate in architecture decisions and technical design reviews','Conduct and respond to code reviews with constructive feedback','Investigate, debug, and resolve production incidents','Collaborate with product managers, designers, and QA engineers','Contribute to CI/CD pipeline improvements and DevOps practices','Mentor junior engineers and share technical knowledge'],
    required_education_levels: "Bachelor's, Master's",
    required_degrees: ['Bachelor of Science in Computer Science','Bachelor of Science in Software Engineering','Bachelor of Science in Information Technology','Bachelor of Engineering in Computer Engineering','Master of Science in Computer Science','Master of Science in Software Engineering'],
    required_fields: 'Computer Science, Software Engineering, Information Technology, Computer Engineering',
    required_min_experience: 2, required_max_experience: 12,
    required_skills: ['Python or Java or Node.js (backend development)','React or Vue.js (frontend development)','SQL and NoSQL databases (PostgreSQL, MongoDB)','RESTful API design and development','Git version control and branching strategies','Docker and containerisation','Unit testing and test-driven development (TDD)','Cloud platforms (AWS, GCP, or Azure)','Agile/Scrum methodologies','Data structures and algorithms'],
    required_certifications: [],
    preferred_qualifications: ['AWS Certified Developer or Solutions Architect','Kubernetes (CKA/CKAD) certification','Contributions to open-source projects','Experience with microservices architecture','GraphQL API experience'],
    employment_type: 'Full-time',
  },
  'Accountant': {
    description: 'We are looking for a meticulous and experienced Accountant to manage financial records, ensure regulatory compliance, and support strategic financial planning.',
    about_role: 'The Accountant will maintain the integrity of our financial reporting systems, manage month-end and year-end processes, oversee tax compliance, and provide financial analysis to support management decision-making.',
    responsibilities: ['Prepare, review, and analyse monthly, quarterly, and annual financial statements','Manage accounts payable, accounts receivable, and general ledger entries','Perform bank reconciliations and ensure timely resolution of discrepancies','Prepare and file corporate tax returns and ensure VAT compliance','Support internal and external audit processes with documentation','Develop and monitor departmental budgets and forecasts','Analyse financial variances and present findings to senior management','Implement and strengthen internal financial controls'],
    required_education_levels: "Bachelor's, Master's",
    required_degrees: ['Bachelor of Commerce in Accounting','Bachelor of Science in Accounting and Finance','Bachelor of Business Administration (Accounting option)','Bachelor of Arts in Economics and Finance','Master of Science in Accounting','Master of Business Administration (Finance)'],
    required_fields: 'Accounting, Finance, Business Administration, Economics',
    required_min_experience: 2, required_max_experience: 15,
    required_skills: ['Financial reporting (IFRS/GAAP)','General ledger management','Tax preparation and compliance (corporate, VAT, PAYE)','Accounts payable and receivable','Bank reconciliation','Advanced Microsoft Excel (pivot tables, VLOOKUP, financial models)','Accounting software (QuickBooks, Sage, SAP, or Oracle)','Budgeting and financial forecasting','Internal controls and audit support','Cash flow management'],
    required_certifications: ['Certified Public Accountant (CPA)','Association of Chartered Certified Accountants (ACCA)'],
    preferred_qualifications: ['Chartered Management Accountant (CMA) designation','Experience with SAP ERP or Oracle Financials','IFRS specialist certification','CFA Level I or above'],
    employment_type: 'Full-time',
  },
  'Registered Nurse': {
    description: 'We are hiring a compassionate and skilled Registered Nurse to deliver high-quality patient care within a multidisciplinary clinical team.',
    about_role: 'The Registered Nurse will assess, plan, implement, and evaluate patient care plans in collaboration with physicians and allied health professionals.',
    responsibilities: ['Conduct comprehensive patient assessments and document findings accurately','Develop, implement, and evaluate individualised nursing care plans','Administer medications, IV therapy, and therapeutic treatments','Monitor patient vitals and respond promptly to changes in condition','Perform wound care, catheterisation, and other clinical procedures','Coordinate patient care with physicians, specialists, and allied health staff','Educate patients and families on diagnoses, medications, and discharge planning','Respond to medical emergencies and participate in resuscitation efforts'],
    required_education_levels: "Diploma, Bachelor's, Master's",
    required_degrees: ['Diploma in Nursing','Bachelor of Science in Nursing (BSN)','Bachelor of Nursing (BN)','Advanced Diploma in Midwifery and Nursing','Master of Science in Nursing (MSN)','Master of Nursing (MN)'],
    required_fields: 'Nursing, Midwifery, Health Sciences, Clinical Medicine',
    required_min_experience: 1, required_max_experience: 20,
    required_skills: ['Clinical patient assessment','Medication administration and pharmacology','IV therapy and venipuncture','Wound care and dressing techniques','Basic Life Support (BLS) and CPR','Electronic Health Records (EHR/EMR)','Infection prevention and control','Patient and family education','Care plan development','Emergency triage protocols'],
    required_certifications: ['Registered Nurse License (Nursing Council)','Basic Life Support (BLS) Certification','Valid Practicing Certificate'],
    preferred_qualifications: ['Advanced Cardiac Life Support (ACLS)','Paediatric Advanced Life Support (PALS)','ICU or critical care nursing experience','Specialty certification (oncology, perioperative, psychiatric)'],
    employment_type: 'Full-time',
  },
  'Data Analyst': {
    description: 'We are seeking a detail-oriented Data Analyst to transform complex datasets into clear, actionable insights that drive strategic business decisions.',
    about_role: 'In this role you will work closely with business stakeholders to define analytical requirements, build data pipelines, create interactive dashboards, and present findings that directly influence strategy.',
    responsibilities: ['Collect, clean, and validate large structured and unstructured datasets','Write complex SQL queries and Python scripts for data extraction and transformation','Build interactive dashboards and visualisations in Tableau or Power BI','Conduct statistical analyses to identify trends, anomalies, and opportunities','Define and track KPIs in collaboration with product and business teams','Develop and maintain automated reporting pipelines','Present findings and recommendations to both technical and non-technical audiences','Collaborate with data engineers to improve data quality and availability'],
    required_education_levels: "Bachelor's, Master's",
    required_degrees: ['Bachelor of Science in Statistics','Bachelor of Science in Mathematics','Bachelor of Science in Computer Science','Bachelor of Science in Data Science','Bachelor of Science in Economics','Master of Science in Data Science','Master of Science in Statistics'],
    required_fields: 'Statistics, Mathematics, Computer Science, Data Science, Economics, Information Systems',
    required_min_experience: 1, required_max_experience: 10,
    required_skills: ['SQL (PostgreSQL, MySQL, or BigQuery)','Python (pandas, NumPy, matplotlib, seaborn)','Data visualisation (Tableau or Power BI)','Statistical analysis and hypothesis testing','Advanced Microsoft Excel','Data cleaning and wrangling','A/B testing and experimental design','ETL processes and data pipelines','Storytelling with data','Business acumen and stakeholder communication'],
    required_certifications: [],
    preferred_qualifications: ['Google Professional Data Analytics Certificate','Tableau Desktop Specialist or Certified Data Analyst','Experience with cloud data warehouses (Snowflake, BigQuery, Redshift)','Knowledge of machine learning basics (scikit-learn)','Microsoft Power BI Data Analyst (PL-300) certification'],
    employment_type: 'Full-time',
  },
  'Human Resources Officer': {
    description: 'We are looking for a proactive HR Officer to manage talent acquisition, employee relations, performance management, and HR compliance across the organisation.',
    about_role: 'The HR Officer will support the full employee lifecycle — from recruitment and onboarding to performance reviews, training, and offboarding.',
    responsibilities: ['Manage end-to-end recruitment including job posting, screening, interviewing, and onboarding','Maintain and update HR information systems and employee records','Coordinate performance appraisal cycles and support managers in the process','Handle employee relations issues, grievances, and disciplinary procedures','Develop and implement HR policies in line with labour legislation','Coordinate training and development programs for all staff levels','Process payroll inputs and liaise with the Finance department','Ensure compliance with employment law and statutory reporting'],
    required_education_levels: "Bachelor's, Master's",
    required_degrees: ['Bachelor of Arts in Human Resource Management','Bachelor of Business Administration (HR option)','Bachelor of Science in Organisational Psychology','Bachelor of Commerce in Industrial Relations','Master of Human Resource Management','Master of Business Administration (HR specialisation)'],
    required_fields: 'Human Resource Management, Business Administration, Organisational Psychology, Industrial Relations',
    required_min_experience: 2, required_max_experience: 12,
    required_skills: ['Talent acquisition and recruitment','HRIS systems (SAP HR, Workday, or BambooHR)','Performance management systems','Labour law and employment legislation','Employee relations and conflict resolution','Payroll processing','Training needs analysis and L&D coordination','HR policy development','Onboarding and offboarding management','Data reporting and HR analytics'],
    required_certifications: ['Professional in Human Resources (PHR) or Senior PHR (SPHR)','SHRM Certified Professional (SHRM-CP)'],
    preferred_qualifications: ['Certified Human Resource Professional (CHRP)','Experience with SAP SuccessFactors or Workday','CIPD Level 5 or above qualification','Training in Employment Equity and Diversity'],
    employment_type: 'Full-time',
  },
  'Project Manager': {
    description: 'We are seeking an experienced Project Manager to lead cross-functional teams and deliver high-impact initiatives on time, within scope, and on budget.',
    about_role: 'As Project Manager you will own end-to-end project delivery — from initiation and planning through execution, monitoring, and closure.',
    responsibilities: ['Define and document project scope, goals, deliverables, and success metrics','Develop comprehensive project plans including WBS, timelines, and resource allocation','Lead, motivate, and coordinate cross-functional project teams','Identify, assess, and proactively mitigate project risks and issues','Manage project budget, track expenditures, and report financial variances','Facilitate sprint planning, daily stand-ups, retrospectives, and stakeholder reviews','Maintain project documentation including RAID logs, status reports, and change requests','Conduct post-implementation reviews and capture lessons learned'],
    required_education_levels: "Bachelor's, Master's",
    required_degrees: ['Bachelor of Business Administration (Project Management option)','Bachelor of Science in Engineering','Bachelor of Science in Information Technology','Master of Business Administration (MBA)','Master of Science in Project Management','Master of Science in Engineering Management'],
    required_fields: 'Business Administration, Project Management, Engineering, Computer Science, Information Technology',
    required_min_experience: 3, required_max_experience: 20,
    required_skills: ['Project planning and scheduling (MS Project, Jira, Asana)','Risk management and mitigation planning','Budget management and cost control','Stakeholder management and executive communication','Agile and Scrum methodologies','Waterfall and hybrid project delivery frameworks','Change management','Team leadership and conflict resolution','Resource allocation and capacity planning','Status reporting and documentation'],
    required_certifications: ['Project Management Professional (PMP)','PRINCE2 Practitioner'],
    preferred_qualifications: ['Certified Scrum Master (CSM) or SAFe Agilist','ITIL Foundation certification','Six Sigma Green Belt or Black Belt','Experience managing budgets above $500,000'],
    employment_type: 'Full-time',
  },
}

const JOB_TITLES = Object.keys(JOB_TEMPLATES)

// ── Shared input styles ──────────────────────────────────────────
const inputStyle = {
  width:        '100%',
  padding:      '11px 14px',
  borderRadius: 8,
  border:       `2px solid ${C.gray300}`,
  background:   C.white,
  color:        C.gray900,
  fontSize:     '0.95rem',
  fontWeight:   500,
  boxSizing:    'border-box',
  outline:      'none',
  fontFamily:   'inherit',
  transition:   'border-color 0.15s',
}

const labelStyle = {
  display:       'block',
  fontSize:      '0.78rem',
  fontWeight:    800,
  color:         C.gray700,
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  marginBottom:  8,
}

// ── Section accent colors ────────────────────────────────────────
const SECTIONS = {
  basic:  { color: C.blue,   light: C.blueLight,   border: C.blueBorder   },
  role:   { color: C.purple, light: C.purpleLight,  border: C.purpleBorder },
  edu:    { color: C.teal,   light: C.tealLight,    border: C.tealBorder   },
  exp:    { color: C.amber,  light: C.amberLight,   border: C.amberBorder  },
  skills: { color: C.purple, light: C.purpleLight,  border: C.purpleBorder },
  certs:  { color: C.amber,  light: C.amberLight,   border: C.amberBorder  },
}

// ── Tag input ────────────────────────────────────────────────────
function TagInput({ label, hint, icon, tags, onChange, placeholder, color = C.blue }) {
  const [input, setInput] = useState('')
  const add    = () => { const v = input.trim(); if (v && !tags.includes(v)) onChange([...tags, v]); setInput('') }
  const remove = (i) => onChange(tags.filter((_, idx) => idx !== i))
  const onKey  = e => {
    if (e.key === 'Enter')     { e.preventDefault(); add() }
    if (e.key === 'Backspace' && !input && tags.length) remove(tags.length - 1)
  }
  return (
    <div>
      <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 7 }}>
        {icon && <span style={{ color }}>{icon}</span>}
        {label}
        {hint && (
          <span style={{ color: C.gray400, fontWeight: 500, textTransform: 'none', fontSize: '0.72rem', marginLeft: 4, letterSpacing: 0 }}>
            {hint}
          </span>
        )}
      </label>
      <div
        style={{
          minHeight:   52,
          padding:     '8px 12px',
          border:      `2px solid ${C.gray300}`,
          borderRadius:8,
          background:  C.white,
          display:     'flex',
          flexWrap:    'wrap',
          gap:         7,
          alignItems:  'center',
          cursor:      'text',
        }}
        onClick={e => e.currentTarget.querySelector('input')?.focus()}
      >
        {tags.map((t, i) => (
          <span key={i} style={{
            display:     'inline-flex',
            alignItems:  'center',
            gap:         6,
            padding:     '4px 12px',
            borderRadius:99,
            background:  color + '22',
            border:      `1.5px solid ${color}88`,
            color:       color,
            fontSize:    '0.8rem',
            fontWeight:  700,
          }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>{t}</span>
            <button
              type="button"
              onClick={() => remove(i)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color, padding: 0, display: 'flex', alignItems: 'center', lineHeight: 1 }}
            >
              <X size={11} />
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
            minWidth:   140,
            border:     'none',
            outline:    'none',
            background: 'transparent',
            fontSize:   '0.88rem',
            color:      C.gray900,
            fontFamily: 'inherit',
          }}
        />
      </div>
      <div style={{ fontSize: '0.71rem', color: C.gray400, marginTop: 5, display: 'flex', alignItems: 'center', gap: 4 }}>
        Press{' '}
        <kbd style={{ padding: '1px 6px', background: C.gray100, border: `1px solid ${C.gray300}`, borderRadius: 4, fontSize: '0.68rem', color: C.gray700, fontFamily: 'inherit' }}>
          Enter
        </kbd>{' '}
        or click away to add
      </div>
    </div>
  )
}

// ── Section header ───────────────────────────────────────────────
function SectionHeader({ icon, title, subtitle, accent }) {
  const { color, light } = accent
  return (
    <div style={{
      display:      'flex',
      alignItems:   'flex-start',
      gap:          14,
      paddingBottom:16,
      borderBottom: `3px solid ${color}`,
      marginBottom: 20,
    }}>
      <div style={{
        width:          42,
        height:         42,
        borderRadius:   10,
        flexShrink:     0,
        background:     color,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        boxShadow:      `0 2px 8px ${color}44`,
      }}>
        <span style={{ color: C.white }}>{icon}</span>
      </div>
      <div style={{ paddingTop: 2 }}>
        <div style={{ fontWeight: 800, fontSize: '1rem', color: C.gray900, letterSpacing: '-0.01em' }}>{title}</div>
        {subtitle && <div style={{ fontSize: '0.78rem', color: C.gray600, marginTop: 3, fontWeight: 500 }}>{subtitle}</div>}
      </div>
    </div>
  )
}

// ── Info banner ──────────────────────────────────────────────────
function InfoBanner({ children, accent }) {
  const { color, light, border } = accent
  return (
    <div style={{
      padding:      '12px 16px',
      background:   light,
      border:       `1.5px solid ${border}`,
      borderLeft:   `5px solid ${color}`,
      borderRadius: 8,
      fontSize:     '0.8rem',
      color:        color,
      fontWeight:   600,
      display:      'flex',
      gap:          9,
      alignItems:   'flex-start',
    }}>
      <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
      <span style={{ lineHeight: 1.6 }}>{children}</span>
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

// ── Card wrapper ─────────────────────────────────────────────────
function Card({ children, accent }) {
  return (
    <div style={{
      background:   C.white,
      border:       `1.5px solid ${C.gray200}`,
      borderTop:    `4px solid ${accent.color}`,
      borderRadius: 12,
      padding:      '28px 28px 24px',
      display:      'flex',
      flexDirection:'column',
      gap:          20,
      boxShadow:    '0 2px 12px rgba(0,0,0,0.06)',
    }}>
      {children}
    </div>
  )
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
    e.preventDefault()
    if (!form.required_skills.length)  { toast.error('Add at least one required skill'); return }
    if (!form.required_fields.trim())  { toast.error('Required fields of study cannot be empty'); return }
    if (!form.required_degrees.length) { toast.error('Add at least one required degree'); return }
    if (!form.responsibilities.length) { toast.error('Add at least one responsibility'); return }
    if (!form.deadline)                { toast.error('Please set an application deadline'); return }

    const deadlineWithSeconds = form.deadline.length === 16 ? form.deadline + ':00' : form.deadline
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

  return (
    <>
      <Helmet><title>Post a Job — TalentScreen</title></Helmet>
      <div className="page-wrapper" style={{ background: C.gray50, minHeight: '100vh' }}>
        <Navbar />

        {/* ── Page header ── */}
        <div style={{
          background: C.navy,
          padding:    '44px 24px 40px',
          color:      C.white,
          borderBottom: `5px solid ${C.blue}`,
        }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <button
              onClick={() => navigate('/hr')}
              style={{
                display:      'inline-flex',
                alignItems:   'center',
                gap:          7,
                padding:      '8px 16px',
                borderRadius: 8,
                border:       `2px solid rgba(255,255,255,0.5)`,
                background:   'rgba(255,255,255,0.12)',
                color:        C.white,
                fontWeight:   700,
                fontSize:     '0.82rem',
                cursor:       'pointer',
                marginBottom: 24,
                letterSpacing: '0.03em',
              }}
            >
              <ArrowLeft size={14} /> Back to Dashboard
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <div style={{
                width:          56,
                height:         56,
                borderRadius:   14,
                background:     C.blue,
                border:         `2px solid rgba(255,255,255,0.3)`,
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                boxShadow:      `0 4px 20px ${C.blue}88`,
              }}>
                <Briefcase size={26} color={C.white} />
              </div>
              <div>
                <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: C.white, margin: 0, letterSpacing: '-0.02em' }}>
                  Post a New Job
                </h1>
                <p style={{ color: C.blueBorder, fontSize: '0.88rem', margin: '4px 0 0', fontWeight: 500 }}>
                  Detailed requirements help the AI accurately shortlist the right candidates
                </p>
              </div>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 24px' }}>

          {/* ── Tab switcher ── */}
          <div style={{
            display:      'flex',
            gap:          0,
            marginBottom: 24,
            background:   C.gray200,
            borderRadius: 10,
            padding:      4,
            width:        'fit-content',
            border:       `1.5px solid ${C.gray300}`,
          }}>
            {['form', 'preview'].map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                style={{
                  padding:      '9px 24px',
                  borderRadius: 7,
                  border:       activeTab === tab ? `2px solid ${C.blue}` : '2px solid transparent',
                  cursor:       'pointer',
                  fontWeight:   700,
                  fontSize:     '0.84rem',
                  background:   activeTab === tab ? C.white : 'transparent',
                  color:        activeTab === tab ? C.blue : C.gray600,
                  boxShadow:    activeTab === tab ? '0 2px 8px rgba(0,0,0,.10)' : 'none',
                  transition:   'all .15s',
                  letterSpacing: '0.02em',
                }}
              >
                {tab === 'form' ? '✏️ Edit Form' : '👁 Preview'}
              </button>
            ))}
          </div>

          <div style={{
            display:             'grid',
            gridTemplateColumns: activeTab === 'preview' ? '1fr' : '1fr 360px',
            gap:                 24,
            alignItems:          'start',
          }}>
            {activeTab === 'form' && (
              <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

                {/* ── Template banner ── */}
                <div style={{
                  padding:      '18px 22px',
                  background:   C.navy,
                  border:       `2px solid ${C.blue}`,
                  borderRadius: 12,
                  display:      'flex',
                  alignItems:   'center',
                  gap:          16,
                  boxShadow:    `0 4px 16px ${C.blue}22`,
                }}>
                  <div style={{
                    width:          40,
                    height:         40,
                    borderRadius:   10,
                    background:     C.blue,
                    display:        'flex',
                    alignItems:     'center',
                    justifyContent: 'center',
                    flexShrink:     0,
                    boxShadow:      `0 2px 10px ${C.blue}66`,
                  }}>
                    <Zap size={18} color={C.white} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: '0.88rem', color: C.white, marginBottom: 8, letterSpacing: '0.02em' }}>
                      ⚡ Quick-Start with a Template
                    </div>
                    <select
                      style={{
                        width:        '100%',
                        padding:      '9px 12px',
                        borderRadius: 7,
                        border:       `2px solid ${C.blue}`,
                        background:   C.white,
                        fontSize:     '0.85rem',
                        color:        C.gray900,
                        cursor:       'pointer',
                        fontFamily:   'inherit',
                        fontWeight:   600,
                      }}
                      value={JOB_TITLES.includes(form.title) ? form.title : ''}
                      onChange={e => { if (e.target.value) applyTemplate(e.target.value) }}
                    >
                      <option value="">— Select a template to auto-fill all fields —</option>
                      {JOB_TITLES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>

                {/* ── SECTION 1: Basic Info ── */}
                <Card accent={SECTIONS.basic}>
                  <SectionHeader
                    icon={<Briefcase size={20} />}
                    title="Basic Information"
                    subtitle="Core details shown on the job listing"
                    accent={SECTIONS.basic}
                  />

                  <div>
                    <label style={labelStyle}>Job Title *</label>
                    <input
                      style={inputStyle}
                      name="title"
                      placeholder="e.g. Accountant, Software Engineer, Registered Nurse"
                      value={form.title}
                      onChange={handle}
                      required
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <MapPin size={13} color={C.blue} /> Location
                      </label>
                      <input style={inputStyle} name="location"
                        placeholder="e.g. Kigali, Rwanda / Remote"
                        value={form.location} onChange={handle} />
                    </div>
                    <div>
                      <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Users size={13} color={C.blue} /> Employment Type
                      </label>
                      <select style={inputStyle} name="employment_type" value={form.employment_type} onChange={handle}>
                        <option>Full-time</option>
                        <option>Part-time</option>
                        <option>Contract</option>
                        <option>Internship</option>
                        <option>Consultancy</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <BarChart2 size={13} color={C.purple} /> Job Level
                      </label>
                      <select style={inputStyle} name="job_level" value={form.job_level} onChange={handle}>
                        <option value="">— Select Level —</option>
                        {JOB_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Users size={13} color={C.purple} /> Number of Posts *
                      </label>
                      <input style={inputStyle} type="number" name="number_of_posts"
                        min="1" max="100" value={form.number_of_posts} onChange={handle} required />
                    </div>
                  </div>

                  <div>
                    <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Timer size={13} color={C.red} /> Application Deadline *
                      <span style={{ color: C.gray400, fontWeight: 500, fontSize: '0.72rem', marginLeft: 4, textTransform: 'none', letterSpacing: 0 }}>
                        — set the exact closing date and time
                      </span>
                    </label>
                    <input
                      style={{ ...inputStyle, borderColor: C.gray300 }}
                      type="datetime-local"
                      name="deadline"
                      min={(() => {
                        const now = new Date()
                        const pad = n => String(n).padStart(2, '0')
                        return `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
                      })()}
                      value={form.deadline}
                      onChange={handle}
                      required
                    />
                    {form.deadline && (
                      <div style={{
                        marginTop: 8,
                        fontSize: '0.78rem',
                        color: C.amber,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontWeight: 700,
                        padding: '6px 12px',
                        background: C.amberLight,
                        borderRadius: 6,
                        border: `1.5px solid ${C.amberBorder}`,
                      }}>
                        <Timer size={12} /> Closes: {fmtDeadlinePreview(form.deadline)}
                      </div>
                    )}
                  </div>
                </Card>

                {/* ── SECTION 2: Role Description ── */}
                <Card accent={SECTIONS.role}>
                  <SectionHeader
                    icon={<FileText size={20} />}
                    title="Role Description"
                    subtitle="Help candidates understand the position in full detail"
                    accent={SECTIONS.role}
                  />

                  <div>
                    <label style={labelStyle}>Short Overview *</label>
                    <textarea
                      style={{ ...inputStyle, minHeight: 85, resize: 'vertical' }}
                      name="description" rows={3}
                      placeholder="A concise 2–3 sentence summary shown on the listings page…"
                      value={form.description} onChange={handle} required
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>About the Role</label>
                    <textarea
                      style={{ ...inputStyle, minHeight: 115, resize: 'vertical' }}
                      name="about_role" rows={5}
                      placeholder="Detailed description of what the role entails, the team, work environment…"
                      value={form.about_role} onChange={handle}
                    />
                  </div>
                  <TagInput
                    label="Key Responsibilities *"
                    hint="— press Enter after each"
                    icon={<FileText size={13} />}
                    tags={form.responsibilities}
                    onChange={setArr('responsibilities')}
                    placeholder="e.g. Prepare monthly financial statements"
                    color={C.purple}
                  />
                </Card>

                {/* ── SECTION 3: Education ── */}
                <Card accent={SECTIONS.edu}>
                  <SectionHeader
                    icon={<GraduationCap size={20} />}
                    title="Education Requirements"
                    subtitle="Specify exact degrees and academic levels required"
                    accent={SECTIONS.edu}
                  />

                  <InfoBanner accent={SECTIONS.edu}>
                    Add each accepted degree in full — e.g. <em>"Bachelor of Science in Accounting"</em>. The AI matches these exactly against applicant submissions.
                  </InfoBanner>

                  <TagInput
                    label="Accepted Degrees / Qualifications *"
                    hint="— one per entry, press Enter"
                    icon={<GraduationCap size={13} />}
                    tags={form.required_degrees}
                    onChange={setArr('required_degrees')}
                    placeholder="e.g. Bachelor of Commerce in Accounting"
                    color={C.teal}
                  />

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <label style={labelStyle}>Minimum Education Level *</label>
                      <select style={inputStyle} name="required_education_levels" value={form.required_education_levels} onChange={handle}>
                        <option value="Diploma">Diploma</option>
                        <option value="Bachelor's">Bachelor's Degree</option>
                        <option value="Master's">Master's Degree</option>
                        <option value="PhD">PhD / Doctorate</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>
                        Fields of Study *{' '}
                        <span style={{ color: C.gray400, fontWeight: 500, fontSize: '0.72rem', textTransform: 'none', letterSpacing: 0 }}>
                          (comma-separated)
                        </span>
                      </label>
                      <input style={inputStyle} name="required_fields"
                        placeholder="e.g. Accounting, Finance, Business Administration"
                        value={form.required_fields} onChange={handle} required />
                    </div>
                  </div>
                </Card>

                {/* ── SECTION 4: Experience ── */}
                <Card accent={SECTIONS.exp}>
                  <SectionHeader
                    icon={<Clock size={20} />}
                    title="Experience Requirements"
                    subtitle="Set the acceptable years of professional experience"
                    accent={SECTIONS.exp}
                  />

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <label style={labelStyle}>Minimum Experience (years) *</label>
                      <input style={inputStyle} type="number" name="required_min_experience" min="0" max="30" value={form.required_min_experience} onChange={handle} required />
                    </div>
                    <div>
                      <label style={labelStyle}>Maximum Experience (years) *</label>
                      <input style={inputStyle} type="number" name="required_max_experience" min="0" max="50" value={form.required_max_experience} onChange={handle} required />
                    </div>
                  </div>

                  <InfoBanner accent={SECTIONS.exp}>
                    Applicants with fewer than <strong>{form.required_min_experience} year(s)</strong> of experience will be automatically disqualified by the AI screening system.
                  </InfoBanner>
                </Card>

                {/* ── SECTION 5: Skills ── */}
                <Card accent={SECTIONS.skills}>
                  <SectionHeader
                    icon={<Wrench size={20} />}
                    title="Required Skills"
                    subtitle="List every technical and soft skill the AI will match against applicants' CVs"
                    accent={SECTIONS.skills}
                  />

                  <InfoBanner accent={SECTIONS.skills}>
                    Be specific — write <em>"Anaesthesia monitoring"</em> not just <em>"Medical skills"</em>. Applicants matching fewer than 30% of skills are automatically disqualified.
                  </InfoBanner>

                  <TagInput
                    label="Required Skills *"
                    hint="— press Enter after each"
                    icon={<Wrench size={13} />}
                    tags={form.required_skills}
                    onChange={setArr('required_skills')}
                    placeholder="e.g. Financial reporting (IFRS/GAAP)"
                    color={C.purple}
                  />
                </Card>

                {/* ── SECTION 6: Certifications ── */}
                <Card accent={SECTIONS.certs}>
                  <SectionHeader
                    icon={<Award size={20} />}
                    title="Certifications & Licences"
                    subtitle="Professional certifications and licences required or preferred"
                    accent={SECTIONS.certs}
                  />

                  <TagInput
                    label="Required Certifications / Licences"
                    hint="— press Enter after each"
                    icon={<Award size={13} />}
                    tags={form.required_certifications}
                    onChange={setArr('required_certifications')}
                    placeholder="e.g. Certified Public Accountant (CPA)"
                    color={C.amber}
                  />

                  <TagInput
                    label="Preferred / Nice-to-Have Qualifications"
                    hint="— press Enter after each"
                    icon={<Star size={13} />}
                    tags={form.preferred_qualifications}
                    onChange={setArr('preferred_qualifications')}
                    placeholder="e.g. CFA Level I or above"
                    color={C.green}
                  />
                </Card>

                {/* ── Submit row ── */}
                <div style={{ display: 'flex', gap: 14, paddingBottom: 48 }}>
                  <button
                    type="button"
                    onClick={() => navigate('/hr')}
                    style={{
                      flex:         1,
                      padding:      '14px',
                      borderRadius: 10,
                      border:       `2px solid ${C.gray300}`,
                      background:   C.white,
                      color:        C.gray700,
                      fontWeight:   700,
                      cursor:       'pointer',
                      fontSize:     '0.95rem',
                      letterSpacing:'0.02em',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    style={{
                      flex:           2,
                      padding:        '14px',
                      borderRadius:   10,
                      border:         'none',
                      background:     loading ? C.gray400 : C.blue,
                      color:          C.white,
                      fontWeight:     800,
                      cursor:         loading ? 'not-allowed' : 'pointer',
                      fontSize:       '0.98rem',
                      letterSpacing:  '0.02em',
                      display:        'flex',
                      alignItems:     'center',
                      justifyContent: 'center',
                      gap:            10,
                      boxShadow:      loading ? 'none' : `0 4px 16px ${C.blue}55`,
                      transition:     'background 0.15s, box-shadow 0.15s',
                    }}
                  >
                    {loading
                      ? <><div className="spinner" style={{ width: 18, height: 18 }} /> Posting Job…</>
                      : <><Briefcase size={18} /> Post Job</>
                    }
                  </button>
                </div>
              </form>
            )}

            {/* ── Sticky live preview panel ── */}
            {activeTab === 'form' && (
              <div style={{ position: 'sticky', top: 24 }}>
                <div style={{
                  background:   C.white,
                  border:       `2px solid ${C.gray200}`,
                  borderTop:    `4px solid ${C.navy}`,
                  borderRadius: 12,
                  padding:      '24px',
                  maxHeight:    'calc(100vh - 80px)',
                  overflowY:    'auto',
                  boxShadow:    '0 4px 20px rgba(0,0,0,0.08)',
                }}>
                  <div style={{
                    fontSize:      '0.72rem',
                    fontWeight:    800,
                    color:         C.blue,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    marginBottom:  16,
                    display:       'flex',
                    alignItems:    'center',
                    gap:           6,
                  }}>
                    👁 Live Preview
                  </div>

                  {!form.title && (
                    <div style={{
                      textAlign:  'center',
                      color:      C.gray400,
                      fontSize:   '0.82rem',
                      padding:    '24px 0',
                      fontWeight: 500,
                    }}>
                      Start filling the form or select a template to see a preview here.
                    </div>
                  )}

                  {form.title && (
                    <div style={{ fontSize: '0.84rem', lineHeight: 1.7 }}>
                      <div style={{
                        fontWeight: 900,
                        fontSize:   '1.05rem',
                        color:      C.gray900,
                        marginBottom: 10,
                        letterSpacing: '-0.01em',
                      }}>
                        {form.title}
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
                        {form.job_level && (
                          <span style={{
                            padding: '3px 12px', borderRadius: 99,
                            background: C.blueLight, border: `1.5px solid ${C.blueBorder}`,
                            color: C.blueDark, fontSize: '0.72rem', fontWeight: 800,
                          }}>
                            Level {form.job_level}
                          </span>
                        )}
                        {form.number_of_posts && (
                          <span style={{
                            padding: '3px 12px', borderRadius: 99,
                            background: C.purpleLight, border: `1.5px solid ${C.purpleBorder}`,
                            color: C.purple, fontSize: '0.72rem', fontWeight: 800,
                          }}>
                            {form.number_of_posts} Post{form.number_of_posts > 1 ? 's' : ''}
                          </span>
                        )}
                        {form.employment_type && (
                          <span style={{
                            padding: '3px 12px', borderRadius: 99,
                            background: C.gray100, border: `1.5px solid ${C.gray300}`,
                            color: C.gray700, fontSize: '0.72rem', fontWeight: 700,
                          }}>
                            {form.employment_type}
                          </span>
                        )}
                        {form.location && (
                          <span style={{
                            padding: '3px 12px', borderRadius: 99,
                            background: C.tealLight, border: `1.5px solid ${C.tealBorder}`,
                            color: C.teal, fontSize: '0.72rem', fontWeight: 700,
                          }}>
                            📍 {form.location}
                          </span>
                        )}
                      </div>

                      {form.deadline && (
                        <div style={{
                          fontSize: '0.75rem', color: C.amber, marginBottom: 10,
                          display: 'flex', alignItems: 'center', gap: 5, fontWeight: 700,
                          padding: '5px 10px', background: C.amberLight,
                          borderRadius: 6, border: `1.5px solid ${C.amberBorder}`,
                        }}>
                          <Timer size={11} /> Closes: {fmtDeadlinePreview(form.deadline)}
                        </div>
                      )}

                      {form.description && (
                        <p style={{ color: C.gray700, marginBottom: 12, fontWeight: 500, lineHeight: 1.6 }}>
                          {form.description}
                        </p>
                      )}

                      {form.required_skills.length > 0 && (
                        <>
                          <div style={{ fontSize: '0.7rem', fontWeight: 800, color: C.gray600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
                            Key Skills
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
                            {form.required_skills.slice(0, 6).map((s, i) => (
                              <span key={i} style={{
                                padding: '3px 10px', borderRadius: 99,
                                background: C.purpleLight, border: `1.5px solid ${C.purpleBorder}`,
                                color: C.purple, fontSize: '0.7rem', fontWeight: 700,
                              }}>
                                {s}
                              </span>
                            ))}
                            {form.required_skills.length > 6 && (
                              <span style={{ fontSize: '0.7rem', color: C.gray400, fontWeight: 600, alignSelf: 'center' }}>
                                +{form.required_skills.length - 6} more
                              </span>
                            )}
                          </div>
                        </>
                      )}

                      {form.responsibilities.length > 0 && (
                        <>
                          <div style={{ fontSize: '0.7rem', fontWeight: 800, color: C.gray600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
                            Responsibilities
                          </div>
                          <ul style={{ margin: 0, paddingLeft: 18, color: C.gray700, fontSize: '0.78rem', fontWeight: 500 }}>
                            {form.responsibilities.slice(0, 4).map((r, i) => (
                              <li key={i} style={{ marginBottom: 4 }}>{r}</li>
                            ))}
                            {form.responsibilities.length > 4 && (
                              <li style={{ color: C.gray400, listStyle: 'none', marginLeft: -18 }}>
                                +{form.responsibilities.length - 4} more…
                              </li>
                            )}
                          </ul>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Preview tab full view ── */}
            {activeTab === 'preview' && (
              <div style={{
                background:   C.white,
                border:       `2px solid ${C.gray200}`,
                borderTop:    `5px solid ${C.navy}`,
                borderRadius: 12,
                padding:      '40px 48px',
                maxWidth:     780,
                margin:       '0 auto',
                width:        '100%',
                boxShadow:    '0 4px 24px rgba(0,0,0,0.08)',
              }}>
                <div style={{
                  fontSize: '0.72rem', fontWeight: 800, color: C.blue,
                  textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 20,
                }}>
                  Job Posting Preview
                </div>

                {form.title && (
                  <h2 style={{ fontSize: '1.7rem', fontWeight: 900, color: C.gray900, marginBottom: 14, letterSpacing: '-0.02em' }}>
                    {form.title}
                  </h2>
                )}

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                  {form.employment_type && (
                    <span style={{ padding: '4px 14px', borderRadius: 99, background: C.blueLight, border: `1.5px solid ${C.blueBorder}`, color: C.blueDark, fontSize: '0.78rem', fontWeight: 700 }}>
                      {form.employment_type}
                    </span>
                  )}
                  {form.location && (
                    <span style={{ padding: '4px 14px', borderRadius: 99, background: C.tealLight, border: `1.5px solid ${C.tealBorder}`, color: C.teal, fontSize: '0.78rem', fontWeight: 700 }}>
                      📍 {form.location}
                    </span>
                  )}
                  {form.job_level && (
                    <span style={{ padding: '4px 14px', borderRadius: 99, background: C.purpleLight, border: `1.5px solid ${C.purpleBorder}`, color: C.purple, fontSize: '0.78rem', fontWeight: 700 }}>
                      Level {form.job_level}
                    </span>
                  )}
                </div>

                {form.deadline && (
                  <div style={{
                    padding: '10px 16px', background: C.amberLight,
                    border: `2px solid ${C.amberBorder}`, borderRadius: 8,
                    fontSize: '0.82rem', color: C.amber, fontWeight: 700,
                    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20,
                  }}>
                    <Timer size={14} /> Application deadline: {fmtDeadlinePreview(form.deadline)}
                  </div>
                )}

                {form.description && (
                  <p style={{ color: C.gray700, lineHeight: 1.8, marginBottom: 24, fontSize: '0.95rem', fontWeight: 500 }}>
                    {form.description}
                  </p>
                )}

                {form.about_role && (
                  <>
                    <h3 style={{ fontSize: '1rem', fontWeight: 800, color: C.gray900, marginBottom: 10, borderBottom: `2px solid ${C.blue}`, paddingBottom: 8 }}>
                      About the Role
                    </h3>
                    <p style={{ color: C.gray700, lineHeight: 1.8, marginBottom: 24, fontSize: '0.9rem' }}>
                      {form.about_role}
                    </p>
                  </>
                )}

                {form.responsibilities.length > 0 && (
                  <>
                    <h3 style={{ fontSize: '1rem', fontWeight: 800, color: C.gray900, marginBottom: 10, borderBottom: `2px solid ${C.purple}`, paddingBottom: 8 }}>
                      Key Responsibilities
                    </h3>
                    <ul style={{ margin: '0 0 24px', paddingLeft: 20, color: C.gray700, fontSize: '0.9rem', lineHeight: 1.9 }}>
                      {form.responsibilities.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  </>
                )}

                {form.required_skills.length > 0 && (
                  <>
                    <h3 style={{ fontSize: '1rem', fontWeight: 800, color: C.gray900, marginBottom: 12, borderBottom: `2px solid ${C.teal}`, paddingBottom: 8 }}>
                      Required Skills
                    </h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
                      {form.required_skills.map((s, i) => (
                        <span key={i} style={{ padding: '5px 14px', borderRadius: 99, background: C.purpleLight, border: `1.5px solid ${C.purpleBorder}`, color: C.purple, fontSize: '0.8rem', fontWeight: 700 }}>
                          {s}
                        </span>
                      ))}
                    </div>
                  </>
                )}

                <div style={{ marginTop: 32, paddingTop: 22, borderTop: `2px solid ${C.gray200}`, display: 'flex', gap: 14 }}>
                  <button
                    onClick={() => setActiveTab('form')}
                    style={{
                      padding: '11px 22px', borderRadius: 8,
                      border: `2px solid ${C.gray300}`, background: C.white,
                      color: C.gray700, fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem',
                    }}
                  >
                    ← Back to Edit
                  </button>
                  <button
                    disabled={loading}
                    onClick={submit}
                    style={{
                      padding: '11px 28px', borderRadius: 8,
                      border: 'none', background: loading ? C.gray400 : C.blue,
                      color: C.white, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer',
                      fontSize: '0.95rem', boxShadow: loading ? 'none' : `0 4px 14px ${C.blue}55`,
                    }}
                  >
                    {loading ? 'Posting…' : '✓ Post This Job'}
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