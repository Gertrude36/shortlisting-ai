/**
 * AuthContext.jsx — v2.0.0
 *
 * FIXES:
 *  ✅ national_id is now stored in user state and localStorage.
 *     GET /auth/me is expected to return national_id from the User row.
 *     If your backend doesn't yet return it, verifyToken() falls back to
 *     localStorage so it survives page reloads after a profile save.
 *
 *  ✅ updateProfile() now persists ALL profile fields the Navbar modal sends:
 *     { fullName, national_id, address, phone, documents }
 *     It updates both the backend (PUT /profile) AND local user state so the
 *     ApplyPage gate re-evaluates immediately without any extra fetches.
 *
 *  ✅ login() seeds national_id from localStorage (set on a previous session)
 *     so returning users don't see the gate flash incomplete on load.
 *
 *  ✅ Cold-start fallback now also restores national_id from localStorage.
 *
 *  ✅ Navbar modal calls updateProfile({ fullName, national_id, address,
 *     phone, documents }) — all of those fields are now properly merged into
 *     user state and persisted, so AuthContext is always the single source
 *     of truth for profile completeness.
 */
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import api from '../api/axios'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)

  const verifyToken = useCallback(async () => {
    const token = localStorage.getItem('token')
    const role  = localStorage.getItem('role')

    if (!token || !role) {
      setUser(null)
      setLoading(false)
      return
    }

    try {
      // /auth/me should return: id, role, full_name, email, phone, address, national_id
      const { data } = await api.get('/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      })

      const userObj = {
        token,
        role:        data.role,
        userId:      data.id,
        fullName:    data.full_name,
        full_name:   data.full_name,   // alias — some components use full_name
        email:       data.email,
        phone:       data.phone       || '',
        address:     data.address     || '',
        // national_id: returned by /auth/me if backend exposes it;
        // falls back to whatever was saved locally after a profile update
        national_id: data.national_id || localStorage.getItem('national_id') || '',
        documents:   data.documents   || [],
      }

      setUser(userObj)

      // Keep localStorage in sync as cold-start fallback
      localStorage.setItem('role',        data.role)
      localStorage.setItem('userId',      String(data.id))
      localStorage.setItem('fullName',    data.full_name)
      localStorage.setItem('phone',       data.phone        || '')
      localStorage.setItem('address',     data.address      || '')
      localStorage.setItem('national_id', data.national_id  || localStorage.getItem('national_id') || '')

    } catch (error) {
      if (error.response?.status === 401) {
        localStorage.clear()
        setUser(null)
      } else if (error.code === 'ERR_NETWORK' || !error.response) {
        // Backend cold-starting — restore from localStorage so user isn't kicked out
        const storedUserId   = localStorage.getItem('userId')
        const storedFullName = localStorage.getItem('fullName')
        if (storedUserId && storedFullName) {
          setUser({
            token,
            role,
            userId:      storedUserId,
            fullName:    storedFullName,
            full_name:   storedFullName,
            phone:       localStorage.getItem('phone')       || '',
            address:     localStorage.getItem('address')     || '',
            national_id: localStorage.getItem('national_id') || '',
            documents:   [],
          })
        } else {
          setUser(null)
        }
      } else {
        console.error('[AuthContext] Token verification error:', error.response?.status, error.message)
        setUser(null)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { verifyToken() }, [verifyToken])

  const login = (data) => {
    localStorage.setItem('token',    data.access_token)
    localStorage.setItem('role',     data.role)
    localStorage.setItem('userId',   String(data.user_id))
    localStorage.setItem('fullName', data.full_name)

    setUser({
      token:       data.access_token,
      role:        data.role,
      userId:      data.user_id,
      fullName:    data.full_name,
      full_name:   data.full_name,
      phone:       '',
      address:     '',
      // Seed national_id from a previous session if available so returning
      // users don't see the profile gate flash on login
      national_id: localStorage.getItem('national_id') || '',
      documents:   [],
    })

    // Verify token async to pick up phone / address / national_id from server
    setTimeout(verifyToken, 0)
  }

  const logout = () => {
    localStorage.clear()
    setUser(null)
  }

  /**
   * updateProfile — saves profile fields to the backend AND updates local
   * user state immediately so all consumers (ApplyPage gate, Navbar badge)
   * re-render without any extra fetches or event-bus gymnastics.
   *
   * Accepts all fields the Navbar ProfileModal sends:
   *   { fullName?, national_id?, address?, phone?, documents? }
   *
   * @param {object} fields
   * @returns {object}  The response from PUT /profile (or the fallback object)
   */
  const updateProfile = useCallback(async (fields) => {
    // Build the patch we'll merge into user state regardless of API outcome
    const patch = {}
    if (fields.fullName    !== undefined) { patch.fullName    = fields.fullName;    patch.full_name   = fields.fullName }
    if (fields.national_id !== undefined)   patch.national_id = fields.national_id
    if (fields.address     !== undefined)   patch.address     = fields.address
    if (fields.phone       !== undefined)   patch.phone       = fields.phone
    if (fields.documents   !== undefined)   patch.documents   = fields.documents

    try {
      const { data } = await api.put('/profile', fields)

      // Server may return updated values — prefer those, fall back to what we sent
      const confirmed = {
        fullName:    data.full_name    || patch.fullName    || '',
        full_name:   data.full_name    || patch.fullName    || '',
        national_id: data.national_id  || patch.national_id || '',
        address:     data.address      || patch.address     || '',
        phone:       data.phone        || patch.phone       || '',
        documents:   data.documents    || patch.documents   || [],
      }

      // Persist to localStorage as cold-start fallback
      localStorage.setItem('fullName',    confirmed.fullName)
      localStorage.setItem('national_id', confirmed.national_id)
      localStorage.setItem('address',     confirmed.address)
      localStorage.setItem('phone',       confirmed.phone)

      setUser(prev => ({ ...prev, ...confirmed }))

      return data
    } catch (err) {
      // Network/server error — optimistically apply the local patch so the UI
      // doesn't stay stuck on "profile incomplete" after a valid save attempt
      const fallback = {
        fullName:    patch.fullName    ?? (user?.fullName    || ''),
        full_name:   patch.fullName    ?? (user?.fullName    || ''),
        national_id: patch.national_id ?? (user?.national_id || ''),
        address:     patch.address     ?? (user?.address     || ''),
        phone:       patch.phone       ?? (user?.phone       || ''),
        documents:   patch.documents   ?? (user?.documents   || []),
      }

      localStorage.setItem('fullName',    fallback.fullName)
      localStorage.setItem('national_id', fallback.national_id)
      localStorage.setItem('address',     fallback.address)
      localStorage.setItem('phone',       fallback.phone)

      setUser(prev => ({ ...prev, ...fallback }))
      throw err
    }
  }, [user])

  return (
    <AuthContext.Provider value={{
      user,
      login,
      logout,
      loading,
      updateProfile,
      verifyToken,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
