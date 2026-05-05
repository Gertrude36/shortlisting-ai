import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import api from '../api/axios'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)

  const verifyToken = useCallback(async () => {
    const token = localStorage.getItem('token')
    const role  = localStorage.getItem('role')

    // No token stored — skip the network call entirely
    if (!token || !role) {
      setUser(null)
      setLoading(false)
      return
    }

    try {
      const { data } = await api.get('/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      })

      setUser({
        token,
        role:       data.role,
        userId:     data.id,
        fullName:   data.full_name,
        nationalId: localStorage.getItem('nationalId') || '',
        location:   localStorage.getItem('location')   || '',
        phone:      localStorage.getItem('phone')      || '',
        documents:  JSON.parse(localStorage.getItem('documents') || '[]'),
      })

      // Keep localStorage in sync with server values
      localStorage.setItem('role',     data.role)
      localStorage.setItem('userId',   String(data.id))
      localStorage.setItem('fullName', data.full_name)

    } catch (error) {
      if (error.response?.status === 401) {
        // Token is expired or invalid — clear everything silently.
        // This is expected behaviour, not an error worth logging.
        localStorage.clear()
        setUser(null)
      } else if (error.code === 'ERR_NETWORK' || !error.response) {
        // Backend is asleep (Render cold start) or truly offline.
        // Keep the stored token and restore a minimal user object so the
        // UI doesn't kick the user out just because the server is slow.
        const storedUserId   = localStorage.getItem('userId')
        const storedFullName = localStorage.getItem('fullName')

        if (storedUserId && storedFullName) {
          setUser({
            token,
            role,
            userId:     storedUserId,
            fullName:   storedFullName,
            nationalId: localStorage.getItem('nationalId') || '',
            location:   localStorage.getItem('location')   || '',
            phone:      localStorage.getItem('phone')      || '',
            documents:  JSON.parse(localStorage.getItem('documents') || '[]'),
          })
        } else {
          setUser(null)
        }
      } else {
        // Any other server error (500, 503 …) — log it, but don't nuke the session
        console.error('[AuthContext] Token verification error:', error.response?.status, error.message)
        setUser(null)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { verifyToken() }, [verifyToken])

  /**
   * Call this after a successful POST /auth/login or /auth/register.
   * Pass the full API response object: { access_token, role, user_id, full_name }
   */
  const login = (data) => {
    localStorage.setItem('token',    data.access_token)
    localStorage.setItem('role',     data.role)
    localStorage.setItem('userId',   String(data.user_id))
    localStorage.setItem('fullName', data.full_name)

    setUser({
      token:      data.access_token,
      role:       data.role,
      userId:     data.user_id,
      fullName:   data.full_name,
      nationalId: '',
      location:   '',
      phone:      '',
      documents:  [],
    })
  }

  const logout = () => {
    localStorage.clear()
    setUser(null)
  }

  const updateProfile = (fields) => {
    if (fields.nationalId !== undefined) localStorage.setItem('nationalId', fields.nationalId)
    if (fields.location   !== undefined) localStorage.setItem('location',   fields.location)
    if (fields.phone      !== undefined) localStorage.setItem('phone',      fields.phone)
    if (fields.documents  !== undefined) localStorage.setItem('documents',  JSON.stringify(fields.documents))
    setUser(prev => ({ ...prev, ...fields }))
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, updateProfile, verifyToken }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
