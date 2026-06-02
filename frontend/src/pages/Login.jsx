/**
 * frontend/src/pages/Login.jsx
 *
 * FIXED: Added admin role redirect to /admin.
 * Each role now routes correctly after login:
 *   admin     → /admin
 *   hr        → /hr
 *   applicant → /applicant
 */
import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import toast from 'react-hot-toast'
import Navbar from '../components/Navbar'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'

export default function Login() {
  const { login }   = useAuth()
  const navigate    = useNavigate()
  const location    = useLocation()

  const prefillEmail   = location.state?.email   || ''
  const successMessage = location.state?.message || ''

  const [form, setForm]         = useState({ email: prefillEmail, password: '' })
  const [loading, setLoading]   = useState(false)
  const [showPass, setShowPass] = useState(false)

  const handleChange = e =>
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))

  const handleSubmit = async e => {
    e.preventDefault()
    if (!form.email.trim() || !form.password) {
      toast.error('Please enter your email and password')
      return
    }
    setLoading(true)
    try {
      const { data } = await api.post('/auth/login', {
        email:    form.email.trim().toLowerCase(),
        password: form.password,
      })
      login(data)
      toast.success(`Welcome back, ${data.full_name || 'there'}!`)

      // FIXED: Route each role to the correct dashboard
      if (data.role === 'admin')     navigate('/admin',     { replace: true })
      else if (data.role === 'hr')   navigate('/hr',        { replace: true })
      else                           navigate('/applicant', { replace: true })

    } catch (err) {
      toast.error(err.response?.data?.detail || 'Invalid email or password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Helmet><title>Sign In — Shortlisting AI</title></Helmet>
      <div className="page-wrapper" style={{ background: 'var(--c-surface)' }}>
        <Navbar />

        <div style={{ flex: 1, display: 'flex', alignItems: 'stretch', minHeight: 'calc(100vh - 70px)' }}>

          {/* ── Left: vivid blue hero panel ── */}
          <div style={{
            flex: '0 0 42%',
            background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 60%, #1d4ed8 100%)',
            color: '#ffffff',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '64px 60px',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* Top accent bar */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #60a5fa, #34d399)' }} />
            {/* Decorative grid */}
            <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px)', backgroundSize: '40px 40px', pointerEvents: 'none' }} />
            {/* Decorative circles */}
            <div style={{ position: 'absolute', top: -80, right: -60, width: 380, height: 380, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,.08) 0%, transparent 68%)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: -60, left: -40, width: 280, height: 280, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />

            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'rgba(255,255,255,0.15)',
                border: '1px solid rgba(255,255,255,0.3)',
                borderRadius: 99,
                padding: '5px 14px',
                fontSize: '.72rem', fontWeight: 700,
                letterSpacing: '.08em', textTransform: 'uppercase',
                color: '#ffffff', marginBottom: 24,
              }}>
                Welcome Back
              </div>

              <h2 style={{
                fontSize: 'clamp(1.8rem, 3vw, 2.6rem)',
                fontWeight: 800,
                color: '#ffffff',
                lineHeight: 1.1,
                marginBottom: 20,
              }}>
                Sign in to your<br />account
              </h2>

              <div style={{ width: 56, height: 3, background: 'linear-gradient(90deg, #60a5fa, #34d399)', marginBottom: 28, borderRadius: 2 }} />

              <p style={{
                fontSize: '1rem',
                color: '#bfdbfe',
                lineHeight: 1.8,
                maxWidth: 340,
                marginBottom: 48,
              }}>
                Access your applications, track AI shortlisting results, and continue your career journey.
              </p>

              {/* Stat blocks */}
              <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
                {[['99.8%', 'AI Accuracy'], ['< 1 min', 'Decision Time']].map(([v, l]) => (
                  <div key={l}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ffffff', lineHeight: 1 }}>{v}</div>
                    <div style={{ fontSize: '.78rem', color: '#93c5fd', fontWeight: 500, letterSpacing: '.04em', textTransform: 'uppercase', marginTop: 4 }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Right: form panel ── */}
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px 40px',
            background: '#ffffff',
          }}>
            <div style={{ width: '100%', maxWidth: 400 }} className="fade-up">

              {successMessage && (
                <div style={{
                  background: 'var(--c-green-lt)',
                  border: '2px solid rgba(10,124,62,.25)',
                  borderRadius: 8,
                  padding: '12px 16px',
                  marginBottom: 28,
                  fontSize: '.9rem',
                  color: 'var(--c-green)',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  ✓ {successMessage}
                </div>
              )}

              <h1 style={{
                fontSize: '1.9rem',
                fontWeight: 800,
                color: '#111827',
                marginBottom: 6,
              }}>
                Sign In
              </h1>
              <div style={{ width: 44, height: 3, background: 'linear-gradient(90deg, #2563eb, #34d399)', marginBottom: 14, borderRadius: 2 }} />
              <p style={{ fontSize: '.95rem', color: '#6b7280', marginBottom: 36 }}>
                Don't have an account?{' '}
                <Link to="/register" style={{ color: '#2563eb', fontWeight: 700 }}>Create one</Link>
              </p>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '.9rem', fontWeight: 700,
                    color: '#374151',
                    marginBottom: 7,
                  }}>
                    Email Address
                  </label>
                  <input
                    className="form-input"
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="you@example.com"
                    autoComplete="email"
                    autoFocus={!prefillEmail}
                    required
                    style={{ color: '#111827', fontSize: '.95rem' }}
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
                    <label style={{ fontSize: '.9rem', fontWeight: 700, color: '#374151' }}>
                      Password
                    </label>
                    <Link
                      to="/forgot-password"
                      style={{ fontSize: '.82rem', color: '#2563eb', fontWeight: 600 }}
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <input
                      className="form-input"
                      type={showPass ? 'text' : 'password'}
                      name="password"
                      value={form.password}
                      onChange={handleChange}
                      placeholder="Your password"
                      autoComplete="current-password"
                      autoFocus={!!prefillEmail}
                      required
                      style={{ paddingRight: 60, color: '#111827', fontSize: '.95rem' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(v => !v)}
                      style={{
                        position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: '.8rem', fontWeight: 700, color: '#2563eb', letterSpacing: '.04em',
                      }}
                    >
                      {showPass ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                  style={{ justifyContent: 'center', width: '100%', marginTop: 8, fontSize: '1rem', padding: '14px 0' }}
                >
                  {loading
                    ? <><div className="spinner" style={{ width: 16, height: 16, borderColor: 'rgba(255,255,255,.3)', borderTopColor: '#fff' }} /> Signing in…</>
                    : 'Sign In'
                  }
                </button>
              </form>

              <p style={{
                textAlign: 'center',
                fontSize: '.82rem',
                color: '#9ca3af',
                marginTop: 28,
                lineHeight: 1.6,
              }}>
                By signing in, you agree to our terms of use.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
