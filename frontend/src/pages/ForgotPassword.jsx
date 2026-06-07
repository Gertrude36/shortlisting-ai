/**
 * frontend/src/pages/ForgotPassword.jsx
 *
 * Step 1 of the password-reset flow.
 * Calls  POST /auth/forgot-password  with { email }.
 *
 * FIXES APPLIED:
 *   FIX 1 — Clearer success message with spam folder reminder
 *   FIX 2 — Network error shown properly (was silently failing)
 *   FIX 3 — Dev hint only in local dev, never in production build
 *   FIX 4 — Email input validation before hitting the server
 *   FIX 5 — "Resend email" button on success screen so user isn't stuck
 *
 * WIRE-UP in your router (App.jsx / main.jsx):
 *   import ForgotPassword from "./pages/ForgotPassword";
 *   <Route path="/forgot-password" element={<ForgotPassword />} />
 */

import { useState } from "react";
import { Link } from "react-router-dom";

const API    = import.meta.env.VITE_API_URL || "http://localhost:8000";
const IS_DEV = import.meta.env.DEV === true;

export default function ForgotPassword() {
  const [email,   setEmail]   = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error,   setError]   = useState("");

  const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }
    if (!isValidEmail(email)) {
      setError("Please enter a valid email address (e.g. you@example.com).");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/forgot-password`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      // Always show success regardless of whether email exists (prevents enumeration)
      // The backend always returns 200 for this endpoint
      if (res.ok || res.status === 200) {
        setSuccess(true);
        return;
      }

      const data = await res.json().catch(() => ({}));
      setError(data.detail || "Something went wrong. Please try again.");
    } catch {
      setError(
        "Unable to reach the server. Please check your internet connection and try again."
      );
    } finally {
      setLoading(false);
    }
  };

  /* ── Success screen ─────────────────────────────────────────────────────── */
  if (success) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={styles.iconWrap}>
            <span style={styles.iconBig}>📧</span>
          </div>
          <h2 style={styles.title}>Check your inbox</h2>
          <p style={styles.body}>
            If an account with <strong>{email}</strong> exists, a password reset
            link has been sent to that address. The link expires in{" "}
            <strong>15 minutes</strong>.
          </p>
          <p style={{ ...styles.body, marginTop: 8 }}>
            Don't see it? Check your <strong>spam / junk folder</strong>.
          </p>

          {/* FIX 5: Resend button so user isn't stuck */}
          <button
            onClick={() => { setSuccess(false); setError(""); }}
            style={styles.resendBtn}
          >
            Didn't receive it? Send again
          </button>

          {/* FIX 3: Dev hint only in local dev (npm run dev), never in production */}
          {IS_DEV && (
            <div style={styles.devHint}>
              🛠 <strong>Dev mode:</strong> Email may not be delivered. Check
              your <code>uvicorn</code> / Render logs — the reset link is
              printed there. Copy it and open it in your browser.
            </div>
          )}

          <Link to="/login" style={styles.backLink}>← Back to Sign In</Link>
        </div>
      </div>
    );
  }

  /* ── Request form ───────────────────────────────────────────────────────── */
  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.iconWrap}>
          <span style={styles.iconBig}></span>
        </div>
        <h2 style={styles.title}>Forgot your password?</h2>
        <p style={styles.subtitle}>
          Enter the email address associated with your account and we'll send
          you a reset link.
        </p>

        <form onSubmit={handleSubmit} style={styles.form} noValidate>
          <label style={styles.label} htmlFor="fp-email">
            Email address
          </label>
          <input
            id="fp-email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(""); }}
            style={{
              ...styles.input,
              borderColor: error ? "#e74c3c" : "#d0d7e8",
            }}
            autoFocus
            autoComplete="email"
            disabled={loading}
          />

          {error && (
            <p style={styles.errorMsg}>{error}</p>
          )}

          <button
            type="submit"
            style={{ ...styles.btn, opacity: loading ? 0.7 : 1, cursor: loading ? "not-allowed" : "pointer" }}
            disabled={loading}
          >
            {loading ? "Sending…" : "Send Reset Link"}
          </button>
        </form>

        <Link to="/login" style={styles.backLink}>← Back to Sign In</Link>
      </div>
    </div>
  );
}

/* ── Styles ──────────────────────────────────────────────────────────────── */
const styles = {
  page: {
    minHeight:      "100vh",
    display:        "flex",
    alignItems:     "center",
    justifyContent: "center",
    background:     "linear-gradient(135deg, #f0f4ff 0%, #e8edf8 100%)",
    padding:        "24px 16px",
    fontFamily:     "'Segoe UI', system-ui, sans-serif",
  },
  card: {
    background:   "#ffffff",
    borderRadius: 16,
    padding:      "40px 36px",
    maxWidth:     420,
    width:        "100%",
    boxShadow:    "0 4px 32px rgba(0,0,0,0.10)",
    textAlign:    "center",
  },
  iconWrap: { marginBottom: 12 },
  iconBig:  { fontSize: 40 },
  title: {
    fontSize:   22,
    fontWeight: 700,
    color:      "#1a2340",
    margin:     "0 0 8px",
  },
  subtitle: {
    fontSize:   14,
    color:      "#5a6480",
    lineHeight: 1.6,
    margin:     "0 0 24px",
  },
  body: {
    fontSize:   14,
    color:      "#5a6480",
    lineHeight: 1.6,
    margin:     "0 0 4px",
  },
  form: {
    display:       "flex",
    flexDirection: "column",
    gap:           10,
    textAlign:     "left",
  },
  label: {
    fontSize:   13,
    fontWeight: 600,
    color:      "#1a2340",
  },
  input: {
    padding:      "11px 14px",
    border:       "1.5px solid #d0d7e8",
    borderRadius: 8,
    fontSize:     14,
    color:        "#1a2340",
    outline:      "none",
    transition:   "border-color 0.2s",
    width:        "100%",
    boxSizing:    "border-box",
  },
  errorMsg: {
    color:        "#d63031",
    fontSize:     13,
    margin:       "2px 0 0",
    padding:      "8px 12px",
    background:   "#fff5f5",
    borderRadius: 6,
    border:       "1px solid #ffcccc",
  },
  btn: {
    marginTop:    8,
    padding:      "12px",
    background:   "linear-gradient(135deg, #3b5bdb, #2f4ac0)",
    color:        "#fff",
    border:       "none",
    borderRadius: 8,
    fontSize:     15,
    fontWeight:   600,
    transition:   "opacity 0.2s",
    width:        "100%",
  },
  resendBtn: {
    display:      "block",
    marginTop:    16,
    padding:      "10px 20px",
    background:   "transparent",
    color:        "#3b5bdb",
    border:       "1.5px solid #3b5bdb",
    borderRadius: 8,
    fontSize:     13,
    fontWeight:   600,
    cursor:       "pointer",
    width:        "100%",
  },
  backLink: {
    display:        "block",
    marginTop:      20,
    fontSize:       13,
    color:          "#3b5bdb",
    textDecoration: "none",
    fontWeight:     500,
  },
  devHint: {
    marginTop:    16,
    padding:      "10px 14px",
    background:   "#fff8e1",
    border:       "1px solid #ffe082",
    borderRadius: 8,
    fontSize:     12,
    color:        "#7a6000",
    textAlign:    "left",
    lineHeight:   1.5,
  },
};
