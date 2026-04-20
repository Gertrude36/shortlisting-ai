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
      localStorage.setItem('role',     data.role)
      localStorage.setItem('userId',   String(data.id))
      localStorage.setItem('fullName', data.full_name)
    } catch (error) {
      console.error('Token verification failed:', error)
      if (error.response?.status === 401) {
        localStorage.clear()
        setUser(null)
      } else {
        // Network or server error – keep the token for now
        setUser(null)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { verifyToken() }, [verifyToken])

  // ✅ FIX: login() now correctly receives the full API response object
  // (access_token, role, user_id, full_name) and stores it.
  // The actual POST /auth/login API call is made in Login.jsx before
  // calling this function — clean separation of concerns.
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
    <AuthContext.Provider value={{ user, login, logout, loading, updateProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
