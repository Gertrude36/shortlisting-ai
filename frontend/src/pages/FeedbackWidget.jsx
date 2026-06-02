import { useState, useEffect } from 'react'
import { MessageSquare, X, Star, Send, CheckCircle, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'

const CATEGORIES = [
  { value: 'ui',           label: 'UI / Design' },
  { value: 'shortlisting', label: 'Shortlisting' },
  { value: 'documents',    label: 'Documents' },
  { value: 'speed',        label: 'Speed' },
  { value: 'other',        label: 'Other' },
]

const spinnerStyle = {
  width: 14, height: 14,
  border: '2px solid rgba(124,58,237,0.25)',
  borderTop: '2px solid #7c3aed',
  borderRadius: '50%',
  animation: 'fw-spin 0.7s linear infinite',
  flexShrink: 0,
}

if (typeof document !== 'undefined' && !document.getElementById('fw-spin-kf')) {
  const s = document.createElement('style')
  s.id = 'fw-spin-kf'
  s.textContent = '@keyframes fw-spin { to { transform: rotate(360deg); } }'
  document.head.appendChild(s)
}

const FEEDBACK_ALLOWED_ROLES = ['applicant', 'admin', 'hr']

// Helper to save feedback locally when server is unavailable
const saveFeedbackToLocalStorage = (feedback) => {
  try {
    const existing = JSON.parse(localStorage.getItem('pending_feedback') || '[]')
    existing.push({ ...feedback, timestamp: Date.now() })
    localStorage.setItem('pending_feedback', JSON.stringify(existing))
    return true
  } catch (e) {
    console.error('Failed to save feedback locally:', e)
    return false
  }
}

// Helper to retry sending pending feedback (call on app start)
export const retryPendingFeedback = async () => {
  try {
    const pending = JSON.parse(localStorage.getItem('pending_feedback') || '[]')
    if (pending.length === 0) return
    const token = localStorage.getItem('token') || sessionStorage.getItem('token')
    const headers = token ? { Authorization: `Bearer ${token}` } : {}
    const remaining = []
    for (const fb of pending) {
      try {
        await api.post('/feedback', {
          rating: fb.rating,
          category: fb.category,
          message: fb.message,
          anonymous: fb.anonymous,
        }, { headers })
        // Success – do not keep
      } catch (err) {
        // Keep failed ones
        remaining.push(fb)
      }
    }
    localStorage.setItem('pending_feedback', JSON.stringify(remaining))
    if (remaining.length === 0 && pending.length > 0) {
      toast.success('All pending feedback has been submitted!')
    } else if (remaining.length < pending.length) {
      toast.success(`Submitted ${pending.length - remaining.length} pending feedback items.`)
    }
  } catch (e) {
    console.error('Failed to retry pending feedback:', e)
  }
}

export default function FeedbackWidget() {
  const { user } = useAuth()

  const [open,      setOpen]      = useState(false)
  const [rating,    setRating]    = useState(0)
  const [hovered,   setHovered]   = useState(0)
  const [category,  setCategory]  = useState('')
  const [message,   setMessage]   = useState('')
  const [anonymous, setAnonymous] = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [submitted, setSubmitted] = useState(false)

  // Early returns after all hooks
  if (!user) return null
  if (!FEEDBACK_ALLOWED_ROLES.includes(user.role)) return null

  const reset = () => {
    setRating(0); setHovered(0); setCategory(''); setMessage('')
    setAnonymous(false); setSubmitted(false)
  }

  const handleClose = () => { setOpen(false); setTimeout(reset, 300) }

  const handleSubmit = async () => {
    if (!rating)                    { toast.error('Please choose a star rating.');             return }
    if (!category)                  { toast.error('Please select a category.');                return }
    if (!message.trim())            { toast.error('Please write a short message.');            return }
    if (message.trim().length < 10) { toast.error('Message must be at least 10 characters.'); return }

    setLoading(true)
    const payload = { rating, category, message: message.trim(), anonymous }
    const token = localStorage.getItem('token') || sessionStorage.getItem('token')
    const headers = token ? { Authorization: `Bearer ${token}` } : {}

    try {
      console.log('[FeedbackWidget] submitting to POST /feedback', payload)
      await api.post('/feedback', payload, { headers })
      console.log('[FeedbackWidget] submission succeeded')
      setSubmitted(true)
      toast.success('Thank you for your feedback!')
    } catch (err) {
      console.error('[FeedbackWidget] submission failed:', {
        status:  err.response?.status,
        detail:  err.response?.data?.detail,
        data:    err.response?.data,
        message: err.message,
      })
      const status = err.response?.status
      // If endpoint missing (404) or any network error, save locally
      if (status === 404 || err.code === 'ERR_NETWORK' || err.message?.includes('Network Error')) {
        const saved = saveFeedbackToLocalStorage(payload)
        if (saved) {
          toast.success('Feedback saved locally. It will be submitted when the server is available.')
          setSubmitted(true)  // Show thank you screen anyway
        } else {
          toast.error('Could not save feedback locally. Please try again later.')
        }
      } else {
        const detail = err.response?.data?.detail
        const msg = Array.isArray(detail)
          ? detail.map(d => d.msg || JSON.stringify(d)).join(' · ')
          : detail || err.message || 'Could not submit feedback. Please try again.'
        toast.error(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  const activeRating  = hovered || rating
  const msgLen        = message.trim().length
  const msgLenOk      = msgLen >= 10
  const msgLenStarted = msgLen > 0

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Share feedback"
        style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 9000,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 18px', borderRadius: 99,
          background: 'linear-gradient(135deg, #db2777, #7c3aed)',
          border: 'none', color: '#fff', fontWeight: 700, fontSize: '.88rem',
          cursor: 'pointer', boxShadow: '0 4px 20px rgba(219,39,119,.35)',
          transition: 'transform .15s, box-shadow .15s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform = 'translateY(-2px)'
          e.currentTarget.style.boxShadow = '0 8px 28px rgba(219,39,119,.45)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'none'
          e.currentTarget.style.boxShadow = '0 4px 20px rgba(219,39,119,.35)'
        }}
      >
        <MessageSquare size={16} /> Feedback
      </button>

      {open && (
        <div
          onClick={handleClose}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(10,12,20,.65)', backdropFilter: 'blur(4px)',
            zIndex: 9500, display: 'flex', alignItems: 'center',
            justifyContent: 'center', padding: '24px 16px',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 16, width: '100%', maxWidth: 460,
              boxShadow: '0 28px 72px rgba(10,15,40,.25)', overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{
              padding: '20px 24px',
              background: 'linear-gradient(135deg, #7c3aed 0%, #db2777 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: 'rgba(255,255,255,.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <MessageSquare size={18} color="#fff" />
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '1rem', color: '#fff' }}>
                    Share Your Feedback
                  </div>
                  <div style={{ fontSize: '.78rem', color: 'rgba(255,255,255,.75)' }}>
                    Help us improve the platform
                  </div>
                </div>
              </div>
              <button
                onClick={handleClose}
                style={{
                  background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: 6,
                  width: 30, height: 30, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', cursor: 'pointer', color: '#fff',
                }}
              >
                <X size={14} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '24px 26px' }}>
              {submitted ? (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{
                    width: 64, height: 64, borderRadius: '50%', background: '#d1fae5',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 16px',
                  }}>
                    <CheckCircle size={32} color="#059669" />
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#111827', marginBottom: 8 }}>
                    Thank you!
                  </div>
                  <div style={{ fontSize: '.9rem', color: '#6b7280', lineHeight: 1.6, marginBottom: 24 }}>
                    Your feedback has been {submitted && 'recorded'}. We read every response and use it to improve the platform.
                  </div>
                  <button
                    onClick={handleClose}
                    style={{
                      padding: '10px 28px', borderRadius: 8, background: '#7c3aed',
                      border: 'none', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '.9rem',
                    }}
                  >
                    Close
                  </button>
                </div>
              ) : (
                <>
                  {/* Star Rating */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: '.85rem', fontWeight: 700, color: '#374151', marginBottom: 10 }}>
                      Overall rating <span style={{ color: '#dc2626' }}>*</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {[1, 2, 3, 4, 5].map(n => (
                        <button
                          key={n}
                          onClick={() => setRating(n)}
                          onMouseEnter={() => setHovered(n)}
                          onMouseLeave={() => setHovered(0)}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            padding: 2, transition: 'transform .1s', lineHeight: 0,
                          }}
                        >
                          <Star
                            size={32}
                            fill={n <= activeRating ? '#f59e0b' : 'none'}
                            color={n <= activeRating ? '#f59e0b' : '#d1d5db'}
                            style={{ transition: 'fill .15s, color .15s' }}
                          />
                        </button>
                      ))}
                      {activeRating > 0 && (
                        <span style={{
                          marginLeft: 10, fontSize: '.85rem', fontWeight: 600,
                          color: activeRating >= 4 ? '#059669' : activeRating === 3 ? '#d97706' : '#dc2626',
                        }}>
                          {['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'][activeRating]}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Category */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: '.85rem', fontWeight: 700, color: '#374151', marginBottom: 8 }}>
                      Category <span style={{ color: '#dc2626' }}>*</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {CATEGORIES.map(c => (
                        <button
                          key={c.value}
                          onClick={() => setCategory(c.value)}
                          style={{
                            padding: '7px 14px', borderRadius: 99, cursor: 'pointer',
                            fontSize: '.82rem', fontWeight: 700,
                            border: `1.5px solid ${category === c.value ? '#7c3aed' : '#e5e7eb'}`,
                            background: category === c.value ? '#ede9fe' : '#f9fafb',
                            color: category === c.value ? '#7c3aed' : '#374151',
                            transition: 'all .15s',
                          }}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Message */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: '.85rem', fontWeight: 700, color: '#374151', marginBottom: 8 }}>
                      Your message <span style={{ color: '#dc2626' }}>*</span>
                    </div>
                    <textarea
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      placeholder="Tell us what you think — what works well, what could be better, or any specific suggestion…"
                      rows={4}
                      style={{
                        width: '100%', padding: '10px 12px', fontSize: '.88rem', color: '#111827',
                        border: `1.5px solid ${msgLenStarted && !msgLenOk ? '#ef4444' : '#e5e7eb'}`,
                        borderRadius: 8, resize: 'vertical', fontFamily: 'inherit',
                        boxSizing: 'border-box', lineHeight: 1.6, outline: 'none',
                        transition: 'border-color .15s',
                      }}
                      onFocus={e  => { e.target.style.borderColor = '#7c3aed' }}
                      onBlur={e   => { e.target.style.borderColor = msgLenStarted && !msgLenOk ? '#ef4444' : '#e5e7eb' }}
                    />
                    <div style={{
                      fontSize: '.73rem',
                      color: msgLenOk ? '#059669' : msgLenStarted ? '#ef4444' : '#9ca3af',
                      marginTop: 4, textAlign: 'right', fontWeight: 600,
                    }}>
                      {msgLen} chars {msgLenStarted && !msgLenOk ? '(min 10)' : msgLenOk ? '✓' : ''}
                    </div>
                  </div>

                  {/* Anonymous toggle */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
                    <button
                      onClick={() => setAnonymous(a => !a)}
                      aria-label={anonymous ? 'Disable anonymous mode' : 'Enable anonymous mode'}
                      style={{
                        width: 40, height: 22, borderRadius: 99, border: 'none', cursor: 'pointer',
                        background: anonymous ? '#7c3aed' : '#d1d5db',
                        transition: 'background .2s', position: 'relative', flexShrink: 0, padding: 0,
                      }}
                    >
                      <span style={{
                        position: 'absolute', top: 3, left: 3, width: 16, height: 16,
                        borderRadius: '50%', background: '#fff',
                        transition: 'transform .2s',
                        transform: anonymous ? 'translateX(18px)' : 'translateX(0)',
                        boxShadow: '0 1px 3px rgba(0,0,0,.2)',
                      }} />
                    </button>
                    <span style={{ fontSize: '.85rem', color: '#374151', fontWeight: 600 }}>
                      Submit anonymously
                    </span>
                    <span style={{ fontSize: '.75rem', color: '#9ca3af' }}>(hides your email)</span>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      onClick={handleClose}
                      disabled={loading}
                      style={{
                        flex: 1, padding: '11px 0', borderRadius: 8,
                        border: '1.5px solid #e5e7eb', background: '#fff',
                        color: loading ? '#d1d5db' : '#374151',
                        fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', transition: 'all .15s',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={loading ? undefined : handleSubmit}
                      disabled={loading}
                      style={{
                        flex: 2, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', gap: 7, padding: '11px 0', borderRadius: 8,
                        border: 'none',
                        background: loading ? '#ede9fe' : 'linear-gradient(135deg, #7c3aed, #db2777)',
                        color: loading ? '#7c3aed' : '#fff',
                        fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer',
                        fontSize: '.9rem', transition: 'opacity .15s', opacity: loading ? 0.8 : 1,
                      }}
                    >
                      {loading
                        ? <><span style={spinnerStyle} /> Submitting…</>
                        : <><Send size={14} /> Submit Feedback</>
                      }
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}