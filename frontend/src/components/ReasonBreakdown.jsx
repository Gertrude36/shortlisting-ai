// frontend/src/components/ReasonBreakdown.jsx
//
// ✅ FIX-SE-15 — Audience-aware rendering (retained)
// ✅ FIX-RB-01 — manual_review decision now renders a clear pending state
//                instead of showing an empty breakdown. Applicants see a
//                friendly "under review" message; HR sees the hr_notes.
// ✅ FIX-RB-02 — Hardened isHR defaulting: the component now also checks
//                window.__IS_HR_VIEW__ as a safety fallback, so applicant
//                pages that forget to pass isHR={false} still never leak
//                HR notes. The authoritative prop still takes priority.
//
// Props:
//   reason    {string}  — JSON string from the backend (ai_reason field)
//   candidate {object}  — candidate object (for fallback score display)
//   isHR      {boolean} — when true, also renders hr_notes below criteria_warnings
//                         when false/omitted, hr_notes are NEVER shown
//
// The backend emits two separate lists in the JSON:
//   "criteria_warnings" — applicant-safe, friendly messages
//   "hr_notes"          — technical HR-action notes (never shown to applicants)
//
// Usage:
//   Applicant view:  <ReasonBreakdown reason={...} candidate={...} />
//   HR view:         <ReasonBreakdown reason={...} candidate={...} isHR />

// ── Classify what a raw string is about ─────────────────────
function classify(s) {
  const l = s.toLowerCase()
  if (l.includes('identity mismatch') || l.includes('not found in any readable document')) return 'identity'
  if (l.includes('missing required documents') || l.includes('missing required document'))  return 'missing_docs'
  if (l.includes('field mismatch') || l.includes('field of study') || l.includes('field_of_study')) return 'field'
  if (l.includes('document verification') || l.includes('verification failed'))             return 'doc_verify'
  if ((l.includes('experience') || l.includes('yr(s)')) && (l.includes('below') || l.includes('minimum') || l.includes('required'))) return 'experience'
  if (l.includes('skill') && (l.includes('matched') || l.includes('missing') || l.includes('minimum') || l.includes('threshold'))) return 'skills'
  if (l.includes('education') && (l.includes('required') || l.includes('not met') || l.includes('below') || l.includes('level'))) return 'education'
  return 'other'
}

function extractEducationLevel(raw) {
  return raw.match(/Education:\s*([^(,\n]+)/i)?.[1]?.trim()
}
function extractField(raw) {
  return raw.match(/Field of Study:\s*([^(,\n]+)/i)?.[1]?.trim()
    || raw.match(/field of study is ['"]?([^'.,"]+)/i)?.[1]?.trim()
}
function extractExperienceNumbers(raw) {
  const got = raw.match(/Experience:\s*(\d+)/i)?.[1]
    || raw.match(/(\d+)\s*yr/i)?.[1]
  const reqMatch = raw.match(/(\d+)[–\-](\d+)\s*yr/i)
  const min = reqMatch?.[1] ?? raw.match(/minimum.*?(\d+)|required.*?(\d+)/i)?.[1]
  const max = reqMatch?.[2]
  return { got, min, max }
}
function extractSkillNumbers(raw) {
  const count = raw.match(/(\d+)\s*\/\s*(\d+)\s*matched/i)
  const pct   = raw.match(/\((\d+)%\)/)?.[1]
  return { matched: count?.[1], total: count?.[2], pct }
}

function translate(raw, variant = 'fail') {
  const kind = classify(raw)
  const s    = raw.toLowerCase()

  if (variant === 'pass') {
    if (kind === 'education') {
      const level = extractEducationLevel(raw)
      return level
        ? `Education level meets requirements: ${level}.`
        : 'Education level meets the minimum requirement for this position.'
    }
    if (kind === 'field') {
      const field = extractField(raw)
      return field
        ? `Field of study matches requirements: ${field}.`
        : 'Field of study matches the required field for this position.'
    }
    if (kind === 'experience') {
      const { got, min, max } = extractExperienceNumbers(raw)
      if (got && min) {
        if (max && parseInt(got) > parseInt(max)) {
          return `You have ${got} year(s) of experience. This exceeds the range (${min}–${max} years), which HR may consider at their discretion.`
        }
        return `Experience meets requirements: ${got} year(s) (required: at least ${min} year(s)).`
      }
      return 'Years of experience meet the minimum requirement for this position.'
    }
    if (kind === 'skills') {
      const { matched, total, pct } = extractSkillNumbers(raw)
      if (matched && total) {
        return `Skills matched: ${matched} out of ${total} required skills (${pct || ''}%).`
      }
      return 'Skill set meets the minimum requirements for this position.'
    }
    if (kind === 'identity') return 'Identity confirmed across uploaded documents.'
    if (kind === 'missing_docs') return 'All required documents are present.'
    const cleaned = raw
      .replace(/\{[^}]*\}/gs, '')
      .replace(/[a-f0-9]{20,}\.(pdf|png|jpg|jpeg)/gi, '')
      .replace(/match scores?:\s*\{[^}]*\}/gi, '')
      .replace(/✓\s*type confirmed/gi, '')
      .replace(/:\s*✓\s*/g, ': ')
      .replace(/\|\s*/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
    return cleaned || raw
  }

  if (kind === 'identity') {
    return 'We could not confirm your identity from the documents you uploaded. Please ensure your full name appears clearly on your National ID card or diploma.'
  }
  if (kind === 'missing_docs') {
    const missing = []
    if (s.includes('certificate')) missing.push('Certificate(s)')
    if (s.includes('id_card'))     missing.push('National ID Card')
    if (s.includes('cv'))          missing.push('CV / Resume')
    if (s.includes('diploma'))     missing.push('Diploma / Degree')
    if (missing.length > 0) {
      return `The following required documents were missing or could not be read: ${missing.join(', ')}. Please re-upload clear, legible copies.`
    }
    return 'Some required documents are missing or could not be read. Please re-upload clear copies of all required files.'
  }
  if (kind === 'field') {
    const declared = extractField(raw)
    if (declared) {
      return `Your declared field of study (${declared}) does not match the content of your uploaded diploma. Please upload the correct degree certificate that matches your stated field of study.`
    }
    return 'Your field of study does not match what was found in your uploaded documents. Please upload the correct degree certificate.'
  }
  if (kind === 'doc_verify') {
    return 'We were unable to verify one or more of your uploaded documents. Please make sure your files are clear, not blurry, and saved as PDF, JPG, or PNG.'
  }
  if (kind === 'experience') {
    const { got, min } = extractExperienceNumbers(raw)
    if (got && min && got !== min) {
      return `You have ${got} year(s) of experience, but this role requires a minimum of ${min} years. We encourage you to apply again once you have gained more experience.`
    }
    return 'Your years of experience do not yet meet the minimum required for this position. We encourage you to apply again in the future.'
  }
  if (kind === 'skills') {
    const countMatch = raw.match(/(\d+)\s*out\s*of\s*(\d+)/i)
      || raw.match(/(\d+)\s*\/\s*(\d+)\s*matched/i)
    const minMatch   = raw.match(/minimum.*?(\d+)%|at least\s+(\d+)%|threshold.*?(\d+)%/i)
    const min        = minMatch?.[1] ?? minMatch?.[2] ?? minMatch?.[3] ?? '30'
    const missingSection = raw.match(/(?:missing|still needed|key skills needed)[:\s]+([^\n.]+)/i)
    let missingText = ''
    if (missingSection) {
      const skills = missingSection[1]
        .split(/,|;\s*|\band\s+more\b/i)
        .map(sk => sk.trim().replace(/\(.*?\)/g, '').trim())
        .filter(sk => sk.length > 1 && !/^\d+$/.test(sk) && !/^and more$/i.test(sk))
        .slice(0, 5)
      if (skills.length > 0) missingText = ` Key skills needed: ${skills.join(', ')}.`
    }
    if (countMatch) {
      return `Your profile matched ${countMatch[1]} out of ${countMatch[2]} required skills, which is below the minimum threshold of ${min}%.${missingText} We encourage you to develop these skills and apply again.`
    }
    return `Your current skill set does not fully meet the requirements for this role (minimum ${min}% match required).${missingText} We encourage you to develop these skills and apply again.`
  }
  if (kind === 'education') {
    return 'Your education level does not meet the minimum requirement for this position. Please check the job description for the required qualification.'
  }

  const cleaned = raw
    .replace(/\{[^}]*\}/gs, '')
    .replace(/[a-f0-9]{20,}\.(pdf|png|jpg|jpeg)/gi, '')
    .replace(/match scores?:\s*\{[^}]*\}/gi, '')
    .replace(/✓\s*type confirmed/gi, '')
    .replace(/:\s*✓\s*/g, ': ')
    .replace(/\|\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return cleaned || raw
}

function expandItem(raw) {
  const segments = raw.split(/\s*\|\s*/).map(s => s.trim()).filter(Boolean)
  const results = []
  for (const seg of segments) {
    if (/^[a-f0-9]{20,}\.(pdf|png|jpg|jpeg)/i.test(seg)) continue
    if (/✓\s*type confirmed/i.test(seg) && seg.length < 60)  continue
    if (/^\s*x\s*$/i.test(seg))                               continue
    results.push(seg)
  }
  if (results.length <= 1) return [raw]
  const seen   = new Set()
  const deduped = []
  for (const seg of results) {
    const kind = classify(seg)
    if (kind !== 'other') {
      if (seen.has(kind)) continue
      seen.add(kind)
    }
    deduped.push(seg)
  }
  return deduped
}

function deduplicateItems(items) {
  const seen   = new Set()
  const result = []
  for (const item of items) {
    const kind = classify(item)
    if (kind !== 'other') {
      if (seen.has(kind)) continue
      seen.add(kind)
    }
    result.push(item)
  }
  return result
}

// ── Strip the [HR] tag prefix used internally to route messages ──────────
function stripHRTag(msg) {
  return msg.replace(/^\[HR\]\s*/i, '').replace(/^\u26a0\s*\[HR\]\s*/i, '').trim()
}

// ── Concrete color configs ────────────────────────────────────
const SECTION_CONFIG = {
  fail: {
    bg:        '#fff1f2',
    border:    '#fca5a5',
    labelColor:'#991b1b',
    dotBg:     '#dc2626',
    textColor: '#7f1d1d',
    label:     'Reasons for rejection',
    icon:      '',
  },
  warn: {
    bg:        '#fffbeb',
    border:    '#fcd34d',
    labelColor:'#92400e',
    dotBg:     '#d97706',
    textColor: '#78350f',
    label:     'Points to note',
    icon:      '',
  },
  pass: {
    bg:        '#f0fdf4',
    border:    '#86efac',
    labelColor:'#14532d',
    dotBg:     '#16a34a',
    textColor: '#14532d',
    label:     'Criteria met',
    icon:      '',
  },
  hr_note: {
    bg:        '#eff6ff',
    border:    '#93c5fd',
    labelColor:'#1e3a5f',
    dotBg:     '#2563eb',
    textColor: '#1e3a5f',
    label:     'HR Notes (internal)',
    icon:      '',
  },
  pending: {
    bg:        '#f5f3ff',
    border:    '#c4b5fd',
    labelColor:'#4c1d95',
    dotBg:     '#7c3aed',
    textColor: '#3b0764',
    label:     'Application status',
    icon:      '',
  },
}

function Section({ items, variant, translate: doTranslate = true }) {
  const { bg, border, labelColor, dotBg, textColor, label, icon } = SECTION_CONFIG[variant]

  const expanded   = items.flatMap(expandItem)
  const deduped    = deduplicateItems(expanded)
  // hr_note items are shown verbatim (already technical); others go through translate()
  const translated = doTranslate
    ? deduped.map(item => translate(item, variant))
    : deduped.map(stripHRTag)

  if (translated.length === 0) return null

  return (
    <div style={{
      background:   bg,
      borderRadius: 8,
      padding:      '14px 16px',
      border:       `1.5px solid ${border}`,
    }}>
      <div style={{
        fontSize:      '.72rem',
        fontWeight:    700,
        color:         labelColor,
        textTransform: 'uppercase',
        letterSpacing: '.06em',
        marginBottom:  10,
      }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {translated.map((msg, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
            <span style={{
              flexShrink:      0,
              width:           18,
              height:          18,
              borderRadius:    '50%',
              background:      dotBg,
              color:           '#fff',
              display:         'inline-flex',
              alignItems:      'center',
              justifyContent:  'center',
              fontSize:        '.62rem',
              fontWeight:      800,
              marginTop:       2,
            }}>{icon}</span>
            <span style={{
              fontSize:   '.84rem',
              color:      textColor,
              lineHeight: 1.65,
              fontWeight: 500,
            }}>
              {msg}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Manual review display (applicant-facing) ─────────────────
function ManualReviewApplicantView({ warningItems }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{
        fontSize:     '.84rem',
        color:        '#374151',
        lineHeight:   1.75,
        padding:      '12px 16px',
        background:   '#f5f3ff',
        borderRadius: 8,
        border:       '1px solid #c4b5fd',
      }}>
        Thank you for submitting your application. Our team is currently reviewing your
        documents and will process your application shortly. You will be notified of
        the outcome by email.
      </div>
      {warningItems.length > 0 && (
        <Section items={warningItems} variant="pending" />
      )}
    </div>
  )
}

// ── Manual review display (HR-facing) ────────────────────────
function ManualReviewHRView({ warningItems, hrNoteItems, parsed }) {
  const ocrScore = parsed?.ocr_quality_score
  const threshold = parsed?.ocr_threshold ?? 60

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{
        fontSize:     '.84rem',
        color:        '#1e3a5f',
        lineHeight:   1.75,
        padding:      '12px 16px',
        background:   '#eff6ff',
        borderRadius: 8,
        border:       '1px solid #93c5fd',
      }}>
        <strong>Manual Review Required</strong>
        {ocrScore != null && (
          <span style={{ marginLeft: 8, color: '#6b7280' }}>
            — OCR quality score: <strong style={{ color: '#dc2626' }}>{ocrScore.toFixed(0)}/100</strong>
            {' '}(threshold: {threshold}/100)
          </span>
        )}
        <br />
        Automated shortlisting was skipped for this application due to low document scan quality.
        Please review the uploaded documents and make a manual decision.
      </div>
      {warningItems.length > 0 && (
        <Section items={warningItems} variant="warn" />
      )}
      {hrNoteItems.length > 0 && (
        <Section items={hrNoteItems} variant="hr_note" translate={false} />
      )}
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────
//
// isHR = true  → renders criteria_warnings + hr_notes (both sections)
//                and shows full manual_review detail for HR
// isHR = false → renders criteria_warnings only (applicant view)
//                hr_notes are NEVER shown to applicants
//
// ✅ FIX-RB-02: Safety guard — if isHR prop is not explicitly passed,
// we also check window.__IS_HR_VIEW__ (set by HR pages in their root).
// This prevents accidental leaks if a component forgets the prop.
//
export default function ReasonBreakdown({ reason, candidate, isHR: isHRProp }) {
  if (!reason) return null

  // FIX-RB-02: resolve isHR with safety fallback
  const isHR = isHRProp === true
    ? true
    : (isHRProp === false ? false : (typeof window !== 'undefined' && window.__IS_HR_VIEW__ === true))

  const PASS_THRESHOLD = 0.40

  let parsed = null
  try { parsed = JSON.parse(reason) } catch (_) { parsed = null }

  if (parsed && (parsed.criteria_met || parsed.criteria_failed || parsed.decision === 'manual_review')) {
    const decision     = parsed.decision          ?? candidate?.decision
    const failedItems  = parsed.criteria_failed   || []
    const warningItems = parsed.criteria_warnings || []
    // FIX-SE-15 / FIX-RB-02: hr_notes only available to HR view
    const hrNoteItems  = isHR ? (parsed.hr_notes || []) : []
    const metItems     = parsed.criteria_met      || []
    const score        = parsed.score             ?? candidate?.ai_score

    // FIX-RB-01: manual_review gets its own dedicated display
    if (decision === 'manual_review') {
      return isHR
        ? <ManualReviewHRView warningItems={warningItems} hrNoteItems={hrNoteItems} parsed={parsed} />
        : <ManualReviewApplicantView warningItems={warningItems} />
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {decision === 'not_shortlisted' && failedItems.length > 0 && (
          <div style={{
            fontSize:     '.84rem',
            color:        '#374151',
            lineHeight:   1.75,
            padding:      '12px 16px',
            background:   '#f9fafb',
            borderRadius: 8,
            border:       '1px solid #e5e7eb',
          }}>
            Thank you for taking the time to apply. After carefully reviewing your application,
            we were unable to move it forward at this time. Below are the specific reasons, along
            with what you did well. We hope this feedback is helpful and encourage you to apply again in the future.
          </div>
        )}

        {failedItems.length > 0  && <Section items={failedItems}  variant="fail" />}
        {warningItems.length > 0 && <Section items={warningItems} variant="warn" />}
        {metItems.length > 0     && <Section items={metItems}     variant="pass" />}

        {/* FIX-SE-15 / FIX-RB-02: HR-only notes rendered only when isHR=true */}
        {isHR && hrNoteItems.length > 0 && (
          <Section
            items={hrNoteItems}
            variant="hr_note"
            translate={false}
          />
        )}

        {score != null && (
          <div style={{
            fontSize:    '.78rem',
            color:       '#6b7280',
            paddingTop:  8,
            borderTop:   '1px solid #e5e7eb',
          }}>
            Overall match score:{' '}
            <strong style={{ color: score >= PASS_THRESHOLD ? '#15803d' : '#b91c1c' }}>
              {(score * 100).toFixed(1)}%
            </strong>
            {score < PASS_THRESHOLD && (
              <span style={{ color: '#4b5563' }}> — below the minimum required score of {(PASS_THRESHOLD * 100).toFixed(0)}% for this position.</span>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── Fallback: pipe-separated string format ────────────────
  const parts     = reason.split(' | ').map(p => p.trim()).filter(Boolean)
  const isPassStr = p =>
    p.startsWith('✓') ||
    (/(\d+(\.\d+)?)%/.test(p) && parseFloat(p.match(/(\d+(\.\d+)?)%/)?.[1] || 0) >= 30)
  const passItems = parts.filter(p =>  isPassStr(p)).map(p => p.replace(/^[✓✗•]\s*/, ''))
  const failItems = parts.filter(p => !isPassStr(p)).map(p => p.replace(/^[✓✗•]\s*/, ''))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {failItems.length > 0 && <Section items={failItems} variant="fail" />}
      {passItems.length > 0 && <Section items={passItems} variant="pass" />}
      {candidate?.ai_score != null && (
        <div style={{ fontSize: '.78rem', color: '#6b7280', paddingTop: 8, borderTop: '1px solid #e5e7eb' }}>
          Overall match score:{' '}
          <strong style={{ color: candidate.ai_score >= PASS_THRESHOLD ? '#15803d' : '#b91c1c' }}>
            {(candidate.ai_score * 100).toFixed(1)}%
          </strong>
          {candidate.ai_score < PASS_THRESHOLD && (
            <span style={{ color: '#4b5563' }}> — below the minimum required score of {(PASS_THRESHOLD * 100).toFixed(0)}% for this position.</span>
          )}
        </div>
      )}
    </div>
  )
}