/**
 * frontend/src/pages/ResetPassword.jsx
 *
 * Step 2 of the password-reset flow.
 * Reads ?token=… from the URL, then calls
 *   POST /auth/reset-password  with { token, new_password }.
 *
 * FIXES APPLIED:
 *   FIX 1 — Token extraction now handles BOTH query string AND hash-based routing
 *              e.g. /#/reset-password?token=... (hash router) works too
 *    FIX 2 — Token is URL-decoded before sending to backend
 *              (some email clients encode + as %2B, breaking JWT)
 *    FIX 3 — Clearer expired/invalid token error with direct link to request new one
 *    FIX 4 — Password strength rules match backend exactly
 *    FIX 5 — Auto-redirect to login after success (5s countdown)
 *
 * WIRE-UP in your router (App.jsx / main.jsx):
 *   import ResetPassword from "./pages/ResetPassword";
 *   <Route path="/reset-password" element={<ResetPassword />} />
 */

import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

/* FIX 1: Also try extracting token from window.location for hash routers */
function getTokenFromUrl() {
  // First try react-router's useSearchParams (works for BrowserRouter)
  // This is handled in the component — here we handle hash router fallback
  const hash = window.location.hash; // e.g. "#/reset-password?token=abc"
  if (hash.includes("token=")) {
    const hashQuery = hash.includes("?") ? hash.split("?")[1] : "";
    const params = new URLSearchParams(hashQuery);
    return params.get("token") || "";
  }
  // Also try raw search params (plain BrowserRouter)
  const params = new URLSearchParams(window.location.search);
  return params.get("token") || "";
}

/* Password-strength rules — must match backend _PASSWORD_RE */
const RULES = [
  { key: "length",    label: "At least 8 characters",            test: (v) => v.length >= 8 },
  { key: "uppercase", label: "One uppercase letter (A–Z)",        test: (v) => /[A-Z]/.test(v) },
  { key: "lowercase", label: "One lowercase letter (a–z)",        test: (v) => /[a-z]/.test(v) },
  { key: "digit",     label: "One number (0–9)",                  test: (v) => /\d/.test(v) },
  { key: "special",   label: "One special character (!@#$%^&*…)", test: (v) => /[^A-Za-z0-9]/.test(v) },
];

export default function ResetPassword() {
  const [searchParams]            = useSearchParams();
  const navigate                  = useNavigate();

  //  FIX 1 & 2: Get token from react-router OR window.location, then URL-decode it
  const rawToken = searchParams.get("token") || getTokenFromUrl() || "";
  const token    = decodeURIComponent(rawToken);  // fixes %2B → + etc.

  const [password,  setPassword]  = useState("");
  const [confirm,   setConfirm]   = useState("");
  const [showPw,    setShowPw]    = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [success,   setSuccess]   = useState(false);
  const [error,     setError]     = useState("");
  const [countdown, setCountdown] = useState(5);

  /* Auto-redirect countdown after success */
  useEffect(() => {
    if (!success) return;
    if (countdown <= 0) { navigate("/login"); return; }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [success, countdown, navigate]);

  /* Show error immediately if token is missing */
  useEffect(() => {
    if (!token) {
      setError(
        "No reset token found in the URL. Please use the full link from your email. " +
        "If the link is broken, request a new one below."
      );
    }
  }, [token]);

  const ruleStates     = RULES.map((r) => ({ ...r, ok: r.test(password) }));
  const allRulesOk     = ruleStates.every((r) => r.ok);
  const passwordsMatch = password === confirm && confirm.length > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!token) {
      setError("Reset token is missing. Please use the link from your email.");
      return;
    }
    if (!allRulesOk) {
      setError("Please fix the password requirements listed below.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/reset-password`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ token, new_password: password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // FIX 3: Clear expired/invalid token error message
        if (res.status === 400) {
          setError(
            data.detail ||
            "This reset link has expired or is invalid. Please request a new one."
          );
        } else if (res.status === 422) {
          setError(data.detail || "Password does not meet requirements.");
        } else {
          setError(data.detail || "Reset failed. Please try again.");
        }
        return;
      }

      setSuccess(true);
    } catch {
      setError("Unable to reach the server. Please check your internet connection.");
    } finally {
      setLoading(false);
    }
  };

  /* ── Success screen ─────────────────────────────────────────────────────── */
  if (success) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={styles.iconWrap}><span style={styles.iconBig}></span></div>
          <h2 style={styles.title}>Password Reset Successfully!</h2>
          <p style={styles.body}>
            Your password has been updated. You can now sign in with your new
            credentials.
          </p>
          <p style={{ ...styles.body, marginTop: 12, color: "#3b5bdb", fontWeight: 600 }}>
            Redirecting to login in {countdown}s…
          </p>
          <Link to="/login" style={styles.btn}>Sign In Now</Link>
        </div>
      </div>
    );
  }

  const tokenMissing = !token;

  /* ── Reset form ─────────────────────────────────────────────────────────── */
  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.iconWrap}><span style={styles.iconBig}>🔒</span></div>
        <h2 style={styles.title}>Set New Password</h2>
        <p style={styles.subtitle}>Choose a strong password for your account.</p>

        {/* FIX 3: If token missing, show prominent error with action */}
        {tokenMissing ? (
          <div style={styles.tokenErrorBox}>
            <p style={{ margin: "0 0 12px", fontWeight: 600, color: "#d63031" }}>
              Reset link is missing or invalid
            </p>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "#5a6480", lineHeight: 1.6 }}>
              This usually happens when the link was broken by your email client.
              Try copying the full URL from the email and pasting it into your browser's
              address bar.
            </p>
            <Link to="/forgot-password" style={styles.btn}>
              Request a New Reset Link
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={styles.form} noValidate>
            {/* New password */}
            <label style={styles.label} htmlFor="rp-password">New Password</label>
            <div style={styles.inputWrap}>
              <input
                id="rp-password"
                type={showPw ? "text" : "password"}
                placeholder="Enter new password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                style={styles.input}
                autoFocus
                autoComplete="new-password"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                style={styles.eyeBtn}
                tabIndex={-1}
                aria-label="Toggle password visibility"
              >
                
              </button>
            </div>

            {/* Strength checklist — shown as soon as user starts typing */}
            {password.length > 0 && (
              <ul style={styles.ruleList}>
                {ruleStates.map((r) => (
                  <li key={r.key} style={{ ...styles.ruleItem, color: r.ok ? "#2ecc71" : "#e74c3c" }}>
                    {r.ok ? "OK" : "X"} {r.label}
                  </li>
                ))}
              </ul>
            )}

            {/* Confirm password */}
            <label style={styles.label} htmlFor="rp-confirm">Confirm Password</label>
            <input
              id="rp-confirm"
              type={showPw ? "text" : "password"}
              placeholder="Re-enter new password"
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setError(""); }}
              style={{
                ...styles.input,
                borderColor: confirm.length > 0 && !passwordsMatch ? "#e74c3c" : "#d0d7e8",
              }}
              autoComplete="new-password"
              disabled={loading}
            />
            {confirm.length > 0 && !passwordsMatch && (
              <p style={styles.smallError}>Passwords do not match.</p>
            )}

            {error && <p style={styles.smallError}>{error}</p>}

            <button
              type="submit"
              style={{
                ...styles.submitBtn,
                opacity: loading ? 0.65 : 1,
                cursor:  loading ? "not-allowed" : "pointer",
              }}
              disabled={loading}
            >
              {loading ? "Resetting…" : "Reset Password"}
            </button>
          </form>
        )}

        <Link to="/forgot-password" style={styles.backLink}>
          ← Request a new link
        </Link>
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
    maxWidth:     440,
    width:        "100%",
    boxShadow:    "0 4px 32px rgba(0,0,0,0.10)",
    textAlign:    "center",
  },
  iconWrap:  { marginBottom: 12 },
  iconBig:   { fontSize: 40 },
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
  tokenErrorBox: {
    background:   "#fff5f5",
    border:       "1px solid #ffcccc",
    borderRadius: 10,
    padding:      "20px",
    marginBottom: 16,
    textAlign:    "left",
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
  inputWrap: {
    position: "relative",
    display:  "flex",
  },
  input: {
    padding:      "11px 14px",
    border:       "1.5px solid #d0d7e8",
    borderRadius: 8,
    fontSize:     14,
    color:        "#1a2340",
    outline:      "none",
    width:        "100%",
    boxSizing:    "border-box",
    paddingRight: 42,
  },
  eyeBtn: {
    position:   "absolute",
    right:      10,
    top:        "50%",
    transform:  "translateY(-50%)",
    background: "none",
    border:     "none",
    cursor:     "pointer",
    fontSize:   16,
    padding:    0,
  },
  ruleList: {
    listStyle:    "none",
    padding:      "8px 12px",
    margin:       "0",
    background:   "#f8faff",
    borderRadius: 8,
    border:       "1px solid #e0e6f5",
  },
  ruleItem: {
    fontSize:   12,
    lineHeight: 1.8,
    fontWeight: 500,
  },
  smallError: {
    color:    "#e74c3c",
    fontSize: 12,
    margin:   "2px 0 0",
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
  submitBtn: {
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
  btn: {
    display:        "block",
    marginTop:      20,
    padding:        "12px",
    background:     "linear-gradient(135deg, #3b5bdb, #2f4ac0)",
    color:          "#fff",
    border:         "none",
    borderRadius:   8,
    fontSize:       15,
    fontWeight:     600,
    textDecoration: "none",
    textAlign:      "center",
    cursor:         "pointer",
  },
  backLink: {
    display:        "block",
    marginTop:      20,
    fontSize:       13,
    color:          "#3b5bdb",
    textDecoration: "none",
    fontWeight:     500,
  },
};
