import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import toast from 'react-hot-toast'
import Navbar from '../components/Navbar'
import api from '../api/axios'

/* ── Request Invite Code Modal ── */
function RequestInviteModal({ onClose }) {
  const [form, setForm]       = useState({ full_name: '', email: '' })
  const [loading, setLoading] = useState(false)
  const [sent, setSent]       = useState(false)

  const handleSubmit = async () => {
    if (!form.full_name.trim() || form.full_name.trim().length < 2) {
      toast.error('Please enter your full name'); return
    }
    if (!form.email.trim()) {
      toast.error('Please enter your email address'); return
    }
    setLoading(true)
    try {
      await api.post('/auth/request-hr-invite', {
        full_name: form.full_name.trim(),
        email:     form.email.trim().toLowerCase(),
      })
      setSent(true)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Request failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(10,12,20,.65)', backdropFilter: 'blur(5px)',
        zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px 16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#ffffff', borderRadius: 14,
          width: '100%', maxWidth: 440,
          boxShadow: '0 28px 72px rgba(10,15,40,.20)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '22px 28px',
          background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '1.5rem' }}>🔐</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: '#fff' }}>
                Request HR Invite Code
              </div>
              <div style={{ fontSize: '.75rem', color: '#bfdbfe' }}>
                We'll email it to you instantly
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.15)', border: 'none',
              borderRadius: 6, width: 30, height: 30, cursor: 'pointer',
              color: '#fff', fontSize: '1rem', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '28px' }}>
          {sent ? (
            /* Success state */
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <div style={{ fontSize: '3rem', marginBottom: 16 }}>📬</div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#111827', marginBottom: 8 }}>
                Invite Code Sent!
              </h3>
              <p style={{ fontSize: '.9rem', color: '#6b7280', lineHeight: 1.7, marginBottom: 24 }}>
                Check your inbox at <strong>{form.email}</strong>. The invite code
                should arrive within a minute. Also check your spam folder.
              </p>
              <button
                onClick={onClose}
                style={{
                  padding: '10px 28px', borderRadius: 6,
                  background: '#2563eb', border: 'none',
                  color: '#fff', fontWeight: 700, fontSize: '.9rem',
                  cursor: 'pointer',
                }}
              >
                Got it, close
              </button>
            </div>
          ) : (
            /* Form state */
            <>
              <p style={{ fontSize: '.9rem', color: '#6b7280', lineHeight: 1.7, marginBottom: 22 }}>
                Enter your name and email below. We'll send your HR invite code immediately
                so you can complete registration.
              </p>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: '.85rem', fontWeight: 700, color: '#374151', marginBottom: 6 }}>
                  Full Name
                </label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="e.g. Jean Claude Habimana"
                  value={form.full_name}
                  onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
                  style={{ width: '100%', boxSizing: 'border-box', color: '#111827' }}
                />
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontSize: '.85rem', fontWeight: 700, color: '#374151', marginBottom: 6 }}>
                  Email Address
                </label>
                <input
                  className="form-input"
                  type="email"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  style={{ width: '100%', boxSizing: 'border-box', color: '#111827' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={onClose}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: 6,
                    background: '#f9fafb', border: '1px solid #e5e7eb',
                    color: '#374151', fontWeight: 600, fontSize: '.9rem',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  style={{
                    flex: 2, padding: '10px 0', borderRadius: 6,
                    background: loading ? '#93c5fd' : '#2563eb',
                    border: 'none', color: '#fff',
                    fontWeight: 700, fontSize: '.9rem',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  {loading
                    ? <><div className="spinner" style={{ width: 14, height: 14, borderColor: 'rgba(255,255,255,.3)', borderTopColor: '#fff' }} /> Sending…</>
                    : '📧 Send Invite Code'
                  }
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Main Register page ── */
export default function Register() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    full_name: '', email: '', password: '', confirm: '',
    role: 'applicant', hr_code: '',
  })
  const [loading,           setLoading]           = useState(false)
  const [showPass,          setShowPass]           = useState(false)
  const [showCode,          setShowCode]           = useState(false)
  const [showInviteModal,   setShowInviteModal]    = useState(false)

  const isHR = form.role === 'hr'

  const handleChange = e => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))

  const validate = () => {
    if (!form.full_name.trim() || form.full_name.trim().length < 2) {
      toast.error('Full name must be at least 2 characters'); return false
    }
    if (!form.email.trim()) {
      toast.error('Please enter your email address'); return false
    }
    if (form.password.length < 8) {
      toast.error('Password must be at least 8 characters'); return false
    }
    if (!/[A-Z]/.test(form.password)) {
      toast.error('Password must contain at least one uppercase letter'); return false
    }
    if (!/[a-z]/.test(form.password)) {
      toast.error('Password must contain at least one lowercase letter'); return false
    }
    if (!/\d/.test(form.password)) {
      toast.error('Password must contain at least one number'); return false
    }
    if (!/[^A-Za-z0-9]/.test(form.password)) {
      toast.error('Password must contain at least one special character'); return false
    }
    if (form.password !== form.confirm) {
      toast.error('Passwords do not match'); return false
    }
    if (isHR && !form.hr_code.trim()) {
      toast.error('Please enter the HR invite code'); return false
    }
    return true
  }

  const handleSubmit = async e => {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    try {
      await api.post('/auth/register', {
        full_name: form.full_name.trim(),
        email:     form.email.trim().toLowerCase(),
        password:  form.password,
        role:      form.role,
        hr_code:   isHR ? form.hr_code.trim() : undefined,
      })
      toast.success('Account created! Please log in.', { duration: 5000 })
      navigate('/login', {
        replace: true,
        state: {
          email:   form.email.trim().toLowerCase(),
          message: 'Registration successful. Please sign in.',
        },
      })
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Helmet><title>Create Account — Shortlisting AI</title></Helmet>

      {showInviteModal && (
        <RequestInviteModal onClose={() => setShowInviteModal(false)} />
      )}

      <div className="page-wrapper" style={{ background: 'var(--c-surface)' }}>
        <Navbar />

        <div style={{ flex: 1, display: 'flex', alignItems: 'stretch', minHeight: 'calc(100vh - 68px)' }}>

          {/* ── Left hero panel ── */}
          <div style={{
            flex: '0 0 38%',
            background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 60%, #1d4ed8 100%)',
            color: '#ffffff',
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            padding: '60px 52px', position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #60a5fa, #34d399)' }} />
            <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px)', backgroundSize: '36px 36px', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', top: -60, right: -40, width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: -80, left: -40, width: 260, height: 260, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />

            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
                borderRadius: 99, padding: '5px 14px', fontSize: '.72rem', fontWeight: 700,
                letterSpacing: '.08em', textTransform: 'uppercase', color: '#ffffff', marginBottom: 24,
              }}>
                Join Us
              </div>

              <h2 style={{ fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', fontWeight: 800, color: '#ffffff', lineHeight: 1.1, marginBottom: 20 }}>
                Create your<br />account
              </h2>

              <div style={{ width: 44, height: 3, background: 'linear-gradient(90deg, #60a5fa, #34d399)', marginBottom: 24, borderRadius: 2 }} />

              <p style={{ fontSize: '1rem', color: '#bfdbfe', lineHeight: 1.8, maxWidth: 320, marginBottom: 40 }}>
                Register as a job applicant to apply for open positions. HR professionals need an invite code from the administrator.
              </p>

              <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
                {[['Fast', 'Processing'], ['Fair', 'Selection'], ['AI', 'Powered']].map(([v, l]) => (
                  <div key={l}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ffffff', lineHeight: 1 }}>{v}</div>
                    <div style={{ fontSize: '.78rem', color: '#93c5fd', fontWeight: 500, letterSpacing: '.04em', textTransform: 'uppercase', marginTop: 4 }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Right: form ── */}
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '60px 40px', background: '#ffffff', overflowY: 'auto',
          }}>
            <div style={{ width: '100%', maxWidth: 420 }} className="fade-up">

              <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#111827', marginBottom: 6 }}>
                Register
              </h1>
              <div style={{ width: 44, height: 3, background: 'linear-gradient(90deg, #2563eb, #34d399)', marginBottom: 14, borderRadius: 2 }} />
              <p style={{ fontSize: '.95rem', color: '#6b7280', marginBottom: 32 }}>
                Already have an account?{' '}
                <Link to="/login" style={{ color: '#2563eb', fontWeight: 700 }}>Sign in</Link>
              </p>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* Full Name */}
                <div>
                  <label style={{ display: 'block', fontSize: '.9rem', fontWeight: 700, color: '#374151', marginBottom: 7 }}>
                    Full Name
                  </label>
                  <input
                    className="form-input" type="text" name="full_name"
                    value={form.full_name} onChange={handleChange}
                    placeholder="e.g. ITUZE Nicole" required
                    style={{ color: '#111827', fontSize: '.95rem' }}
                  />
                </div>

                {/* Email */}
                <div>
                  <label style={{ display: 'block', fontSize: '.9rem', fontWeight: 700, color: '#374151', marginBottom: 7 }}>
                    Email Address
                  </label>
                  <input
                    className="form-input" type="email" name="email"
                    value={form.email} onChange={handleChange}
                    placeholder="e.g nicole35@gmail.com" required
                    style={{ color: '#111827', fontSize: '.95rem' }}
                  />
                </div>

                {/* Role selector */}
                <div>
                  <label style={{ display: 'block', fontSize: '.9rem', fontWeight: 700, color: '#374151', marginBottom: 7 }}>
                    I am registering as
                  </label>
                  <select
                    className="form-select" name="role"
                    value={form.role} onChange={handleChange}
                    style={{ color: '#111827', fontSize: '.95rem' }}
                  >
                    <option value="applicant">Job Applicant</option>
                    <option value="hr">HR / Recruiter</option>
                  </select>
                </div>

                {/* HR invite code — only shown when HR is selected */}
                {isHR && (
                  <div style={{
                    background: '#fefce8', border: '1.5px solid #fde68a',
                    borderRadius: 10, padding: '16px 18px',
                    display: 'flex', flexDirection: 'column', gap: 10,
                  }}>
                    {/* Warning banner */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>🔐</span>
                      <div>
                        <div style={{ fontSize: '.88rem', fontWeight: 700, color: '#92400e', marginBottom: 2 }}>
                          HR Account — Invite Code Required
                        </div>
                        <div style={{ fontSize: '.8rem', color: '#a16207', lineHeight: 1.5 }}>
                          HR accounts have full access to candidate data and shortlisting tools.
                          An invite code from your system administrator is required.
                        </div>
                      </div>
                    </div>

                    {/* Code input */}
                    <div>
                      <label style={{ display: 'block', fontSize: '.88rem', fontWeight: 700, color: '#374151', marginBottom: 6 }}>
                        HR Invite Code
                      </label>
                      <div style={{ position: 'relative' }}>
                        <input
                          className="form-input"
                          type={showCode ? 'text' : 'password'}
                          name="hr_code"
                          value={form.hr_code}
                          onChange={handleChange}
                          placeholder="Enter your invite code"
                          autoComplete="off"
                          style={{
                            color: '#111827', fontSize: '.95rem',
                            paddingRight: 60, borderColor: '#fbbf24', background: '#fffbeb',
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowCode(v => !v)}
                          style={{
                            position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                            background: 'none', border: 'none', cursor: 'pointer',
                            fontSize: '.8rem', fontWeight: 700, color: '#d97706', letterSpacing: '.04em',
                          }}
                        >
                          {showCode ? 'Hide' : 'Show'}
                        </button>
                      </div>
                    </div>

                    {/* ✅ NEW: Request invite code by email button */}
                    <button
                      type="button"
                      onClick={() => setShowInviteModal(true)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        padding: '9px 14px', borderRadius: 7,
                        background: '#fffbeb', border: '1.5px solid #fbbf24',
                        color: '#92400e', fontSize: '.82rem', fontWeight: 700,
                        cursor: 'pointer', transition: 'all .15s',
                        width: '100%',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#fef3c7' }}
                      onMouseLeave={e => { e.currentTarget.style.background = '#fffbeb' }}
                    >
                      📧 Don't have a code? Request it by email
                    </button>
                  </div>
                )}

                {/* Password */}
                <div>
                  <label style={{ display: 'block', fontSize: '.9rem', fontWeight: 700, color: '#374151', marginBottom: 7 }}>
                    Password
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      className="form-input"
                      type={showPass ? 'text' : 'password'}
                      name="password" value={form.password} onChange={handleChange}
                      placeholder="Min 8 chars, uppercase, number, special"
                      autoComplete="new-password" required
                      style={{ paddingRight: 56, color: '#111827', fontSize: '.95rem' }}
                    />
                    <button
                      type="button" onClick={() => setShowPass(v => !v)}
                      style={{
                        position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: '.8rem', fontWeight: 700, color: '#2563eb', letterSpacing: '.04em',
                      }}
                    >
                      {showPass ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <div style={{ fontSize: '.78rem', color: '#6b7280', marginTop: 5, lineHeight: 1.5 }}>
                    Must contain: uppercase, lowercase, number, special character
                  </div>
                </div>

                {/* Confirm Password */}
                <div>
                  <label style={{ display: 'block', fontSize: '.9rem', fontWeight: 700, color: '#374151', marginBottom: 7 }}>
                    Confirm Password
                  </label>
                  <input
                    className="form-input"
                    type={showPass ? 'text' : 'password'}
                    name="confirm" value={form.confirm} onChange={handleChange}
                    placeholder="Re-enter your password"
                    autoComplete="new-password" required
                    style={{
                      color: '#111827', fontSize: '.95rem',
                      borderColor: form.confirm && form.confirm !== form.password ? 'var(--c-red)' : undefined,
                    }}
                  />
                  {form.confirm && form.confirm !== form.password && (
                    <div style={{ fontSize: '.78rem', color: 'var(--c-red)', marginTop: 4 }}>
                      Passwords do not match
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                  style={{ justifyContent: 'center', width: '100%', marginTop: 4, fontSize: '1rem', padding: '13px 0' }}
                >
                  {loading
                    ? <><div className="spinner" style={{ width: 16, height: 16, borderColor: 'rgba(255,255,255,.3)', borderTopColor: '#fff' }} /> Creating account…</>
                    : isHR ? '🔐 Create HR Account' : 'Create Account'
                  }
                </button>
              </form>

              <p style={{ textAlign: 'center', fontSize: '.82rem', color: '#9ca3af', marginTop: 22, lineHeight: 1.6 }}>
                By creating an account, you agree to our terms of use.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
