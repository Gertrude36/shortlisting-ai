import ReactDOM from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import App from './App.jsx'
import './index.css'

// React.StrictMode intentionally invokes effects twice in development
// to help detect side-effects. This causes two /auth/me calls on load
// (and two 401s in the console when the token is expired).
// Removing StrictMode eliminates the double-call in all environments.
ReactDOM.createRoot(document.getElementById('root')).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
)
