import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { Users, CheckCircle, XCircle, Bot, ShieldCheck, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import Navbar from '../components/Navbar'
import DecisionBadge from '../components/DecisionBadge'
import ReasonBreakdown from '../components/ReasonBreakdown'
import PageHero from '../components/PageHero'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'

export default function ApplicantDashboard() {
  const { user } = useAuth()
  const [applications, setApplications] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedRow, setExpandedRow] = useState(null)
  const [jobsMap, setJobsMap] = useState({})

  const fetchApplications = () => {
    setLoading(true)
    api.get('/applications/my')
      .then(res => setApplications(res.data))
      .catch(() => toast.error('Failed to load your applications'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchApplications() }, [])
  useEffect(() => {
    api.get('/jobs').then(res => {
      const map = {}
      res.data.forEach(job => { map[job.id] = job.title })
      setJobsMap(map)
    }).catch(() => {})
  }, [])

  const total       = applications.length
  const shortlisted = applications.filter(a => a.decision === 'shortlisted').length
  const rejected    = applications.filter(a => a.decision === 'not_shortlisted').length
  const underReview = applications.filter(a => a.decision === 'pending').length

  const heroStats = [
    { label: 'Applications', value: total,       icon: <Users size={14} />,         color: '#2563eb' },
    { label: 'Shortlisted',  value: shortlisted, icon: <CheckCircle size={14} />,   color: '#16a34a' },
    { label: 'Rejected',     value: rejected,    icon: <XCircle size={14} />,       color: '#dc2626' },
    ...(underReview > 0 ? [{ label: 'Under Review', value: underReview, icon: <Bot size={14} />, color: '#d97706' }] : []),
  ]

  return (
    <>
      <Helmet><title>My Applications — Shortlisting AI</title></Helmet>
      <div className="page-wrapper">
        <Navbar />

        {/* ── Hero Banner ── */}
        <section style={{
          background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
          color:      '#ffffff',
          padding:    '52px 20px 44px',
        }}>
          <div className="container">
            <div style={{
              display:      'inline-block',
              background:   'rgba(255,255,255,0.15)',
              border:       '1px solid rgba(255,255,255,0.3)',
              borderRadius: 99,
              padding:      '4px 14px',
              fontSize:     '.72rem',
              fontWeight:   700,
              letterSpacing:'.08em',
              textTransform:'uppercase',
              color:        '#ffffff',
              marginBottom: 16,
            }}>
              Applicant Portal
            </div>

            <h1 style={{
              fontSize:    '2rem',
              fontWeight:  800,
              color:       '#ffffff',
              marginBottom:8,
            }}>
              My Applications
            </h1>
            <p style={{ color: '#bfdbfe', fontSize: '.95rem', marginBottom: 28 }}>
              Welcome back, <strong style={{ color: '#ffffff' }}>{user?.fullName || user?.full_name}</strong>. Track your applications and AI decisions below.
            </p>

            {/* Stat pills */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
              {heroStats.map(({ label, value, icon, color }) => (
                <div key={label} style={{
                  display:      'flex',
                  alignItems:   'center',
                  gap:          8,
                  background:   'rgba(255,255,255,0.12)',
                  border:       '1px solid rgba(255,255,255,0.2)',
                  borderRadius: 8,
                  padding:      '8px 16px',
                }}>
                  <span style={{ color: '#ffffff', opacity: 0.8 }}>{icon}</span>
                  <div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#ffffff', lineHeight: 1 }}>{value}</div>
                    <div style={{ fontSize: '.72rem', color: '#bfdbfe', fontWeight: 500 }}>{label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                onClick={fetchApplications}
                style={{
                  display:      'inline-flex',
                  alignItems:   'center',
                  gap:          6,
                  padding:      '8px 18px',
                  borderRadius: 6,
                  border:       '1.5px solid rgba(255,255,255,0.4)',
                  background:   'rgba(255,255,255,0.12)',
                  color:        '#ffffff',
                  fontWeight:   600,
                  fontSize:     '.85rem',
                  cursor:       'pointer',
                }}
              >
                <RefreshCw size={13} /> Refresh
              </button>
              <Link
                to="/jobs"
                style={{
                  display:        'inline-flex',
                  alignItems:     'center',
                  gap:            6,
                  padding:        '8px 18px',
                  borderRadius:   6,
                  border:         'none',
                  background:     '#ffffff',
                  color:          '#1d4ed8',
                  fontWeight:     700,
                  fontSize:       '.85rem',
                  textDecoration: 'none',
                  cursor:         'pointer',
                }}
              >
                Browse Positions
              </Link>
            </div>
          </div>
        </section>

        {/* ── Main Content ── */}
        <div style={{ background: '#f9fafb', minHeight: '60vh', padding: '36px 20px' }}>
          <div className="container">
            <div style={{
              background:   '#ffffff',
              border:       '1px solid #e5e7eb',
              borderRadius: 12,
              overflow:     'hidden',
            }}>
              {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 72 }}>
                  <div className="spinner" style={{ width: 36, height: 36 }} />
                </div>
              ) : applications.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 24px' }}>
                  <div style={{ fontSize: '3rem', marginBottom: 16 }}>📄</div>
                  <h3 style={{ color: '#111827', fontSize: '1.1rem', marginBottom: 8 }}>No applications yet</h3>
                  <p style={{ color: '#6b7280', marginBottom: 24 }}>Browse available positions and submit your first application.</p>
                  <Link
                    to="/jobs"
                    style={{
                      display:        'inline-flex',
                      alignItems:     'center',
                      padding:        '10px 22px',
                      borderRadius:   6,
                      background:     '#2563eb',
                      color:          '#ffffff',
                      fontWeight:     700,
                      textDecoration: 'none',
                      fontSize:       '.9rem',
                    }}
                  >
                    Browse Positions
                  </Link>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{
                    width:          '100%',
                    borderCollapse: 'collapse',
                    fontSize:       '.88rem',
                  }}>
                    <thead>
                      <tr style={{ background: '#f3f4f6', borderBottom: '2px solid #e5e7eb' }}>
                        {['Job Title', 'Education', 'Experience', 'Decision', 'AI Score', 'Documents', 'AI Reasoning'].map(h => (
                          <th key={h} style={{
                            padding:       '12px 16px',
                            textAlign:     'left',
                            fontSize:      '.75rem',
                            fontWeight:    700,
                            color:         '#374151',
                            letterSpacing: '.05em',
                            textTransform: 'uppercase',
                            whiteSpace:    'nowrap',
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {applications.map((app, i) => (
                        <React.Fragment key={app.id}>
                          <tr style={{
                            background:  expandedRow === app.id ? '#eff6ff' : i % 2 === 0 ? '#ffffff' : '#f9fafb',
                            borderBottom:'1px solid #e5e7eb',
                          }}>
                            <td style={{ padding: '14px 16px', fontWeight: 700, color: '#111827', fontSize: '.9rem' }}>
                              {jobsMap[app.job_id] || `Position #${app.job_id}`}
                            </td>
                            <td style={{ padding: '14px 16px' }}>
                              <div style={{ fontWeight: 600, color: '#111827', fontSize: '.88rem' }}>{app.education_level}</div>
                              <div style={{ fontSize: '.78rem', color: '#6b7280' }}>{app.field_of_study}</div>
                            </td>
                            <td style={{ padding: '14px 16px', color: '#374151', fontSize: '.88rem', fontWeight: 600 }}>
                              {app.experience_years} yrs
                            </td>
                            <td style={{ padding: '14px 16px' }}>
                              <DecisionBadge decision={app.decision} />
                            </td>
                            <td style={{ padding: '14px 16px' }}>
                              {app.ai_score != null
                                ? <span style={{
                                    fontWeight: 800,
                                    fontSize:   '.95rem',
                                    color:      app.ai_score >= 0.45 ? '#15803d' : '#b91c1c',
                                  }}>
                                    {(app.ai_score * 100).toFixed(1)}%
                                  </span>
                                : <span style={{ color: '#9ca3af', fontSize: '.85rem' }}>—</span>
                              }
                            </td>
                            <td style={{ padding: '14px 16px' }}>
                              {app.doc_verified
                                ? <span style={{
                                    color:      '#15803d',
                                    fontSize:   '.82rem',
                                    fontWeight: 600,
                                    display:    'flex',
                                    alignItems: 'center',
                                    gap:        5,
                                  }}>
                                    <ShieldCheck size={13} /> Verified
                                  </span>
                                : <span style={{
                                    color:      '#d97706',
                                    fontSize:   '.82rem',
                                    fontWeight: 600,
                                    display:    'flex',
                                    alignItems: 'center',
                                    gap:        5,
                                  }}>
                                    <Bot size={12} /> Processing
                                  </span>
                              }
                            </td>
                            <td style={{ padding: '14px 16px' }}>
                              {app.ai_reason
                                ? <button
                                    style={{
                                      background:  'none',
                                      border:      '1.5px solid #2563eb',
                                      borderRadius:6,
                                      cursor:      'pointer',
                                      display:     'flex',
                                      alignItems:  'center',
                                      gap:         5,
                                      color:       '#1d4ed8',
                                      fontSize:    '.82rem',
                                      fontWeight:  700,
                                      padding:     '5px 10px',
                                    }}
                                    onClick={() => setExpandedRow(expandedRow === app.id ? null : app.id)}
                                  >
                                    {expandedRow === app.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    {expandedRow === app.id ? 'Hide' : 'View Reason'}
                                  </button>
                                : <span style={{
                                    color:      '#d97706',
                                    fontSize:   '.8rem',
                                    fontWeight: 600,
                                    display:    'flex',
                                    alignItems: 'center',
                                    gap:        5,
                                  }}>
                                    <Bot size={12} /> AI evaluating…
                                  </span>
                              }
                            </td>
                          </tr>

                          {expandedRow === app.id && (
                            <tr>
                              <td colSpan={7} style={{ padding: '0 16px 16px', background: '#eff6ff' }}>
                                <div style={{
                                  padding:      '18px 22px',
                                  background:   '#ffffff',
                                  borderRadius: 10,
                                  border:       '1px solid #bfdbfe',
                                  borderTop:    '3px solid #2563eb',
                                }}>
                                  <div style={{
                                    fontWeight:  700,
                                    fontSize:    '.88rem',
                                    color:       '#1e40af',
                                    marginBottom:14,
                                    display:     'flex',
                                    alignItems:  'center',
                                    gap:         8,
                                  }}>
                                    <Bot size={15} />
                                    AI Decision Breakdown — {jobsMap[app.job_id] || `Position #${app.job_id}`}
                                  </div>
                                  <ReasonBreakdown reason={app.ai_reason} candidate={app} />
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
