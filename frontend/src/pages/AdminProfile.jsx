/**
 * frontend/src/pages/AdminProfile.jsx
 *
 * NEW FILE — FIX-APP-2
 *
 * A dedicated profile / account-settings page for admin users.
 * Admins do not have job-application profiles (no education, CV, etc.).
 * This page covers:
 *   • Display name, email (read-only)
 *   • Phone and address (editable, persisted to DB via PUT /profile)
 *   • Password change (via POST /auth/change-password)
 *   • Quick-link back to Admin Dashboard
 *
 * Route: /admin/profile  (admin role only — see App.jsx)
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import {
  ArrowLeft, User, Mail, Phone, MapPin, Lock,
  ShieldCheck, Save, Eye, EyeOff, CheckCircle,
} from 'lucide-react'
import toast   from 'react-hot-toast'
import Navbar  from '../components/Navbar'
import { useAuth } from '../context/AuthContext'
import api     from '../api/axios'

// ── Design tokens (matches AdminDashboard palette) ────────────
const B = {
  navy:         '#1e3a5f',
  blue:         '#2563eb', blueDark: '#1d4ed8', blueXLight: '#dbeafe',
  violet:       '#7c3aed', violetLight: '#ede9fe',
  emerald:      '#059669', emeraldLight: '#d1fae5',
  red:          '#dc2626', redLight: '#fee2e2',
  amber:        '#d97706', amberLight: '#fef3c7',
  text:         '#111827', textMid: '#374151', textLight: '#6b7280',
  border:       '#e5e7eb', borderLight: '#f3f4f6',
  bg:           '#f9fafb', white: '#ffffff',
}

// ── Small field label style ────────────────────────────────────
const fieldLabel = {
  display: 'block', fontSize: '.82rem', fontWeight: 700,
  color: B.textMid, marginBottom: 6,
}

// ── Read-only info row ─────────────────────────────────────────
function InfoRow({ icon, label, value }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '14px 18px',
      borderBottom: `1px solid ${B.borderLight}`,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 8,
        background: B.blueXLight,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: '.72rem', fontWeight: 700, color: B.textLight, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>
          {label}
        </div>
        <div style={{ fontSize: '.95rem', fontWeight: 600, color: B.text }}>
          {value || <span style={{ color: B.textLight, fontStyle: 'italic' }}>Not set</span>}
        </div>
      </div>
    </div>
  )
}

// ── Section card wrapper ───────────────────────────────────────
function SectionCard({ title, icon, children, accentColor = B.blue }) {
  return (
    <div style={{
      background: B.white, border: `1.5px solid ${B.border}`,
      borderRadius: 14, overflow: 'hidden',
      boxShadow: '0 1px 4px rgba(0,0,0,.04)',
    }}>
      <div style={{
        padding: '18px 22px',
        borderBottom: `2px solid ${B.borderLight}`,
        display: 'flex', alignItems: 'center', gap: 10,
        background: B.bg,
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: 8,
          background: `${accentColor}18`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {icon}
        </div>
        <h2 style={{ fontSize: '1rem', fontWeight: 800, color: B.text, margin: 0 }}>
          {title}
        </h2>
      </div>
      <div style={{ padding: '22px' }}>
        {children}
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────
export default function AdminProfile() {
  const navigate          = useNavigate()
  const { user, updateProfile } = useAuth()

  // ── Contact info form ──────────────────────────────────────
  const [contact, setContact]         = useState({
    phone:   user?.phone   || '',
    address: user?.address || '',
  })
  const [savingContact, setSavingContact] = useState(false)
  const [contactSaved,  setContactSaved]  = useState(false)

  const handleSaveContact = async () => {
    setSavingContact(true)
    setContactSaved(false)
    try {
      await updateProfile({ phone: contact.phone, address: contact.address })
      setContactSaved(true)
      toast.success('Contact information updated successfully')
      setTimeout(() => setContactSaved(false), 3000)
    } catch {
      toast.error('Failed to save contact information')
    } finally {
      setSavingContact(false)
    }
  }

  // ── Password change form ───────────────────────────────────
  const [pwForm, setPwForm]         = useState({ current: '', next: '', confirm: '' })
  const [pwErrors, setPwErrors]     = useState({})
  const [savingPw, setSavingPw]     = useState(false)
  const [showPw, setShowPw]         = useState({ current: false, next: false, confirm: false })

  const validatePw = () => {
    const e = {}
    if (!pwForm.current)               e.current = 'Current password is required'
    if (pwForm.next.length < 8)        e.next    = 'New password must be at least 8 characters'
    if (pwForm.next !== pwForm.confirm) e.confirm = 'Passwords do not match'
    return e
  }

  const handleChangePassword = async () => {
    const errs = validatePw()
    if (Object.keys(errs).length) { setPwErrors(errs); return }
    setSavingPw(true)
    setPwErrors({})
    try {
      await api.post('/auth/change-password', {
        current_password: pwForm.current,
        new_password:     pwForm.next,
      })
      toast.success('Password changed successfully')
      setPwForm({ current: '', next: '', confirm: '' })
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to change password'
      toast.error(msg)
      if (msg.toLowerCase().includes('current')) {
        setPwErrors({ current: 'Incorrect current password' })
      }
    } finally {
      setSavingPw(false)
    }
  }

  const initials = (user?.fullName || user?.full_name || 'A')
    .split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <>
      <Helmet><title>My Profile — Admin | Shortlisting AI</title></Helmet>

      <div style={{ background: B.bg, minHeight: '100vh' }}>
        <Navbar />

        <div style={{ maxWidth: 780, margin: '0 auto', padding: '48px 24px 80px' }}>

          {/* ── Back link ── */}
          <button
            onClick={() => navigate('/admin')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 8,
              border: `1.5px solid ${B.border}`, background: B.white,
              color: B.textMid, fontWeight: 600, fontSize: '.88rem',
              cursor: 'pointer', marginBottom: 28,
            }}
          >
            <ArrowLeft size={14} /> Back to Admin Dashboard
          </button>

          {/* ── Page header ── */}
          <div style={{ marginBottom: 36 }}>
            <div style={{ fontSize: '.75rem', fontWeight: 800, letterSpacing: '.16em', textTransform: 'uppercase', color: B.violet, marginBottom: 6 }}>
              ADMIN PANEL
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
              {/* Avatar */}
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                background: `linear-gradient(135deg, ${B.navy}, ${B.violet})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.7rem', fontWeight: 800, color: '#fff', flexShrink: 0,
                boxShadow: '0 4px 16px rgba(124,58,237,.25)',
              }}>
                {initials}
              </div>
              <div>
                <h1 style={{ fontSize: '1.9rem', fontWeight: 800, color: B.text, margin: 0 }}>
                  {user?.fullName || user?.full_name}
                </h1>
                <div style={{ width: 44, height: 3, background: `linear-gradient(90deg, ${B.violet}, ${B.blue})`, marginTop: 8, borderRadius: 2 }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '4px 12px', borderRadius: 99,
                    background: B.violetLight, border: `1.5px solid ${B.violet}`,
                    color: B.violet, fontSize: '.8rem', fontWeight: 800,
                  }}>
                    <ShieldCheck size={12} /> System Administrator
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Grid of cards ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* ── Account info (read-only) ── */}
            <SectionCard
              title="Account Information"
              icon={<User size={16} color={B.blue} />}
              accentColor={B.blue}
            >
              <div style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid ${B.borderLight}` }}>
                <InfoRow
                  icon={<User size={16} color={B.blue} />}
                  label="Full Name"
                  value={user?.fullName || user?.full_name}
                />
                <InfoRow
                  icon={<Mail size={16} color={B.blue} />}
                  label="Email Address"
                  value={user?.email}
                />
                <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: B.blueXLight, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <ShieldCheck size={16} color={B.blue} />
                  </div>
                  <div>
                    <div style={{ fontSize: '.72rem', fontWeight: 700, color: B.textLight, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>Role</div>
                    <div style={{ fontSize: '.95rem', fontWeight: 600, color: B.violet }}>Administrator (Full Access)</div>
                  </div>
                </div>
              </div>
              <p style={{ fontSize: '.8rem', color: B.textLight, marginTop: 12, marginBottom: 0 }}>
                Name and email are managed by the system. Contact another administrator to change them.
              </p>
            </SectionCard>

            {/* ── Contact info (editable) ── */}
            <SectionCard
              title="Contact Information"
              icon={<Phone size={16} color={B.emerald} />}
              accentColor={B.emerald}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={fieldLabel}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Phone size={13} color={B.emerald} /> Phone Number
                    </span>
                  </label>
                  <input
                    type="tel"
                    value={contact.phone}
                    onChange={e => setContact(p => ({ ...p, phone: e.target.value }))}
                    placeholder="e.g. +250 7XX XXX XXX"
                    style={{
                      width: '100%', padding: '10px 14px', boxSizing: 'border-box',
                      border: `1.5px solid ${B.border}`, borderRadius: 8,
                      fontSize: '.9rem', color: B.text, outline: 'none',
                    }}
                    onFocus={e => e.target.style.borderColor = B.emerald}
                    onBlur={e => e.target.style.borderColor  = B.border}
                  />
                </div>
                <div>
                  <label style={fieldLabel}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <MapPin size={13} color={B.emerald} /> Address / Location
                    </span>
                  </label>
                  <input
                    type="text"
                    value={contact.address}
                    onChange={e => setContact(p => ({ ...p, address: e.target.value }))}
                    placeholder="e.g. Kigali, Rwanda"
                    style={{
                      width: '100%', padding: '10px 14px', boxSizing: 'border-box',
                      border: `1.5px solid ${B.border}`, borderRadius: 8,
                      fontSize: '.9rem', color: B.text, outline: 'none',
                    }}
                    onFocus={e => e.target.style.borderColor = B.emerald}
                    onBlur={e => e.target.style.borderColor  = B.border}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    onClick={handleSaveContact}
                    disabled={savingContact}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 7,
                      padding: '10px 22px', borderRadius: 8, border: 'none',
                      background: savingContact ? B.emeraldLight : B.emerald,
                      color: savingContact ? B.emerald : '#fff',
                      fontWeight: 700, fontSize: '.88rem',
                      cursor: savingContact ? 'not-allowed' : 'pointer',
                      transition: 'all .15s',
                    }}
                  >
                    {savingContact
                      ? <><div className="spinner" style={{ width: 14, height: 14, borderTopColor: B.emerald }} /> Saving…</>
                      : <><Save size={14} /> Save Changes</>
                    }
                  </button>
                  {contactSaved && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: B.emerald, fontSize: '.85rem', fontWeight: 700 }}>
                      <CheckCircle size={14} /> Saved
                    </span>
                  )}
                </div>
              </div>
            </SectionCard>

            {/* ── Password change ── */}
            <SectionCard
              title="Change Password"
              icon={<Lock size={16} color={B.amber} />}
              accentColor={B.amber}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {[
                  { key: 'current', label: 'Current Password',  placeholder: 'Enter your current password' },
                  { key: 'next',    label: 'New Password',       placeholder: 'At least 8 characters' },
                  { key: 'confirm', label: 'Confirm New Password', placeholder: 'Repeat the new password' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <label style={fieldLabel}>{label}</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showPw[key] ? 'text' : 'password'}
                        value={pwForm[key]}
                        onChange={e => {
                          setPwForm(p => ({ ...p, [key]: e.target.value }))
                          setPwErrors(p => ({ ...p, [key]: undefined }))
                        }}
                        placeholder={placeholder}
                        style={{
                          width: '100%', padding: '10px 40px 10px 14px',
                          boxSizing: 'border-box',
                          border: `1.5px solid ${pwErrors[key] ? B.red : B.border}`,
                          borderRadius: 8, fontSize: '.9rem', color: B.text, outline: 'none',
                        }}
                        onFocus={e => { if (!pwErrors[key]) e.target.style.borderColor = B.amber }}
                        onBlur={e => { if (!pwErrors[key]) e.target.style.borderColor = B.border }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPw(p => ({ ...p, [key]: !p[key] }))}
                        style={{
                          position: 'absolute', right: 10, top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none', border: 'none',
                          cursor: 'pointer', color: B.textLight, padding: 4,
                        }}
                      >
                        {showPw[key] ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                    {pwErrors[key] && (
                      <p style={{ fontSize: '.78rem', color: B.red, margin: '4px 0 0', fontWeight: 600 }}>
                        {pwErrors[key]}
                      </p>
                    )}
                  </div>
                ))}

                <div>
                  <button
                    onClick={handleChangePassword}
                    disabled={savingPw}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 7,
                      padding: '10px 22px', borderRadius: 8, border: 'none',
                      background: savingPw ? B.amberLight : B.amber,
                      color: savingPw ? B.amber : '#fff',
                      fontWeight: 700, fontSize: '.88rem',
                      cursor: savingPw ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {savingPw
                      ? <><div className="spinner" style={{ width: 14, height: 14, borderTopColor: B.amber }} /> Changing…</>
                      : <><Lock size={14} /> Change Password</>
                    }
                  </button>
                </div>

                <div style={{
                  padding: '12px 16px',
                  background: B.amberLight, border: `1px solid ${B.amber}`,
                  borderRadius: 8, fontSize: '.82rem', color: B.amber,
                  lineHeight: 1.6, fontWeight: 600,
                }}>
                  For security, you will not be logged out automatically after a password change.
                  Log out and log back in to confirm the new password works.
                </div>
              </div>
            </SectionCard>

          </div>
        </div>
      </div>
    </>
  )
}