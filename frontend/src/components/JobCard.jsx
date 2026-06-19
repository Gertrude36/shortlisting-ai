import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Briefcase, GraduationCap, Clock, ChevronRight,
  X, MapPin, BookOpen, Star, ListChecks, Award,
  Building2, Calendar, Timer, AlertCircle, Users
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'

// ── Helpers ──────────────────────────────────────────────────

function parseList(raw) {
  if (!raw || String(raw).trim().toLowerCase() === 'none') return []
  return String(raw).split(/[,\n;]+/).map(s => s.trim()).filter(Boolean)
}

/**
 * Parses the backend-serialized qualification string into clean rows.
 *
 * Backend format:
 *   "Bachelor of Commerce [min 2 yrs] | Master of Science [min 1 yr]"
 *
 * Returns: [{ label: "Bachelor of Commerce", exp: 2 }, ...]
 *
 * Also handles legacy plain strings (no brackets / no pipes) gracefully.
 */
function parseQualifications(eduRaw) {
  if (!eduRaw || String(eduRaw).trim() === '') return []

  const raw = String(eduRaw).trim()

  // Split on pipe separator (with optional surrounding spaces)
  const chunks = raw.split(/\s*\|\s*/).map(s => s.trim()).filter(Boolean)

  return chunks.map(chunk => {
    // Match: "Degree Name [min N yr(s)]"
    const m = chunk.match(/^(.*?)\s*\[min\s+(\d+)\s+yrs?\s*\]$/i)
    if (m) {
      return { label: m[1].trim(), exp: parseInt(m[2], 10) }
    }
    // No bracket tag found — return the chunk as-is (legacy / plain text)
    return { label: chunk, exp: null }
  })
}

function parseDeadline(deadline) {
  if (!deadline) return null
  const str = String(deadline)
  if (str.includes('T')) return new Date(str)
  return new Date(str + 'T23:59:59')
}

function isDeadlineExpired(deadline) {
  if (!deadline) return false
  return parseDeadline(deadline) < new Date()
}

// ── Live countdown timer ─────────────────────────────────────
function CountdownTimer({ deadline }) {
  const getRemaining = () => {
    if (!deadline) return null
    const end  = parseDeadline(deadline)
    const diff = end - new Date()
    if (diff <= 0) return { expired: true }
    const days  = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const mins  = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    const secs  = Math.floor((diff % (1000 * 60)) / 1000)
    const urgent = diff < 24 * 60 * 60 * 1000
    return { expired: false, urgent, days, hours, mins, secs }
  }

  const [rem, setRem] = useState(getRemaining)
  useEffect(() => {
    const id = setInterval(() => setRem(getRemaining()), 1000)
    return () => clearInterval(id)
  }, [deadline])

  if (!rem) return null

  if (rem.expired) return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 10px', borderRadius: 8,
      background: '#fee2e2', color: '#991b1b',
      fontSize: '.72rem', fontWeight: 700,
    }}>
      <AlertCircle size={11} /> Deadline passed
    </span>
  )

  const accent = rem.urgent ? '#dc2626' : '#1a56db'
  const bg     = rem.urgent ? '#fee2e2' : '#deeaff'
  const pad    = n => String(n).padStart(2, '0')

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      {[
        { val: rem.days,  label: 'd' },
        { val: rem.hours, label: 'h' },
        { val: rem.mins,  label: 'm' },
        { val: rem.secs,  label: 's' },
      ].map(({ val, label }, i) => (
        <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <span style={{
            display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
            background: bg, borderRadius: 6, padding: '3px 6px', minWidth: 30,
          }}>
            <span style={{ fontSize: '.8rem', fontWeight: 800, color: accent, lineHeight: 1 }}>{pad(val)}</span>
            <span style={{ fontSize: '.55rem', color: accent, opacity: .75, letterSpacing: '.04em' }}>{label}</span>
          </span>
          {i < 3 && (
            <span style={{ fontSize: '.78rem', fontWeight: 700, color: accent, margin: '0 1px', lineHeight: 1 }}>:</span>
          )}
        </span>
      ))}
    </div>
  )
}

// ── QualificationList — clean Mifotra-style numbered rows ────
// Accepts the raw backend string and parses it internally.
// NEVER shows [min N yrs] brackets or pipe characters to users.
function QualificationList({ eduRaw }) {
  const qualifications = parseQualifications(eduRaw)
  if (!qualifications.length) return null

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', background: '#ffffff' }}>
      {qualifications.map((q, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'flex-start', gap: 14,
          padding: '14px 18px',
          borderBottom: i < qualifications.length - 1 ? '1px solid #e5e7eb' : 'none',
        }}>
          <span style={{
            flexShrink: 0, width: 30, height: 30, borderRadius: '50%',
            border: '1.5px solid #e5e7eb',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '.75rem', fontWeight: 700, color: '#374151', marginTop: 2,
          }}>{i + 1}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={{ fontSize: '.875rem', fontWeight: 600, color: '#111827', lineHeight: 1.5 }}>
              {q.label}
            </span>
            {q.exp !== null && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                width: 'fit-content', padding: '4px 11px', borderRadius: 6,
                background: '#374151', color: '#fff',
                fontSize: '.72rem', fontWeight: 600, letterSpacing: '.02em',
              }}>
                <Clock size={10} />
                {q.exp === 0
                  ? '0 Years of relevant experience'
                  : `${q.exp} Year${q.exp !== 1 ? 's' : ''} of relevant experience`}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function NumberedList({ items }) {
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
      {items.map((item, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'flex-start', gap: 14,
          padding: '13px 18px',
          borderBottom: i < items.length - 1 ? '1px solid #e5e7eb' : 'none',
          background: '#ffffff',
        }}>
          <span style={{
            flexShrink: 0, width: 28, height: 28, borderRadius: '50%',
            border: '1.5px solid #e5e7eb',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '.75rem', fontWeight: 700, color: '#374151', marginTop: 2,
          }}>{i + 1}</span>
          <span style={{ fontSize: '.875rem', color: '#111827', lineHeight: 1.65 }}>{item}</span>
        </div>
      ))}
    </div>
  )
}

function Section({ icon, title, children }) {
  return (
    <div>
      <h3 style={{
        fontWeight: 700, fontSize: '.9rem', color: '#111827',
        marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ color: '#2563eb' }}>{icon}</span>
        {title}
      </h3>
      {children}
    </div>
  )
}

function MetaPill({ icon, label, color }) {
  if (!label) return null
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 10px', borderRadius: 99,
      background: color ? color + '15' : '#f9fafb',
      border: `1px solid ${color ? color + '40' : '#e5e7eb'}`,
      fontSize: '.78rem', color: color || '#374151', fontWeight: color ? 600 : 500,
    }}>
      {icon} {label}
    </span>
  )
}

// ── Full-detail Modal ────────────────────────────────────────
function JobModal({ job, onClose, onApply }) {
  const skillList = parseList(job.required_skills)
  const certList  = parseList(job.required_certifications)
  const prefList  = parseList(job.preferred_qualifications)
  const respList  = parseList(job.responsibilities)
  const isExpired = isDeadlineExpired(job.deadline)

  const fmt = (d) => {
    if (!d) return null
    const dt = new Date(d)
    const hasTime = dt.getHours() !== 0 || dt.getMinutes() !== 0 || dt.getSeconds() !== 0
    return dt.toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
      ...(hasTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    })
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(10,12,20,.55)', backdropFilter: 'blur(6px)',
        zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px 16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#ffffff', borderRadius: 14,
          width: '100%', maxWidth: 700, maxHeight: '92vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 32px 80px rgba(0,0,0,.18)', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '22px 26px',
          borderBottom: '1px solid #e5e7eb',
          background: '#ffffff',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{
                width: 50, height: 50, borderRadius: 8,
                background: '#deeaff', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Briefcase size={22} color="#1a56db" />
              </div>
              <div>
                <h2 style={{ fontSize: '1.18rem', fontWeight: 800, margin: 0, color: '#111827' }}>{job.title}</h2>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 7 }}>
                  {job.job_level && <MetaPill icon={<Star size={11} />} label={`Level: ${job.job_level}`} color="#1a56db" />}
                  {job.number_of_posts && <MetaPill icon={<Users size={11} />} label={`Post: ${job.number_of_posts}`} color="#6d28d9" />}
                  {job.employment_type && <MetaPill icon={<Briefcase size={11} />} label={job.employment_type} />}
                  {job.location && <MetaPill icon={<MapPin size={11} />} label={job.location} />}
                  <MetaPill icon={<Clock size={11} />} label={`${job.required_min_experience}–${job.required_max_experience} yrs exp`} />
                </div>
              </div>
            </div>
            {/* FIX: Close button – always visible */}
            <button
              onClick={onClose}
              style={{
                flexShrink: 0, width: 36, height: 36,
                border: '1px solid #cbd5e1', borderRadius: 8,
                background: '#f8fafc', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#334155', transition: 'all 0.2s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.backgroundColor = '#e2e8f0';
                e.currentTarget.style.borderColor = '#94a3b8';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = '#f8fafc';
                e.currentTarget.style.borderColor = '#cbd5e1';
              }}
            >
              <X size={16} strokeWidth={1.8} />
            </button>
          </div>

          {(job.created_at || job.deadline) && (
            <div style={{
              marginTop: 14, paddingTop: 14, borderTop: '1px solid #e5e7eb',
              display: 'flex', flexWrap: 'wrap', alignItems: 'center',
              justifyContent: 'space-between', gap: 12,
            }}>
              <div style={{ display: 'flex', gap: 20 }}>
                {job.created_at && (
                  <div>
                    <div style={{ fontSize: '.7rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                      <Calendar size={10} /> Posted on
                    </div>
                    <div style={{ fontSize: '.82rem', fontWeight: 600, color: '#111827' }}>{fmt(job.created_at)}</div>
                  </div>
                )}
                {job.deadline && (
                  <div>
                    <div style={{ fontSize: '.7rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                      <Timer size={10} /> Deadline
                    </div>
                    <div style={{ fontSize: '.82rem', fontWeight: 600, color: isExpired ? '#991b1b' : '#111827' }}>{fmt(job.deadline)}</div>
                  </div>
                )}
              </div>
              <CountdownTimer deadline={job.deadline} />
            </div>
          )}
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: 'auto', padding: '26px', display: 'flex', flexDirection: 'column', gap: 28 }}>
          {(job.about_role || job.description) && (
            <Section icon={<BookOpen size={15} />} title="About the Role">
              <p style={{
                fontSize: '.875rem', color: '#374151', lineHeight: 1.85, margin: 0,
                padding: '14px 16px', background: '#f9fafb',
                borderRadius: 8, border: '1px solid #e5e7eb',
              }}>
                {job.about_role || job.description}
              </p>
            </Section>
          )}

          <Section icon={<GraduationCap size={15} />} title="Advertisement Details">
            <QualificationList eduRaw={job.required_education_levels} />
          </Section>

          {respList.length > 0 && (
            <Section icon={<ListChecks size={15} />} title="Job Responsibilities">
              <NumberedList items={respList} />
            </Section>
          )}
          {skillList.length > 0 && (
            <Section icon={<Star size={15} />} title="Required Competencies and Key Technical Skills">
              <NumberedList items={skillList} />
            </Section>
          )}
          {certList.length > 0 && (
            <Section icon={<Award size={15} />} title="Required Certifications">
              <NumberedList items={certList} />
            </Section>
          )}
          {prefList.length > 0 && (
            <Section icon={<Star size={15} />} title="Preferred Qualifications">
              <NumberedList items={prefList} />
            </Section>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 26px 20px', borderTop: '1px solid #e5e7eb',
          display: 'flex', gap: 10, justifyContent: 'flex-end',
          background: '#ffffff',
        }}>
          <button
            className="btn btn-outline btn-sm"
            onClick={onClose}
            style={{ background: '#f3f4f6', color: '#1f2937', border: '1px solid #d1d5db', fontWeight: 600 }}
          >
            Close
          </button>
          <button
            className="btn btn-primary"
            style={{ paddingLeft: 28, paddingRight: 28, opacity: isExpired ? .5 : 1 }}
            onClick={isExpired ? undefined : onApply}
            disabled={isExpired}
          >
            {isExpired ? 'Deadline Passed' : <> Apply Now <ChevronRight size={15} /></>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main JobCard ──────────────────────────────────────────────
export default function JobCard({ job, index = 0 }) {
  const { user, profileDocuments } = useAuth()
  const navigate                    = useNavigate()
  const [open, setOpen]            = useState(false)

  const isExpired = isDeadlineExpired(job.deadline)

  const profileDocs = profileDocuments || []
  const profileDocTypes = new Set(profileDocs.map(doc => doc.doc_type))
  const hasRequiredProfileDocs = ['id_card', 'cv', 'diploma'].every(type => profileDocTypes.has(type))
  const profileComplete = !!(user?.phone && user?.address && user?.national_id)

  const handleApply = () => {
    setOpen(false)
    if (isExpired) { toast.error('Application deadline has passed'); return }
    if (!user) {
      toast('Please sign in to apply', { icon: '🔒' })
      navigate('/login', { state: { from: `/apply/${job.id}` } })
      return
    }
    if (user.role === 'hr' || user.role === 'admin') {
      toast.error('HR and admin accounts cannot apply for jobs')
      return
    }
    if (!profileComplete || !hasRequiredProfileDocs) {
      toast.error('Please complete your profile and upload required documents before applying. Open your profile to finish the setup.')
      window.dispatchEvent(new Event('open-profile-modal'))
      return
    }
    navigate(`/apply/${job.id}`)
  }

  const skillList = parseList(job.required_skills)
  const qualList  = parseQualifications(job.required_education_levels)

  const fmt = (d) => {
    if (!d) return null
    const dt = new Date(d)
    const hasTime = dt.getHours() !== 0 || dt.getMinutes() !== 0 || dt.getSeconds() !== 0
    return dt.toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
      ...(hasTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    })
  }

  const qualSummaryLabel = qualList.length === 1
    ? qualList[0].label
    : qualList.length > 1
      ? `${qualList.length} qualification options`
      : null

  return (
    <>
      {open && <JobModal job={job} onClose={() => setOpen(false)} onApply={handleApply} />}

      <div
        className={`card fade-up fade-up-${Math.min(index + 1, 4)}`}
        style={{
          padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px',
          borderRadius: 12,
          border: `1px solid ${isExpired ? '#fca5a5' : '#e5e7eb'}`,
          background: isExpired ? '#fff5f5' : '#ffffff',
          transition: 'box-shadow .2s ease, transform .2s ease',
          opacity: isExpired ? .85 : 1,
        }}
        onMouseEnter={e => {
          if (isExpired) return
          e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,.09)'
          e.currentTarget.style.transform = 'translateY(-2px)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.boxShadow = ''
          e.currentTarget.style.transform = ''
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 46, height: 46, borderRadius: 8,
              background: isExpired ? '#fee2e2' : '#deeaff',
              flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Briefcase size={20} color={isExpired ? '#ef4444' : '#1a56db'} />
            </div>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', margin: 0 }}>{job.title}</h3>
              {job.location && (
                <span style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 4, fontSize: '.78rem', color: '#6b7280' }}>
                  <MapPin size={11} /> {job.location}
                </span>
              )}
            </div>
          </div>

          {isExpired
            ? <span style={{ flexShrink: 0, padding: '3px 10px', borderRadius: 99, background: '#fee2e2', color: '#991b1b', fontSize: '.72rem', fontWeight: 700 }}>Closed</span>
            : <span className="badge badge-teal" style={{ flexShrink: 0 }}>Open</span>
          }
        </div>

        {/* Description */}
        {job.description && (
          <p style={{ fontSize: '.85rem', color: '#6b7280', lineHeight: 1.6, margin: 0 }}>
            {job.description.length > 100 ? job.description.slice(0, 100) + '…' : job.description}
          </p>
        )}

        {/* Meta pills — clean label, no raw strings */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {job.job_level && <MetaPill icon={<Star size={12} />} label={`Level: ${job.job_level}`} color="#1a56db" />}
          {job.number_of_posts && <MetaPill icon={<Users size={12} />} label={`Post: ${job.number_of_posts}`} color="#6d28d9" />}
          {qualSummaryLabel && (
            <MetaPill icon={<GraduationCap size={12} />} label={qualSummaryLabel} />
          )}
          <MetaPill icon={<Clock size={12} />} label={`${job.required_min_experience}–${job.required_max_experience} yrs exp`} />
          {job.employment_type && <MetaPill icon={<Building2 size={12} />} label={job.employment_type} />}
        </div>

        {/* Posted / Deadline + countdown */}
        {(job.created_at || job.deadline) && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: 10, padding: '10px 14px',
            borderRadius: 8, background: '#f9fafb', border: '1px solid #e5e7eb',
          }}>
            <div style={{ display: 'flex', gap: 18 }}>
              {job.created_at && (
                <div>
                  <div style={{ fontSize: '.65rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Calendar size={9} /> Posted on
                  </div>
                  <div style={{ fontSize: '.78rem', fontWeight: 600, color: '#111827' }}>{fmt(job.created_at)}</div>
                </div>
              )}
              {job.deadline && (
                <div>
                  <div style={{ fontSize: '.65rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Timer size={9} /> Deadline
                  </div>
                  <div style={{ fontSize: '.78rem', fontWeight: 600, color: isExpired ? '#991b1b' : '#111827' }}>{fmt(job.deadline)}</div>
                </div>
              )}
            </div>
            <CountdownTimer deadline={job.deadline} />
          </div>
        )}

        {/* Skill tags */}
        {skillList.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {skillList.slice(0, 4).map(s => (
              <span key={s} style={{
                padding: '3px 10px', borderRadius: 99,
                background: '#f9fafb', border: '1px solid #e5e7eb',
                fontSize: '.75rem', color: '#374151', fontWeight: 500,
              }}>{s}</span>
            ))}
            {skillList.length > 4 && (
              <span style={{ fontSize: '.75rem', color: '#9ca3af', alignSelf: 'center' }}>+{skillList.length - 4} more</span>
            )}
          </div>
        )}

        {/* Actions – both buttons always visible */}
        <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
          <button
            className="btn btn-outline"
            style={{
              flex: 1,
              justifyContent: 'center',
              fontSize: '.85rem',
              backgroundColor: '#f3f4f6',
              color: '#1f2937',
              border: '1px solid #d1d5db',
              fontWeight: 600,
              padding: '8px 12px',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onClick={() => setOpen(true)}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = '#e5e7eb';
              e.currentTarget.style.borderColor = '#9ca3af';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = '#f3f4f6';
              e.currentTarget.style.borderColor = '#d1d5db';
            }}
          >
            View Details
          </button>
          <button
            className="btn btn-primary"
            style={{ flex: 1, justifyContent: 'center', opacity: isExpired ? .5 : 1 }}
            onClick={handleApply}
            disabled={isExpired}
          >
            {isExpired ? 'Closed' : <> Apply Now <ChevronRight size={15} /></>}
          </button>
        </div>
      </div>
    </>
  )
}