import { useEffect, useState, useRef } from 'react'
import { Helmet } from 'react-helmet-async'
import { Send, Loader } from 'lucide-react'
import toast from 'react-hot-toast'
import Navbar from '../components/Navbar'
import api from '../api/axios'

function formatTime(date) {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

export default function SupportChat() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hello! 👋 Ask only system-related questions about the platform: registration, login, applications, document uploads, shortlisting, or account management.', timestamp: new Date() }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!input.trim()) return

    const userMessage = { role: 'user', content: input, timestamp: new Date() }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setLoading(true)

    try {
      const { data } = await api.post('/support/chat', { question: input })
      const assistantMessage = { role: 'assistant', content: data.answer || 'I couldn\'t generate a response. Please try again.', timestamp: new Date() }
      setMessages(prev => [...prev, assistantMessage])
    } catch (err) {
      console.error('SupportChat request failed:', err)
      const backendDetail = err.response?.data?.detail || err.response?.data?.message || err.response?.statusText
      const userError = backendDetail
        ? `❌ Sorry, I encountered an error: ${backendDetail}`
        : '❌ Sorry, I encountered an error. Please try again later.'
      const errorMsg = { role: 'assistant', content: userError, timestamp: new Date() }
      setMessages(prev => [...prev, errorMsg])
      toast.error(`Failed to get response${backendDetail ? `: ${backendDetail}` : ''}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Helmet><title>AI Support Chat — Shortlisting Platform</title></Helmet>
      <div className="page-wrapper" style={{ minHeight: '100vh', background: '#f9fafb', display: 'flex', flexDirection: 'column' }}>
        <Navbar />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: 900, margin: '0 auto', width: '100%', padding: '24px' }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: '.75rem', fontWeight: 800, letterSpacing: '.16em', textTransform: 'uppercase', color: '#7c3aed' }}>Support Center</div>
            <h1 style={{ margin: '8px 0 0 0', fontSize: '1.8rem', fontWeight: 800, color: '#0f172a' }}>AI Support Assistant</h1>
            <p style={{ margin: '6px 0 0 0', color: '#6b7280', fontSize: '.9rem' }}>Get instant answers to your questions</p>
          </div>

          {/* Chat Container */}
          <div style={{
            flex: 1,
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 16,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            marginBottom: 16
          }}>
            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {messages.map((msg, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '70%',
                    padding: '12px 16px',
                    borderRadius: 12,
                    background: msg.role === 'user' ? '#2563eb' : '#f3f4f6',
                    color: msg.role === 'user' ? '#fff' : '#1f2937',
                    fontSize: '.95rem',
                    lineHeight: 1.6,
                    wordWrap: 'break-word'
                  }}>
                    {msg.content}
                    <div style={{ fontSize: '.75rem', marginTop: 6, opacity: 0.7 }}>
                      {formatTime(msg.timestamp)}
                    </div>
                  </div>
                </div>
              ))}
              {loading && (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div style={{ padding: '12px 16px', borderRadius: 12, background: '#f3f4f6', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Loader size={18} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
                    <span style={{ color: '#6b7280', fontSize: '.9rem' }}>Thinking...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div style={{ padding: '16px', borderTop: '1px solid #e5e7eb' }}>
              <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 10 }}>
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="Type your question here..."
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    border: '1px solid #d1d5db',
                    borderRadius: 8,
                    fontSize: '1rem',
                    fontFamily: 'inherit',
                    opacity: loading ? 0.6 : 1
                  }}
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  style={{
                    padding: '12px 20px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#2563eb',
                    color: '#fff',
                    fontWeight: 700,
                    cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                    opacity: loading || !input.trim() ? 0.5 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <Send size={16} />
                </button>
              </form>
            </div>
          </div>

          <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: '.85rem' }}>
            Powered by AI. For complex issues, you can submit a formal support ticket.
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  )
}
