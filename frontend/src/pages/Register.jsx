import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import toast from 'react-hot-toast'
import Navbar from '../components/Navbar'
import api from '../api/axios'

export default function Register() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    full_name: '', email: '', password: '', confirm: '', role: 'applicant',
  })
  const [loading,  setLoading]  = useState(false)
  const [showPass, setShowPass] = useState(false)

  const handleChange = e => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))

  const validate = () => {
    if (!form.full_name.trim() || form.full_name.trim().length < 2) { toast.error('Full name must be at least 2 characters'); return false }
    if (!form.email.trim()) { toast.error('Please enter your email address'); return false }
    if (form.password.length < 8) { toast.error('Password must be at least 8 characters'); return false }
    if (!/[A-Z]/.test(form.password)) { toast.error('Password must contain at least one uppercase letter'); return false }
    if (!/[a-z]/.test(form.password)) { toast.error('Password must contain at least one lowercase letter'); return false }
    if (!/\d/.test(form.password)) { toast.error('Password must contain at least one number'); return false }
    if (!/[^A-Za-z0-9]/.test(form.password)) { toast.error('Password must contain at least one special character'); return false }
    if (form.password !== form.confirm) { toast.error('Passwords do not match'); return false }
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
      })
      toast.success('Account created! Please log in.', { duration: 5000 })
      navigate('/login', {
        replace: true,
        state: { email: form.email.trim().toLowerCase(), message: 'Registration successful. Please sign in.' },
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
      <div className="page-wrapper" style={{ background: 'var(--c-surface)' }}>
        <Navbar />

        <div style={{ flex: 1, display: 'flex', alignItems: 'stretch', minHeight: 'calc(100vh - 68px)' }}>

          {/* ── Left hero panel ── */}
          <div style={{
            flex: '0 0 38%',
            background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 60%, #1d4ed8 100%)',
            color: '#ffffff',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '60px 52px',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* Top accent bar */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #60a5fa, #34d399)' }} />
            {/* Grid overlay */}
            <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px)', backgroundSize: '36px 36px', pointerEvents: 'none' }} />
            {/* Decorative circles */}
            <div style={{ position: 'absolute', top: -60, right: -40, width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: -80, left: -40, width: 260, height: 260, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />

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
                Join Us
              </div>

              <h2 style={{
                fontSize: 'clamp(1.8rem, 3vw, 2.4rem)',
                fontWeight: 800,
                color: '#ffffff',
                lineHeight: 1.1,
                marginBottom: 20,
              }}>
                Create your<br />account
              </h2>

              <div style={{ width: 44, height: 3, background: 'linear-gradient(90deg, #60a5fa, #34d399)', marginBottom: 24, borderRadius: 2 }} />

              <p style={{
                fontSize: '1rem',
                color: '#bfdbfe',
                lineHeight: 1.8,
                maxWidth: 320,
                marginBottom: 40,
              }}>
                Register as a job applicant to apply to open positions, or as an HR professional to manage recruitment.
              </p>

              {/* Stats */}
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
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px 40px',
            background: '#ffffff',
            overflowY: 'auto',
          }}>
            <div style={{ width: '100%', maxWidth: 420 }} className="fade-up">

              <h1 style={{
                fontSize: '1.8rem',
                fontWeight: 800,
                color: '#111827',
                marginBottom: 6,
              }}>
                Register
              </h1>
              <div style={{ width: 44, height: 3, background: 'linear-gradient(90deg, #2563eb, #34d399)', marginBottom: 14, borderRadius: 2 }} />
              <p style={{ fontSize: '.95rem', color: '#6b7280', marginBottom: 32 }}>
                Already have an account?{' '}
                <Link to="/login" style={{ color: '#2563eb', fontWeight: 700 }}>Sign in</Link>
              </p>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                {[
                  { key: 'full_name', label: 'Full Name',     type: 'text',  placeholder: 'e.g. Gertrude Irimaso' },
                  { key: 'email',     label: 'Email Address', type: 'email', placeholder: 'you@example.com' },
                ].map(({ key, label, type, placeholder }) => (
                  <div key={key}>
                    <label style={{
                      display: 'block',
                      fontSize: '.9rem', fontWeight: 700,
                      color: '#374151',
                      marginBottom: 7,
                    }}>
                      {label}
                    </label>
                    <input
                      className="form-input"
                      type={type}
                      name={key}
                      value={form[key]}
                      onChange={handleChange}
                      placeholder={placeholder}
                      required
                      style={{ color: '#111827', fontSize: '.95rem' }}
                    />
                  </div>
                ))}

                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '.9rem', fontWeight: 700,
                    color: '#374151',
                    marginBottom: 7,
                  }}>
                    I am registering as
                  </label>
                  <select
                    className="form-select"
                    name="role"
                    value={form.role}
                    onChange={handleChange}
                    style={{ color: '#111827', fontSize: '.95rem' }}
                  >
                    <option value="applicant">Job Applicant</option>
                    <option value="hr">HR / Recruiter</option>
                  </select>
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '.9rem', fontWeight: 700,
                    color: '#374151',
                    marginBottom: 7,
                  }}>
                    Password
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      className="form-input"
                      type={showPass ? 'text' : 'password'}
                      name="password"
                      value={form.password}
                      onChange={handleChange}
                      placeholder="Min 8 chars, uppercase, number, special"
                      autoComplete="new-password"
                      required
                      style={{ paddingRight: 56, color: '#111827', fontSize: '.95rem' }}
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
                  <div style={{ fontSize: '.78rem', color: '#6b7280', marginTop: 5, lineHeight: 1.5 }}>
                    Must contain: uppercase, lowercase, number, special character
                  </div>
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '.9rem', fontWeight: 700,
                    color: '#374151',
                    marginBottom: 7,
                  }}>
                    Confirm Password
                  </label>
                  <input
                    className="form-input"
                    type={showPass ? 'text' : 'password'}
                    name="confirm"
                    value={form.confirm}
                    onChange={handleChange}
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                    required
                    style={{
                      color: '#111827',
                      fontSize: '.95rem',
                      borderColor: form.confirm && form.confirm !== form.password ? 'var(--c-red)' : undefined,
                    }}
                  />
                  {form.confirm && form.confirm !== form.password && (
                    <div style={{ fontSize: '.78rem', color: 'var(--c-red)', marginTop: 4 }}>Passwords do not match</div>
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
                    : 'Create Account'
                  }
                </button>
              </form>

              <p style={{
                textAlign: 'center',
                fontSize: '.82rem',
                color: '#9ca3af',
                marginTop: 22,
                lineHeight: 1.6,
              }}>
                By creating an account, you agree to our terms of use.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
