import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import {
  Users, RefreshCw, Trash2, X, UserPlus, Mail, Lock,
  ShieldCheck, ShieldX, ScrollText, BarChart2, Settings,
  UserCog, Briefcase, Activity, Bot, Database, Server,
  AlertCircle, CheckCircle, Clock, Search, ChevronDown,
  Shield, ExternalLink, TrendingUp,
  FileText, Award, RotateCcw, MessageSquare, Star, ThumbsUp,
  ThumbsDown, Smile, Frown, Meh, Filter
} from 'lucide-react'
import React from 'react'
import toast   from 'react-hot-toast'
import Navbar  from '../components/Navbar'
import { useAuth } from '../context/AuthContext'
import api     from '../api/axios'

// ── Design tokens ──────────────────────────────────────────────
const B = {
  navy: '#1e3a5f', navyMid: '#1e293b',
  blue: '#2563eb', blueDark: '#1d4ed8', blueLight: '#3b82f6', blueXLight: '#dbeafe',
  violet: '#7c3aed', violetLight: '#ede9fe',
  amber: '#d97706', amberLight: '#fef3c7',
  sky: '#0284c7', skyLight: '#e0f2fe',
  emerald: '#059669', emeraldLight: '#d1fae5',
  red: '#dc2626', redLight: '#fee2e2',
  text: '#111827', textMid: '#374151', textLight: '#6b7280',
  border: '#e5e7eb', borderLight: '#f3f4f6',
  bg: '#f9fafb', white: '#ffffff',
  pink: '#db2777', pinkLight: '#fce7f3',
}

// ── Helpers ─────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
function pct(n) {
  if (n == null) return '—'
  return `${(n * 100).toFixed(1)}%`
}

// ── Stat card ───────────────────────────────────────────────────
function StatCard({ label, value, icon, color, bg, border, sub }) {
  return (
    <div style={{ background: bg, border: `2px solid ${border}`, borderRadius: 12, padding: '20px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, color, marginBottom: 10 }}>
        {icon}
        <span style={{ fontSize: '.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em' }}>{label}</span>
      </div>
      <div style={{ fontSize: '2.4rem', fontWeight: 800, color, lineHeight: 1 }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: '.78rem', color, opacity: 0.7, marginTop: 5, fontWeight: 600 }}>{sub}</div>}
    </div>
  )
}

// ── Role Badge ──────────────────────────────────────────────────
function RoleBadge({ role }) {
  const cfg = {
    admin:     { bg: B.violetLight, border: B.violet, color: B.violet, label: 'Admin' },
    hr:        { bg: B.skyLight,    border: B.sky,    color: B.sky,    label: 'HR' },
    applicant: { bg: B.emeraldLight,border: B.emerald,color: B.emerald,label: 'Applicant' },
  }
  const c = cfg[role] || { bg: B.bg, border: B.border, color: B.textLight, label: role }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: 99, background: c.bg, border: `1.5px solid ${c.border}`, color: c.color, fontSize: '.78rem', fontWeight: 800 }}>
      {c.label}
    </span>
  )
}

// ── Status Dot ──────────────────────────────────────────────────
function StatusDot({ status }) {
  const color = status === 'success' ? B.emerald : status === 'failure' ? B.red : B.amber
  return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color, marginRight: 6 }} />
}

// ── Score Bar ───────────────────────────────────────────────────
function ScoreBar({ value, max = 1 }) {
  const pctVal = Math.round(((value ?? 0) / max) * 100)
  const color  = pctVal >= 40 ? B.emerald : B.red
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: B.borderLight, borderRadius: 99, overflow: 'hidden', minWidth: 60 }}>
        <div style={{ height: '100%', width: `${Math.min(pctVal, 100)}%`, background: color, borderRadius: 99, transition: 'width .4s' }} />
      </div>
      <span style={{ fontSize: '.78rem', fontWeight: 700, color, minWidth: 38, textAlign: 'right' }}>{pctVal}%</span>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   MODALS
   ══════════════════════════════════════════════════════════════ */

function DeleteUserModal({ user, onConfirm, onCancel, isDeleting }) {
  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(10,12,20,.70)', backdropFilter: 'blur(5px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: B.white, borderRadius: 14, width: '100%', maxWidth: 420, padding: '40px 36px', boxShadow: '0 28px 72px rgba(10,15,40,.25)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ width: 60, height: 60, borderRadius: '50%', background: B.redLight, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 22 }}>
          <Trash2 size={26} color={B.red} />
        </div>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: B.text, margin: '0 0 12px', textAlign: 'center' }}>Delete this account?</h3>
        <p style={{ fontSize: '.95rem', color: B.textLight, lineHeight: 1.7, margin: '0 0 10px', textAlign: 'center' }}>
          Permanently delete <strong style={{ color: B.text }}>{user?.full_name}</strong> (<em>{user?.email}</em>) — role: <strong>{user?.role}</strong>.
        </p>
        <div style={{ padding: '12px 16px', background: B.amberLight, border: `2px solid ${B.amber}`, borderRadius: 8, marginBottom: 28, width: '100%' }}>
          <p style={{ fontSize: '.85rem', color: B.amber, margin: 0, lineHeight: 1.6, textAlign: 'center', fontWeight: 600 }}>All applications and documents belonging to this account will be permanently deleted.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, width: '100%' }}>
          <button onClick={onCancel} disabled={isDeleting} style={{ flex: 1, padding: '11px 0', borderRadius: 8, border: `1.5px solid ${B.border}`, background: B.white, color: B.textMid, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
          <button onClick={onConfirm} disabled={isDeleting} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '11px 0', borderRadius: 8, background: isDeleting ? B.redLight : B.red, border: 'none', color: B.white, fontWeight: 800, cursor: isDeleting ? 'not-allowed' : 'pointer' }}>
            {isDeleting ? <><div className="spinner" style={{ width: 14, height: 14, borderColor: 'rgba(255,255,255,.3)', borderTopColor: '#fff' }} /> Deleting…</> : <><Trash2 size={14} /> Delete Account</>}
          </button>
        </div>
      </div>
    </div>
  )
}

function ChangeRoleModal({ user, onConfirm, onCancel, isSaving }) {
  const [newRole, setNewRole] = useState(user?.role || 'applicant')
  const roles = [
    { value: 'applicant', label: 'Job Applicant', desc: 'Can browse and apply for jobs' },
    { value: 'hr',        label: 'HR Officer',    desc: 'Manages candidates and shortlisting' },
    { value: 'admin',     label: 'System Admin',  desc: 'Full system control — assign carefully' },
  ]
  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(10,12,20,.70)', backdropFilter: 'blur(5px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: B.white, borderRadius: 14, width: '100%', maxWidth: 460, boxShadow: '0 28px 72px rgba(10,15,40,.25)', overflow: 'hidden' }}>
        <div style={{ padding: '22px 28px', borderBottom: `1px solid ${B.borderLight}`, background: `linear-gradient(135deg, ${B.navy} 0%, ${B.violet} 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 8, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><UserCog size={18} color="#fff" /></div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#fff' }}>Change Role</div>
              <div style={{ fontSize: '.8rem', color: '#c4b5fd' }}>{user?.full_name}</div>
            </div>
          </div>
          <button onClick={onCancel} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 6, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}><X size={14} /></button>
        </div>
        <div style={{ padding: '24px 28px' }}>
          <p style={{ fontSize: '.9rem', color: B.textLight, marginBottom: 18 }}>Current role: <RoleBadge role={user?.role} /></p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {roles.map(r => (
              <button key={r.value} onClick={() => setNewRole(r.value)} style={{ padding: '12px 16px', borderRadius: 8, cursor: 'pointer', border: `2px solid ${newRole === r.value ? B.violet : B.border}`, background: newRole === r.value ? B.violetLight : B.white, textAlign: 'left' }}>
                <div style={{ fontWeight: 800, fontSize: '.9rem', color: newRole === r.value ? B.violet : B.textMid }}>{r.label}</div>
                <div style={{ fontSize: '.78rem', color: B.textLight, marginTop: 2 }}>{r.desc}</div>
              </button>
            ))}
          </div>
          {newRole === 'admin' && (
            <div style={{ padding: '10px 14px', background: B.amberLight, border: `1.5px solid ${B.amber}`, borderRadius: 8, marginBottom: 16 }}>
              <p style={{ fontSize: '.82rem', color: B.amber, margin: 0, fontWeight: 700 }}>Granting admin access gives this user full system control.</p>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onCancel} disabled={isSaving} style={{ flex: 1, padding: '11px 0', borderRadius: 8, border: `1.5px solid ${B.border}`, background: B.white, color: B.textMid, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
            <button onClick={() => onConfirm(newRole)} disabled={isSaving || newRole === user?.role} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '11px 0', borderRadius: 8, background: isSaving || newRole === user?.role ? B.violetLight : B.violet, border: 'none', color: newRole === user?.role ? B.violet : '#fff', fontWeight: 800, cursor: isSaving || newRole === user?.role ? 'not-allowed' : 'pointer' }}>
              {isSaving ? <><div className="spinner" style={{ width: 14, height: 14, borderColor: 'rgba(255,255,255,.3)', borderTopColor: '#fff' }} /> Saving…</> : <><ShieldCheck size={14} /> Apply Role</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function AddUserModal({ onClose, onCreated }) {
  const [form, setForm]       = useState({ full_name: '', email: '', role: 'applicant' })
  const [loading, setLoading] = useState(false)
  const [errors, setErrors]   = useState({})

  const validate = () => {
    const e = {}
    if (!form.full_name.trim() || form.full_name.trim().length < 2) e.full_name = 'Full name must be at least 2 characters'
    if (!form.email.trim()) e.email = 'Email is required'
    return e
  }

  const handleSubmit = async () => {
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setLoading(true)
    try {
      const { data } = await api.post('/admin/users', {
        full_name: form.full_name,
        email: form.email,
        role: form.role,
      })
      toast.success(`Account created for ${data.full_name} (${data.role})`)
      onCreated(data); onClose()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create account')
    } finally { setLoading(false) }
  }

  const roles = [
    { value: 'applicant', label: 'Applicant', desc: 'Job seeker' },
    { value: 'hr',        label: 'HR Officer', desc: 'Manages hiring' },
    { value: 'admin',     label: 'Admin',      desc: 'Full system access' },
  ]

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(10,12,20,.70)', backdropFilter: 'blur(5px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: B.white, borderRadius: 14, width: '100%', maxWidth: 480, boxShadow: '0 28px 72px rgba(10,15,40,.25)', overflow: 'hidden' }}>
        <div style={{ padding: '22px 28px', borderBottom: `1px solid ${B.borderLight}`, background: `linear-gradient(135deg, ${B.navy} 0%, ${B.blue} 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 8, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><UserPlus size={18} color="#fff" /></div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#fff' }}>Create Account</div>
              <div style={{ fontSize: '.8rem', color: '#bfdbfe' }}>Admin can create any role</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 6, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}><X size={14} /></button>
        </div>
        <div style={{ padding: '26px 28px' }}>
          {[{ key: 'full_name', label: 'Full Name', type: 'text', placeholder: 'Full name' },
            { key: 'email',    label: 'Email Address', type: 'email', placeholder: 'Email address' }].map(f => (
            <div key={f.key} style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: '.88rem', fontWeight: 700, color: B.textMid, marginBottom: 6 }}>{f.label}</label>
              <input type={f.type} value={form[f.key]} onChange={e => { setForm(p => ({ ...p, [f.key]: e.target.value })); setErrors(p => ({ ...p, [f.key]: undefined })) }} style={{ width: '100%', padding: '10px 12px', border: `1.5px solid ${errors[f.key] ? '#ef4444' : B.border}`, borderRadius: 8, fontSize: '.9rem', color: B.text, boxSizing: 'border-box' }} placeholder={f.placeholder} />
              {errors[f.key] && <p style={{ fontSize: '.78rem', color: '#ef4444', margin: '4px 0 0', fontWeight: 600 }}>{errors[f.key]}</p>}
            </div>
          ))}
          <div style={{ marginBottom: 14, padding: '12px 14px', background: '#f7f9fc', border: '1px solid #dbeafe', borderRadius: 10 }}>
            <div style={{ fontSize: '.88rem', color: B.textMid }}>A secure password will be generated automatically and emailed to the new user.</div>
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: '.88rem', fontWeight: 700, color: B.textMid, marginBottom: 8 }}>Account Role</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {roles.map(r => (
                <button key={r.value} onClick={() => setForm(p => ({ ...p, role: r.value }))} style={{ flex: 1, padding: '10px 8px', borderRadius: 8, cursor: 'pointer', border: `2px solid ${form.role === r.value ? B.blue : B.border}`, background: form.role === r.value ? B.blueXLight : B.white, textAlign: 'center' }}>
                  <div style={{ fontWeight: 800, fontSize: '.85rem', color: form.role === r.value ? B.blue : B.textMid }}>{r.label}</div>
                  <div style={{ fontSize: '.7rem', color: B.textLight, marginTop: 2 }}>{r.desc}</div>
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} disabled={loading} style={{ flex: 1, padding: '11px 0', borderRadius: 8, border: `1.5px solid ${B.border}`, background: B.white, color: B.textMid, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleSubmit} disabled={loading} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '11px 0', borderRadius: 8, background: loading ? '#93c5fd' : B.blue, border: 'none', color: '#fff', fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? <><div className="spinner" style={{ width: 14, height: 14, borderColor: 'rgba(255,255,255,.3)', borderTopColor: '#fff' }} /> Creating…</> : <><UserPlus size={14} /> Create Account</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}


/* ══════════════════════════════════════════════════════════════
   USERS TAB
   ══════════════════════════════════════════════════════════════ */
function UsersTab({ currentUserId }) {
  const [users,        setUsers]        = useState([])
  const [loading,      setLoading]      = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [roleTarget,   setRoleTarget]   = useState(null)
  const [isDeleting,   setIsDeleting]   = useState(false)
  const [isSavingRole, setIsSavingRole] = useState(false)
  const [roleFilter,   setRoleFilter]   = useState('all')
  const [search,       setSearch]       = useState('')

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (roleFilter !== 'all') params.role = roleFilter
      if (search.trim()) params.search = search.trim()
      const { data } = await api.get('/admin/users', { params })
      setUsers(data.users || [])
    } catch { toast.error('Failed to load users') }
    finally { setLoading(false) }
  }, [roleFilter, search])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const handleDeleteUser = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      await api.delete(`/admin/users/${deleteTarget.id}`)
      toast.success(`Account "${deleteTarget.full_name}" permanently deleted`)
      setUsers(prev => prev.filter(u => u.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to delete account') }
    finally { setIsDeleting(false) }
  }

  const handleChangeRole = async (newRole) => {
    if (!roleTarget) return
    setIsSavingRole(true)
    try {
      const { data } = await api.put(`/admin/users/${roleTarget.id}/role`, { role: newRole })
      toast.success(`${roleTarget.full_name} role changed to ${newRole}`)
      setUsers(prev => prev.map(u => u.id === roleTarget.id ? { ...u, role: data.role } : u))
      setRoleTarget(null)
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to change role') }
    finally { setIsSavingRole(false) }
  }

  const totalAdmin = users.filter(u => u.role === 'admin').length
  const totalHR    = users.filter(u => u.role === 'hr').length
  const totalApp   = users.filter(u => u.role === 'applicant').length

  return (
    <>
      {showAddModal && <AddUserModal onClose={() => setShowAddModal(false)} onCreated={u => setUsers(prev => [u, ...prev])} />}
      {deleteTarget && <DeleteUserModal user={deleteTarget} onConfirm={handleDeleteUser} onCancel={() => setDeleteTarget(null)} isDeleting={isDeleting} />}
      {roleTarget   && <ChangeRoleModal user={roleTarget} onConfirm={handleChangeRole} onCancel={() => setRoleTarget(null)} isSaving={isSavingRole} />}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total Accounts', value: users.length,  color: B.text,    bg: B.bg,           border: B.border },
          { label: 'Admins',         value: totalAdmin,    color: B.violet,  bg: B.violetLight,  border: B.violet },
          { label: 'HR Officers',    value: totalHR,       color: B.sky,     bg: B.skyLight,     border: B.sky },
          { label: 'Applicants',     value: totalApp,      color: B.emerald, bg: B.emeraldLight, border: B.emerald },
        ].map(({ label, value, color, bg, border }) => (
          <div key={label} style={{ background: bg, border: `1.5px solid ${border}`, borderRadius: 10, padding: '16px 20px' }}>
            <div style={{ fontSize: '.72rem', fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: B.textLight }} />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchUsers()} placeholder="Search name or email…" style={{ paddingLeft: 30, paddingRight: 10, paddingTop: 8, paddingBottom: 8, border: `1.5px solid ${B.border}`, borderRadius: 8, fontSize: '.88rem', color: B.text, background: B.white, width: 200 }} />
          </div>
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={{ padding: '8px 12px', border: `1.5px solid ${B.border}`, borderRadius: 8, background: B.white, color: B.text, fontSize: '.88rem' }}>
            <option value="all">All Roles</option>
            <option value="admin">Admins</option>
            <option value="hr">HR Officers</option>
            <option value="applicant">Applicants</option>
          </select>
          <button onClick={fetchUsers} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 8, border: `1.5px solid ${B.border}`, background: B.white, color: B.textMid, fontWeight: 700, fontSize: '.85rem', cursor: 'pointer' }}><RefreshCw size={13} /> Refresh</button>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setShowAddModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, background: B.blue, border: 'none', color: '#fff', fontWeight: 700, fontSize: '.85rem', cursor: 'pointer' }}>
            <UserPlus size={14} /> Add Account
          </button>
        </div>
      </div>

      <div style={{ background: B.white, border: `1.5px solid ${B.border}`, borderRadius: 12, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: B.bg, borderBottom: `2px solid ${B.border}` }}>
              {['#', 'Full Name', 'Email', 'Role', 'Joined', 'Actions'].map(h => (
                <th key={h} style={{ padding: '13px 18px', textAlign: 'left', fontWeight: 800, fontSize: '.75rem', color:'white', textTransform: 'uppercase', letterSpacing: '.08em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '48px 24px' }}><div className="spinner" style={{ width: 36, height: 36, margin: '0 auto' }} /></td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '48px 24px', color: B.textLight }}>No accounts found.</td></tr>
            ) : users.map((u, i) => {
              const isSelf = u.id === currentUserId
              return (
                <tr key={u.id} style={{ borderBottom: `1px solid ${B.borderLight}`, background: isSelf ? B.amberLight : i % 2 === 0 ? B.white : B.bg }}
                  onMouseEnter={e => { if (!isSelf) e.currentTarget.style.background = B.blueXLight }}
                  onMouseLeave={e => { e.currentTarget.style.background = isSelf ? B.amberLight : i % 2 === 0 ? B.white : B.bg }}>
                  <td style={{ padding: '14px 18px', color: B.textLight, fontSize: '.85rem', fontWeight: 700 }}>{u.id}</td>
                  <td style={{ padding: '14px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: u.role === 'admin' ? B.violetLight : u.role === 'hr' ? B.skyLight : B.blueXLight, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.9rem', fontWeight: 800, flexShrink: 0, color: u.role === 'admin' ? B.violet : u.role === 'hr' ? B.sky : B.blueDark }}>
                        {u.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '.95rem', color: B.text }}>
                          {u.full_name}
                          {isSelf && <span style={{ marginLeft: 7, fontSize: '.72rem', fontWeight: 800, background: B.amberLight, color: B.amber, border: `1.5px solid ${B.amber}`, borderRadius: 4, padding: '1px 6px' }}>You</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '14px 18px', fontSize: '.9rem', color: B.textMid }}>{u.email}</td>
                  <td style={{ padding: '14px 18px' }}><RoleBadge role={u.role} /></td>
                  <td style={{ padding: '14px 18px', fontSize: '.88rem', color: B.textLight, fontWeight: 600 }}>{fmtDate(u.created_at)}</td>
                  <td style={{ padding: '14px 18px' }}>
                    {isSelf ? (
                      <span style={{ fontSize: '.82rem', color: B.textLight, fontStyle: 'italic' }}>(current account)</span>
                    ) : (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button onClick={() => setRoleTarget(u)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 7, background: B.violetLight, border: `1.5px solid ${B.violet}`, color: B.violet, fontSize: '.78rem', fontWeight: 800, cursor: 'pointer', transition: 'all .15s' }}
                          onMouseEnter={e => { e.currentTarget.style.background = B.violet; e.currentTarget.style.color = '#fff' }}
                          onMouseLeave={e => { e.currentTarget.style.background = B.violetLight; e.currentTarget.style.color = B.violet }}>
                          <UserCog size={12} /> Role
                        </button>
                        <button onClick={() => setDeleteTarget(u)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 7, background: B.redLight, border: `1.5px solid ${B.red}`, color: B.red, fontSize: '.78rem', fontWeight: 800, cursor: 'pointer', transition: 'all .15s' }}
                          onMouseEnter={e => { e.currentTarget.style.background = B.red; e.currentTarget.style.color = '#fff' }}
                          onMouseLeave={e => { e.currentTarget.style.background = B.redLight; e.currentTarget.style.color = B.red }}>
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

/* ══════════════════════════════════════════════════════════════
   JOBS TAB
   ══════════════════════════════════════════════════════════════ */
function JobsTab() {
  const [jobs, setJobs]       = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    api.get('/admin/jobs').then(res => setJobs(res.data || [])).catch(() => toast.error('Failed to load jobs')).finally(() => setLoading(false))
  }, [])

  function getJobStatus(job) {
    const deadlinePassed = job.deadline && new Date(job.deadline) < new Date()
    if (deadlinePassed)   return 'expired'
    if (!job.is_active)   return 'inactive'
    return 'active'
  }

  const statusCfg = {
    active:   { label: 'Active',   bg: B.emeraldLight, border: B.emerald, color: B.emerald },
    inactive: { label: 'Inactive', bg: B.redLight,     border: B.red,     color: B.red     },
    expired:  { label: 'Expired',  bg: B.amberLight,   border: B.amber,   color: B.amber   },
  }

  return (
    <div style={{ background: B.white, border: `1.5px solid ${B.border}`, borderRadius: 12, overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: B.bg, borderBottom: `2px solid ${B.border}` }}>
            {['#', 'Title', 'Location', 'Type', 'Applicants', 'Deadline', 'Status'].map(h => (
              <th key={h} style={{ padding: '13px 18px', textAlign: 'left', fontWeight: 800, fontSize: '.75rem', color:'white', textTransform: 'uppercase', letterSpacing: '.08em', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', padding: '48px' }}><div className="spinner" style={{ width: 36, height: 36, margin: '0 auto' }} /></td></tr>
          ) : jobs.length === 0 ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', padding: '48px', color: B.textLight }}>No jobs found.</td></tr>
          ) : jobs.map((j, i) => {
            const expired = j.deadline && new Date(j.deadline) < new Date()
            const status  = getJobStatus(j)
            const sc      = statusCfg[status]
            return (
              <tr key={j.id} style={{ borderBottom: `1px solid ${B.borderLight}`, background: i % 2 === 0 ? B.white : B.bg }}>
                <td style={{ padding: '14px 18px', color: B.textLight, fontSize: '.85rem' }}>{j.id}</td>
                <td style={{ padding: '14px 18px', fontWeight: 700, color: B.text }}>{j.title}</td>
                <td style={{ padding: '14px 18px', fontSize: '.9rem', color: B.textMid }}>{j.location || '—'}</td>
                <td style={{ padding: '14px 18px', fontSize: '.9rem', color: B.textMid }}>{j.employment_type || '—'}</td>
                <td style={{ padding: '14px 18px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 28, height: 24, padding: '0 8px', borderRadius: 6, background: j.applicant_count > 0 ? B.blueXLight : B.bg, color: j.applicant_count > 0 ? B.blueDark : B.textLight, fontWeight: 800, fontSize: '.85rem' }}>{j.applicant_count}</span>
                </td>
                <td style={{ padding: '14px 18px', fontSize: '.88rem', color: expired ? B.amber : B.textLight, fontWeight: expired ? 700 : 400 }}>
                  {j.deadline ? fmtDate(j.deadline) : '—'}{expired ? ' (Expired)' : ''}
                </td>
                <td style={{ padding: '14px 18px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 99, fontSize: '.78rem', fontWeight: 800, background: sc.bg, border: `1.5px solid ${sc.border}`, color: sc.color }}>
                    {sc.label}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   LOGS TAB
   ══════════════════════════════════════════════════════════════ */
function LogsTab() {
  const [logs,         setLogs]         = useState([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [roleFilter,   setRoleFilter]   = useState('')
  const [clearing,     setClearing]     = useState(false)
  const [total,        setTotal]        = useState(0)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = { limit: 200 }
      if (search.trim())       params.search    = search.trim()
      if (actionFilter.trim()) params.action    = actionFilter.trim().toUpperCase()
      if (roleFilter)          params.user_role = roleFilter
      const { data } = await api.get('/admin/logs', { params })
      setLogs(data.logs || []); setTotal(data.total || 0)
    } catch { toast.error('Failed to load logs') }
    finally { setLoading(false) }
  }, [search, actionFilter, roleFilter])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const handleClearLogs = async () => {
    if (!window.confirm('Clear logs older than 30 days? This cannot be undone.')) return
    setClearing(true)
    try {
      const { data } = await api.delete('/admin/logs', { params: { older_than_days: 30 } })
      toast.success(data.message); fetchLogs()
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to clear logs') }
    finally { setClearing(false) }
  }

  const actionColor = (action) => {
    if (action?.includes('DELETE') || action?.includes('FAILED'))    return { bg: B.redLight,     color: B.red }
    if (action?.includes('CREATED') || action?.includes('REGISTER')) return { bg: B.emeraldLight, color: B.emerald }
    if (action?.includes('LOGIN'))                                   return { bg: B.blueXLight,   color: B.blue }
    if (action?.includes('ADMIN'))                                   return { bg: B.violetLight,  color: B.violet }
    if (action?.includes('SHORTLIST'))                               return { bg: B.skyLight,     color: B.sky }
    if (action?.includes('FEEDBACK'))                                return { bg: B.pinkLight,    color: B.pink }
    return { bg: B.bg, color: B.textMid }
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: B.textLight }} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchLogs()} placeholder="Search logs…" style={{ paddingLeft: 30, paddingRight: 10, paddingTop: 8, paddingBottom: 8, border: `1.5px solid ${B.border}`, borderRadius: 8, fontSize: '.88rem', color: B.text, background: B.white, width: 180 }} />
        </div>
        <input type="text" value={actionFilter} onChange={e => setActionFilter(e.target.value)} placeholder="Filter by action…" style={{ padding: '8px 12px', border: `1.5px solid ${B.border}`, borderRadius: 8, fontSize: '.88rem', color: B.text, background: B.white, width: 160 }} />
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={{ padding: '8px 12px', border: `1.5px solid ${B.border}`, borderRadius: 8, background: B.white, color: B.text, fontSize: '.88rem' }}>
          <option value="">All Roles</option>
          <option value="admin">Admin</option>
          <option value="hr">HR</option>
          <option value="applicant">Applicant</option>
        </select>
        <button onClick={fetchLogs} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 8, border: `1.5px solid ${B.border}`, background: B.white, color: B.textMid, fontWeight: 700, fontSize: '.85rem', cursor: 'pointer' }}><RefreshCw size={13} /> Refresh</button>
        <button onClick={handleClearLogs} disabled={clearing} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 8, border: `1.5px solid ${B.red}`, background: B.redLight, color: B.red, fontWeight: 700, fontSize: '.85rem', cursor: clearing ? 'not-allowed' : 'pointer', marginLeft: 'auto' }}>
          <Trash2 size={13} /> {clearing ? 'Clearing…' : 'Clear Old Logs (>30d)'}
        </button>
      </div>
      <div style={{ marginBottom: 12, fontSize: '.88rem', color: B.textLight, fontWeight: 600 }}>{total} total log entries — showing {logs.length}</div>
      <div style={{ background: B.white, border: `1.5px solid ${B.border}`, borderRadius: 12, overflow: 'auto', maxHeight: 600 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr style={{ background: B.bg, borderBottom: `2px solid ${B.border}` }}>
              {['Time', 'Action', 'User', 'Role', 'Target', 'Detail', 'Status'].map(h => (
                <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 800, fontSize: '.72rem', color: 'white', textTransform: 'uppercase', letterSpacing: '.08em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '48px' }}><div className="spinner" style={{ width: 36, height: 36, margin: '0 auto' }} /></td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '48px', color: B.textLight }}>No logs found.</td></tr>
            ) : logs.map((log, i) => {
              const ac = actionColor(log.action)
              return (
                <tr key={log.id} style={{ borderBottom: `1px solid ${B.borderLight}`, background: i % 2 === 0 ? B.white : B.bg, fontSize: '.82rem' }}>
                  <td style={{ padding: '10px 14px', color: B.textLight, whiteSpace: 'nowrap' }}>{fmtDateTime(log.created_at)}</td>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: 5, background: ac.bg, color: ac.color, fontWeight: 800, fontSize: '.72rem' }}>{log.action}</span>
                  </td>
                  <td style={{ padding: '10px 14px', color: B.text, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.user_email || '—'}</td>
                  <td style={{ padding: '10px 14px' }}>{log.user_role ? <RoleBadge role={log.user_role} /> : '—'}</td>
                  <td style={{ padding: '10px 14px', color: B.textLight, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.target || '—'}</td>
                  <td style={{ padding: '10px 14px', color: B.textMid, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.detail}>{log.detail || '—'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <StatusDot status={log.status} />
                    <span style={{ color: log.status === 'success' ? B.emerald : log.status === 'failure' ? B.red : B.amber, fontWeight: 700, fontSize: '.78rem' }}>{log.status}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

/* ══════════════════════════════════════════════════════════════
   OVERVIEW TAB
   FIX: Use optional chaining (?.) on stats.system so that if the
   API returns stats without a `system` key (or returns a partial
   object), we get `undefined` instead of a TypeError crash.
   ══════════════════════════════════════════════════════════════ */
function OverviewTab() {
  const [stats, setStats]     = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchStats = () => {
    setLoading(true)
    api.get('/admin/stats')
      .then(res => setStats(res.data))
      .catch(() => toast.error('Failed to load stats'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchStats() }, [])

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
      <div className="spinner" style={{ width: 40, height: 40 }} />
    </div>
  )

  if (!stats) return (
    <div style={{ textAlign: 'center', padding: 80 }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: B.redLight, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
        <AlertCircle size={30} color={B.red} />
      </div>
      <div style={{ fontWeight: 800, fontSize: '1.1rem', color: B.red, marginBottom: 8 }}>Failed to load system stats</div>
      <div style={{ fontSize: '.9rem', color: B.textLight, marginBottom: 24 }}>Make sure the backend server is running on port 8000.</div>
      <button onClick={fetchStats} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 24px', borderRadius: 8, background: B.blue, color: '#fff', fontWeight: 700, border: 'none', cursor: 'pointer' }}>
        <RotateCcw size={14} /> Retry
      </button>
    </div>
  )

  //  FIX: All stats.system accesses use optional chaining (?.)
  // so a missing/undefined `system` key never throws a TypeError.
  const mlReady     = stats.system?.ml_ready     ?? false
  const ocrEnabled  = stats.system?.ocr_enabled  ?? false
  const mlError     = stats.system?.ml_error     ?? null
  const serverBorn  = stats.system?.server_born_at ?? null
  const totalLogs   = stats.system?.total_logs   ?? '—'

  const systemItems = [
    { label: 'System Status',   value: 'Online',                        ok: true },
    { label: 'ML Model Status', value: mlReady   ? 'Active' : 'Loading…', ok: mlReady },
    { label: 'OCR Service',     value: ocrEnabled ? 'Active' : 'Disabled', ok: ocrEnabled },
    { label: 'Database',        value: 'Connected',                     ok: true },
    { label: 'AI Service',      value: mlReady   ? 'Active' : 'Degraded', ok: mlReady },
  ]

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: 16, marginBottom: 32 }}>
        <StatCard label="Total Users"     value={stats.users?.total}                  icon={<Users size={17} />}       color={B.text}    bg={B.bg}           border={B.border}  sub={`+${stats.users?.new_this_week ?? 0} this week`} />
        <StatCard label="HR Officers"     value={stats.users?.hr}                     icon={<Shield size={17} />}      color={B.sky}     bg={B.skyLight}     border={B.sky} />
        <StatCard label="Job Applicants"  value={stats.users?.applicants}             icon={<Users size={17} />}       color={B.emerald} bg={B.emeraldLight} border={B.emerald} />
        <StatCard label="Total Jobs"      value={stats.jobs?.total}                   icon={<Briefcase size={17} />}   color={B.amber}   bg={B.amberLight}   border={B.amber}   sub={`+${stats.jobs?.new_this_week ?? 0} this week`} />
        <StatCard label="Applications"    value={stats.applications?.total}           icon={<BarChart2 size={17} />}   color={B.blue}    bg={B.blueXLight}   border={B.blue} />
        <StatCard label="Shortlisted"     value={stats.applications?.shortlisted}     icon={<CheckCircle size={17} />} color={B.emerald} bg={B.emeraldLight} border={B.emerald} />
        <StatCard label="Not Shortlisted" value={stats.applications?.not_shortlisted} icon={<ShieldX size={17} />}     color={B.red}     bg={B.redLight}     border={B.red} />
        <StatCard label="Pending AI"      value={stats.applications?.pending}         icon={<Clock size={17} />}       color={B.amber}   bg={B.amberLight}   border={B.amber} />
      </div>
      <div style={{ background: B.white, border: `1.5px solid ${B.border}`, borderRadius: 12, padding: '24px 28px', marginBottom: 24 }}>
        <div style={{ fontWeight: 800, fontSize: '1rem', color: B.text, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Server size={16} color={B.blue} /> System Overview
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          {systemItems.map(item => (
            <div key={item.label} style={{ background: item.ok ? B.emeraldLight : B.amberLight, border: `1.5px solid ${item.ok ? B.emerald : B.amber}`, borderRadius: 8, padding: '12px 16px' }}>
              <div style={{ fontSize: '.72rem', fontWeight: 700, color: item.ok ? B.emerald : B.amber, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>{item.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.ok ? B.emerald : B.amber, flexShrink: 0 }} />
                <span style={{ fontWeight: 800, fontSize: '.9rem', color: item.ok ? '#14532d' : B.amber }}>{item.value}</span>
              </div>
            </div>
          ))}
        </div>
        {mlError && (
          <div style={{ marginTop: 16, padding: '12px 16px', background: B.amberLight, border: `1.5px solid ${B.amber}`, borderRadius: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.88rem', color: B.amber, fontWeight: 700 }}>
              <AlertCircle size={14} /> ML Load Warning: {mlError}
            </div>
          </div>
        )}
        <div style={{ marginTop: 16, fontSize: '.82rem', color: B.textLight }}>
          Server started: {serverBorn ? new Date(serverBorn).toLocaleString() : '—'} · {totalLogs} total audit log entries
        </div>
      </div>
    </>
  )
}

/* ══════════════════════════════════════════════════════════════
   SYSTEM REPORTS TAB
   ══════════════════════════════════════════════════════════════ */
function SystemReportsTab() {
  const navigate              = useNavigate()
  const [reports, setReports] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [sortField, setSortField] = useState('total')
  const [sortDir, setSortDir]     = useState('desc')

  const fetchReports = useCallback(() => {
    setLoading(true); setError(null)
    api.get('/admin/reports')
      .then(res => setReports(res.data))
      .catch(err => {
        const msg = err.response?.data?.detail || err.message || 'Failed to load reports'
        setError(msg)
        toast.error(msg)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchReports() }, [fetchReports])

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  const sortedPositions = reports?.positions
    ? [...reports.positions].sort((a, b) => {
        const va = a[sortField] ?? 0
        const vb = b[sortField] ?? 0
        return sortDir === 'asc' ? va - vb : vb - va
      })
    : []

// Update SortTh to always use white text, and a gold arrow for active sort
const SortTh = ({ field, children }) => (
  <th onClick={() => toggleSort(field)} style={{
    padding: '13px 16px', textAlign: 'left', fontWeight: 800, fontSize: '.72rem',
    background:'black', color: 'white',  // Always white text
    textTransform: 'uppercase', letterSpacing: '.08em', whiteSpace: 'nowrap',
    cursor: 'pointer', userSelect: 'none'
  }}>
    {children} {sortField === field ? (sortDir === 'asc' ? '↑' : '↓') : ''}
  </th>
)

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><div className="spinner" style={{ width: 40, height: 40 }} /></div>

  if (error) return (
    <div style={{ padding: '40px 28px', textAlign: 'center' }}>
      <div style={{ width: 60, height: 60, borderRadius: '50%', background: B.redLight, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
        <AlertCircle size={28} color={B.red} />
      </div>
      <div style={{ fontWeight: 800, fontSize: '1.1rem', color: B.red, marginBottom: 8 }}>Failed to load reports</div>
      <div style={{ fontSize: '.9rem', color: B.textLight, marginBottom: 24 }}>{error}</div>
      <button onClick={fetchReports} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 24px', borderRadius: 8, background: B.blue, color: '#fff', fontWeight: 700, border: 'none', cursor: 'pointer' }}>
        <RotateCcw size={14} /> Retry
      </button>
    </div>
  )

  if (!reports) return null

  const shortlistRate = reports.total_applications > 0
    ? ((reports.total_shortlisted / reports.total_applications) * 100).toFixed(1)
    : '0'

  return (
    <div>
      <div style={{ padding: '14px 18px', background: B.blueXLight, border: `1.5px solid ${B.blueLight}`, borderRadius: 10, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 10, fontSize: '.88rem', color: B.blueDark, fontWeight: 600 }}>
        <BarChart2 size={16} color={B.blue} />
        Whole-system shortlisting reports aggregated from all HR officers and positions.
        <button onClick={fetchReports} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: `1.5px solid ${B.blueLight}`, background: B.white, color: B.blue, fontWeight: 700, fontSize: '.82rem', cursor: 'pointer' }}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 28 }}>
        {[
          { label: 'Total Applications', value: reports.total_applications,  color: B.text,    bg: B.bg,           border: B.border,   icon: <Users size={17} /> },
          { label: 'Total Shortlisted',  value: reports.total_shortlisted,   color: B.emerald, bg: B.emeraldLight, border: B.emerald,  icon: <CheckCircle size={17} />, sub: `${shortlistRate}% shortlist rate` },
          { label: 'Total Rejected',     value: reports.total_rejected,      color: B.red,     bg: B.redLight,     border: B.red,      icon: <ShieldX size={17} /> },
          { label: 'Pending AI',         value: reports.total_pending,       color: B.amber,   bg: B.amberLight,   border: B.amber,    icon: <Clock size={17} /> },
          { label: 'Manual Review',      value: reports.total_manual_review, color: B.sky,     bg: B.skyLight,     border: B.sky,      icon: <AlertCircle size={17} />, sub: 'Low OCR / AI confidence' },
          { label: 'Active Positions',   value: reports.total_positions,     color: B.violet,  bg: B.violetLight,  border: B.violet,   icon: <Briefcase size={17} /> },
        ].map(({ label, value, color, bg, border, icon, sub }) => (
          <div key={label} style={{ background: bg, border: `1.5px solid ${border}`, borderRadius: 10, padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, color, marginBottom: 8 }}>{icon}<span style={{ fontSize: '.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em' }}>{label}</span></div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color, lineHeight: 1 }}>{value ?? '—'}</div>
            {sub && <div style={{ fontSize: '.72rem', color, opacity: 0.75, marginTop: 4, fontWeight: 600 }}>{sub}</div>}
          </div>
        ))}
      </div>

      <div style={{ background: B.white, border: `1.5px solid ${B.border}`, borderRadius: 12, marginBottom: 24, overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px', borderBottom: `1.5px solid ${B.borderLight}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1rem', color: B.text, display: 'flex', alignItems: 'center', gap: 8 }}>
              <BarChart2 size={16} color={B.blue} /> Shortlisting Results by Position
            </div>
            <div style={{ fontSize: '.8rem', color: B.textLight, marginTop: 3 }}>
              {sortedPositions.length} position{sortedPositions.length !== 1 ? 's' : ''} — click column headers to sort
            </div>
          </div>
        </div>

        {sortedPositions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: B.textLight }}>
            <Briefcase size={36} style={{ marginBottom: 12, opacity: 0.2, display: 'block', margin: '0 auto 12px' }} />
            <div style={{ fontWeight: 700 }}>No position data yet</div>
            <div style={{ fontSize: '.85rem', marginTop: 4 }}>Run shortlisting on at least one job position to see reports here.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
               <tr style={{ background: B.navy, borderBottom: `2px solid ${B.border}` }}>
  <SortTh field="job_title">Position</SortTh>
  <th style={{ padding: '13px 16px', textAlign: 'left', fontWeight: 800, fontSize: '.72rem', background: B.navy, color: 'white', textTransform: 'uppercase', letterSpacing: '.08em', whiteSpace: 'nowrap' }}>HR Officer</th>
  <SortTh field="total">Total</SortTh>
  <SortTh field="shortlisted">Shortlisted</SortTh>
  <SortTh field="rejected">Rejected</SortTh>
  <SortTh field="manual_review">Manual Review</SortTh>
  <SortTh field="shortlist_rate">Shortlist Rate</SortTh>
  <SortTh field="avg_score">Avg Score</SortTh>
  <th style={{ padding: '13px 16px', textAlign: 'left', fontWeight: 800, fontSize: '.72rem', background: B.navy, color: 'white', textTransform: 'uppercase', letterSpacing: '.08em', whiteSpace: 'nowrap' }}>Report</th>
</tr>
              </thead>
              <tbody>
                {sortedPositions.map((pos, i) => (
                  <tr key={pos.job_id} style={{ borderBottom: `1px solid ${B.borderLight}`, background: i % 2 === 0 ? B.white : B.bg }}
                    onMouseEnter={e => e.currentTarget.style.background = B.blueXLight}
                    onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? B.white : B.bg}>
                    <td style={{ padding: '13px 16px', fontWeight: 700, color: B.text, fontSize: '.9rem' }}>
                      {pos.job_title}
                      {pos.job_location && <div style={{ fontSize: '.72rem', color: B.textLight, marginTop: 2 }}>{pos.job_location}</div>}
                    </td>
                    <td style={{ padding: '13px 16px', fontSize: '.85rem', color: B.textMid }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <div style={{ width: 26, height: 26, borderRadius: '50%', background: B.skyLight, color: B.sky, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.75rem', fontWeight: 800, flexShrink: 0 }}>
                          {(pos.hr_officer || '?').charAt(0).toUpperCase()}
                        </div>
                        <span>{pos.hr_officer || '—'}</span>
                      </div>
                    </td>
                    <td style={{ padding: '13px 16px', fontWeight: 800, color: B.text, fontSize: '.95rem' }}>{pos.total}</td>
                    <td style={{ padding: '13px 16px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 4, background: B.emeraldLight, color: B.emerald, fontSize: '.82rem', fontWeight: 800 }}>
                        <CheckCircle size={11} /> {pos.shortlisted}
                      </span>
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 4, background: B.redLight, color: B.red, fontSize: '.82rem', fontWeight: 800 }}>
                        {pos.rejected}
                      </span>
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      {(pos.manual_review || 0) > 0 ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 4, background: B.amberLight, color: B.amber, fontSize: '.82rem', fontWeight: 800 }}>
                          <AlertCircle size={10} /> {pos.manual_review}
                        </span>
                      ) : <span style={{ color: B.textLight, fontSize: '.82rem' }}>—</span>}
                    </td>
                    <td style={{ padding: '13px 16px', minWidth: 140 }}>
                      <ScoreBar value={pos.shortlist_rate ?? 0} max={1} />
                    </td>
                    <td style={{ padding: '13px 16px', fontSize: '.88rem', color: B.textMid, fontWeight: 700 }}>
                      {pos.avg_score != null ? `${(pos.avg_score * 100).toFixed(1)}%` : '—'}
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      <button onClick={() => navigate(`/hr/report/${pos.job_id}`)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, background: B.blueXLight, border: `1.5px solid ${B.blueLight}`, color: B.blueDark, fontSize: '.78rem', fontWeight: 800, cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap', transition: 'all .15s' }}
                        onMouseEnter={e => { e.currentTarget.style.background = B.blue; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = B.blue }}
                        onMouseLeave={e => { e.currentTarget.style.background = B.blueXLight; e.currentTarget.style.color = B.blueDark; e.currentTarget.style.borderColor = B.blueLight }}>
                        <ExternalLink size={11} /> View Report
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {reports.generated_at && (
        <div style={{ fontSize: '.78rem', color: B.textLight, textAlign: 'center', padding: '8px 0' }}>
          Last refreshed: {new Date(reports.generated_at).toLocaleString('en-GB')}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   FEEDBACK TAB
   ══════════════════════════════════════════════════════════════ */
function StarRating({ rating, size = 14 }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <Star key={n} size={size} fill={n <= rating ? '#f59e0b' : 'none'} color={n <= rating ? '#f59e0b' : '#d1d5db'} />
      ))}
    </div>
  )
}

function CategoryBadge({ category }) {
  const cfg = {
    ui:           { bg: B.blueXLight,   color: B.blueDark, label: ' UI / Design' },
    shortlisting: { bg: B.violetLight,  color: B.violet,   label: ' Shortlisting' },
    documents:    { bg: B.amberLight,   color: B.amber,    label: 'Documents' },
    speed:        { bg: B.emeraldLight, color: B.emerald,  label: 'Speed' },
    other:        { bg: B.bg,           color: B.textMid,  label: ' Other' },
  }
  const c = cfg[category] || cfg.other
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 99, background: c.bg, color: c.color, fontSize: '.75rem', fontWeight: 700 }}>
      {c.label}
    </span>
  )
}

function FeedbackTab() {
  const [feedback,       setFeedback]       = useState([])
  const [loading,        setLoading]        = useState(true)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [avgRating,      setAvgRating]      = useState(null)
  const [total,          setTotal]          = useState(0)

  const fetchFeedback = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (categoryFilter) params.category = categoryFilter
      const { data } = await api.get('/admin/feedback', { params })
      setFeedback(data.feedback || [])
      setAvgRating(data.avg_rating)
      setTotal(data.total || 0)
    } catch {
      toast.error('Failed to load feedback')
    } finally {
      setLoading(false)
    }
  }, [categoryFilter])

  useEffect(() => { fetchFeedback() }, [fetchFeedback])

  const ratingCounts = [5, 4, 3, 2, 1].map(r => ({
    rating: r,
    count: feedback.filter(f => f.rating === r).length,
  }))
  const maxCount = Math.max(...ratingCounts.map(r => r.count), 1)

  const categoryCounts = ['ui', 'shortlisting', 'documents', 'speed', 'other'].map(cat => ({
    cat,
    count: feedback.filter(f => f.category === cat).length,
  }))

  const ratingIcon = (r) => {
    if (r >= 4) return <Smile size={16} color={B.emerald} />
    if (r === 3) return <Meh size={16} color={B.amber} />
    return <Frown size={16} color={B.red} />
  }

  return (
    <div>
      <div style={{ padding: '14px 18px', background: B.pinkLight, border: `1.5px solid ${B.pink}`, borderRadius: 10, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 10, fontSize: '.88rem', color: B.pink, fontWeight: 600 }}>
        <MessageSquare size={16} color={B.pink} />
        User feedback submitted by all system users. Anonymous submissions are shown without an email.
        <button onClick={fetchFeedback} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: `1.5px solid ${B.pink}`, background: B.white, color: B.pink, fontWeight: 700, fontSize: '.82rem', cursor: 'pointer' }}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 28 }}>
        <div style={{ background: B.pinkLight, border: `1.5px solid ${B.pink}`, borderRadius: 10, padding: '16px 20px' }}>
          <div style={{ fontSize: '.72rem', fontWeight: 800, color: B.pink, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <MessageSquare size={13} /> Total Feedback
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: B.pink, lineHeight: 1 }}>{total}</div>
        </div>
        <div style={{ background: B.amberLight, border: `1.5px solid ${B.amber}`, borderRadius: 10, padding: '16px 20px' }}>
          <div style={{ fontSize: '.72rem', fontWeight: 800, color: B.amber, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Star size={13} /> Average Rating
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: B.amber, lineHeight: 1 }}>
            {avgRating != null ? avgRating.toFixed(1) : '—'}
          </div>
          {avgRating != null && <div style={{ marginTop: 6 }}><StarRating rating={Math.round(avgRating)} size={12} /></div>}
        </div>
        <div style={{ background: B.white, border: `1.5px solid ${B.border}`, borderRadius: 10, padding: '16px 20px', gridColumn: 'span 2' }}>
          <div style={{ fontSize: '.72rem', fontWeight: 800, color: B.textMid, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12 }}>Rating Distribution</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ratingCounts.map(({ rating, count }) => (
              <div key={rating} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 60 }}>
                  <Star size={11} fill="#f59e0b" color="#f59e0b" />
                  <span style={{ fontSize: '.8rem', fontWeight: 700, color: B.textMid }}>{rating}</span>
                </div>
                <div style={{ flex: 1, height: 8, background: B.borderLight, borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(count / maxCount) * 100}%`, background: '#f59e0b', borderRadius: 99, transition: 'width .4s' }} />
                </div>
                <span style={{ fontSize: '.78rem', fontWeight: 700, color: B.textLight, minWidth: 24, textAlign: 'right' }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ background: B.white, border: `1.5px solid ${B.border}`, borderRadius: 10, padding: '16px 20px', gridColumn: 'span 2' }}>
          <div style={{ fontSize: '.72rem', fontWeight: 800, color: B.textMid, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12 }}>By Category</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {categoryCounts.map(({ cat, count }) => (
              <button key={cat} onClick={() => setCategoryFilter(categoryFilter === cat ? '' : cat)} style={{ padding: '6px 14px', borderRadius: 99, cursor: 'pointer', fontWeight: 700, fontSize: '.82rem', border: `1.5px solid ${categoryFilter === cat ? B.blue : B.border}`, background: categoryFilter === cat ? B.blueXLight : B.bg, color: categoryFilter === cat ? B.blue : B.textMid, transition: 'all .15s' }}>
                <CategoryBadge category={cat} /> <span style={{ marginLeft: 4 }}>{count}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '.88rem', color: B.textLight }}>
          <Filter size={13} /><span>Filter by category:</span>
        </div>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{ padding: '8px 12px', border: `1.5px solid ${B.border}`, borderRadius: 8, background: B.white, color: B.text, fontSize: '.88rem' }}>
          <option value="">All Categories</option>
          <option value="ui">UI / Design</option>
          <option value="shortlisting">Shortlisting</option>
          <option value="documents">Documents</option>
          <option value="speed">Speed</option>
          <option value="other">Other</option>
        </select>
        <button onClick={fetchFeedback} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 8, border: `1.5px solid ${B.border}`, background: B.white, color: B.textMid, fontWeight: 700, fontSize: '.85rem', cursor: 'pointer' }}>
          <RefreshCw size={13} /> Refresh
        </button>
        <span style={{ fontSize: '.85rem', color: B.textLight, marginLeft: 'auto' }}>
          {feedback.length} result{feedback.length !== 1 ? 's' : ''}
        </span>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <div className="spinner" style={{ width: 40, height: 40 }} />
        </div>
      ) : feedback.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 24px', color: B.textLight, background: B.white, borderRadius: 12, border: `1.5px solid ${B.border}` }}>
          <MessageSquare size={40} style={{ opacity: 0.2, marginBottom: 12 }} />
          <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 4 }}>No feedback yet</div>
          <div style={{ fontSize: '.88rem' }}>Users will see a feedback button in the bottom-right corner.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {feedback.map(fb => (
            <div key={fb.id} style={{ background: B.white, border: `1.5px solid ${fb.rating >= 4 ? B.emerald : fb.rating === 3 ? B.amber : B.red}20`, borderLeft: `4px solid ${fb.rating >= 4 ? B.emerald : fb.rating === 3 ? B.amber : B.red}`, borderRadius: 10, padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {ratingIcon(fb.rating)}
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '.9rem', color: B.text }}>
                      {fb.user_email === 'anonymous'
                        ? <span style={{ color: B.textLight, fontStyle: 'italic' }}>Anonymous</span>
                        : fb.user_email || '—'}
                    </div>
                    <div style={{ fontSize: '.75rem', color: B.textLight, marginTop: 1 }}>
                      {fb.user_role ? <RoleBadge role={fb.user_role} /> : null}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <CategoryBadge category={fb.category} />
                  <StarRating rating={fb.rating} size={14} />
                  <span style={{ fontSize: '.75rem', color: B.textLight, whiteSpace: 'nowrap' }}>{fmtDateTime(fb.submitted_at)}</span>
                </div>
              </div>
              <div style={{ fontSize: '.88rem', color: B.textMid, lineHeight: 1.6, padding: '10px 14px', background: B.bg, borderRadius: 8 }}>
                {fb.message}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   MAIN AdminDashboard
   ══════════════════════════════════════════════════════════════ */
export default function AdminDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('overview')

  const tabs = [
    { key: 'overview',  label: 'Dashboard',       icon: <BarChart2 size={15} /> },
    { key: 'users',     label: 'User Management', icon: <Users size={15} /> },
    { key: 'jobs',      label: 'Job Management',  icon: <Briefcase size={15} /> },
    { key: 'reports',   label: 'System Reports',  icon: <TrendingUp size={15} /> },
    { key: 'logs',      label: 'Audit Logs',      icon: <ScrollText size={15} /> },
    { key: 'feedback',  label: 'User Feedback',   icon: <MessageSquare size={15} /> },
  ]

  return (
    <>
      <Helmet><title>Admin Dashboard — Shortlisting AI</title></Helmet>
      <div className="page-wrapper" style={{ background: B.bg, minHeight: '100vh' }}>
        <Navbar />
        <div style={{ padding: '48px 28px 80px', maxWidth: 1400, margin: '0 auto' }}>

          {/* ── Header ── */}
          <div style={{ marginBottom: 36 }}>
            <div style={{ fontSize: '.8rem', fontWeight: 800, letterSpacing: '.16em', textTransform: 'uppercase', color: B.violet, marginBottom: 8 }}>ADMIN PANEL</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
              <div>
                <h1 style={{ fontSize: '2.2rem', fontWeight: 800, color: B.text }}>Administrator Dashboard</h1>
                <div style={{ width: 44, height: 4, background: `linear-gradient(90deg, ${B.violet}, ${B.blue})`, marginTop: 10, borderRadius: 2 }} />
                <p style={{ color: B.textLight, marginTop: 10, fontSize: '1rem', fontWeight: 500 }}>
                  Welcome, {user?.fullName || user?.full_name}. Monitor and manage the entire system.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: B.violetLight, border: `1.5px solid ${B.violet}` }}>
                  <ShieldCheck size={14} color={B.violet} />
                  <span style={{ fontSize: '.85rem', fontWeight: 800, color: B.violet }}>System Administrator</span>
                </div>
                <button
                  onClick={() => navigate('/admin/profile')}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: B.white, border: `1.5px solid ${B.border}`, color: B.textMid, fontWeight: 700, fontSize: '.85rem', cursor: 'pointer', transition: 'all .15s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = B.violet; e.currentTarget.style.color = B.violet; e.currentTarget.style.background = B.violetLight }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = B.border;  e.currentTarget.style.color = B.textMid;  e.currentTarget.style.background = B.white }}
                >
                  <UserCog size={14} /> My Profile
                </button>
              </div>
            </div>
          </div>

          {/* ── Quick-access cards ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 32 }}>
            {[
              { key: 'users',    icon: <Users size={22} color={B.blue} />,         title: 'User Management',  desc: 'Create, view, update, or remove system users.',  bg: B.blueXLight,   border: B.blue },
              { key: 'users',    icon: <UserCog size={22} color={B.violet} />,     title: 'Role Management',  desc: 'Manage roles and permissions.',                   bg: B.violetLight,  border: B.violet },
              { key: 'jobs',     icon: <Briefcase size={22} color={B.amber} />,    title: 'Job Management',   desc: 'Create, update, and manage job postings.',        bg: B.amberLight,   border: B.amber },
              { key: 'reports',  icon: <TrendingUp size={22} color={B.emerald} />, title: 'System Reports',   desc: 'Whole-system shortlisting reports from all HR.',  bg: B.emeraldLight, border: B.emerald },
              { key: 'logs',     icon: <ScrollText size={22} color={B.sky} />,     title: 'Audit Logs',       desc: 'View system audit and activity logs.',             bg: B.skyLight,     border: B.sky },
              { key: 'feedback', icon: <MessageSquare size={22} color={B.pink} />, title: 'User Feedback',    desc: 'View ratings and comments from all users.',       bg: B.pinkLight,    border: B.pink },
            ].map((card, i) => (
              <button key={i} onClick={() => setActiveTab(card.key)}
                style={{ padding: '20px 20px', background: activeTab === card.key ? card.border : card.bg, border: `1.5px solid ${card.border}`, borderRadius: 12, cursor: 'pointer', textAlign: 'left', transition: 'transform .15s, box-shadow .15s, background .15s' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.1)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}>
                <div style={{ marginBottom: 12 }}>{card.icon}</div>
                <div style={{ fontWeight: 800, fontSize: '.95rem', color: activeTab === card.key ? B.white : B.text, marginBottom: 4 }}>{card.title}</div>
                <div style={{ fontSize: '.82rem', color: activeTab === card.key ? 'rgba(255,255,255,0.8)' : B.textLight, lineHeight: 1.5 }}>{card.desc}</div>
              </button>
            ))}
          </div>

          {/* ── Tab nav ── */}
          <div style={{ display: 'flex', gap: 0, borderBottom: `2px solid ${B.border}`, marginBottom: 28, overflowX: 'auto' }}>
            {tabs.map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '11px 20px', border: 'none', borderBottom: activeTab === tab.key ? `3px solid ${tab.key === 'feedback' ? B.pink : B.violet}` : '3px solid transparent', background: 'none', cursor: 'pointer', fontWeight: activeTab === tab.key ? 800 : 600, fontSize: '.92rem', color: activeTab === tab.key ? (tab.key === 'feedback' ? B.pink : B.violet) : B.textLight, transition: 'all .15s', marginBottom: -2, whiteSpace: 'nowrap' }}>
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {/* ── Tab content ── */}
          {activeTab === 'overview'  && <OverviewTab />}
          {activeTab === 'users'     && (
            <div>
              <div style={{ marginBottom: 24 }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: B.text, marginBottom: 4 }}>User Management</h2>
                <p style={{ fontSize: '.95rem', color: B.textLight }}>Create, search, change roles, or permanently remove any system account.</p>
              </div>
              <UsersTab currentUserId={user?.userId ? Number(user.userId) : null} />
            </div>
          )}
          {activeTab === 'jobs'      && (
            <div>
              <div style={{ marginBottom: 24 }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: B.text, marginBottom: 4 }}>Job Management</h2>
                <p style={{ fontSize: '.95rem', color: B.textLight }}>
                  View all job postings across the system. Status shows <strong>Expired</strong> when the deadline has passed,
                  <strong> Inactive</strong> when manually disabled, and <strong>Active</strong> when open for applications.
                </p>
              </div>
              <JobsTab />
            </div>
          )}
          {activeTab === 'reports'   && (
            <div>
              <div style={{ marginBottom: 24 }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: B.text, marginBottom: 4 }}>System Reports</h2>
                <p style={{ fontSize: '.95rem', color: B.textLight }}>Whole-system shortlisting reports aggregated from all HR officers and positions.</p>
              </div>
              <SystemReportsTab />
            </div>
          )}
          {activeTab === 'logs'      && (
            <div>
              <div style={{ marginBottom: 24 }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: B.text, marginBottom: 4 }}>Audit Logs</h2>
                <p style={{ fontSize: '.95rem', color: B.textLight }}>Full system audit trail. Only admins can view and clear logs.</p>
              </div>
              <LogsTab />
            </div>
          )}
          {activeTab === 'feedback'  && (
            <div>
              <div style={{ marginBottom: 24 }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: B.text, marginBottom: 4 }}>User Feedback</h2>
                <p style={{ fontSize: '.95rem', color: B.textLight }}>Ratings, comments, and suggestions submitted by users of all roles.</p>
              </div>
              <FeedbackTab />
            </div>
          )}

        </div>
      </div>
    </>
  )
}