import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { Search, Zap, Shield, Clock, ChevronRight } from 'lucide-react'
import Navbar from '../components/Navbar'
import JobCard from '../components/JobCard'
import api from '../api/axios'

export default function HomePage() {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/jobs')
      .then(r => setJobs(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleJobDeleted = (deletedId) => {
    setJobs(prev => prev.filter(j => j.id !== deletedId))
  }

  const filtered = jobs.filter(j =>
    j.title.toLowerCase().includes(query.toLowerCase()) ||
    (j.required_fields || '').toLowerCase().includes(query.toLowerCase())
  )

  return (
    <>
      <Helmet>
        <title>Recruitment Portal</title>
      </Helmet>

      <div className="page-wrapper">
        <Navbar />

        {/* ── HERO ── */}
        <section style={{
          background:    'linear-gradient(135deg, #1e3a5f 0%, #2563eb 60%, #1d4ed8 100%)',
          color:         '#ffffff',
          padding:       '90px 20px 80px',
          position:      'relative',
          overflow:      'hidden',
        }}>
          <div style={{
            position:     'absolute', top: -60, right: -60,
            width:        320, height: 320,
            borderRadius: '50%',
            background:   'rgba(255,255,255,0.05)',
            pointerEvents:'none',
          }} />
          <div style={{
            position:     'absolute', bottom: -80, left: -40,
            width:        260, height: 260,
            borderRadius: '50%',
            background:   'rgba(255,255,255,0.04)',
            pointerEvents:'none',
          }} />

          <div className="container" style={{ position: 'relative', zIndex: 1 }}>
            <div style={{
              display:         'inline-flex',
              alignItems:      'center',
              gap:             6,
              background:      'rgba(255,255,255,0.15)',
              border:          '1px solid rgba(255,255,255,0.3)',
              borderRadius:    99,
              padding:         '5px 14px',
              fontSize:        '.72rem',
              fontWeight:      700,
              letterSpacing:   '.08em',
              textTransform:   'uppercase',
              color:           '#ffffff',
              marginBottom:    20,
            }}>
              <Zap size={11} /> AI-Powered Shortlisting System
            </div>

            <h1 style={{
              fontSize:    'clamp(2rem, 5vw, 3rem)',
              fontWeight:  800,
              color:       '#ffffff',
              marginBottom:14,
              lineHeight:  1.15,
              maxWidth:    600,
            }}>
              Find and apply for jobs fast and fairly
            </h1>

            <p style={{
              maxWidth:    500,
              marginBottom:32,
              color:       '#bfdbfe',
              fontSize:    '1.05rem',
              lineHeight:  1.7,
            }}>
              Browse available positions and apply through a transparent, AI-powered shortlisting system.
            </p>

            <div style={{ maxWidth: 480, position: 'relative', marginBottom: 36 }}>
              <Search size={16} style={{
                position:  'absolute',
                left:      14,
                top:       '50%',
                transform: 'translateY(-50%)',
                color:     '#ecf0f7',
              }} />
              <input
                type="text"
                placeholder="Search by job title or field…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                style={{
                  width:        '100%',
                  padding:      '13px 13px 13px 42px',
                  borderRadius: 8,
                  border:       '2px solid rgba(255,255,255,0.2)',
                  background:   '#ffffff',
                  color:        '#111827',
                  fontSize:     '.95rem',
                  outline:      'none',
                  boxSizing:    'border-box',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
              {[
                { value: jobs.length || 0, label: 'Jobs Available' },
                { value: 'Fast',           label: 'Processing'     },
                { value: 'Fair',           label: 'Selection'      },
              ].map(({ value, label }) => (
                <div key={label}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ffffff' }}>{value}</div>
                  <div style={{ fontSize: '.78rem', color: '#93c5fd', fontWeight: 500, letterSpacing: '.04em', textTransform: 'uppercase' }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FEATURES STRIP ── */}
        <section style={{
          background:   '#ffffff',
          borderBottom: '1px solid #e5e7eb',
          padding:      '14px 20px',
        }}>
          <div className="container" style={{
            display:        'flex',
            justifyContent: 'center',
            gap:            40,
            flexWrap:       'wrap',
          }}>
            {[
              { icon: <Shield size={14} />,  label: 'Secure & Private' },
              { icon: <Zap size={14} />,     label: 'Automated Screening' },
              { icon: <Clock size={14} />,   label: 'Fast Results' },
            ].map(({ icon, label }) => (
              <div key={label} style={{
                display:    'flex',
                alignItems: 'center',
                gap:        7,
                color:      '#374151',
                fontSize:   '.85rem',
                fontWeight: 600,
              }}>
                <span style={{ color: '#2563eb' }}>{icon}</span>
                {label}
              </div>
            ))}
          </div>
        </section>

        {/* ── JOB LIST ── */}
        <section style={{ background: '#f9fafb', padding: '48px 20px' }}>
          <div className="container">
            <div style={{ marginBottom: 28 }}>
              <h2 style={{
                fontSize:    '1.6rem',
                fontWeight:  800,
                color:       '#111827',
                marginBottom:6,
              }}>Available Positions</h2>
              <p style={{ color: '#6b7280', fontSize: '.9rem' }}>
                {filtered.length} position{filtered.length !== 1 ? 's' : ''} found
              </p>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 60 }}>
                <div className="spinner" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="card" style={{
                textAlign: 'center',
                padding:   48,
                background:'#ffffff',
                border:    '1px solid #e5e7eb',
                borderRadius: 12,
              }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 12 }}></div>
                <h3 style={{ color: '#111827', marginBottom: 8 }}>No positions found</h3>
                <p style={{ color: '#6b7280', marginBottom: 20 }}>Try adjusting your search terms.</p>
                <button
                  style={{
                    padding:      '9px 20px',
                    borderRadius: 6,
                    border:       '1.5px solid #d1d5db',
                    background:   '#ffffff',
                    color:        '#374151',
                    fontWeight:   600,
                    cursor:       'pointer',
                    fontSize:     '.9rem',
                  }}
                  onClick={() => setQuery('')}
                >
                  Clear search
                </button>
              </div>
            ) : (
              <div style={{
                display:             'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap:                 20,
              }}>
                {filtered.map((job, i) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    index={i}
                    onDeleted={handleJobDeleted}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── HOW IT WORKS ── */}
        <section style={{ background: '#ffffff', padding: '60px 20px' }}>
          <div className="container">
            <div style={{ textAlign: 'center', marginBottom: 40 }}>
              <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#111827', marginBottom: 8 }}>
                Application Process
              </h2>
              <p style={{ color: '#6b7280', fontSize: '.95rem' }}>Four simple steps to your next opportunity</p>
            </div>

            <div style={{
              display:             'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap:                 20,
            }}>
              {[
                { step: '01', title: 'Browse Jobs',        desc: 'Find a position that matches your skills and experience.'},
                { step: '02', title: 'Submit Application',  desc: 'Fill in your details and upload the required documents.'},
                { step: '03', title: 'System Evaluation',  desc: 'Our AI reviews your application fairly and transparently.'},
                { step: '04', title: 'Receive Results',    desc: 'Get notified of your shortlisting decision with full feedback.'},
              ].map(({ step, title, desc, icon }) => (
                <div key={step} style={{
                  background:   '#f9fafb',
                  border:       '1px solid #e5e7eb',
                  borderRadius: 12,
                  padding:      '24px 20px',
                  position:     'relative',
                }}>
                  <div style={{
                    fontSize:    '2rem',
                    marginBottom:12,
                  }}>{icon}</div>
                  <div style={{
                    fontSize:    '.72rem',
                    fontWeight:  700,
                    color:       '#2563eb',
                    letterSpacing:'.08em',
                    textTransform:'uppercase',
                    marginBottom:6,
                  }}>Step {step}</div>
                  <h4 style={{
                    fontSize:    '1rem',
                    fontWeight:  700,
                    color:       '#111827',
                    marginBottom:8,
                  }}>{title}</h4>
                  <p style={{
                    fontSize:   '.85rem',
                    color:      '#6b7280',
                    lineHeight: 1.65,
                    margin:     0,
                  }}>{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section style={{
          background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
          padding:    '64px 20px',
          textAlign:  'center',
        }}>
          <h2 style={{
            fontSize:    '1.8rem',
            fontWeight:  800,
            color:       '#ffffff',
            marginBottom:10,
          }}>Ready to get started?</h2>
          <p style={{
            color:       '#bfdbfe',
            fontSize:    '1rem',
            marginBottom:32,
          }}>Create an account and apply to open positions today.</p>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              style={{
                display:      'inline-flex',
                alignItems:   'center',
                gap:          6,
                padding:      '12px 28px',
                borderRadius: 8,
                border:       'none',
                background:   '#ffffff',
                color:        '#1d4ed8',
                fontWeight:   700,
                fontSize:     '.95rem',
                cursor:       'pointer',
              }}
              onClick={() => navigate('/register')}
            >
              Register <ChevronRight size={16} />
            </button>

            <button
              style={{
                display:      'inline-flex',
                alignItems:   'center',
                gap:          6,
                padding:      '12px 28px',
                borderRadius: 8,
                border:       '2px solid rgba(255,255,255,0.5)',
                background:   'transparent',
                color:        '#ffffff',
                fontWeight:   700,
                fontSize:     '.95rem',
                cursor:       'pointer',
              }}
              onClick={() => navigate('/login')}
            >
              Login
            </button>
          </div>
        </section>

        <footer style={{
          background: '#1e293b',
          color:      '#94a3b8',
          padding:    '20px',
          textAlign:  'center',
          fontSize:   '.85rem',
        }}>
          Recruitment System {new Date().getFullYear()}
        </footer>
      </div>
    </>
  )
}