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

// ── Shared input styles ──────────────────────────────────────
const inputStyle = {
  width:        '100%',
  padding:      '10px 12px',
  borderRadius: 6,
  border:       '1.5px solid #d1d5db',
  background:   '#ffffff',
  color:        '#111827',
  fontSize:     '.9rem',
  boxSizing:    'border-box',
  outline:      'none',
  fontFamily:   'inherit',
}

const labelStyle = {
  display:       'block',
  fontSize:      '.8rem',
  fontWeight:    700,
  color:         '#374151',
  textTransform: 'uppercase',
  letterSpacing: '.05em',
  marginBottom:  7,
}

// ── Tag input ────────────────────────────────────────────────
function TagInput({ label, hint, icon, tags, onChange, placeholder, color = '#374151' }) {
  const [input, setInput] = useState('')
  const add    = () => { const v = input.trim(); if (v && !tags.includes(v)) onChange([...tags, v]); setInput('') }
  const remove = (i) => onChange(tags.filter((_, idx) => idx !== i))
  const onKey  = e => {
    if (e.key === 'Enter')     { e.preventDefault(); add() }
    if (e.key === 'Backspace' && !input && tags.length) remove(tags.length - 1)
  }
  return (
    <div>
      <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
        {icon && <span style={{ color }}>{icon}</span>}
        {label}
        {hint && <span style={{ color: '#9ca3af', fontWeight: 400, textTransform: 'none', fontSize: '.73rem', marginLeft: 4, letterSpacing: 0 }}>{hint}</span>}
      </label>
      <div
        style={{
          minHeight:   48,
          padding:     '6px 10px',
          border:      '1.5px solid #d1d5db',
          borderRadius:6,
          background:  '#ffffff',
          display:     'flex',
          flexWrap:    'wrap',
          gap:         6,
          alignItems:  'center',
          cursor:      'text',
        }}
        onClick={e => e.currentTarget.querySelector('input')?.focus()}
      >
        {tags.map((t, i) => (
          <span key={i} style={{
            display:     'inline-flex',
            alignItems:  'center',
            gap:         5,
            padding:     '3px 10px',
            borderRadius:99,
            background:  color + '18',
            border:      `1px solid ${color}55`,
            color,
            fontSize:    '.78rem',
            fontWeight:  600,
          }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>{t}</span>
            <button
              type="button"
              onClick={() => remove(i)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color, padding: 0, display: 'flex', alignItems: 'center' }}
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
            fontSize:   '.85rem',
            color:      '#111827',
            fontFamily: 'inherit',
          }}
        />
      </div>
      <div style={{ fontSize: '.71rem', color: '#9ca3af', marginTop: 4 }}>
        Press <kbd style={{ padding: '1px 5px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 4, fontSize: '.7rem', color: '#374151' }}>Enter</kbd> or click away to add
      </div>
    </div>
  )
}

// ── Section header ───────────────────────────────────────────
function SectionHeader({ icon, title, subtitle, color = '#374151' }) {
  return (
    <div style={{
      display:       'flex',
      alignItems:    'flex-start',
      gap:           12,
      paddingBottom: 14,
      borderBottom:  '2px solid #e5e7eb',
      marginBottom:  18,
    }}>
      <div style={{
        width:          36,
        height:         36,
        borderRadius:   8,
        flexShrink:     0,
        background:     color + '18',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
      }}>
        <span style={{ color }}>{icon}</span>
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: '.95rem', color: '#111827' }}>{title}</div>
        {subtitle && <div style={{ fontSize: '.75rem', color: '#6b7280', marginTop: 2 }}>{subtitle}</div>}
      </div>
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
    background:   '#ffffff',
    border:       '1px solid #e5e7eb',
    borderRadius: 12,
    padding:      '28px',
    display:      'flex',
    flexDirection:'column',
    gap:          18,
  }

  return (
    <>
      <Helmet><title>Post a Job — TalentScreen</title></Helmet>
      <div className="page-wrapper">
        <Navbar />

        {/* ── Page header ── */}
        <div style={{
          background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
          padding:    '40px 20px 36px',
          color:      '#ffffff',
        }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <button
              onClick={() => navigate('/hr')}
              style={{
                display:      'inline-flex',
                alignItems:   'center',
                gap:          6,
                padding:      '7px 14px',
                borderRadius: 6,
                border:       '1.5px solid rgba(255,255,255,0.4)',
                background:   'rgba(255,255,255,0.1)',
                color:        '#ffffff',
                fontWeight:   600,
                fontSize:     '.82rem',
                cursor:       'pointer',
                marginBottom: 20,
              }}
            >
              <ArrowLeft size={14} /> Back to Dashboard
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width:          50,
                height:         50,
                borderRadius:   12,
                background:     'rgba(255,255,255,0.15)',
                border:         '1px solid rgba(255,255,255,0.25)',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
              }}>
                <Briefcase size={24} color="#ffffff" />
              </div>
              <div>
                <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#ffffff', margin: 0 }}>Post a New Job</h1>
                <p style={{ color: '#93c5fd', fontSize: '.85rem', margin: 0 }}>
                  Detailed requirements help the AI accurately shortlist the right candidates
                </p>
              </div>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 20px' }}>

          {/* Tab switcher */}
          <div style={{
            display:      'flex',
            gap:          0,
            marginBottom: 24,
            background:   '#f3f4f6',
            borderRadius: 8,
            padding:      4,
            width:        'fit-content',
          }}>
            {['form', 'preview'].map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                style={{
                  padding:      '7px 20px',
                  borderRadius: 6,
                  border:       'none',
                  cursor:       'pointer',
                  fontWeight:   600,
                  fontSize:     '.82rem',
                  textTransform:'capitalize',
                  background:   activeTab === tab ? '#ffffff' : 'transparent',
                  color:        activeTab === tab ? '#111827' : '#6b7280',
                  boxShadow:    activeTab === tab ? '0 1px 4px rgba(0,0,0,.08)' : 'none',
                  transition:   'all .15s',
                }}
              >
                {tab === 'form' ? '✏️ Edit' : '👁 Preview'}
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
              <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* Template banner */}
                <div style={{
                  padding:      '14px 18px',
                  background:   '#eff6ff',
                  border:       '1px solid #bfdbfe',
                  borderRadius: 10,
                  display:      'flex',
                  alignItems:   'center',
                  gap:          12,
                }}>
                  <div style={{
                    width:          32,
                    height:         32,
                    borderRadius:   8,
                    background:     '#2563eb',
                    display:        'flex',
                    alignItems:     'center',
                    justifyContent: 'center',
                    flexShrink:     0,
                  }}>
                    <Zap size={16} color="#fff" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '.85rem', color: '#1e40af', marginBottom: 6 }}>
                      Quick-Start with a Template
                    </div>
                    <select
                      style={{
                        width:        '100%',
                        padding:      '7px 10px',
                        borderRadius: 6,
                        border:       '1.5px solid #bfdbfe',
                        background:   '#ffffff',
                        fontSize:     '.82rem',
                        color:        '#111827',
                        cursor:       'pointer',
                        fontFamily:   'inherit',
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
                <div style={cardStyle}>
                  <SectionHeader icon={<Briefcase size={18} />} title="Basic Information" subtitle="Core details shown on the job listing" color="#2563eb" />

                  <div>
                    <label style={labelStyle}>Job Title *</label>
                    <input style={inputStyle} name="title"
                      placeholder="e.g. Accountant, Software Engineer, Registered Nurse"
                      value={form.title} onChange={handle} required />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <MapPin size={13} color="#6b7280" /> Location
                      </label>
                      <input style={inputStyle} name="location"
                        placeholder="e.g. Kigali, Rwanda / Remote"
                        value={form.location} onChange={handle} />
                    </div>
                    <div>
                      <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Users size={13} color="#6b7280" /> Employment Type
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
                      <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <BarChart2 size={13} color="#7c3aed" /> Job Level
                      </label>
                      <select style={inputStyle} name="job_level" value={form.job_level} onChange={handle}>
                        <option value="">— Select Level —</option>
                        {JOB_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Users size={13} color="#7c3aed" /> Number of Posts *
                      </label>
                      <input style={inputStyle} type="number" name="number_of_posts"
                        min="1" max="100" value={form.number_of_posts} onChange={handle} required />
                    </div>
                  </div>

                  <div>
                    <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Timer size={13} color="#dc2626" /> Application Deadline *
                      <span style={{ color: '#9ca3af', fontWeight: 400, fontSize: '.72rem', marginLeft: 4, textTransform: 'none', letterSpacing: 0 }}>
                        — set the exact date and time when the position closes
                      </span>
                    </label>
                    <input
                      style={inputStyle}
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
                      <div style={{ marginTop: 6, fontSize: '.75rem', color: '#92400e', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Info size={11} />
                        Closes on {fmtDeadlinePreview(form.deadline)}
                      </div>
                    )}
                  </div>
                </div>

                {/* ── SECTION 2: Role Description ── */}
                <div style={cardStyle}>
                  <SectionHeader icon={<FileText size={18} />} title="Role Description" subtitle="Help candidates understand the position in full detail" color="#7c3aed" />

                  <div>
                    <label style={labelStyle}>Short Overview *</label>
                    <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} name="description" rows={3}
                      placeholder="A concise 2–3 sentence summary shown on the listings page…"
                      value={form.description} onChange={handle} required />
                  </div>
                  <div>
                    <label style={labelStyle}>About the Role</label>
                    <textarea style={{ ...inputStyle, minHeight: 110, resize: 'vertical' }} name="about_role" rows={5}
                      placeholder="Detailed description of what the role entails, the team, work environment…"
                      value={form.about_role} onChange={handle} />
                  </div>
                  <TagInput
                    label="Key Responsibilities *" hint="— press Enter after each"
                    icon={<FileText size={13} />}
                    tags={form.responsibilities} onChange={setArr('responsibilities')}
                    placeholder="e.g. Prepare monthly financial statements" color="#7c3aed"
                  />
                </div>

                {/* ── SECTION 3: Education ── */}
                <div style={cardStyle}>
                  <SectionHeader icon={<GraduationCap size={18} />} title="Education Requirements" subtitle="Specify exact degrees and academic levels required" color="#0284c7" />

                  <div style={{
                    padding:      '10px 14px',
                    background:   '#f0f9ff',
                    border:       '1px solid #bae6fd',
                    borderRadius: 8,
                    fontSize:     '.78rem',
                    color:        '#075985',
                    display:      'flex',
                    gap:          7,
                    alignItems:   'flex-start',
                  }}>
                    <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>Add each accepted degree in full — e.g. <em>"Bachelor of Science in Accounting"</em>. The AI matches these exactly against applicant submissions.</span>
                  </div>

                  <TagInput
                    label="Accepted Degrees / Qualifications *" hint="— one per entry, press Enter"
                    icon={<GraduationCap size={13} />}
                    tags={form.required_degrees} onChange={setArr('required_degrees')}
                    placeholder="e.g. Bachelor of Commerce in Accounting" color="#0284c7"
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
                        <span style={{ color: '#9ca3af', fontWeight: 400, fontSize: '.72rem', textTransform: 'none', letterSpacing: 0 }}>(comma-separated)</span>
                      </label>
                      <input style={inputStyle} name="required_fields"
                        placeholder="e.g. Accounting, Finance, Business Administration"
                        value={form.required_fields} onChange={handle} required />
                    </div>
                  </div>
                </div>

                {/* ── SECTION 4: Experience ── */}
                <div style={cardStyle}>
                  <SectionHeader icon={<Clock size={18} />} title="Experience Requirements" subtitle="Set the acceptable years of professional experience" color="#d97706" />

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
                  <div style={{
                    padding:      '10px 14px',
                    background:   '#fffbeb',
                    border:       '1px solid #fcd34d',
                    borderRadius: 8,
                    fontSize:     '.78rem',
                    color:        '#78350f',
                    display:      'flex',
                    gap:          7,
                    fontWeight:   600,
                  }}>
                    <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                    Applicants with fewer than <strong>&nbsp;{form.required_min_experience} year(s)&nbsp;</strong> of experience will be automatically disqualified.
                  </div>
                </div>

                {/* ── SECTION 5: Skills ── */}
                <div style={cardStyle}>
                  <SectionHeader icon={<Wrench size={18} />} title="Required Skills" subtitle="List every technical and soft skill the AI will match against applicants' CVs" color="#7c3aed" />

                  <div style={{
                    padding:      '10px 14px',
                    background:   '#faf5ff',
                    border:       '1px solid #e9d5ff',
                    borderRadius: 8,
                    fontSize:     '.78rem',
                    color:        '#5b21b6',
                    display:      'flex',
                    gap:          7,
                    alignItems:   'flex-start',
                  }}>
                    <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>Be specific — write <em>"Anaesthesia monitoring"</em> not just <em>"Medical skills"</em>. Applicants matching fewer than 30% of skills are automatically disqualified.</span>
                  </div>
                  <TagInput
                    label="Required Skills *" hint="— press Enter after each"
                    icon={<Wrench size={13} />}
                    tags={form.required_skills} onChange={setArr('required_skills')}
                    placeholder="e.g. Financial reporting (IFRS/GAAP)" color="#7c3aed"
                  />
                </div>

                {/* ── SECTION 6: Certifications ── */}
                <div style={cardStyle}>
                  <SectionHeader icon={<Award size={18} />} title="Certifications & Licences" subtitle="Professional certifications and licences required or preferred" color="#d97706" />
                  <TagInput
                    label="Required Certifications / Licences" hint="— press Enter after each"
                    icon={<Award size={13} />}
                    tags={form.required_certifications} onChange={setArr('required_certifications')}
                    placeholder="e.g. Certified Public Accountant (CPA)" color="#d97706"
                  />
                  <TagInput
                    label="Preferred / Nice-to-Have Qualifications" hint="— press Enter after each"
                    icon={<Star size={13} />}
                    tags={form.preferred_qualifications} onChange={setArr('preferred_qualifications')}
                    placeholder="e.g. CFA Level I or above" color="#059669"
                  />
                </div>

                {/* Submit */}
                <div style={{ display: 'flex', gap: 12, paddingBottom: 40 }}>
                  <button
                    type="button"
                    onClick={() => navigate('/hr')}
                    style={{
                      flex:         1,
                      padding:      '12px',
                      borderRadius: 8,
                      border:       '1.5px solid #d1d5db',
                      background:   '#ffffff',
                      color:        '#374151',
                      fontWeight:   600,
                      cursor:       'pointer',
                      fontSize:     '.95rem',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    style={{
                      flex:           2,
                      padding:        '12px',
                      borderRadius:   8,
                      border:         'none',
                      background:     loading ? '#93c5fd' : '#2563eb',
                      color:          '#ffffff',
                      fontWeight:     700,
                      cursor:         loading ? 'not-allowed' : 'pointer',
                      fontSize:       '.95rem',
                      display:        'flex',
                      alignItems:     'center',
                      justifyContent: 'center',
                      gap:            8,
                    }}
                  >
                    {loading
                      ? <><div className="spinner" style={{ width: 16, height: 16 }} /> Posting Job…</>
                      : <><Briefcase size={16} /> Post Job</>
                    }
                  </button>
                </div>
              </form>
            )}

            {/* ── Sticky live preview ── */}
            {activeTab === 'form' && (
              <div style={{ position: 'sticky', top: 24 }}>
                <div style={{
                  background:   '#ffffff',
                  border:       '1px solid #e5e7eb',
                  borderRadius: 12,
                  padding:      '22px',
                  maxHeight:    'calc(100vh - 80px)',
                  overflowY:    'auto',
                }}>
                  <div style={{
                    fontSize:      '.72rem',
                    fontWeight:    700,
                    color:         '#2563eb',
                    textTransform: 'uppercase',
                    letterSpacing: '.08em',
                    marginBottom:  14,
                  }}>
                    👁 Live Preview
                  </div>
                  <div style={{ fontSize: '.82rem', lineHeight: 1.7 }}>
                    {form.title && (
                      <div style={{ fontWeight: 800, fontSize: '1rem', color: '#111827', marginBottom: 8 }}>
                        {form.title}
                      </div>
                    )}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                      {form.job_level && (
                        <span style={{ padding: '2px 10px', borderRadius: 99, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', fontSize: '.72rem', fontWeight: 700 }}>
                          Level: {form.job_level}
                        </span>
                      )}
                      {form.number_of_posts && (
                        <span style={{ padding: '2px 10px', borderRadius: 99, background: '#faf5ff', border: '1px solid #e9d5ff', color: '#6d28d9', fontSize: '.72rem', fontWeight: 700 }}>
                          Posts: {form.number_of_posts}
                        </span>
                      )}
                      {form.employment_type && (
                        <span style={{ padding: '2px 10px', borderRadius: 99, background: '#f3f4f6', border: '1px solid #e5e7eb', color: '#374151', fontSize: '.72rem' }}>
                          {form.employment_type}
                        </span>
                      )}
                    </div>
                    {form.deadline && (
                      <div style={{ fontSize: '.75rem', color: '#92400e', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Timer size={11} /> Closes: {fmtDeadlinePreview(form.deadline)}
                      </div>
                    )}
                    {form.description && (
                      <p style={{ color: '#4b5563', marginBottom: 10 }}>{form.description}</p>
                    )}
                    {form.required_skills.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {form.required_skills.slice(0, 5).map((s, i) => (
                          <span key={i} style={{ padding: '2px 8px', borderRadius: 99, background: '#faf5ff', border: '1px solid #e9d5ff', color: '#6d28d9', fontSize: '.7rem' }}>
                            {s}
                          </span>
                        ))}
                        {form.required_skills.length > 5 && (
                          <span style={{ fontSize: '.7rem', color: '#9ca3af' }}>+{form.required_skills.length - 5} more</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── Preview tab ── */}
            {activeTab === 'preview' && (
              <div style={{
                background:   '#ffffff',
                border:       '1px solid #e5e7eb',
                borderRadius: 12,
                padding:      '36px 40px',
                maxWidth:     760,
                margin:       '0 auto',
                width:        '100%',
              }}>
                <div style={{ fontSize: '.72rem', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 20 }}>
                  Job Posting Preview
                </div>
                {form.title && <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#111827', marginBottom: 12 }}>{form.title}</h2>}
                {form.description && <p style={{ color: '#4b5563', lineHeight: 1.8, marginBottom: 20 }}>{form.description}</p>}
                <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid #e5e7eb', display: 'flex', gap: 12 }}>
                  <button
                    onClick={() => setActiveTab('form')}
                    style={{
                      padding:      '10px 20px',
                      borderRadius: 6,
                      border:       '1.5px solid #d1d5db',
                      background:   '#ffffff',
                      color:        '#374151',
                      fontWeight:   600,
                      cursor:       'pointer',
                    }}
                  >
                    ← Back to Edit
                  </button>
                  <button
                    disabled={loading}
                    onClick={submit}
                    style={{
                      padding:      '10px 24px',
                      borderRadius: 6,
                      border:       'none',
                      background:   '#2563eb',
                      color:        '#ffffff',
                      fontWeight:   700,
                      cursor:       'pointer',
                    }}
                  >
                    {loading ? 'Posting…' : 'Post This Job'}
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
