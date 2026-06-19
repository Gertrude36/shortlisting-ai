/**
 * ApplyPage.jsx — simplified profile-driven application flow.
 * Applicants submit using saved profile contact info and saved profile documents.
 * Missing required profile fields must be completed in the profile page before applying.
 */

import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { CheckCircle, ArrowRight, ShieldCheck, User } from 'lucide-react'
import toast from 'react-hot-toast'
import Navbar from '../components/Navbar'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'

const REQUIRED_DOC_KEYS = ['id_card', 'cv', 'diploma']

export default function ApplyPage() {
  const { jobId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [job, setJob] = useState(null)
  const [loadingJob, setLoadingJob] = useState(true)
  const [alreadyApplied, setAlreadyApplied] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [profileAvailable, setProfileAvailable] = useState({})
  const [profileDocsLoading, setProfileDocsLoading] = useState(true)
  const [createError, setCreateError] = useState('')
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    if (!jobId) return
    api.get(`/jobs/${jobId}`)
      .then(res => { if (mountedRef.current) setJob(res.data) })
      .catch(() => toast.error('Job not found'))
      .finally(() => { if (mountedRef.current) setLoadingJob(false) })
  }, [jobId])

  const loadProfileDocuments = async () => {
    setProfileDocsLoading(true)
    try {
      const { data } = await api.get('/profile/documents')
      if (!mountedRef.current) return
      const docs = Array.isArray(data) ? data : (data.documents || [])
      const available = {}
      docs.forEach(doc => {
        if (!doc.doc_type || !doc.id) return
        if (!REQUIRED_DOC_KEYS.includes(doc.doc_type)) return
        available[doc.doc_type] = {
          id: doc.id,
          fileName: doc.original_name || doc.file_name || doc.doc_type,
        }
      })
      setProfileAvailable(available)
    } catch {
      if (mountedRef.current) setProfileAvailable({})
    } finally {
      if (mountedRef.current) setProfileDocsLoading(false)
    }
  }

  useEffect(() => {
    loadProfileDocuments()
  }, [])

  useEffect(() => {
    const onProfileUpdated = () => loadProfileDocuments()
    window.addEventListener('profile-updated', onProfileUpdated)
    return () => window.removeEventListener('profile-updated', onProfileUpdated)
  }, [])

  const profileSavedCount = Object.keys(profileAvailable).length
  const profileHasAllRequired = REQUIRED_DOC_KEYS.every(k => !!profileAvailable[k])
  const profileContactComplete = !!(user?.phone && user?.address && user?.national_id)
  const profileReadyToApply = profileHasAllRequired && profileContactComplete

  const beginApplication = async () => {
    if (submitting) return
    if (!profileReadyToApply) {
      toast.error('Please complete your profile before applying. Open your profile to finish required contact and document uploads.')
      window.dispatchEvent(new Event('open-profile-modal'))
      return
    }

    setSubmitting(true)
    setCreateError('')
    try {
      const { data } = await api.post('/applications', { job_id: parseInt(jobId, 10) })
      if (data.submitted_at) {
        setSubmitted(true)
      }
    } catch (err) {
      const message = err?.response?.data?.detail || err?.message || 'Something went wrong. Please try again.'
      if (err?.response?.status === 400 && typeof message === 'string' && message.toLowerCase().includes('already applied')) {
        setAlreadyApplied(true)
        return
      }
      setCreateError(message)
      toast.error(message, { duration: 8000 })
    } finally {
      if (mountedRef.current) setSubmitting(false)
    }
  }

  if (loadingJob) return (
    <div className="page-wrapper"><Navbar />
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <div className="spinner" style={{ width: 40, height: 40 }} />
      </div>
    </div>
  )

  if (!job) return (
    <div className="page-wrapper"><Navbar />
      <div style={{ textAlign: 'center', padding: 80 }}>
        <div style={{ fontSize: '3rem', marginBottom: 16 }}>🔍</div>
        <h2 style={{ color: '#111827' }}>Position not found</h2>
        <button style={{ marginTop: 20, padding: '10px 22px', borderRadius: 6, border: '1.5px solid #d1d5db', background: '#ffffff', color: '#374151', fontWeight: 600, cursor: 'pointer' }} onClick={() => navigate('/jobs')}>Browse Positions</button>
      </div>
    </div>
  )

  if (alreadyApplied) return (
    <div className="page-wrapper">
      <Helmet><title>Already Applied — {job.title} | Shortlisting AI</title></Helmet>
      <Navbar />
      <div style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)', padding: '40px 0 36px' }} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 24px', textAlign: 'center' }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#dbeafe', border: '3px solid #2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 28 }}>
          <CheckCircle size={40} color="#2563eb" />
        </div>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#111827', marginBottom: 14 }}>You've Already Applied</h1>
        <div style={{ width: 44, height: 3, background: '#2563eb', borderRadius: 99, margin: '0 auto 20px' }} />
        <p style={{ color: '#6b7280', maxWidth: 480, lineHeight: 1.8, marginBottom: 30 }}>
          You have already submitted an application for <strong style={{ color: '#111827' }}>{job.title}</strong>.
          Check your application status on the dashboard.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button onClick={() => navigate('/jobs')} style={{ padding: '10px 22px', borderRadius: 6, border: '1.5px solid #d1d5db', background: '#ffffff', color: '#374151', fontWeight: 600, cursor: 'pointer' }}>Browse More Positions</button>
          <button onClick={() => navigate('/applicant')} style={{ padding: '10px 22px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#ffffff', fontWeight: 700, cursor: 'pointer' }}>My Applications</button>
        </div>
      </div>
    </div>
  )

  if (submitted) return (
    <div className="page-wrapper">
      <Helmet><title>Application Submitted — Shortlisting AI</title></Helmet>
      <Navbar />
      <div style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)', padding: '40px 0 36px' }} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 24px', textAlign: 'center' }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#dcfce7', border: '3px solid #16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 28 }}>
          <CheckCircle size={40} color="#16a34a" />
        </div>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#111827', marginBottom: 14 }}>Application Submitted!</h1>
        <div style={{ width: 44, height: 3, background: '#2563eb', borderRadius: 99, margin: '0 auto 20px' }} />
        <p style={{ color: '#6b7280', maxWidth: 520, lineHeight: 1.8, marginBottom: 20 }}>
          Your application for <strong style={{ color: '#111827' }}>{job.title}</strong> has been submitted successfully.
        </p>
        <div style={{ maxWidth: 520, width: '100%', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '18px 22px', marginBottom: 20, textAlign: 'left' }}>
          <div style={{ fontWeight: 700, color: '#1e40af', marginBottom: 10, fontSize: '.9rem', display: 'flex', alignItems: 'center', gap: 7 }}>
            <ShieldCheck size={15} /> What happens next
          </div>
          <ol style={{ margin: 0, paddingLeft: 18, color: '#1e40af', fontSize: '.85rem', lineHeight: 2 }}>
            <li>Your documents are <strong>verified automatically</strong> — no action needed from you.</li>
            <li>Your <strong>profile will be updated</strong> with information from your documents.</li>
            <li>Shortlisted candidates will be contacted directly.</li>
          </ol>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button onClick={() => navigate('/jobs')} style={{ padding: '10px 22px', borderRadius: 6, border: '1.5px solid #d1d5db', background: '#ffffff', color: '#374151', fontWeight: 600, cursor: 'pointer' }}>Browse More Positions</button>
          <button onClick={() => navigate('/applicant')} style={{ padding: '10px 22px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#ffffff', fontWeight: 700, cursor: 'pointer' }}>My Applications</button>
        </div>
      </div>
    </div>
  )

  const profileHintCount = profileSavedCount

  return (
    <>
      <Helmet><title>Apply — {job.title} | Shortlisting AI</title></Helmet>
      <div className="page-wrapper">
        <Navbar />
        <div style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)', padding: '36px 20px 30px', color: '#ffffff' }}>
          <div className="container">
            <div style={{ fontSize: '.72rem', fontWeight: 700, color: '#93c5fd', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 8 }}>Applying for</div>
            <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 800, color: '#ffffff' }}>{job.title}</h1>
          </div>
        </div>

        <div style={{ background: '#f9fafb', padding: '36px 20px' }}>
          <div className="container" style={{ maxWidth: 740 }}>
            <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '32px 36px' }}>
              <div style={{ fontSize: '.72rem', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>Apply with Your Profile</div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#111827', marginBottom: 6 }}>Submit your application instantly</h2>
              <div style={{ width: 40, height: 3, background: '#2563eb', borderRadius: 99, marginBottom: 20 }} />
              <p style={{ color: '#4b5563', fontSize: '1rem', lineHeight: 1.8, marginBottom: 24 }}>{job.description || 'Review the role details before applying.'}</p>
              {job.required_skills && (
                <div style={{ marginBottom: 22 }}>
                  <div style={{ fontSize: '.75rem', fontWeight: 700, color: '#374151', marginBottom: 10, letterSpacing: '.06em', textTransform: 'uppercase' }}>Required Skills</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {job.required_skills.split(',').map(s => (
                      <span key={s} style={{ padding: '4px 12px', borderRadius: 4, background: '#eff6ff', color: '#1d4ed8', fontSize: '.78rem', fontWeight: 600, border: '1px solid #bfdbfe' }}>{s.trim()}</span>
                    ))}
                  </div>
                </div>
              )}
              {profileHintCount > 0 && (
                <div style={{ padding: '12px 16px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, marginBottom: 20, fontSize: '.88rem', color: '#14532d', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <User size={14} color="#16a34a" />
                  <span><strong>{profileHintCount} document{profileHintCount > 1 ? 's' : ''} saved in your profile.</strong>{' '}Your saved profile documents can be used automatically when you apply.</span>
                </div>
              )}
              <div style={{ padding: '16px 20px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, marginBottom: 30, fontSize: '.88rem', color: '#78350f', lineHeight: 1.7 }}>
                <strong>How this works:</strong><br />
                Your saved profile documents and contact information are used to submit this application instantly.<br />
                <strong>Required documents:</strong> National ID, CV, Diploma<br />
                <strong>Accepted formats:</strong> PDF, PNG, JPG, JPEG<br />
                <strong>Identity check:</strong> Your name must match the account name on each document.<br />
                <strong>Tip:</strong> Keep your profile documents up to date so applications can submit immediately.
              </div>
              {(!profileDocsLoading || !profileReadyToApply) && (
                <div style={{ marginBottom: 20, padding: '16px 18px', borderRadius: 10, background: '#fffbeb', border: '1px solid #fcd34d', color: '#78350f', fontSize: '.9rem', lineHeight: 1.7 }}>
                  {profileDocsLoading
                    ? 'Checking your saved profile documents…'
                    : profileHasAllRequired
                      ? 'Your documents are ready, but your profile contact details are incomplete. Open your profile to add your phone, address, and National ID.'
                      : 'Please upload your required profile documents before beginning your application. Open your profile to save your National ID, CV and Diploma.'}
                </div>
              )}
              <button
                onClick={beginApplication}
                disabled={!profileReadyToApply || submitting}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '11px 24px', borderRadius: 6, border: 'none', background: !profileReadyToApply ? '#93c5fd' : '#2563eb', color: '#ffffff', fontWeight: 700, cursor: !profileReadyToApply ? 'not-allowed' : 'pointer', fontSize: '.9rem' }}>
                {submitting ? 'Submitting…' : 'Submit application'} <ArrowRight size={14} />
              </button>
              {createError && (
                <div style={{ marginTop: 18, color: '#991b1b', fontSize: '.9rem' }}>{createError}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
