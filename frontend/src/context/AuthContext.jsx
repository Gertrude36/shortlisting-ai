/**
 * AuthContext.jsx — v3.1.0
 *
 * FIXES vs v3.0.0:
 *
 *   FIX-CTX-7 — refreshDocuments() is now ONLY called for applicants.
 *     Previously it was already gated with `if (data.role === 'applicant')`
 *     in verifyToken(), but the public `refreshDocuments` function was still
 *     callable by anyone (e.g. Navbar). Now refreshDocuments() itself checks
 *     the user's role and silently no-ops for HR / admin, preventing the
 *     403 "applicant-only" error from appearing in the console for those roles.
 *
 *   FIX-CTX-8 — verifyToken() already had the applicant-only gate for
 *     documents (data.role === 'applicant'). Confirmed correct — kept as-is.
 *
 *  FIX-CTX-9 — login() calls verifyToken() via setTimeout(verifyToken, 0)
 *     which in turn calls refreshDocuments(). For HR/admin users this was
 *     triggering the 403. Now safe because of FIX-CTX-7.
 *
 * All v3.0.0 fixes retained:
 *   FIX-CTX-1 — national_id is localStorage-only (not in DB)
 *   FIX-CTX-2 — verifyToken fetches /profile/documents for applicants
 *   FIX-CTX-3 — updateProfile sends only { phone, address } to backend
 *   FIX-CTX-4 — refreshDocuments exposed on context
 *   FIX-CTX-5 — phone/address seeded from localStorage on login
 *  FIX-CTX-6 — cold-start fallback restores profileDocuments from cache
 */
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import api from '../api/axios'

const AuthContext = createContext(null)

// ─── helpers ──────────────────────────────────────────────────────────────────

function safeLS(key, fallback = '') {
  try { return localStorage.getItem(key) ?? fallback } catch { return fallback }
}
function setLS(key, value) {
  try { localStorage.setItem(key, String(value ?? '')) } catch {}
}
function clearLS() {
  try { localStorage.clear() } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────

export function AuthProvider({ children }) {
  const [user,             setUser]             = useState(null)
  const [profileDocuments, setProfileDocuments] = useState([])
  const [loading,          setLoading]          = useState(true)

  // ── Fetch profile documents ────────────────────────────────────────────────
  // FIX-CTX-7: Guard against non-applicant roles. HR / admin calling this
  // (e.g. from Navbar after a document upload) would get a 403 from the
  // applicant-only /profile/documents endpoint. We silently no-op for them.
  const refreshDocuments = useCallback(async (roleOverride) => {
    // Use the override when called before user state is set (during verifyToken),
    // otherwise fall back to the user state role.
    const effectiveRole = roleOverride ?? user?.role ?? safeLS('role')
    if (effectiveRole !== 'applicant') return null

    try {
      const { data } = await api.get('/profile/documents')
      const docs = data.documents || []
      setProfileDocuments(docs)
      try {
        localStorage.setItem(
          'profileDocuments',
          JSON.stringify(docs.map(d => ({ doc_type: d.doc_type, original_name: d.original_name }))),
        )
      } catch {}
      return docs
    } catch {
      return null
    }
  }, [user?.role])

  // ── Full token verification + profile load ─────────────────────────────────
  const verifyToken = useCallback(async () => {
    const token = safeLS('token')
    const role  = safeLS('role')

    if (!token || !role) {
      setUser(null)
      setLoading(false)
      return
    }

    try {
      const { data } = await api.get('/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      })

      const userObj = {
        token,
        role:        data.role,
        userId:      data.id,
        fullName:    data.full_name,
        full_name:   data.full_name,
        email:       data.email,
        phone:       data.phone   || '',
        address:     data.address || '',
        national_id: safeLS('national_id'),
      }

      setUser(userObj)
      setLS('role',     data.role)
      setLS('userId',   data.id)
      setLS('fullName', data.full_name)
      setLS('phone',    data.phone   || '')
      setLS('address',  data.address || '')

      // Only fetch documents for applicants — HR/admin have no document portfolio
      if (data.role === 'applicant') {
        await refreshDocuments('applicant')
      }

    } catch (error) {
      if (error.response?.status === 401) {
        clearLS()
        setUser(null)
        setProfileDocuments([])
      } else if (error.code === 'ERR_NETWORK' || !error.response) {
        // FIX-CTX-6: Backend cold-starting — restore from localStorage
        const storedUserId   = safeLS('userId')
        const storedFullName = safeLS('fullName')
        if (storedUserId && storedFullName) {
          setUser({
            token,
            role,
            userId:      storedUserId,
            fullName:    storedFullName,
            full_name:   storedFullName,
            phone:       safeLS('phone'),
            address:     safeLS('address'),
            national_id: safeLS('national_id'),
          })
          // Only restore cached documents for applicants
          if (role === 'applicant') {
            try {
              const cached = JSON.parse(localStorage.getItem('profileDocuments') || '[]')
              setProfileDocuments(cached)
            } catch {}
          }
        } else {
          setUser(null)
          setProfileDocuments([])
        }
      } else {
        console.error('[AuthContext] verifyToken error:', error.response?.status, error.message)
        setUser(null)
        setProfileDocuments([])
      }
    } finally {
      setLoading(false)
    }
  }, [refreshDocuments])

  useEffect(() => { verifyToken() }, [verifyToken])

  // ── login ──────────────────────────────────────────────────────────────────
  const login = (data) => {
    setLS('token',    data.access_token)
    setLS('role',     data.role)
    setLS('userId',   data.user_id)
    setLS('fullName', data.full_name)

    setUser({
      token:       data.access_token,
      role:        data.role,
      userId:      data.user_id,
      fullName:    data.full_name,
      full_name:   data.full_name,
      email:       data.email || '',
      // FIX-CTX-5: seed from localStorage so returning users don't flash
      phone:       safeLS('phone'),
      address:     safeLS('address'),
      national_id: safeLS('national_id'),
    })

    // Fetch real values from server — safe because verifyToken / refreshDocuments
    // now both guard against non-applicant roles before calling /profile/documents
    setTimeout(verifyToken, 0)
  }

  // ── logout ─────────────────────────────────────────────────────────────────
  const logout = () => {
    clearLS()
    setUser(null)
    setProfileDocuments([])
  }

  /**
   * updateProfile — persists phone + address to the DB.
   * national_id goes to localStorage only (not a DB column).
   *
   * ✅ FIX-CTX-3: Only sends { phone, address } to PUT /profile.
   */
  const updateProfile = useCallback(async (fields = {}) => {
    const dbPatch = {}
    if (fields.phone   !== undefined) dbPatch.phone   = fields.phone
    if (fields.address !== undefined) dbPatch.address = fields.address

    if (fields.national_id !== undefined) {
      setLS('national_id', fields.national_id)
    }

    let responseData = {}

    if (Object.keys(dbPatch).length > 0) {
      try {
        const { data } = await api.put('/profile', dbPatch)
        responseData = data

        const confirmed = {
          phone:   data.phone   ?? dbPatch.phone   ?? '',
          address: data.address ?? dbPatch.address ?? '',
        }

        setLS('phone',   confirmed.phone)
        setLS('address', confirmed.address)

        setUser(prev => prev ? ({
          ...prev,
          phone:       confirmed.phone,
          address:     confirmed.address,
          national_id: fields.national_id !== undefined
            ? fields.national_id
            : (prev.national_id || ''),
        }) : prev)

      } catch (err) {
        const fallback = {
          phone:   fields.phone   ?? (user?.phone   || ''),
          address: fields.address ?? (user?.address || ''),
        }
        setLS('phone',   fallback.phone)
        setLS('address', fallback.address)
        setUser(prev => prev ? ({
          ...prev,
          ...fallback,
          national_id: fields.national_id !== undefined
            ? fields.national_id
            : (prev?.national_id || ''),
        }) : prev)
        throw err
      }
    } else {
      if (fields.national_id !== undefined) {
        setUser(prev => prev ? ({ ...prev, national_id: fields.national_id }) : prev)
      }
    }

    // Refresh documents only for applicants
    if (fields.documents !== undefined && user?.role === 'applicant') {
      await refreshDocuments('applicant')
    }

    return responseData
  }, [user, refreshDocuments])

  return (
    <AuthContext.Provider value={{
      user,
      profileDocuments,
      login,
      logout,
      loading,
      updateProfile,
      verifyToken,
      refreshDocuments,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
