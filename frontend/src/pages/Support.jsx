import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import toast from 'react-hot-toast'

const isEmailValid = (value) => typeof value === 'string' && /.+@.+\..+/.test(value)

export default function Support() {
  const { user } = useAuth()
  const [name, setName] = useState(user?.fullName || '')
  const [email, setEmail] = useState(user?.email || '')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async () => {
    const trimmedSubject = subject.trim()
    const trimmedMessage = message.trim()
    const trimmedEmail = email.trim()
    const trimmedName = name.trim() || (user?.fullName || '')

    if (!trimmedSubject) {
      return toast.error('Please enter a subject for your support request.')
    }
    if (trimmedMessage.length < 15) {
      return toast.error('Support messages must be at least 15 characters.')
    }
    if (!user && !isEmailValid(trimmedEmail)) {
      return toast.error('Please provide a valid email address so we can reply.')
    }

    setLoading(true)
    try {
      await api.post('/support', {
        subject: trimmedSubject,
        message: trimmedMessage,
        name: trimmedName || undefined,
        email: trimmedEmail || undefined,
      })
      setSubmitted(true)
      toast.success('Support request submitted. We will respond soon.')
    } catch (err) {
      const detail = err.response?.data?.detail || err.message || 'Could not submit support request.'
      toast.error(detail)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Helmet>
        <title>Support & Help</title>
      </Helmet>

      <div className="page-wrapper">
        <Navbar />

        <section style={{ background: '#f8fafc', padding: '60px 20px 80px' }}>
          <div className="container" style={{ maxWidth: 900 }}>
            <div style={{ display: 'grid', gap: 24 }}>
              <div style={{ padding: 24, background: '#ffffff', borderRadius: 18, border: '1px solid #e5e7eb' }}>
                <p style={{ margin: 0, color: '#2563eb', fontWeight: 700, fontSize: '.82rem', textTransform: 'uppercase', letterSpacing: '.08em' }}>
                  Support Center
                </p>
                <h1 style={{ margin: '14px 0 0', fontSize: '2rem', color: '#111827', lineHeight: 1.1 }}>
                  Need help? Contact our support team.
                </h1>
                <p style={{ color: '#475569', marginTop: 12, fontSize: '1rem', lineHeight: 1.75 }}>
                  If you have a question about your account, application, or the system, submit a support request and our team will get back to you shortly.
                </p>
              </div>

              <div style={{ display: 'grid', gap: 20 }}>
                {submitted ? (
                  <div style={{ padding: 32, background: '#eff6ff', borderRadius: 18, border: '1px solid #bfdbfe', textAlign: 'center' }}>
                    <h2 style={{ margin: 0, color: '#1d4ed8', fontSize: '1.75rem' }}>Request submitted</h2>
                    <p style={{ color: '#334155', margin: '18px 0 0', fontSize: '1rem', lineHeight: 1.7 }}>
                      We received your request and will reply as soon as possible. In the meantime, you can return to the <Link to="/" style={{ color: '#2563eb', fontWeight: 700 }}>home page</Link>.
                    </p>
                  </div>
                ) : (
                  <div style={{ background: '#ffffff', borderRadius: 18, border: '1px solid #e5e7eb', padding: 28 }}>
                    <div style={{ display: 'grid', gap: 18 }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: 6, fontWeight: 700, color: '#0f172a' }}>
                          Subject
                        </label>
                        <input
                          type="text"
                          value={subject}
                          onChange={e => setSubject(e.target.value)}
                          placeholder="What do you need help with?"
                          style={{ width: '100%', padding: '14px 16px', borderRadius: 12, border: '1.5px solid #d1d5db', fontSize: '.95rem', outline: 'none' }}
                        />
                      </div>

                      {!user && (
                        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: '1fr 1fr' }}>
                          <div>
                            <label style={{ display: 'block', marginBottom: 6, fontWeight: 700, color: '#0f172a' }}>
                              Your name
                            </label>
                            <input
                              type="text"
                              value={name}
                              onChange={e => setName(e.target.value)}
                              placeholder="Full name"
                              style={{ width: '100%', padding: '14px 16px', borderRadius: 12, border: '1.5px solid #d1d5db', fontSize: '.95rem', outline: 'none' }}
                            />
                          </div>
                          <div>
                            <label style={{ display: 'block', marginBottom: 6, fontWeight: 700, color: '#0f172a' }}>
                              Email address
                            </label>
                            <input
                              type="email"
                              value={email}
                              onChange={e => setEmail(e.target.value)}
                              placeholder="you@example.com"
                              style={{ width: '100%', padding: '14px 16px', borderRadius: 12, border: '1.5px solid #d1d5db', fontSize: '.95rem', outline: 'none' }}
                            />
                          </div>
                        </div>
                      )}

                      <div>
                        <label style={{ display: 'block', marginBottom: 6, fontWeight: 700, color: '#0f172a' }}>
                          Message
                        </label>
                        <textarea
                          value={message}
                          onChange={e => setMessage(e.target.value)}
                          rows={7}
                          placeholder="Tell us what happened and how we can help."
                          style={{ width: '100%', padding: '14px 16px', borderRadius: 12, border: '1.5px solid #d1d5db', fontSize: '.95rem', outline: 'none', minHeight: 180, resize: 'vertical' }}
                        />
                        <p style={{ margin: '10px 0 0', color: '#64748b', fontSize: '.83rem' }}>
                          Provide as much detail as possible so our support team can respond faster.
                        </p>
                      </div>

                      <button
                        onClick={handleSubmit}
                        disabled={loading}
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          padding: '14px 24px', borderRadius: 12, border: 'none',
                          background: loading ? '#c7d2fe' : 'linear-gradient(135deg, #2563eb, #4f46e5)',
                          color: '#ffffff', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
                          fontSize: '.95rem', transition: 'transform .15s',
                        }}
                      >
                        {loading ? 'Sending request…' : 'Send support request'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
