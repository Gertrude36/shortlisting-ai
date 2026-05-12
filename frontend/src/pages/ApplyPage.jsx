javascript

import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { Upload, CheckCircle, XCircle, AlertCircle, Loader, ArrowRight, ArrowLeft, ShieldCheck, Info } from 'lucide-react'
import toast from 'react-hot-toast'
import Navbar from '../components/Navbar'
import { useAuth } from '../context/AuthContext'
import api, { BACKEND } from '../api/axios'

// ✅ FIX K — "experience" added as an optional document type.
// REQUIRED_DOC_KEYS is derived from this array and intentionally excludes
// "experience" (required: false) so fresh graduates are not blocked.
const DOC_TYPES = [
  { key: 'id_card',     label: 'National ID / Passport',    icon: '🪪', description: 'Official government-issued ID. Name must match your account.', required: true },
  { key: 'cv',          label: 'CV / Resume',               icon: '📄', description: 'Your up-to-date curriculum vitae or resume.',                   required: true },
  { key: 'diploma',     label: 'Academic Diploma / Degree', icon: '🎓', description: 'Highest academic qualification matching your field of study.',   required: true },
  { key: 'certificate', label: 'Professional Certificate',  icon: '📜', description: 'Any professional certification relevant to the role. Optional.', required: false },
  // ✅ FIX K (NEW):
  {
    key:         'experience',
    label:       'Experience Document',
    icon:        '💼',
    description: 'Employment letter, reference letter, or work certificate. Optional — recommended if you have declared work experience. It will be cross-checked against your declared years.',
    required:    false,
  },
]
const REQUIRED_DOC_KEYS = DOC_TYPES.filter(d => d.required).map(d => d.key)
const STEPS = ['Position Info', 'Your Details', 'Documents', 'Submit']

const STEP_COLORS = {
  done:    { bg: '#2563eb', color: '#ffffff', border: '#2563eb' },
  active:  { bg: '#ffffff', color: '#2563eb', border: '#2563eb' },
  pending: { bg: '#ffffff', color: '#9ca3af', border: '#d1d5db' },
}

function StepBar({ current }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 36, overflowX: 'auto', paddingBottom: 4 }}>
      {STEPS.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'active' : 'pending'
        const { bg, color, border } = STEP_COLORS[state]
        return (
          <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width:          28,
                height:         28,
                borderRadius:   '50%',
                background:     bg,
                border:         `2px solid ${border}`,
                color:          color,
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                fontSize:       '.75rem',
                fontWeight:     700,
                flexShrink:     0,
              }}>
                {i < current ? '✓' : i + 1}
              </div>
              <span style={{
                fontSize:   '.85rem',
                fontWeight: i === current ? 700 : 500,
                color:      i === current ? '#111827' : '#9ca3af',
                whiteSpace: 'nowrap',
              }}>{s}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{
                width:      32,
                height:     2,
                background: i < current ? '#2563eb' : '#e5e7eb',
                margin:     '0 10px',
                flexShrink: 0,
              }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// Shared label style
const fieldLabel = {
  display:       'block',
  fontSize:      '.8rem',
  fontWeight:    700,
  color:         '#374151',
  textTransform: 'uppercase',
  letterSpacing: '.05em',
  marginBottom:  7,
}

export default function ApplyPage() {
  const { jobId } = useParams()
  const { user }  = useAuth()
  const navigate  = useNavigate()

  const [job,           setJob]           = useState(null)
  const [step,          setStep]          = useState(0)
  const [applicationId, setApplicationId] = useState(null)
  const [submitting,    setSubmitting]    = useState(false)
  const [submitted,     setSubmitted]     = useState(false)
  const [loadingJob,    setLoadingJob]    = useState(true)

  const applicationIdRef = useRef(null)
  const submittedRef     = useRef(false)
  useEffect(() => { applicationIdRef.current = applicationId }, [applicationId])
  useEffect(() => { submittedRef.current = submitted }, [submitted])

  const [form, setForm] = useState({
    gender: '', education_level: '', field_of_study: '', graduation_year: '',
    experience_years: 0, skills: '', certifications: '', address: '', phone: '', date_of_birth: '',
  })
  const [formErrors, setFormErrors] = useState({})
  const [docStatus, setDocStatus] = useState(
    Object.fromEntries(DOC_TYPES.map(d => [d.key, { status: 'idle', message: '', fileName: '', isAdvisory: false }]))
  )

  useEffect(() => {
    if (!jobId) return
    api.get(`/jobs/${jobId}`)
      .then(res => setJob(res.data))
      .catch(() => toast.error('Job not found'))
      .finally(() => setLoadingJob(false))
  }, [jobId])

  useEffect(() => {
    return () => {
      if (applicationIdRef.current && !submittedRef.current) {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token') || ''
        fetch(`${BACKEND}/applications/${applicationIdRef.current}`, {
          method: 'DELETE',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          keepalive: true,
        }).catch(() => {})
      }
    }
  }, [])

  const requiredUploaded    = REQUIRED_DOC_KEYS.every(k => docStatus[k].status === 'success')
  const successCount        = DOC_TYPES.filter(d => docStatus[d.key].status === 'success').length
  const requiredCount       = REQUIRED_DOC_KEYS.filter(k => docStatus[k].status === 'success').length
  const missingRequiredCount= REQUIRED_DOC_KEYS.length - requiredCount

  const validateForm = () => {
    const errors = {}
    if (!form.gender)          errors.gender          = 'Gender is required'
    if (!form.education_level) errors.education_level = 'Education level is required'
    if (!form.field_of_study)  errors.field_of_study  = 'Field of study is required'
    if (!form.graduation_year) errors.graduation_year = 'Graduation year is required'
    if (!form.skills.trim())   errors.skills          = 'Please list at least one skill'
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleCreateDraft = async () => {
    if (!validateForm()) return
    setSubmitting(true)
    try {
      const { data } = await api.post('/applications', {
        job_id:           parseInt(jobId),
        gender:           form.gender,
        education_level:  form.education_level,
        field_of_study:   form.field_of_study,
        graduation_year:  parseInt(form.graduation_year),
        experience_years: parseInt(form.experience_years) || 0,
        skills:           form.skills,
        certifications:   form.certifications || null,
        address:          form.address || null,
        phone:            form.phone || null,
        date_of_birth:    form.date_of_birth || null,
      })
      setApplicationId(data.id)
      setStep(2)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create application')
    } finally {
      setSubmitting(false)
    }
  }

  const _isAdvisory = msg =>
    msg && (msg.startsWith('⚠') || msg.toLowerCase().includes('will be reviewed') ||
      msg.toLowerCase().includes('manual review') || msg.toLowerCase().includes('accepted') ||
      msg.toLowerCase().includes('advisory') || msg.toLowerCase().includes('cross-checked'))

  const handleUpload = async (docType, file) => {
    if (!applicationId) { toast.error('Please complete your details first'); return }
    setDocStatus(prev => ({ ...prev, [docType]: { status: 'uploading', message: 'Uploading and validating…', fileName: file.name, isAdvisory: false } }))
    const formData = new FormData()
    formData.append('doc_type', docType)
    formData.append('file', file)
    try {
      const { data } = await api.post(`/applications/${applicationId}/documents`, formData)
      const msg        = data.validation_message || 'Document accepted ✓'
      const isAdvisory = _isAdvisory(msg)
      setDocStatus(prev => ({ ...prev, [docType]: { status: 'success', message: msg, fileName: file.name, isAdvisory } }))
      toast.success(`${DOC_TYPES.find(d => d.key === docType)?.label} uploaded successfully`)
    } catch (err) {
      const detail = err.response?.data?.detail || 'Upload failed. Please try again.'
      setDocStatus(prev => ({ ...prev, [docType]: { status: 'error', message: detail, fileName: file.name, isAdvisory: false } }))
      toast.error(`Upload rejected: ${detail}`, { duration: 8000 })
    }
  }

  const handleFileChange = (docType, e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setDocStatus(prev => ({ ...prev, [docType]: { status: 'idle', message: '', fileName: '', isAdvisory: false } }))
    handleUpload(docType, file)
    e.target.value = ''
  }

  const handleDeleteDoc = async (docType) => {
    try {
      const { data } = await api.get(`/applications/${applicationId}/documents`)
      const doc = data.documents.find(d => d.doc_type === docType)
      if (!doc) return
      await api.delete(`/applications/${applicationId}/documents/${doc.id}`)
      setDocStatus(prev => ({ ...prev, [docType]: { status: 'idle', message: '', fileName: '', isAdvisory: false } }))
      toast.success('Document removed.')
    } catch { toast.error('Failed to remove document') }
  }

  const handleFinalize = async () => {
    if (!requiredUploaded) { toast.error('Please upload all 3 required documents.'); return }
    setSubmitting(true)
    try {
      await api.post(`/applications/${applicationId}/finalize`)
      submittedRef.current = true
      setSubmitted(true)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Submission failed. Please check your documents.', { duration: 8000 })
    } finally {
      setSubmitting(false)
    }
  }

  /* ── Loading ── */
  if (loadingJob) return (
    <div className="page-wrapper">
      <Navbar />
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <div className="spinner" style={{ width: 40, height: 40 }} />
      </div>
    </div>
  )

  /* ── Not found ── */
  if (!job) return (
    <div className="page-wrapper">
      <Navbar />
      <div style={{ textAlign: 'center', padding: 80 }}>
        <div style={{ fontSize: '3rem', marginBottom: 16 }}>🔍</div>
        <h2 style={{ color: '#111827' }}>Position not found</h2>
        <button
          style={{
            marginTop:    20,
            padding:      '10px 22px',
            borderRadius: 6,
            border:       '1.5px solid #d1d5db',
            background:   '#ffffff',
            color:        '#374151',
            fontWeight:   600,
            cursor:       'pointer',
          }}
          onClick={() => navigate('/jobs')}
        >
          Browse Positions
        </button>
      </div>
    </div>
  )

  /* ── Success ── */
  if (submitted) return (
    <div className="page-wrapper">
      <Helmet><title>Application Submitted — Shortlisting AI</title></Helmet>
      <Navbar />
      <div style={{
        background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
        padding:    '40px 0 36px',
      }} />
      <div style={{
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        padding:        '60px 24px',
        textAlign:      'center',
      }}>
        <div style={{
          width:          80,
          height:         80,
          borderRadius:   '50%',
          background:     '#dcfce7',
          border:         '3px solid #16a34a',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          marginBottom:   28,
        }}>
          <CheckCircle size={40} color="#16a34a" />
        </div>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#111827', marginBottom: 14 }}>
          Application Submitted!
        </h1>
        <div style={{ width: 44, height: 3, background: '#2563eb', borderRadius: 99, margin: '0 auto 20px' }} />
        <p style={{ color: '#6b7280', maxWidth: 480, lineHeight: 1.8, marginBottom: 36 }}>
          Your application for <strong style={{ color: '#111827' }}>{job.title}</strong> has been submitted.
          The AI shortlisting system will evaluate your profile — track your status in your dashboard.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            onClick={() => navigate('/jobs')}
            style={{
              padding:      '10px 22px',
              borderRadius: 6,
              border:       '1.5px solid #d1d5db',
              background:   '#ffffff',
              color:        '#374151',
              fontWeight:   600,
              cursor:       'pointer',
            }}
          >
            Browse More Positions
          </button>
          <button
            onClick={() => navigate('/applicant')}
            style={{
              padding:      '10px 22px',
              borderRadius: 6,
              border:       'none',
              background:   '#2563eb',
              color:        '#ffffff',
              fontWeight:   700,
              cursor:       'pointer',
            }}
          >
            My Applications
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      <Helmet><title>Apply — {job.title} | Shortlisting AI</title></Helmet>
      <div className="page-wrapper">
        <Navbar />

        {/* ── Hero strip ── */}
        <div style={{
          background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
          padding:    '36px 20px 30px',
          color:      '#ffffff',
        }}>
          <div className="container">
            <div style={{
              fontSize:      '.72rem',
              fontWeight:    700,
              color:         '#93c5fd',
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              marginBottom:  8,
            }}>
              Applying for
            </div>
            <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 800, color: '#ffffff' }}>
              {job.title}
            </h1>
          </div>
        </div>

        <div style={{ background: '#f9fafb', padding: '36px 20px' }}>
          <div className="container" style={{ maxWidth: 740 }}>
            <StepBar current={step} />

            {/* ── STEP 0: Position Info ── */}
            {step === 0 && (
              <div style={{
                background:   '#ffffff',
                border:       '1px solid #e5e7eb',
                borderRadius: 12,
                padding:      '32px 36px',
              }}>
                <div style={{ fontSize: '.72rem', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>
                  Step 1 of 4
                </div>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#111827', marginBottom: 6 }}>
                  About This Role
                </h2>
                <div style={{ width: 40, height: 3, background: '#2563eb', borderRadius: 99, marginBottom: 20 }} />
                <p style={{ color: '#4b5563', fontSize: '1rem', lineHeight: 1.8, marginBottom: 24 }}>
                  {job.description || 'Review the role details before applying.'}
                </p>

                {job.required_skills && (
                  <div style={{ marginBottom: 22 }}>
                    <div style={{ fontSize: '.75rem', fontWeight: 700, color: '#374151', marginBottom: 10, letterSpacing: '.06em', textTransform: 'uppercase' }}>
                      Required Skills
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {job.required_skills.split(',').map(s => (
                        <span key={s} style={{
                          padding:      '4px 12px',
                          borderRadius: 4,
                          background:   '#eff6ff',
                          color:        '#1d4ed8',
                          fontSize:     '.78rem',
                          fontWeight:   600,
                          border:       '1px solid #bfdbfe',
                        }}>
                          {s.trim()}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* ✅ FIX K — updated info box to mention experience as a 2nd optional document */}
                <div style={{
                  padding:      '16px 20px',
                  background:   '#fffbeb',
                  border:       '1px solid #fcd34d',
                  borderRadius: 8,
                  marginBottom: 30,
                  fontSize:     '.88rem',
                  color:        '#78350f',
                  lineHeight:   1.7,
                }}>
                  <strong>📋 Documents required:</strong><br />
                  <strong>Required (3):</strong> National ID/Passport, CV/Resume, Academic Diploma<br />
                  <strong>Optional (2):</strong> Professional Certificate, Experience Document (employment/reference letter — recommended if you have work experience)
                </div>

                <button
                  onClick={() => setStep(1)}
                  style={{
                    display:      'inline-flex',
                    alignItems:   'center',
                    gap:          6,
                    padding:      '11px 24px',
                    borderRadius: 6,
                    border:       'none',
                    background:   '#2563eb',
                    color:        '#ffffff',
                    fontWeight:   700,
                    cursor:       'pointer',
                    fontSize:     '.9rem',
                  }}
                >
                  Begin Application <ArrowRight size={14} />
                </button>
              </div>
            )}

            {/* ── STEP 1: Details ── */}
            {step === 1 && (
              <div style={{
                background:   '#ffffff',
                border:       '1px solid #e5e7eb',
                borderRadius: 12,
                padding:      '32px 36px',
              }}>
                <div style={{ fontSize: '.72rem', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>
                  Step 2 of 4
                </div>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#111827', marginBottom: 6 }}>Your Details</h2>
                <div style={{ width: 40, height: 3, background: '#2563eb', borderRadius: 99, marginBottom: 24 }} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {/* Gender */}
                  <div>
                    <label style={fieldLabel}>
                      Gender <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <select
                      className="form-select"
                      value={form.gender}
                      onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}
                      style={{ borderColor: formErrors.gender ? '#dc2626' : undefined }}
                    >
                      <option value="">Select…</option>
                      <option>Male</option>
                      <option>Female</option>
                      <option>Other / Prefer not to say</option>
                    </select>
                    {formErrors.gender && <div style={{ color: '#dc2626', fontSize: '.78rem', marginTop: 4 }}>{formErrors.gender}</div>}
                  </div>

                  {/* Education level */}
                  <div>
                    <label style={fieldLabel}>
                      Highest Education Level <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <select
                      className="form-select"
                      value={form.education_level}
                      onChange={e => setForm(f => ({ ...f, education_level: e.target.value }))}
                    >
                      <option value="">Select…</option>
                      <option>Diploma</option>
                      <option>Bachelor's</option>
                      <option>Master's</option>
                      <option>PhD</option>
                    </select>
                  </div>

                  {/* Field of study */}
                  <div>
                    <label style={fieldLabel}>
                      Field of Study <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <input
                      className="form-input"
                      type="text"
                      placeholder="e.g. Computer Science, Nursing, Accounting…"
                      value={form.field_of_study}
                      onChange={e => setForm(f => ({ ...f, field_of_study: e.target.value }))}
                      style={{ borderColor: formErrors.field_of_study ? '#dc2626' : undefined }}
                    />
                    {formErrors.field_of_study && <div style={{ color: '#dc2626', fontSize: '.78rem', marginTop: 4 }}>{formErrors.field_of_study}</div>}
                  </div>

                  {/* Graduation year + Experience */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <label style={fieldLabel}>
                        Graduation Year <span style={{ color: '#dc2626' }}>*</span>
                      </label>
                      <input
                        className="form-input"
                        type="number"
                        min="1980"
                        max={new Date().getFullYear()}
                        placeholder="e.g. 2022"
                        value={form.graduation_year}
                        onChange={e => setForm(f => ({ ...f, graduation_year: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label style={fieldLabel}>Years of Experience</label>
                      <input
                        className="form-input"
                        type="number"
                        min="0"
                        max="50"
                        value={form.experience_years}
                        onChange={e => setForm(f => ({ ...f, experience_years: e.target.value }))}
                      />
                    </div>
                  </div>

                  {/* ✅ FIX K — hint: nudge applicants with experience > 0 to upload an experience doc */}
                  {parseInt(form.experience_years) > 0 && (
                    <div style={{
                      padding:      '10px 14px',
                      background:   '#eff6ff',
                      border:       '1px solid #bfdbfe',
                      borderRadius: 6,
                      fontSize:     '.82rem',
                      color:        '#1e40af',
                      lineHeight:   1.6,
                    }}>
                      💼 <strong>Tip:</strong> You've declared {form.experience_years} year(s) of experience.
                      Uploading an experience document (employment letter / reference letter) in the next step
                      can strengthen your application.
                    </div>
                  )}

                  {/* Skills */}
                  <div>
                    <label style={fieldLabel}>
                      Skills <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <textarea
                      className="form-input form-textarea"
                      placeholder="e.g. Python, SQL, Data Analysis (comma-separated)"
                      value={form.skills}
                      onChange={e => setForm(f => ({ ...f, skills: e.target.value }))}
                      style={{ borderColor: formErrors.skills ? '#dc2626' : undefined }}
                    />
                    {formErrors.skills && <div style={{ color: '#dc2626', fontSize: '.78rem', marginTop: 4 }}>{formErrors.skills}</div>}
                  </div>

                  {/* Certifications */}
                  <div>
                    <label style={fieldLabel}>
                      Certifications{' '}
                      <span style={{ fontWeight: 400, textTransform: 'none', color: '#9ca3af', fontSize: '.75rem', letterSpacing: 0 }}>
                        (optional)
                      </span>
                    </label>
                    <textarea
                      className="form-input form-textarea"
                      placeholder="e.g. AWS Certified, PMP, CCNA (comma-separated)"
                      value={form.certifications}
                      onChange={e => setForm(f => ({ ...f, certifications: e.target.value }))}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, marginTop: 28 }}>
                  <button
                    onClick={() => setStep(0)}
                    style={{
                      display:      'inline-flex',
                      alignItems:   'center',
                      gap:          6,
                      padding:      '10px 20px',
                      borderRadius: 6,
                      border:       '1.5px solid #d1d5db',
                      background:   '#ffffff',
                      color:        '#374151',
                      fontWeight:   600,
                      cursor:       'pointer',
                      fontSize:     '.9rem',
                    }}
                  >
                    <ArrowLeft size={13} /> Back
                  </button>
                  <button
                    onClick={handleCreateDraft}
                    disabled={submitting}
                    style={{
                      display:      'inline-flex',
                      alignItems:   'center',
                      gap:          6,
                      padding:      '10px 24px',
                      borderRadius: 6,
                      border:       'none',
                      background:   submitting ? '#93c5fd' : '#2563eb',
                      color:        '#ffffff',
                      fontWeight:   700,
                      cursor:       submitting ? 'not-allowed' : 'pointer',
                      fontSize:     '.9rem',
                    }}
                  >
                    {submitting
                      ? <><Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
                      : <>Continue to Documents <ArrowRight size={13} /></>
                    }
                  </button>
                </div>
              </div>
            )}

            {/* ── STEP 2: Documents ── */}
            {step === 2 && (
              <div style={{
                background:   '#ffffff',
                border:       '1px solid #e5e7eb',
                borderRadius: 12,
                padding:      '32px 36px',
              }}>
                <div style={{ fontSize: '.72rem', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>
                  Step 3 of 4
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 10 }}>
                  <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#111827' }}>Upload Documents</h2>
                  <span style={{
                    padding:      '4px 12px',
                    borderRadius: 99,
                    fontSize:     '.78rem',
                    fontWeight:   700,
                    background:   requiredUploaded ? '#dcfce7' : '#fef3c7',
                    border:       `1.5px solid ${requiredUploaded ? '#16a34a' : '#d97706'}`,
                    color:        requiredUploaded ? '#14532d' : '#78350f',
                  }}>
                    {requiredCount} / {REQUIRED_DOC_KEYS.length} required
                  </span>
                </div>
                <div style={{ width: 40, height: 3, background: '#2563eb', borderRadius: 99, marginBottom: 18 }} />
                <p style={{ color: '#4b5563', fontSize: '.92rem', lineHeight: 1.75, marginBottom: 24 }}>
                  Upload your <strong style={{ color: '#111827' }}>3 required documents</strong>. Ensure your name matches your account:{' '}
                  <strong style={{ color: '#111827' }}>{user?.full_name || user?.fullName}</strong>. Accepted: PDF, PNG, JPG (max 5 MB).
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 28 }}>
                  {DOC_TYPES.map(doc => {
                    const state      = docStatus[doc.key]
                    const isSuccess  = state.status === 'success'
                    const isError    = state.status === 'error'
                    const isLoading  = state.status === 'uploading'
                    const isAdvisory = isSuccess && state.isAdvisory

                    const borderColor = isSuccess && !isAdvisory ? '#16a34a' : isAdvisory ? '#d97706' : isError ? '#dc2626' : '#e5e7eb'
                    const bgColor     = isSuccess && !isAdvisory ? '#f0fdf4' : isAdvisory ? '#fffbeb' : isError ? '#fff1f2' : '#f9fafb'

                    return (
                      <div key={doc.key} style={{
                        padding:      '18px 20px',
                        border:       `1.5px solid ${borderColor}`,
                        borderRadius: 10,
                        background:   bgColor,
                        transition:   'all .2s',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                          <div style={{
                            width:          44,
                            height:         44,
                            borderRadius:   8,
                            background:     '#ffffff',
                            display:        'flex',
                            alignItems:     'center',
                            justifyContent: 'center',
                            fontSize:       '1.4rem',
                            flexShrink:     0,
                            border:         '1px solid #e5e7eb',
                          }}>
                            {doc.icon}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: '.95rem', color: '#111827', marginBottom: 4 }}>
                              {doc.label}
                              {doc.required
                                ? <span style={{ marginLeft: 6, color: '#dc2626', fontSize: '.8rem' }}>*</span>
                                : <span style={{ marginLeft: 6, color: '#9ca3af', fontSize: '.78rem', fontWeight: 400 }}>(optional)</span>
                              }
                            </div>
                            <div style={{ fontSize: '.8rem', color: '#6b7280', lineHeight: 1.6, marginBottom: 10 }}>
                              {doc.description}
                            </div>

                            {isSuccess && state.message && (
                              <div style={{
                                fontSize:     '.78rem',
                                lineHeight:   1.5,
                                marginBottom: 10,
                                padding:      '8px 12px',
                                borderRadius: 6,
                                background:   isAdvisory ? '#fef3c7' : '#dcfce7',
                                color:        isAdvisory ? '#78350f' : '#14532d',
                                border:       `1px solid ${isAdvisory ? '#fcd34d' : '#86efac'}`,
                                display:      'flex',
                                alignItems:   'flex-start',
                                gap:          6,
                              }}>
                                {isAdvisory ? <Info size={12} style={{ flexShrink: 0, marginTop: 1 }} /> : '✅ '}
                                <span>{state.message}</span>
                              </div>
                            )}
                            {isError && state.message && (
                              <div style={{
                                fontSize:     '.78rem',
                                lineHeight:   1.5,
                                marginBottom: 10,
                                padding:      '8px 12px',
                                borderRadius: 6,
                                background:   '#fee2e2',
                                color:        '#7f1d1d',
                                border:       '1px solid #fca5a5',
                              }}>
                                ❌ {state.message}
                              </div>
                            )}

                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              {isLoading ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#6b7280', fontSize: '.85rem' }}>
                                  <div className="spinner" style={{ width: 14, height: 14 }} /> Uploading and verifying…
                                </div>
                              ) : isSuccess ? (
                                <>
                                  <div style={{
                                    display:    'flex',
                                    alignItems: 'center',
                                    gap:        5,
                                    color:      isAdvisory ? '#78350f' : '#15803d',
                                    fontSize:   '.85rem',
                                    fontWeight: 600,
                                  }}>
                                    <CheckCircle size={13} /> {state.fileName}
                                  </div>
                                  <button
                                    onClick={() => handleDeleteDoc(doc.key)}
                                    style={{
                                      background:     'none',
                                      border:         'none',
                                      cursor:         'pointer',
                                      color:          '#6b7280',
                                      fontSize:       '.78rem',
                                      textDecoration: 'underline',
                                      padding:        0,
                                    }}
                                  >
                                    Remove &amp; re-upload
                                  </button>
                                </>
                              ) : (
                                <label style={{
                                  display:        'inline-flex',
                                  alignItems:     'center',
                                  gap:            6,
                                  padding:        '7px 14px',
                                  borderRadius:   6,
                                  border:         'none',
                                  background:     isError ? '#dc2626' : '#2563eb',
                                  color:          '#ffffff',
                                  fontWeight:     700,
                                  fontSize:       '.82rem',
                                  cursor:         'pointer',
                                }}>
                                  <Upload size={13} />
                                  {isError ? 'Try Again' : 'Choose File'}
                                  <input
                                    type="file"
                                    accept=".pdf,.png,.jpg,.jpeg"
                                    style={{ display: 'none' }}
                                    onChange={e => handleFileChange(doc.key, e)}
                                  />
                                </label>
                              )}
                            </div>
                          </div>
                          <div style={{ flexShrink: 0, marginTop: 4 }}>
                            {isSuccess && !isAdvisory && <CheckCircle size={20} color="#16a34a" />}
                            {isAdvisory                && <Info size={20} color="#d97706" />}
                            {isError                   && <XCircle size={20} color="#dc2626" />}
                            {!isSuccess && !isError && !isLoading && <AlertCircle size={20} color="#d1d5db" />}
                            {isLoading                 && <div className="spinner" style={{ width: 20, height: 20 }} />}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {!requiredUploaded && (
                  <div style={{
                    padding:      '12px 16px',
                    borderRadius: 8,
                    background:   '#fffbeb',
                    border:       '1px solid #fcd34d',
                    fontSize:     '.88rem',
                    color:        '#78350f',
                    marginBottom: 16,
                    display:      'flex',
                    alignItems:   'center',
                    gap:          8,
                    fontWeight:   600,
                  }}>
                    <AlertCircle size={14} />
                    Please upload the {missingRequiredCount} remaining required document(s) before continuing.
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => setStep(1)}
                    style={{
                      display:      'inline-flex',
                      alignItems:   'center',
                      gap:          6,
                      padding:      '10px 20px',
                      borderRadius: 6,
                      border:       '1.5px solid #d1d5db',
                      background:   '#ffffff',
                      color:        '#374151',
                      fontWeight:   600,
                      cursor:       'pointer',
                    }}
                  >
                    <ArrowLeft size={13} /> Back
                  </button>
                  <button
                    onClick={() => setStep(3)}
                    disabled={!requiredUploaded}
                    style={{
                      display:      'inline-flex',
                      alignItems:   'center',
                      gap:          6,
                      padding:      '10px 24px',
                      borderRadius: 6,
                      border:       'none',
                      background:   requiredUploaded ? '#2563eb' : '#93c5fd',
                      color:        '#ffffff',
                      fontWeight:   700,
                      cursor:       requiredUploaded ? 'pointer' : 'not-allowed',
                      opacity:      requiredUploaded ? 1 : 0.7,
                    }}
                  >
                    Continue to Submit <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            )}

            {/* ── STEP 3: Review & Submit ── */}
            {step === 3 && (
              <div style={{
                background:   '#ffffff',
                border:       '1px solid #e5e7eb',
                borderRadius: 12,
                padding:      '32px 36px',
              }}>
                <div style={{ fontSize: '.72rem', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>
                  Step 4 of 4
                </div>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#111827', marginBottom: 6 }}>
                  Review &amp; Submit
                </h2>
                <div style={{ width: 40, height: 3, background: '#2563eb', borderRadius: 99, marginBottom: 20 }} />
                <p style={{ color: '#4b5563', fontSize: '.92rem', marginBottom: 24 }}>
                  Please review your application details before final submission.
                </p>

                <div style={{
                  background:   '#f9fafb',
                  borderRadius: 10,
                  padding:      '18px 22px',
                  marginBottom: 22,
                  border:       '1px solid #e5e7eb',
                }}>
                  <div style={{
                    fontWeight:    700,
                    fontSize:      '.78rem',
                    textTransform: 'uppercase',
                    letterSpacing: '.06em',
                    marginBottom:  14,
                    color:         '#374151',
                  }}>
                    Application Summary
                  </div>
                  {[
                    ['Position',   job.title],
                    ['Applicant',  user?.full_name || user?.fullName],
                    ['Education',  form.education_level],
                    ['Field',      form.field_of_study],
                    ['Experience', `${form.experience_years || 0} year(s)`],
                    ['Skills',     form.skills],
                    // ✅ FIX K — optional count now includes experience doc if uploaded
                    ['Documents',  `${requiredCount}/${REQUIRED_DOC_KEYS.length} required${successCount > requiredCount ? ` + ${successCount - requiredCount} optional` : ''} ✅`],
                  ].map(([label, value]) => (
                    <div key={label} style={{ display: 'flex', gap: 14, marginBottom: 10, fontSize: '.9rem' }}>
                      <span style={{ color: '#6b7280', minWidth: 100, flexShrink: 0 }}>{label}:</span>
                      <span style={{ color: '#111827', fontWeight: 600 }}>{value}</span>
                    </div>
                  ))}
                </div>

                {/* ✅ FIX K — show experience doc note in submission confirmation */}
                {docStatus['experience']?.status === 'success' && (
                  <div style={{
                    padding:      '12px 16px',
                    background:   '#eff6ff',
                    border:       '1px solid #bfdbfe',
                    borderRadius: 8,
                    marginBottom: 14,
                    display:      'flex',
                    alignItems:   'flex-start',
                    gap:          8,
                    fontSize:     '.85rem',
                    color:        '#1e40af',
                    lineHeight:   1.6,
                  }}>
                    <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>
                      <strong>Experience document included.</strong> It will be cross-checked against your
                      declared {form.experience_years} year(s) of experience during AI shortlisting.
                    </span>
                  </div>
                )}

                <div style={{
                  padding:      '14px 18px',
                  background:   '#f0fdf4',
                  border:       '1px solid #86efac',
                  borderRadius: 8,
                  marginBottom: 30,
                  display:      'flex',
                  alignItems:   'flex-start',
                  gap:          10,
                }}>
                  <ShieldCheck size={18} color="#16a34a" style={{ flexShrink: 0, marginTop: 1 }} />
                  <div style={{ fontSize: '.88rem', color: '#14532d', lineHeight: 1.7, fontWeight: 600 }}>
                    All required documents uploaded. By submitting, you confirm all documents are your own and the information is accurate.
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => setStep(2)}
                    style={{
                      display:      'inline-flex',
                      alignItems:   'center',
                      gap:          6,
                      padding:      '10px 20px',
                      borderRadius: 6,
                      border:       '1.5px solid #d1d5db',
                      background:   '#ffffff',
                      color:        '#374151',
                      fontWeight:   600,
                      cursor:       'pointer',
                    }}
                  >
                    <ArrowLeft size={13} /> Back to Documents
                  </button>
                  <button
                    onClick={handleFinalize}
                    disabled={submitting}
                    style={{
                      display:        'inline-flex',
                      alignItems:     'center',
                      gap:            6,
                      padding:        '10px 28px',
                      borderRadius:   6,
                      border:         'none',
                      background:     submitting ? '#93c5fd' : '#2563eb',
                      color:          '#ffffff',
                      fontWeight:     700,
                      cursor:         submitting ? 'not-allowed' : 'pointer',
                      minWidth:       180,
                      justifyContent: 'center',
                    }}
                  >
                    {submitting
                      ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Submitting…</>
                      : <>Submit Application <CheckCircle size={13} /></>
                    }
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