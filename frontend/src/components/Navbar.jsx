/**
 * frontend/src/components/Navbar.jsx  ·  v6.0.0
 *
 * FIXES vs v5.9.0:
 *
 *  ✅ FIX-NAV-1 (CRITICAL) — profileComplete and `missing` now read from
 *     `profileDocuments` (the separate array on AuthContext) instead of
 *     `user.documents`. In AuthContext v3.0.0 profileDocuments is populated
 *     by /profile/documents; user.documents does not exist and was always
 *     undefined → profile was ALWAYS shown as incomplete regardless of uploads.
 *
 *  ✅ FIX-NAV-2 (CRITICAL) — InfoRow for "Documents" now uses profileDocuments
 *     from context instead of user.documents, so the sidebar shows the real
 *     count instead of "Not set" forever.
 *
 *  ✅ FIX-NAV-3 — ProfileModal now receives and calls refreshDocuments() after
 *     all uploads finish, so AuthContext.profileDocuments is updated before
 *     updateProfile() is called and before the modal closes. This means the
 *     Navbar dropdown immediately reflects the new document count.
 *
 *  ✅ FIX-NAV-4 — updateProfile() call in handleSave now only sends
 *     { phone, address, national_id } — fields the backend/AuthContext
 *     actually handles. `fullName` and `documents` are no longer sent
 *     (fullName is read-only; documents are managed via /profile/documents).
 *
 *  ✅ FIX-NAV-5 — Removed the `phone` field being marked required in the
 *     profile completeness check. phone is optional per backend schema;
 *     only national_id, address, and required documents block the gate.
 *
 * All v5.9.0 visual design and non-broken logic is retained unchanged.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { Link, useNavigate }           from 'react-router-dom'
import {
  LogOut, LayoutDashboard, Briefcase,
  Upload, X, User, MapPin, CreditCard,
  Phone, FileText, CheckCircle, AlertCircle,
  GraduationCap, ScrollText, Award, Eye,
  Trash2, RefreshCw, Pencil, Save, Briefcase as BriefcaseIcon,
} from 'lucide-react'
import toast       from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import api         from '../api/axios'

const DOC_SLOTS = [
  { key: 'id_card',     label: 'National ID Copy',      hint: 'Front & back scan or photo',    icon: CreditCard,    color: '#1a56db', bg: '#deeaff', border: '#93b4ff', required: true  },
  { key: 'cv',          label: 'Curriculum Vitae (CV)', hint: 'Your most recent CV',            icon: FileText,      color: '#0a7c3e', bg: '#d1f5e0', border: '#6dd8a0', required: true  },
  { key: 'diploma',     label: 'Diploma / Degree',      hint: 'Highest academic certificate',   icon: GraduationCap, color: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd', required: true  },
  { key: 'certificate', label: 'Other Certificates',    hint: 'Professional certifications',    icon: Award,         color: '#b86400', bg: '#fdf0d0', border: '#fbc86a', required: false },
  { key: 'experience',  label: 'Experience Document',   hint: 'Employment or reference letter', icon: BriefcaseIcon, color: '#0e7490', bg: '#ecfeff', border: '#67e8f9', required: false },
]

const REQUIRED_DOC_KEYS = DOC_SLOTS.filter(s => s.required).map(s => s.key)

function getDisplayName(user) {
  return user?.fullName || user?.full_name || ''
}

function extractApiError(err, fallback = 'An error occurred. Please try again.') {
  if (!err.response) return 'Could not reach the server. Please check your connection.'
  const data = err.response?.data
  if (!data)                              return `Server error (${err.response.status})`
  if (typeof data.detail === 'string')    return data.detail
  if (Array.isArray(data.detail))         return data.detail.map(e => e.msg || JSON.stringify(e)).join(' · ')
  if (typeof data === 'string')           return data
  if (typeof data.message === 'string')   return data.message
  return fallback
}

function Avatar({ name = '', size = 36, onClick }) {
  const initials = name.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2)
  return (
    <button
      onClick={onClick}
      title="My Profile"
      style={{
        width: size, height: size, borderRadius: '50%',
        background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
        border: '2.5px solid rgba(255,255,255,.30)',
        color: '#fff', fontWeight: 700,
        fontSize: size * 0.36, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, padding: 0,
      }}
    >
      {initials || <User size={size * 0.45} />}
    </button>
  )
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 0', borderBottom: '1px solid #e5e7eb',
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 6,
        background: '#deeaff', border: '1.5px solid rgba(26,86,219,.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={13} color="#1a56db" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '.65rem', color: '#6b7280', fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '.06em',
        }}>{label}</div>
        <div style={{
          fontSize: '.85rem', marginTop: 1,
          color: value ? '#111827' : '#d1d5db',
          fontWeight: value ? 600 : 400,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {value || 'Not set'}
        </div>
      </div>
    </div>
  )
}

function DocSlot({ slot, file, serverDoc, onChange, onPreview }) {
  const fileRef = useRef(null)
  const Icon    = slot.icon
  const hasFile = !!file || !!serverDoc
  const displayName = file?.name || serverDoc?.original_name || serverDoc?.file_name || slot.key

  return (
    <div style={{
      border: `2px solid ${hasFile ? slot.border : '#e5e7eb'}`,
      borderRadius: 8,
      background: hasFile ? slot.bg : '#f9fafb',
      padding: '12px 14px',
      transition: 'all .2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 6, flexShrink: 0,
          background: hasFile ? slot.bg : '#ffffff',
          border: `2px solid ${hasFile ? slot.border : '#e5e7eb'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={17} color={hasFile ? slot.color : '#9ca3af'} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: '.82rem', fontWeight: 700, color: '#111827' }}>{slot.label}</span>
            {slot.required
              ? <span style={{ fontSize: '.62rem', color: '#c41a1a', fontWeight: 700, background: '#fde0e0', border: '1.5px solid rgba(196,26,26,.20)', borderRadius: 3, padding: '1px 5px' }}>Required</span>
              : <span style={{ fontSize: '.62rem', color: '#6b7280', fontWeight: 600, background: '#f9fafb', border: '1.5px solid #e5e7eb', borderRadius: 3, padding: '1px 5px' }}>Optional</span>
            }
            {serverDoc && !file && (
              <span style={{ fontSize: '.62rem', color: '#0a7c3e', fontWeight: 700, background: '#d1f5e0', border: '1.5px solid #6dd8a0', borderRadius: 3, padding: '1px 5px' }}>Saved ✓</span>
            )}
          </div>
          {hasFile
            ? <div style={{ fontSize: '.75rem', color: slot.color, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>✓ {displayName}</div>
            : <div style={{ fontSize: '.75rem', color: '#9ca3af' }}>{slot.hint}</div>
          }
        </div>
        {hasFile ? (
          <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
            {serverDoc && !file && (
              <button onClick={() => onPreview(slot)} style={{ width: 28, height: 28, borderRadius: 6, border: `1.5px solid ${slot.border}`, background: slot.bg, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Eye size={12} color={slot.color} />
              </button>
            )}
            <button onClick={() => fileRef.current.click()} style={{ width: 28, height: 28, borderRadius: 6, border: '1.5px solid #93b4ff', background: '#deeaff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <RefreshCw size={12} color="#1a56db" />
            </button>
            <button onClick={() => onChange(slot.key, null)} style={{ width: 28, height: 28, borderRadius: 6, border: '1.5px solid rgba(196,26,26,.2)', background: '#fde0e0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Trash2 size={12} color="#c41a1a" />
            </button>
          </div>
        ) : (
          <button onClick={() => fileRef.current.click()} style={{ padding: '6px 14px', borderRadius: 6, flexShrink: 0, border: '2px solid #2563eb', background: '#deeaff', cursor: 'pointer', fontSize: '.75rem', fontWeight: 700, color: '#1a56db', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Upload size={11} /> Upload
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
        onChange={e => { if (e.target.files[0]) onChange(slot.key, e.target.files[0]); e.target.value = '' }}
        style={{ display: 'none' }}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ProfileModal
// ─────────────────────────────────────────────────────────────────────────────

function ProfileModal({ user, updateProfile, refreshDocuments, onClose }) {
  const displayName = getDisplayName(user)

  const [form, setForm] = useState({
    national_id: user.national_id || '',
    address:     user.address     || '',
    phone:       user.phone       || '',
  })
  const [editingName, setEditingName] = useState(false)
  const [fullName,    setFullName]    = useState(displayName)
  const [newFiles,    setNewFiles]    = useState({})
  const [serverDocs,  setServerDocs]  = useState({})
  const [loadingDocs, setLoadingDocs] = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [done,        setDone]        = useState(false)

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  // Load existing profile documents from server on mount
  useEffect(() => {
    api.get('/profile/documents')
      .then(({ data }) => {
        const docs = Array.isArray(data) ? data : (data.documents || [])
        const map  = {}
        docs.forEach(d => { if (d.doc_type) map[d.doc_type] = d })
        setServerDocs(map)
      })
      .catch(() => {})
      .finally(() => setLoadingDocs(false))
  }, [])

  const handleDocChange = (slotKey, file) => {
    setNewFiles(prev => ({ ...prev, [slotKey]: file || undefined }))
    if (!file) setServerDocs(prev => { const next = { ...prev }; delete next[slotKey]; return next })
  }

  const totalUploaded    = DOC_SLOTS.filter(s => newFiles[s.key] || serverDocs[s.key]).length
  const requiredDone     = DOC_SLOTS.filter(s => s.required && (newFiles[s.key] || serverDocs[s.key])).length
  const requiredTotal    = DOC_SLOTS.filter(s => s.required).length
  const requiredComplete = requiredDone === requiredTotal

  const fieldsFilled = !!(form.national_id.trim() && form.address.trim() && fullName.trim())
  const isComplete   = fieldsFilled && requiredComplete
  const progress     = Math.round(
    ([form.national_id, form.address, fullName].filter(v => v.trim()).length / 3) * 40 +
    (requiredDone / requiredTotal) * 60
  )

  // ✅ FIX-NAV-3 + FIX-NAV-4: upload files first, refresh AuthContext docs,
  // then call updateProfile with only the fields it actually handles.
  const handleSave = async () => {
    if (!fullName.trim())         { toast.error('Full name is required');               return }
    if (!form.national_id.trim()) { toast.error('National ID is required');             return }
    if (!form.address.trim())     { toast.error('Location is required');                return }
    if (!requiredComplete)        { toast.error('Please upload all required documents'); return }

    setSaving(true)
    try {
      // Step 1 — upload any new local files
      const uploadEntries = Object.entries(newFiles).filter(([, f]) => !!f)
      await Promise.all(
        uploadEntries.map(async ([docType, file]) => {
          const formData = new FormData()
          formData.append('doc_type', docType)
          formData.append('file', file)
          try {
            await api.post('/profile/documents', formData)
          } catch (err) {
            const msg = extractApiError(err, `Failed to upload ${docType}`)
            toast.error(msg)
            throw err
          }
        })
      )

      // ✅ FIX-NAV-3: refresh AuthContext.profileDocuments now so the
      // dropdown count updates immediately when the modal closes
      if (uploadEntries.length > 0) {
        await refreshDocuments()
      }

      // Step 2 — persist text fields
      // ✅ FIX-NAV-4: only send what the backend/AuthContext handle:
      //   phone + address  → PUT /profile (saved to DB)
      //   national_id      → localStorage only
      // fullName is read-only on the backend; skip it.
      await updateProfile({
        phone:       form.phone,
        address:     form.address,
        national_id: form.national_id,
      })

      setNewFiles({})
      setDone(true)
      toast.success('Profile saved successfully!')
      window.dispatchEvent(new Event('profile-updated'))
      setTimeout(onClose, 700)

    } catch {
      // Individual errors already toasted in the upload loop
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(11,15,26,.65)', backdropFilter: 'blur(6px)',
        zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div style={{
        background: '#ffffff', borderRadius: 14,
        border: '1.5px solid #e5e7eb',
        width: '100%', maxWidth: 520, maxHeight: '92vh',
        boxShadow: '0 28px 72px rgba(10,15,40,.20)',
        position: 'relative', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>

        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
          borderBottom: '3px solid #2563eb',
          padding: '20px 24px 18px', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 8,
                background: 'rgba(255,255,255,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <User size={19} color="#fff" />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#ffffff' }}>My Profile</h2>
                <p style={{ margin: '2px 0 0', fontSize: '.8rem', color: 'rgba(255,255,255,.7)' }}>{fullName}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                width: 34, height: 34, borderRadius: '50%',
                border: '1.5px solid rgba(255,255,255,.3)',
                background: 'rgba(255,255,255,.1)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <X size={15} color="rgba(255,255,255,.9)" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '22px 24px 28px', display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Progress */}
          <div style={{
            padding: '14px 16px', borderRadius: 8,
            background: isComplete ? '#d1f5e0' : '#deeaff',
            border: `2px solid ${isComplete ? 'rgba(10,124,62,.25)' : 'rgba(26,86,219,.20)'}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{
                fontSize: '.82rem', fontWeight: 700,
                color: isComplete ? '#0a7c3e' : '#1a56db',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                {isComplete ? <><CheckCircle size={14} /> Profile complete</> : 'Profile completion'}
              </span>
              <span style={{ fontSize: '.82rem', fontWeight: 700, color: isComplete ? '#0a7c3e' : '#1a56db' }}>{progress}%</span>
            </div>
            <div style={{ height: 6, background: 'rgba(0,0,0,.08)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 99,
                background: isComplete ? '#0a7c3e' : '#2563eb',
                width: `${progress}%`, transition: 'width .35s ease',
              }} />
            </div>
          </div>

          {/* Personal info */}
          <div>
            <div style={{
              fontSize: '.72rem', fontWeight: 700, color: '#2563eb',
              letterSpacing: '.12em', textTransform: 'uppercase',
              marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <div style={{ flex: 1, height: 1.5, background: '#e5e7eb' }} />
              Personal Information
              <div style={{ flex: 1, height: 1.5, background: '#e5e7eb' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Full Name — read-only unless editing */}
              <div>
                <label style={{ display: 'block', fontSize: '.85rem', fontWeight: 700, color: '#374151', marginBottom: 6 }}>Full Name</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="form-input"
                    value={fullName}
                    disabled={!editingName}
                    onChange={e => setFullName(e.target.value)}
                    style={{ flex: 1, background: editingName ? '#ffffff' : '#f9fafb', color: '#111827' }}
                  />
                  <button
                    onClick={() => setEditingName(v => !v)}
                    style={{
                      padding: '0 14px', borderRadius: 4, flexShrink: 0,
                      border: editingName ? 'none' : '2px solid #e5e7eb',
                      background: editingName ? '#2563eb' : '#f9fafb',
                      color: editingName ? '#fff' : '#374151',
                      fontWeight: 700, fontSize: '.82rem', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 5,
                    }}
                  >
                    {editingName ? <><Save size={12} /> Done</> : <><Pencil size={12} /> Edit</>}
                  </button>
                </div>
                <div style={{ fontSize: '.72rem', color: '#9ca3af', marginTop: 3 }}>
                  Name changes require contacting support.
                </div>
              </div>

              {/* national_id, address, phone */}
              {[
                { key: 'national_id', label: 'National ID *',           placeholder: 'e.g. 1 1998 8 0123456 7 89' },
                { key: 'address',     label: 'Location / Address *',    placeholder: 'e.g. Kigali, Rwanda'         },
                { key: 'phone',       label: 'Phone Number (optional)', placeholder: 'e.g. +250 788 000 000'       },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label style={{ display: 'block', fontSize: '.85rem', fontWeight: 700, color: '#374151', marginBottom: 6 }}>{label}</label>
                  <input
                    className="form-input"
                    value={form[key]}
                    onChange={e => set(key, e.target.value)}
                    placeholder={placeholder}
                    style={{ color: '#111827' }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Documents */}
          <div>
            <div style={{
              fontSize: '.72rem', fontWeight: 700, color: '#2563eb',
              letterSpacing: '.12em', textTransform: 'uppercase',
              marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <div style={{ flex: 1, height: 1.5, background: '#e5e7eb' }} />
              Documents ({totalUploaded}/{DOC_SLOTS.length})
              <div style={{ flex: 1, height: 1.5, background: '#e5e7eb' }} />
            </div>

            {loadingDocs ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                <div className="spinner" style={{ width: 24, height: 24 }} />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {DOC_SLOTS.map(slot => (
                  <DocSlot
                    key={slot.key}
                    slot={slot}
                    file={newFiles[slot.key] || null}
                    serverDoc={serverDocs[slot.key] || null}
                    onChange={handleDocChange}
                    onPreview={() => {}}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving || done}
            style={{
              width: '100%', padding: '13px 0', borderRadius: 4, border: 'none',
              background: done ? '#0a7c3e' : '#2563eb',
              color: '#fff', fontSize: '1rem', fontWeight: 700,
              cursor: saving || done ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              opacity: saving ? .85 : 1,
            }}
          >
            {done
              ? <><CheckCircle size={16} /> Profile Saved!</>
              : saving
                ? <><div className="spinner" style={{ width: 15, height: 15, borderColor: 'rgba(255,255,255,.3)', borderTopColor: '#fff' }} /> Saving…</>
                : <><Save size={15} /> Save Profile</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Navbar
// ─────────────────────────────────────────────────────────────────────────────

export default function Navbar() {
  // ✅ FIX-NAV-1: pull profileDocuments from context (not user.documents)
  const { user, logout, updateProfile, profileDocuments, refreshDocuments } = useAuth()
  const navigate    = useNavigate()
  const dropdownRef = useRef(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [modalOpen,    setModalOpen]    = useState(false)

  const openModal = useCallback(() => {
    setDropdownOpen(false)
    setModalOpen(true)
  }, [])

  useEffect(() => {
    window.addEventListener('open-profile-modal', openModal)
    return () => window.removeEventListener('open-profile-modal', openModal)
  }, [openModal])

  useEffect(() => {
    const handler = e => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target))
        setDropdownOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleLogout = () => { logout(); toast.success('Logged out successfully'); navigate('/') }

  const isHR        = user?.role === 'hr'
  const displayName = getDisplayName(user)

  // ✅ FIX-NAV-1: use profileDocuments (from AuthContext) for all doc checks
  const uploadedDocTypes  = new Set((profileDocuments || []).map(d => d.doc_type))
  const missingRequiredDocs = REQUIRED_DOC_KEYS.filter(k => !uploadedDocTypes.has(k))
  const docCount          = (profileDocuments || []).length

  const profileComplete = isHR
    ? true
    : !!(user?.national_id && user?.address && missingRequiredDocs.length === 0)

  const missing = isHR
    ? []
    : [
        !user?.national_id              && 'National ID',
        !user?.address                  && 'Location',
        missingRequiredDocs.length > 0  && 'Documents',
      ].filter(Boolean)

  // ✅ FIX-NAV-2: document count for sidebar uses profileDocuments
  const docDisplayValue = docCount > 0
    ? `${docCount} file${docCount > 1 ? 's' : ''} uploaded`
    : null

  return (
    <>
      <nav className="navbar">
        <div className="container navbar-inner">
          <Link to="/" className="navbar-logo">
            <div style={{
              width: 32, height: 32, borderRadius: 6,
              background: 'linear-gradient(135deg, #2563eb, #0693c7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(26,86,219,.4)',
            }}>
              <Briefcase size={16} color="#fff" />
            </div>
            GI Recruitment<span> Network</span>
          </Link>

          <div className="navbar-actions">
            {!user ? (
              <>
                <Link to="/login"><button className="btn btn-outline btn-sm">Sign In</button></Link>
                <Link to="/register"><button className="btn btn-primary btn-sm">Register</button></Link>
              </>
            ) : (
              <>
                {user.role === 'applicant' && (
                  <Link to="/dashboard">
                    <button className="btn btn-outline btn-sm"><LayoutDashboard size={14} /> My Applications</button>
                  </Link>
                )}
                {user.role === 'hr' && (
                  <Link to="/hr">
                    <button className="btn btn-outline btn-sm"><Briefcase size={14} /> HR Dashboard</button>
                  </Link>
                )}

                <div ref={dropdownRef} style={{ position: 'relative' }}>
                  <div style={{ position: 'relative', display: 'inline-flex' }}>
                    <Avatar name={displayName} size={40} onClick={() => setDropdownOpen(v => !v)} />
                    {!profileComplete && (
                      <span style={{
                        position: 'absolute', top: -2, right: -2,
                        width: 12, height: 12, borderRadius: '50%',
                        background: '#f59e0b', border: '2px solid #0b0f1a',
                      }} title="Profile incomplete" />
                    )}
                  </div>

                  {dropdownOpen && (
                    <div style={{
                      position: 'absolute', top: 'calc(100% + 14px)', right: 0,
                      width: 300, background: '#ffffff',
                      border: '1.5px solid #e5e7eb', borderRadius: 14,
                      boxShadow: '0 28px 72px rgba(10,15,40,.20)',
                      zIndex: 500, overflow: 'hidden',
                    }}>
                      <div style={{
                        padding: '16px 20px 14px',
                        borderBottom: '2px solid #2563eb',
                        background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <Avatar name={displayName} size={44} />
                          <div style={{ overflow: 'hidden' }}>
                            <p style={{
                              margin: 0, fontWeight: 700, fontSize: '.95rem', color: '#ffffff',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {displayName || 'My Account'}
                            </p>
                            <p style={{ margin: '2px 0 0', fontSize: '.78rem', color: 'rgba(255,255,255,.7)', textTransform: 'capitalize' }}>{user.role}</p>
                          </div>
                        </div>

                        {!isHR && (
                          <div style={{
                            marginTop: 12, padding: '8px 12px', borderRadius: 6,
                            background: profileComplete ? 'rgba(10,124,62,.25)' : 'rgba(248,163,0,.2)',
                            border: `1.5px solid ${profileComplete ? 'rgba(10,124,62,.4)' : 'rgba(248,163,0,.4)'}`,
                            fontSize: '.78rem', fontWeight: 700,
                            color: profileComplete ? '#6fffa8' : '#fde68a',
                            display: 'flex', alignItems: 'center', gap: 6,
                          }}>
                            {profileComplete
                              ? <><CheckCircle size={12} /> Profile complete</>
                              : <><AlertCircle size={12} /> Missing: {missing.join(', ')}</>
                            }
                          </div>
                        )}
                      </div>

                      {/* ✅ FIX-NAV-2: InfoRow for Documents uses docDisplayValue */}
                      {!isHR && (
                        <div style={{ padding: '6px 20px 2px' }}>
                          <InfoRow icon={CreditCard} label="National ID" value={user.national_id}  />
                          <InfoRow icon={MapPin}      label="Location"   value={user.address}       />
                          <InfoRow icon={Phone}       label="Phone"      value={user.phone}         />
                          <InfoRow icon={ScrollText}  label="Documents"  value={docDisplayValue}    />
                        </div>
                      )}

                      <div style={{ padding: '12px 20px 16px', display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1.5px solid #e5e7eb' }}>
                        {!isHR && (
                          <button
                            onClick={openModal}
                            style={{
                              width: '100%', padding: '10px 0', borderRadius: 4,
                              border: 'none', background: '#2563eb', color: '#fff',
                              fontSize: '.88rem', fontWeight: 700, cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                              boxShadow: '0 3px 10px rgba(26,86,219,.3)',
                            }}
                          >
                            <User size={13} /> View & Edit Profile
                          </button>
                        )}
                        <button
                          onClick={handleLogout}
                          style={{
                            width: '100%', padding: '9px 0', borderRadius: 4,
                            border: '2px solid #e5e7eb', background: '#ffffff',
                            color: '#374151', fontSize: '.88rem', fontWeight: 600,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                          }}
                        >
                          <LogOut size={13} /> Log Out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ✅ FIX-NAV-3: pass refreshDocuments so modal can update context after uploads */}
      {modalOpen && user && !isHR && (
        <ProfileModal
          user={user}
          updateProfile={updateProfile}
          refreshDocuments={refreshDocuments}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  )
}
