/**
 * App.jsx
 *
 * FIXES:
 *  FIX-APP-1 — "Apply Now" no longer silently redirects admin/HR users
 *     to /login or / when they click Apply on a job listing.
 *     A new <ApplyGuard> wrapper checks the user's role before allowing
 *     access to /apply/:jobId:
 *       • Not logged in  → /login
 *       • Role applicant → allow (existing behaviour)
 *       • Role hr/admin  → show a clear "You cannot apply" page instead
 *         of a blank redirect, so the user understands what happened.
 *
 *  FIX-APP-2 — New /admin/profile route added so admin users have
 *     their own profile / account settings page.  Admins do not have
 *     job-application profiles, so this is a dedicated lightweight page
 *     (AdminProfile) rather than ApplicantDashboard.
 */

import {
  createBrowserRouter,
  RouterProvider,
  Navigate,
  Outlet,
  useNavigate,
  useLocation,
} from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import WakeBanner from './components/WakeBanner'

import HomePage           from './pages/HomePage'
import Login              from './pages/Login'
import Register           from './pages/Register'
import ForgotPassword     from './pages/ForgotPassword'
import ResetPassword      from './pages/ResetPassword'
import ApplyPage          from './pages/ApplyPage'
import ApplicantDashboard from './pages/ApplicantDashboard'
import HRDashboard        from './pages/HRDashboard'
import HRJobCreate        from './pages/HRJobCreate'
import HRReport           from './pages/HRReport'
import AdminDashboard     from './pages/AdminDashboard'
import AdminProfile       from './pages/AdminProfile'  // ✅ FIX-APP-2
import SupportChat        from './pages/SupportChat'

// ── Loading spinner shared between guards ──────────────────────
function FullPageSpinner() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      background: 'var(--c-surface)',
      gap: 16,
    }}>
      <div style={{
        width: 52, height: 52, borderRadius: 14,
        background: 'linear-gradient(135deg, var(--c-accent), var(--c-teal))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 8px 24px rgba(26,86,219,.30)',
        marginBottom: 4,
        animation: 'fadeIn .4s ease both',
      }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
          stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
          <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
          <line x1="12" y1="12" x2="12" y2="12" />
          <path d="M2 12h20" />
        </svg>
      </div>
      <div className="spinner" style={{ width: 32, height: 32 }} />
      <p style={{
        fontFamily: 'var(--font-display)',
        fontSize: '.85rem', fontWeight: 600,
        color: 'var(--c-muted)',
        letterSpacing: '.06em', textTransform: 'uppercase',
        margin: 0,
      }}>
        Loading…
      </p>
    </div>
  )
}

// ── Standard protected route (single required role) ────────────
function ProtectedRoute({ requiredRole }) {
  const { user, loading } = useAuth()
  if (loading)                                                 return <FullPageSpinner />
  if (!user)                                                   return <Navigate to="/login" replace />
  if (requiredRole && user.role !== requiredRole)              return <Navigate to="/" replace />
  return <Outlet />
}

// ── Multi-role protected route ─────────────────────────────────
function ProtectedRouteMulti({ allowedRoles }) {
  const { user, loading } = useAuth()
  if (loading)                                                 return <FullPageSpinner />
  if (!user)                                                   return <Navigate to="/login" replace />
  if (!allowedRoles.includes(user.role))                       return <Navigate to="/" replace />
  return <Outlet />
}

// ── Apply guard ────────────────────────────────────────────────
// FIX-APP-1: Replaces the old applicant-only ProtectedRoute for /apply.
//   • Not logged in           → /login  (same as before)
//   • role === 'applicant'    → render ApplyPage (same as before)
//   • role === 'hr'/'admin'   → show a friendly "you can't apply" message
//     with a button back to their own dashboard, so the user knows why
//     nothing happened instead of getting a confusing blank redirect.
function ApplyGuard() {
  const { user, loading } = useAuth()
  const navigate          = useNavigate()

  if (loading)               return <FullPageSpinner />
  if (!user)                 return <Navigate to="/login" replace />
  if (user.role === 'applicant') return <Outlet />

  // HR or Admin tried to apply — show a clear explanation
  const dashPath  = user.role === 'admin' ? '/admin' : '/hr'
  const dashLabel = user.role === 'admin' ? 'Admin Dashboard' : 'HR Dashboard'
  const roleLabel = user.role === 'admin' ? 'Administrator' : 'HR Officer'

  return (
    <div style={{
      minHeight: '100vh', background: '#f9fafb',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '40px 24px', textAlign: 'center',
    }}>
      {/* Icon */}
      <div style={{
        width: 80, height: 80, borderRadius: '50%',
        background: '#ede9fe', border: '3px solid #7c3aed',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 28, fontSize: '2rem',
      }}>
      </div>

      <h1 style={{ fontSize: '1.7rem', fontWeight: 800, color: '#111827', marginBottom: 10 }}>
        Application Not Available
      </h1>

      <div style={{ width: 44, height: 3, background: '#7c3aed', borderRadius: 99, margin: '0 auto 18px' }} />

      <p style={{ color: '#6b7280', maxWidth: 480, lineHeight: 1.8, marginBottom: 10 }}>
        You are currently logged in as a <strong style={{ color: '#111827' }}>{roleLabel}</strong>.
        Job applications are for <strong style={{ color: '#111827' }}>applicant accounts only</strong>.
      </p>

      <p style={{ color: '#6b7280', maxWidth: 480, lineHeight: 1.8, marginBottom: 32, fontSize: '.9rem' }}>
        If you need to test the application flow, log in with a separate applicant account.
        {user.role === 'admin' && ' As an admin you can create applicant accounts from the User Management tab.'}
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            padding: '10px 22px', borderRadius: 8,
            border: '1.5px solid #d1d5db', background: '#ffffff',
            color: '#374151', fontWeight: 600, cursor: 'pointer', fontSize: '.9rem',
          }}
        >
          ← Go Back
        </button>
        <button
          onClick={() => navigate(dashPath)}
          style={{
            padding: '10px 24px', borderRadius: 8, border: 'none',
            background: '#7c3aed', color: '#ffffff',
            fontWeight: 700, cursor: 'pointer', fontSize: '.9rem',
          }}
        >
          Go to {dashLabel}
        </button>
      </div>
    </div>
  )
}

// ── Root layout — Toaster + WakeBanner for all routes ──────────
function RootLayout() {
  return (
    <>
      <WakeBanner />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            fontFamily: "'EB Garamond', 'Times New Roman', Georgia, serif",
            fontSize:   '15px',
            borderRadius: '3px',
            border: '1.5px solid #cdd3e8',
            boxShadow: '0 6px 22px rgba(10,15,40,.13), 0 2px 7px rgba(10,15,40,.07)',
            background: '#ffffff',
            color: '#0b0f1a',
            padding: '12px 16px',
            maxWidth: 380,
          },
          success: {
            iconTheme: { primary: '#0a7c3e', secondary: '#ffffff' },
            style:     { borderLeft: '4px solid #0a7c3e' },
          },
          error: {
            iconTheme: { primary: '#c41a1a', secondary: '#ffffff' },
            style:     { borderLeft: '4px solid #c41a1a' },
          },
          loading: {
            iconTheme: { primary: '#1a56db', secondary: '#deeaff' },
            style:     { borderLeft: '4px solid #1a56db' },
          },
        }}
      />
      <Outlet />
    </>
  )
}

// ── Router ──────────────────────────────────────────────────────
const router = createBrowserRouter(
  [
    {
      element: <RootLayout />,
      children: [

        // ── Public ──────────────────────────────────────────────
        { path: '/',                element: <HomePage /> },
        { path: '/login',           element: <Login /> },
        { path: '/register',        element: <Register /> },
        { path: '/forgot-password', element: <ForgotPassword /> },
        { path: '/reset-password',  element: <ResetPassword /> },
        { path: '/support',         element: <SupportChat /> },

        // ── Apply — applicants only, HR/Admin shown a clear message ──
        // FIX-APP-1: ApplyGuard handles the role check and feedback
        {
          element: <ApplyGuard />,
          children: [
            { path: '/apply/:jobId', element: <ApplyPage /> },
          ],
        },

        // ── Applicant-only ───────────────────────────────────────
        {
          element: <ProtectedRoute requiredRole="applicant" />,
          children: [
            { path: '/applicant', element: <ApplicantDashboard /> },
            { path: '/dashboard', element: <ApplicantDashboard /> },
          ],
        },

        // ── HR-only ──────────────────────────────────────────────
        {
          element: <ProtectedRoute requiredRole="hr" />,
          children: [
            { path: '/hr',          element: <HRDashboard /> },
            { path: '/hr/jobs/new', element: <HRJobCreate /> },
          ],
        },

        // ── HR report — accessible by both HR and Admin ──────────
        {
          element: <ProtectedRouteMulti allowedRoles={['hr', 'admin']} />,
          children: [
            { path: '/hr/report/:jobId', element: <HRReport /> },
          ],
        },

        // ── Admin-only ───────────────────────────────────────────
        {
          element: <ProtectedRoute requiredRole="admin" />,
          children: [
            { path: '/admin',         element: <AdminDashboard /> },
            { path: '/admin/profile', element: <AdminProfile /> }, //
          ],
        },

        // ── Catch-all ────────────────────────────────────────────
        { path: '*', element: <Navigate to="/" replace /> },
      ],
    },
  ],
  {
    future: {
      v7_startTransition:   true,
      v7_relativeSplatPath: true,
    },
  },
)

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  )
}