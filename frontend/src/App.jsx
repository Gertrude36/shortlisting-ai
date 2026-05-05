import {
  createBrowserRouter,
  RouterProvider,
  Navigate,
  Outlet,
} from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './context/AuthContext'

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

// ── Protected route wrapper ──────────────────────────────────
function ProtectedRoute({ requiredRole }) {
  const { user, loading } = useAuth()

  if (loading) {
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
          width: 52,
          height: 52,
          borderRadius: 14,
          background: 'linear-gradient(135deg, var(--c-accent), var(--c-teal))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
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
          fontSize: '.85rem',
          fontWeight: 600,
          color: 'var(--c-muted)',
          letterSpacing: '.06em',
          textTransform: 'uppercase',
          margin: 0,
        }}>
          Loading…
        </p>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (requiredRole && user.role !== requiredRole) return <Navigate to="/" replace />
  return <Outlet />
}

// ── Root layout — provides Toaster to all routes ─────────────
function RootLayout() {
  return (
    <>
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

// ── Router with v7 future flags ───────────────────────────────
const router = createBrowserRouter(
  [
    {
      element: <RootLayout />,
      children: [
        // Public
        { path: '/',                element: <HomePage /> },
        { path: '/login',           element: <Login /> },
        { path: '/register',        element: <Register /> },
        { path: '/forgot-password', element: <ForgotPassword /> },
        { path: '/reset-password',  element: <ResetPassword /> },

        // Applicant-only
        {
          element: <ProtectedRoute requiredRole="applicant" />,
          children: [
            { path: '/apply/:jobId', element: <ApplyPage /> },
            { path: '/applicant',    element: <ApplicantDashboard /> },
            { path: '/dashboard',    element: <ApplicantDashboard /> },
          ],
        },

        // HR-only
        {
          element: <ProtectedRoute requiredRole="hr" />,
          children: [
            { path: '/hr',               element: <HRDashboard /> },
            { path: '/hr/jobs/new',      element: <HRJobCreate /> },
            { path: '/hr/report/:jobId', element: <HRReport /> },
          ],
        },

        // Catch-all
        { path: '*', element: <Navigate to="/" replace /> },
      ],
    },
  ],
  {
    future: {
      v7_startTransition:   true,  // fixes: React.startTransition warning
      v7_relativeSplatPath: true,  // fixes: relative splat path warning
    },
  }
)

// ── App root ─────────────────────────────────────────────────
export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  )
}
