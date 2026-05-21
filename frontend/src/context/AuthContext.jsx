/**
 * AuthContext.jsx — v3.0.0
 *
 * ROOT-CAUSE FIXES FOR PROFILE DATA NOT PERSISTING:
 *
 *  ✅ FIX-CTX-1 — Removed national_id from DB expectations entirely.
 *     national_id is NOT a column on the users table. Storing it only in
 *     localStorage caused the "Not set" flash on every login because
 *     verifyToken() overwrote the localStorage value with '' from /auth/me.
 *     national_id is now kept ONLY in localStorage (client-side only field)
 *     and never sent to PUT /profile (backend rejects unknown fields anyway).
 *
 *  ✅ FIX-CTX-2 — verifyToken() now also fetches /profile/documents after
 *     /auth/me so the Navbar sidebar always shows real persisted documents
 *     (not an empty array). This is what caused "Documents: Not set" even
 *     after uploading — the user object never had documents populated.
 *
 *  ✅ FIX-CTX-3 — updateProfile() now sends ONLY the fields the backend
 *     PUT /profile actually accepts: { phone, address }. Previously it
 *     was sending national_id and documents which the backend silently
 *     ignored, making callers think they were saved when they weren't.
 *
 *  ✅ FIX-CTX-4 — refreshDocuments() exposed on context so Navbar can
 *     call it after uploading a profile document without triggering a full
 *     verifyToken() round-trip.
 *
 *  ✅ FIX-CTX-5 — phone and address are always seeded from localStorage
 *     on login() so the profile-complete gate never shows a false
 *     incomplete state for returning users between the login and the
 *     async verifyToken() call.
 *
 *  ✅ FIX-CTX-6 — Cold-start fallback also restores profileDocuments from
 *     a cached copy so the Navbar doesn't flash "No documents" when the
 *     backend is waking up.
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
  const [user,            setUser]            = useState(null)
  const [profileDocuments, setProfileDocuments] = useState([])
  const [loading,         setLoading]         = useState(true)

  // ── Fetch profile documents (separated so Navbar can call it alone) ────────
  const refreshDocuments = useCallback(async () => {
    try {
      const { data } = await api.get('/profile/documents')
      const docs = data.documents || []
      setProfileDocuments(docs)
      // Cache a lightweight version for cold-start fallback
      try {
        localStorage.setItem(
          'profileDocuments',
          JSON.stringify(docs.map(d => ({ doc_type: d.doc_type, original_name: d.original_name }))),
        )
      } catch {}
      return docs
    } catch {
      // Non-fatal — keep whatever we have
      return null
    }
  }, [])

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
      // Step 1 — fetch basic user info from /auth/me
      // Returns: { id, role, full_name, email, phone, address }
      const { data } = await api.get('/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      })

      const userObj = {
        token,
        role:      data.role,
        userId:    data.id,
        fullName:  data.full_name,
        full_name: data.full_name,
        email:     data.email,
        // phone and address come from the DB via /auth/me — source of truth
        phone:     data.phone   || '',
        address:   data.address || '',
        // national_id is client-side only (not in DB) — keep from localStorage
        national_id: safeLS('national_id'),
      }

      setUser(userObj)

      // Sync localStorage so cold-start fallback is always fresh
      setLS('role',      data.role)
      setLS('userId',    data.id)
      setLS('fullName',  data.full_name)
      setLS('phone',     data.phone   || '')
      setLS('address',   data.address || '')
      // national_id is already in localStorage — don't overwrite with ''

      // Step 2 — fetch profile documents (only for applicants)
      if (data.role === 'applicant') {
        await refreshDocuments()
      }

    } catch (error) {
      if (error.response?.status === 401) {
        // Token is invalid / expired — force logout
        clearLS()
        setUser(null)
        setProfileDocuments([])
      } else if (error.code === 'ERR_NETWORK' || !error.response) {
        // ✅ FIX-CTX-6: Backend cold-starting — restore from localStorage
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
          // Restore cached document list
          try {
            const cached = JSON.parse(localStorage.getItem('profileDocuments') || '[]')
            setProfileDocuments(cached)
          } catch {}
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
      // ✅ FIX-CTX-5: seed from localStorage so returning users don't flash
      // "profile incomplete" between login and the async verifyToken() call
      phone:       safeLS('phone'),
      address:     safeLS('address'),
      national_id: safeLS('national_id'),
    })

    // Immediately fetch the real values from the server
    setTimeout(verifyToken, 0)
  }

  // ── logout ─────────────────────────────────────────────────────────────────
  const logout = () => {
    clearLS()
    setUser(null)
    setProfileDocuments([])
  }

  /**
   * updateProfile — persists phone + address to the DB, and national_id
   * to localStorage only (it is not a DB column).
   *
   * ✅ FIX-CTX-3: Only sends { phone, address } to PUT /profile.
   *    national_id and documents are handled separately (localStorage /
   *    profile-document upload endpoints).
   *
   * @param {{ phone?, address?, national_id?, fullName?, documents? }} fields
   * @returns {object} The response from PUT /profile
   */
  const updateProfile = useCallback(async (fields = {}) => {
    // Build the DB patch (only what the backend accepts)
    const dbPatch = {}
    if (fields.phone   !== undefined) dbPatch.phone   = fields.phone
    if (fields.address !== undefined) dbPatch.address = fields.address

    // national_id is localStorage-only
    if (fields.national_id !== undefined) {
      setLS('national_id', fields.national_id)
    }

    let responseData = {}

    if (Object.keys(dbPatch).length > 0) {
      try {
        const { data } = await api.put('/profile', dbPatch)
        responseData = data

        // The server returns the saved values — use those as source of truth
        const confirmed = {
          phone:   data.phone   ?? dbPatch.phone   ?? '',
          address: data.address ?? dbPatch.address ?? '',
        }

        // Sync localStorage
        setLS('phone',   confirmed.phone)
        setLS('address', confirmed.address)

        // Update user state immediately
        setUser(prev => prev ? ({
          ...prev,
          phone:       confirmed.phone,
          address:     confirmed.address,
          // also apply national_id if it was in the fields
          national_id: fields.national_id !== undefined
            ? fields.national_id
            : (prev.national_id || ''),
        }) : prev)

      } catch (err) {
        // ✅ Optimistic fallback — apply locally so UI doesn't stay stuck
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
      // Only national_id was updated — apply to user state
      if (fields.national_id !== undefined) {
        setUser(prev => prev ? ({ ...prev, national_id: fields.national_id }) : prev)
      }
    }

    // documents field — just refresh from server (don't try to set via PUT /profile)
    if (fields.documents !== undefined) {
      await refreshDocuments()
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
