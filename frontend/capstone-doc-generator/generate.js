

const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");

// Icons
const { FaBrain, FaFileAlt, FaSearch, FaCheckCircle, FaChartBar, FaUsers, FaCog,
        FaLightbulb, FaShieldAlt, FaDatabase, FaCode, FaGraduationCap, FaExclamationTriangle,
        FaArrowRight, FaStar, FaRobot, FaClipboardList, FaBalanceScale } = require("react-icons/fa");
const { MdDocumentScanner, MdAutorenew, MdSecurity } = require("react-icons/md");

// Color palette - deep blue tech theme, projector-friendly
const C = {
  bg:       "0B1C3A",   // deep navy bg
  bgLight:  "0F2554",   // slightly lighter panel
  bgCard:   "112D6A",   // card bg
  teal:     "00C9B1",   // bright teal accent
  gold:     "F5C842",   // gold highlight
  white:    "FFFFFF",
  offWhite: "E8F0FF",
  muted:    "8BA8D4",
  red:      "FF5252",
  green:    "4DD97A",
  cyan:     "38BDF8",
};

async function iconPng(IconComp, color, size = 256) {
  const svg = ReactDOMServer.renderToStaticMarkup(
    React.createElement(IconComp, { color: `#${color}`, size: String(size) })
  );
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + buf.toString("base64");
}

function makeShadow() {
  return { type: "outer", blur: 8, offset: 3, angle: 135, color: "000000", opacity: 0.25 };
}

async function build() {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  pres.author = "Gertrude IRIMASO";
  pres.title = "Automated Shortlisting System Using Generative AI";

  // Pre-render icons
  const icons = {
    brain:   await iconPng(FaBrain,            C.teal),
    file:    await iconPng(FaFileAlt,          C.gold),
    search:  await iconPng(FaSearch,           C.cyan),
    check:   await iconPng(FaCheckCircle,      C.green),
    chart:   await iconPng(FaChartBar,         C.teal),
    users:   await iconPng(FaUsers,            C.gold),
    cog:     await iconPng(FaCog,              C.cyan),
    light:   await iconPng(FaLightbulb,        C.gold),
    shield:  await iconPng(FaShieldAlt,        C.green),
    db:      await iconPng(FaDatabase,         C.cyan),
    code:    await iconPng(FaCode,             C.teal),
    grad:    await iconPng(FaGraduationCap,    C.gold),
    warn:    await iconPng(FaExclamationTriangle, C.red),
    arrow:   await iconPng(FaArrowRight,       C.teal),
    star:    await iconPng(FaStar,             C.gold),
    robot:   await iconPng(FaRobot,            C.teal),
    clip:    await iconPng(FaClipboardList,    C.cyan),
    balance: await iconPng(FaBalanceScale,     C.gold),
  };

  // ─── helpers ────────────────────────────────────────────────
  function addSlide() { return pres.addSlide(); }

  function slideBg(slide) {
    slide.background = { color: C.bg };
  }

  // Bright gradient-look header bar using two rectangles
  function header(slide, title, accent = C.teal) {
    slide.addShape(pres.shapes.RECTANGLE, {
      x: 0, y: 0, w: 10, h: 0.72,
      fill: { color: C.bgLight }, line: { color: C.bgLight }
    });
    slide.addShape(pres.shapes.RECTANGLE, {
      x: 0, y: 0, w: 0.18, h: 0.72,
      fill: { color: accent }, line: { color: accent }
    });
    slide.addText(title, {
      x: 0.28, y: 0, w: 9.5, h: 0.72,
      fontSize: 22, bold: true, color: C.white,
      fontFace: "Arial Black", valign: "middle", margin: 0
    });
  }

  // Slide number footer
  function footer(slide, num) {
    slide.addText(`${num} / 16`, {
      x: 8.8, y: 5.28, w: 1, h: 0.3,
      fontSize: 10, color: C.muted, align: "right"
    });
  }

  // Card box
  function card(slide, x, y, w, h, accent = C.teal) {
    slide.addShape(pres.shapes.RECTANGLE, {
      x, y, w, h,
      fill: { color: C.bgCard }, line: { color: accent, width: 1.5 },
      shadow: makeShadow()
    });
  }

  // Stat callout
  function stat(slide, x, y, value, label, color = C.teal) {
    slide.addShape(pres.shapes.RECTANGLE, {
      x, y, w: 2.1, h: 1.1,
      fill: { color: C.bgCard }, line: { color: color, width: 2 }
    });
    slide.addText(value, {
      x, y: y + 0.05, w: 2.1, h: 0.58,
      fontSize: 30, bold: true, color: color,
      align: "center", fontFace: "Arial Black"
    });
    slide.addText(label, {
      x, y: y + 0.62, w: 2.1, h: 0.38,
      fontSize: 10, color: C.offWhite, align: "center", bold: true
    });
  }

  // ══════════════════════════════════════════════════════════════
  // SLIDE 1 — TITLE
  // ══════════════════════════════════════════════════════════════
  {
    const s = addSlide();
    s.background = { color: C.bg };

    // Large dark overlay panel left side
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0, y: 0, w: 6.4, h: 5.625,
      fill: { color: C.bgLight }, line: { color: C.bgLight }
    });
    // Teal accent strip
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0, y: 0, w: 0.22, h: 5.625,
      fill: { color: C.teal }, line: { color: C.teal }
    });

    // Brain icon large
    s.addImage({ data: icons.brain, x: 0.5, y: 0.7, w: 0.85, h: 0.85 });

    s.addText("CAPSTONE PROJECT DEFENSE", {
      x: 0.4, y: 0.5, w: 5.8, h: 0.45,
      fontSize: 11, color: C.teal, bold: true, charSpacing: 4, fontFace: "Arial"
    });

    s.addText([
      { text: "Automated Shortlisting\n", options: { color: C.white, bold: true, breakLine: false } },
      { text: "System Using ", options: { color: C.white, bold: true } },
      { text: "Generative AI", options: { color: C.teal, bold: true } }
    ], {
      x: 0.4, y: 1.0, w: 5.8, h: 2.0,
      fontSize: 30, fontFace: "Arial Black", valign: "top"
    });

    s.addText("AI-Powered Recruitment Automation for Rwandan Organizations", {
      x: 0.4, y: 2.95, w: 5.8, h: 0.55,
      fontSize: 13, color: C.offWhite, italic: true
    });

    // Divider
    s.addShape(pres.shapes.LINE, {
      x: 0.4, y: 3.62, w: 5.5, h: 0,
      line: { color: C.teal, width: 1.5 }
    });

    const details = [
      ["Submitted By:",  "Gertrude IRIMASO  |  Reg: 25RP19175"],
      ["Supervisor:",    "Judith BIZIMANA"],
      ["Institution:",  "Rwanda Polytechnic – Huye College"],
      ["Department:",   "ICT – Information Technology  |  Level 8"],
    ];
    details.forEach(([label, val], i) => {
      s.addText(label, {
        x: 0.4, y: 3.72 + i * 0.35, w: 1.55, h: 0.33,
        fontSize: 10, color: C.teal, bold: true
      });
      s.addText(val, {
        x: 1.98, y: 3.72 + i * 0.35, w: 4.1, h: 0.33,
        fontSize: 10, color: C.offWhite
      });
    });

    // Right panel — quick stats
    s.addText("PROJECT AT A GLANCE", {
      x: 6.55, y: 0.45, w: 3.2, h: 0.38,
      fontSize: 11, color: C.gold, bold: true, charSpacing: 2, align: "center"
    });

    const glance = [
      [icons.brain,  "ML + GenAI",      "Core Engine"],
      [icons.file,   "4 Doc Types",     "OCR Verified"],
      [icons.users,  "3 User Roles",    "Admin / HR / Applicant"],
      [icons.check,  "99.95% Accuracy", "XGBoost Model"],
      [icons.shield, "10,000 Profiles", "Training Dataset"],
    ];
    glance.forEach(([ico, title, sub], i) => {
      const gy = 1.0 + i * 0.87;
      s.addShape(pres.shapes.RECTANGLE, {
        x: 6.55, y: gy, w: 3.2, h: 0.74,
        fill: { color: C.bgCard }, line: { color: C.teal, width: 1 }
      });
      s.addImage({ data: ico, x: 6.68, y: gy + 0.12, w: 0.45, h: 0.45 });
      s.addText(title, {
        x: 7.22, y: gy + 0.06, w: 2.4, h: 0.3,
        fontSize: 12, color: C.white, bold: true
      });
      s.addText(sub, {
        x: 7.22, y: gy + 0.36, w: 2.4, h: 0.28,
        fontSize: 9.5, color: C.muted
      });
    });
  }

  // ══════════════════════════════════════════════════════════════
  // SLIDE 2 — INTRODUCTION
  // ══════════════════════════════════════════════════════════════
  {
    const s = addSlide(); slideBg(s);
    header(s, "INTRODUCTION", C.teal);
    footer(s, 2);

    s.addText("Why Does This System Exist?", {
      x: 0.3, y: 0.85, w: 9.4, h: 0.45,
      fontSize: 17, color: C.teal, bold: true, fontFace: "Arial"
    });

    const context = [
      { ico: icons.users,  bold: "Growing Workforce:",   txt: "Rwanda saw a 34% annual rise in graduate applications to private-sector organizations (RDB, 2021)." },
      { ico: icons.warn,   bold: "Manual Overload:",     txt: "Recruiters spend up to 23 hrs per hire just on CV screening — reading, cross-checking 4+ documents per candidate." },
      { ico: icons.brain,  bold: "AI Revolution:",       txt: "Generative AI + ML + OCR now enable intelligent, automated, explainable candidate evaluation." },
      { ico: icons.shield, bold: "No Existing Solution:",txt: "100% of 30 surveyed HR professionals confirmed NO automated shortlisting system is in place." },
    ];

    context.forEach(({ ico, bold, txt }, i) => {
      const cx = i % 2 === 0 ? 0.3 : 5.1;
      const cy = 1.42 + Math.floor(i / 2) * 1.55;
      card(s, cx, cy, 4.55, 1.35, i % 2 === 0 ? C.teal : C.gold);
      s.addImage({ data: ico, x: cx + 0.18, y: cy + 0.18, w: 0.45, h: 0.45 });
      s.addText([
        { text: bold + " ", options: { bold: true, color: C.gold } },
        { text: txt, options: { color: C.offWhite } }
      ], {
        x: cx + 0.72, y: cy + 0.12, w: 3.65, h: 1.1,
        fontSize: 11, valign: "top"
      });
    });
  }

  // ══════════════════════════════════════════════════════════════
  // SLIDE 3 — PROBLEM STATEMENT
  // ══════════════════════════════════════════════════════════════
  {
    const s = addSlide(); slideBg(s);
    header(s, "PROBLEM STATEMENT", C.red);
    footer(s, 3);

    s.addText("What Problems Does Manual Shortlisting Cause?", {
      x: 0.3, y: 0.82, w: 9.4, h: 0.4,
      fontSize: 16, color: C.gold, bold: true
    });

    const problems = [
      ["TIME",        "Hours/days spent cross-referencing IDs, CVs, Diplomas & Certificates per applicant manually"],
      ["BIAS",        "Human reviewers unconsciously favor candidates based on name, gender, or age — not merit"],
      ["INCONSISTENCY","Different HR officers apply different standards → unfair outcomes for candidates"],
      ["NO AUDIT TRAIL","No documented rationale for decisions makes shortlisting impossible to justify or appeal"],
      ["NO CENTRALIZED PLATFORM","Applications arrive by email/paper with no unified tracking or digital document verification"],
      ["NO AI AUTOMATION","Small & medium Rwandan enterprises lack affordable AI-powered screening tools"],
    ];

    problems.forEach(([title, desc], i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = 0.3 + col * 3.2;
      const y = 1.35 + row * 1.7;

      s.addShape(pres.shapes.RECTANGLE, {
        x, y, w: 3.05, h: 1.52,
        fill: { color: C.bgCard }, line: { color: C.red, width: 1.5 }
      });
      s.addShape(pres.shapes.RECTANGLE, {
        x, y, w: 3.05, h: 0.36,
        fill: { color: "5C1010" }, line: { color: C.red, width: 1.5 }
      });
      s.addText(title, {
        x: x + 0.08, y: y + 0.02, w: 2.88, h: 0.32,
        fontSize: 10, color: C.red, bold: true, valign: "middle"
      });
      s.addText(desc, {
        x: x + 0.08, y: y + 0.42, w: 2.88, h: 1.02,
        fontSize: 10, color: C.offWhite, valign: "top"
      });
    });
  }

  // ══════════════════════════════════════════════════════════════
  // SLIDE 4 — ABSTRACT
  // ══════════════════════════════════════════════════════════════
  {
    const s = addSlide(); slideBg(s);
    header(s, "ABSTRACT", C.cyan);
    footer(s, 4);

    s.addText("What This Project Built & Achieved", {
      x: 0.3, y: 0.82, w: 9.4, h: 0.4,
      fontSize: 16, color: C.cyan, bold: true
    });

    // Left — text summary
    s.addText([
      { text: "This project designed and implemented an ", options: { color: C.offWhite } },
      { text: "AI-powered Automated Shortlisting System", options: { color: C.teal, bold: true } },
      { text: " combining:", options: { color: C.offWhite } },
    ], {
      x: 0.3, y: 1.32, w: 5.8, h: 0.55, fontSize: 12
    });

    const components = [
      [icons.robot,  "Machine Learning (XGBoost)",  "Candidate scoring & ranking"],
      [icons.file,   "OCR Pipeline",                "Text extraction from 4 doc types"],
      [icons.brain,  "Generative AI (Claude)",      "Human-readable decision explanations"],
      [icons.cog,    "Document Verifier",            "Identity & field-of-study verification"],
    ];

    components.forEach(([ico, title, sub], i) => {
      const y = 2.0 + i * 0.74;
      s.addImage({ data: ico, x: 0.3, y: y + 0.1, w: 0.4, h: 0.4 });
      s.addText(title, {
        x: 0.82, y: y + 0.04, w: 5.2, h: 0.3,
        fontSize: 12, color: C.teal, bold: true
      });
      s.addText(sub, {
        x: 0.82, y: y + 0.34, w: 5.2, h: 0.28,
        fontSize: 11, color: C.muted
      });
    });

    // Right panel — key stats box
    s.addShape(pres.shapes.RECTANGLE, {
      x: 6.4, y: 1.25, w: 3.3, h: 4.15,
      fill: { color: C.bgCard }, line: { color: C.gold, width: 2 }
    });
    s.addText("KEY RESULTS", {
      x: 6.4, y: 1.3, w: 3.3, h: 0.38,
      fontSize: 12, color: C.gold, bold: true, align: "center"
    });

    const results = [
      ["99.95%",  "XGBoost Accuracy"],
      ["1.00",    "AUC-ROC Score"],
      ["86%",     "HR Professionals Surveyed\nWant AI Automation"],
      ["100%",    "Surveyed Orgs with\nNo Existing System"],
      ["10,000",  "Training Profiles"],
      ["6 wks",   "Agile Dev Sprints"],
    ];
    results.forEach(([val, label], i) => {
      const y = 1.78 + i * 0.57;
      s.addShape(pres.shapes.RECTANGLE, {
        x: 6.52, y, w: 3.06, h: 0.48,
        fill: { color: "1A3A7A" }, line: { color: C.teal, width: 0.8 }
      });
      s.addText(val, {
        x: 6.52, y: y + 0.04, w: 1.1, h: 0.38,
        fontSize: 16, color: C.teal, bold: true, align: "center"
      });
      s.addText(label, {
        x: 7.65, y: y + 0.04, w: 1.9, h: 0.38,
        fontSize: 9.5, color: C.offWhite, valign: "middle"
      });
    });
  }

  // ══════════════════════════════════════════════════════════════
  // SLIDE 5 — MAIN OBJECTIVE
  // ══════════════════════════════════════════════════════════════
  {
    const s = addSlide(); slideBg(s);
    header(s, "MAIN OBJECTIVE", C.gold);
    footer(s, 5);

    // Central goal box
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.5, y: 0.88, w: 9, h: 1.0,
      fill: { color: "1A3A7A" }, line: { color: C.gold, width: 2 },
      shadow: makeShadow()
    });
    s.addImage({ data: icons.brain, x: 0.68, y: 1.02, w: 0.55, h: 0.55 });
    s.addText([
      { text: "General Objective: ", options: { color: C.gold, bold: true } },
      { text: "Design and implement an intelligent AI-powered Automated Shortlisting System combining Machine Learning, OCR multi-document processing, document verification, and Generative AI to screen, score, rank, and shortlist job applicants based on defined criteria.", options: { color: C.white } }
    ], {
      x: 1.35, y: 0.92, w: 7.9, h: 0.9,
      fontSize: 11.5, valign: "middle"
    });

    s.addText("FOUR PILLARS OF THE SYSTEM", {
      x: 0.3, y: 2.1, w: 9.4, h: 0.35,
      fontSize: 12, color: C.teal, bold: true, charSpacing: 2
    });

    const pillars = [
      [icons.file,   "OCR Pipeline",      "Extract text from 4 document types:\nNational ID, CV, Diploma, Certificate"],
      [icons.shield, "Document Verify",   "Confirm document belongs to\napplicant — identity & field check"],
      [icons.robot,  "ML Model",          "Score & rank candidates using\n14 engineered match-quality features"],
      [icons.brain,  "Generative AI",     "Generate human-readable\nexplanations per shortlisting decision"],
    ];
    pillars.forEach(([ico, title, desc], i) => {
      const x = 0.3 + i * 2.38;
      s.addShape(pres.shapes.RECTANGLE, {
        x, y: 2.58, w: 2.22, h: 2.7,
        fill: { color: C.bgCard }, line: { color: C.teal, width: 1.5 }
      });
      // Number badge
      s.addShape(pres.shapes.OVAL, {
        x: x + 0.82, y: 2.62, w: 0.58, h: 0.58,
        fill: { color: C.teal }, line: { color: C.teal }
      });
      s.addText(String(i + 1), {
        x: x + 0.82, y: 2.62, w: 0.58, h: 0.58,
        fontSize: 16, bold: true, color: C.bg, align: "center", valign: "middle"
      });
      s.addImage({ data: ico, x: x + 0.84, y: 3.3, w: 0.55, h: 0.55 });
      s.addText(title, {
        x: x + 0.08, y: 3.92, w: 2.06, h: 0.36,
        fontSize: 11, color: C.gold, bold: true, align: "center"
      });
      s.addText(desc, {
        x: x + 0.08, y: 4.28, w: 2.06, h: 0.82,
        fontSize: 9.5, color: C.offWhite, align: "center"
      });
    });
  }

  // ══════════════════════════════════════════════════════════════
  // SLIDE 6 — SPECIFIC OBJECTIVES
  // ══════════════════════════════════════════════════════════════
  {
    const s = addSlide(); slideBg(s);
    header(s, "SPECIFIC OBJECTIVES", C.teal);
    footer(s, 6);

    s.addText("7 Specific Objectives → 7 Research Questions → 7 Deliverables", {
      x: 0.3, y: 0.82, w: 9.4, h: 0.38,
      fontSize: 13, color: C.muted, italic: true
    });

    const objs = [
      [icons.search, "SO1", "Analyze current manual shortlisting processes\nand identify key inefficiencies in Rwanda"],
      [icons.db,     "SO2", "Design a 3-role database schema (Admin / HR / Applicant)\nfor multi-document application management"],
      [icons.file,   "SO3", "Integrate OCR to extract text from all 4 document types:\nID, CV, Diploma, Certificate"],
      [icons.shield, "SO4", "Implement a document verification module to\nvalidate completeness & format before processing"],
      [icons.robot,  "SO5", "Build & train an ML classification model to score\nand rank candidates against job requirements"],
      [icons.brain,  "SO6", "Integrate Generative AI API to produce\nhuman-readable shortlisting explanations"],
      [icons.cog,    "SO7", "Develop role-specific React.js dashboards\nand validate system performance with real data"],
    ];

    objs.forEach(([ico, label, text], i) => {
      const col = i < 4 ? 0 : 1;
      const row = i < 4 ? i : i - 4;
      const x = col === 0 ? 0.3 : 5.15;
      const y = 1.32 + row * 1.02;
      const accent = i % 2 === 0 ? C.teal : C.gold;

      s.addShape(pres.shapes.RECTANGLE, {
        x, y, w: 4.6, h: 0.88,
        fill: { color: C.bgCard }, line: { color: accent, width: 1.2 }
      });
      s.addShape(pres.shapes.RECTANGLE, {
        x, y, w: 0.72, h: 0.88,
        fill: { color: accent === C.teal ? "0A3A4A" : "3A2800" }, line: { color: accent, width: 1.2 }
      });
      s.addText(label, {
        x, y, w: 0.72, h: 0.88,
        fontSize: 10, color: accent, bold: true, align: "center", valign: "middle"
      });
      s.addImage({ data: ico, x: x + 0.78, y: y + 0.22, w: 0.38, h: 0.38 });
      s.addText(text, {
        x: x + 1.24, y: y + 0.08, w: 3.22, h: 0.72,
        fontSize: 10, color: C.offWhite, valign: "middle"
      });
    });

    // 7th obj sits alone on second column
    // already handled — last index i=6 → col=1, row=3
  }

  // ══════════════════════════════════════════════════════════════
  // SLIDE 7 — METHODOLOGY
  // ══════════════════════════════════════════════════════════════
  {
    const s = addSlide(); slideBg(s);
    header(s, "METHODOLOGY", C.cyan);
    footer(s, 7);

    s.addText("Agile Development + Quantitative Research Design", {
      x: 0.3, y: 0.82, w: 9.4, h: 0.38,
      fontSize: 14, color: C.cyan, bold: true
    });

    // Agile cycle diagram — circles with arrows
    const phases = [
      { label: "PLAN",     sub: "Requirements\n& user stories",   color: C.teal },
      { label: "DESIGN",   sub: "UML, ERD,\narchitecture",        color: C.gold },
      { label: "DEVELOP",  sub: "Flask API,\nReact.js, ML",       color: C.cyan },
      { label: "TEST",     sub: "Unit tests,\nintegration",       color: C.green },
      { label: "FEEDBACK", sub: "HR review\neach sprint",         color: "FF8C42" },
      { label: "RELEASE",  sub: "Stable\nincrement",              color: C.gold },
    ];
    const cx_center = 3.7, cy_center = 3.1, radius = 1.65;
    phases.forEach(({ label, sub, color }, i) => {
      const angle = (i / phases.length) * Math.PI * 2 - Math.PI / 2;
      const bx = cx_center + Math.cos(angle) * radius - 0.7;
      const by = cy_center + Math.sin(angle) * radius - 0.5;

      s.addShape(pres.shapes.OVAL, {
        x: bx, y: by, w: 1.4, h: 1.0,
        fill: { color: "1A3A7A" }, line: { color: color, width: 2 }
      });
      s.addText(label, {
        x: bx, y: by + 0.05, w: 1.4, h: 0.38,
        fontSize: 10, color: color, bold: true, align: "center"
      });
      s.addText(sub, {
        x: bx, y: by + 0.42, w: 1.4, h: 0.5,
        fontSize: 8, color: C.offWhite, align: "center"
      });
    });
    // Center label
    s.addShape(pres.shapes.OVAL, {
      x: cx_center - 0.65, y: cy_center - 0.45, w: 1.3, h: 0.9,
      fill: { color: C.teal }, line: { color: C.teal }
    });
    s.addText("AGILE\n6 Sprints", {
      x: cx_center - 0.65, y: cy_center - 0.45, w: 1.3, h: 0.9,
      fontSize: 11, color: C.bg, bold: true, align: "center", valign: "middle"
    });

    // Right side — methodology details
    const methods = [
      [icons.clip,  "Research Design",  "Quantitative — structured questionnaires\nto 30 HR professionals in Kigali"],
      [icons.users, "Population",       "32–35 HR managers, recruiters across\npublic, private & NGO sectors"],
      [icons.search,"Sampling",         "Purposive sampling — 30 participants\nwith active recruitment involvement"],
      [icons.chart, "Data Analysis",    "Frequency distributions, percentage\ncalculations, descriptive statistics"],
    ];
    methods.forEach(([ico, title, desc], i) => {
      const y = 1.28 + i * 1.05;
      s.addShape(pres.shapes.RECTANGLE, {
        x: 7.6, y, w: 2.15, h: 0.92,
        fill: { color: C.bgCard }, line: { color: C.cyan, width: 1 }
      });
      s.addImage({ data: ico, x: 7.68, y: y + 0.22, w: 0.35, h: 0.35 });
      s.addText(title, {
        x: 8.08, y: y + 0.05, w: 1.6, h: 0.3,
        fontSize: 9.5, color: C.cyan, bold: true
      });
      s.addText(desc, {
        x: 8.08, y: y + 0.35, w: 1.6, h: 0.5,
        fontSize: 8.5, color: C.offWhite
      });
    });
  }

  // ══════════════════════════════════════════════════════════════
  // SLIDE 8 — DATA COLLECTION & FINDINGS
  // ══════════════════════════════════════════════════════════════
  {
    const s = addSlide(); slideBg(s);
    header(s, "DATA COLLECTION & KEY FINDINGS", C.gold);
    footer(s, 8);

    s.addText("Survey of 30 HR Professionals — Kigali, Rwanda", {
      x: 0.3, y: 0.82, w: 9.4, h: 0.38,
      fontSize: 14, color: C.gold, italic: true, bold: true
    });

    // Big stat callouts
    stat(s, 0.3,  1.35, "80%",  "Spend 3+ hrs/day\non document review",    C.red);
    stat(s, 2.55, 1.35, "86%",  "Cross-referencing 4\ndocs is most burden",  C.gold);
    stat(s, 4.8,  1.35, "86%",  "Want AI to auto-\nextract doc content",     C.teal);
    stat(s, 7.05, 1.35, "100%", "Have NO automated\nshortlisting system",    C.cyan);

    // Bar chart — survey results
    s.addChart(pres.charts.BAR, [{
      name: "% of Respondents",
      labels: ["Spend 3+ hrs/day", "Doc cross-ref\nmost burden", "Trust AI with\nexplanations", "Want AI doc\nextraction", "Inconsistency\nmain problem"],
      values: [80, 86, 86, 86, 76]
    }], {
      x: 0.3, y: 2.78, w: 6.4, h: 2.55,
      barDir: "bar",
      chartColors: ["0D9488"],
      chartArea: { fill: { color: C.bgCard }, roundedCorners: false },
      catAxisLabelColor: C.offWhite,
      valAxisLabelColor: C.muted,
      valGridLine: { color: "1A3A7A", size: 0.5 },
      catGridLine: { style: "none" },
      showValue: true,
      dataLabelColor: C.white,
      dataLabelFontSize: 11,
      showLegend: false,
      showTitle: true,
      title: "Survey Results (%)",
      titleColor: C.gold,
      titleFontSize: 12,
    });

    // Key insight box
    s.addShape(pres.shapes.RECTANGLE, {
      x: 6.9, y: 2.78, w: 2.8, h: 2.55,
      fill: { color: C.bgCard }, line: { color: C.gold, width: 2 }
    });
    s.addText("KEY INSIGHT", {
      x: 6.9, y: 2.85, w: 2.8, h: 0.35,
      fontSize: 11, color: C.gold, bold: true, align: "center"
    });
    const insights = [
      "Manual cross-referencing is the #1 bottleneck (86%)",
      "HR professionals strongly demand transparency in AI decisions",
      "Zero automated tools exist in any of the 30 organizations surveyed",
      "76% cite inconsistency as the most critical problem",
    ];
    insights.forEach((txt, i) => {
      s.addImage({ data: icons.check, x: 6.98, y: 3.3 + i * 0.5, w: 0.22, h: 0.22 });
      s.addText(txt, {
        x: 7.26, y: 3.25 + i * 0.5, w: 2.3, h: 0.44,
        fontSize: 9, color: C.offWhite
      });
    });
  }

  // ══════════════════════════════════════════════════════════════
  // SLIDE 9 — SYSTEM ARCHITECTURE
  // ══════════════════════════════════════════════════════════════
  {
    const s = addSlide(); slideBg(s);
    header(s, "SYSTEM ARCHITECTURE & DESIGN", C.cyan);
    footer(s, 9);

    s.addText("Three-Tier Architecture — React.js → Flask API → SQLite", {
      x: 0.3, y: 0.82, w: 9.4, h: 0.38,
      fontSize: 13, color: C.cyan, bold: true
    });

    // Tier diagram
    const tiers = [
      { label: "PRESENTATION LAYER", sub: "React.js (Vite) SPA",
        items: ["Admin Dashboard", "HR Dashboard", "Applicant Dashboard"],
        color: C.gold, x: 0.3 },
      { label: "APPLICATION LAYER",  sub: "Python Flask REST API",
        items: ["JWT Auth", "Job & Application Mgmt", "Shortlisting Engine"],
        color: C.teal, x: 3.55 },
      { label: "DATA LAYER",         sub: "SQLite + SQLAlchemy ORM",
        items: ["Users / Jobs / Applications", "Documents / OCR Results", "Audit Logs"],
        color: C.cyan, x: 6.8 },
    ];
    tiers.forEach(({ label, sub, items, color, x }) => {
      s.addShape(pres.shapes.RECTANGLE, {
        x, y: 1.35, w: 3.0, h: 2.6,
        fill: { color: C.bgCard }, line: { color: color, width: 2 }, shadow: makeShadow()
      });
      s.addShape(pres.shapes.RECTANGLE, {
        x, y: 1.35, w: 3.0, h: 0.48,
        fill: { color: color === C.gold ? "3A2800" : color === C.teal ? "0A3A4A" : "003A55" },
        line: { color: color, width: 2 }
      });
      s.addText(label, {
        x, y: 1.37, w: 3.0, h: 0.28,
        fontSize: 9.5, color: color, bold: true, align: "center"
      });
      s.addText(sub, {
        x, y: 1.65, w: 3.0, h: 0.22,
        fontSize: 8.5, color: C.muted, align: "center"
      });
      items.forEach((item, ii) => {
        s.addText("▸  " + item, {
          x: x + 0.15, y: 2.02 + ii * 0.55, w: 2.7, h: 0.45,
          fontSize: 10.5, color: C.offWhite
        });
      });
    });

    // Arrows between tiers
    [3.3, 6.55].forEach(ax => {
      s.addShape(pres.shapes.LINE, {
        x: ax, y: 2.6, w: 0.28, h: 0,
        line: { color: C.teal, width: 2 }
      });
    });

    // Bottom: AI components row
    s.addText("AI & PROCESSING COMPONENTS", {
      x: 0.3, y: 4.12, w: 9.4, h: 0.32,
      fontSize: 11, color: C.muted, bold: true, charSpacing: 2
    });

    const aiComps = [
      [icons.file,   "Tesseract OCR",     "Text extraction"],
      [icons.shield, "Document Verifier", "Identity check"],
      [icons.robot,  "XGBoost ML Model",  "Score & rank"],
      [icons.brain,  "Claude (OpenRouter)","Explanations"],
      [icons.db,     "SQLite DB",         "Data persistence"],
    ];
    aiComps.forEach(([ico, title, sub], i) => {
      const x = 0.3 + i * 1.9;
      s.addShape(pres.shapes.RECTANGLE, {
        x, y: 4.52, w: 1.75, h: 0.85,
        fill: { color: C.bgCard }, line: { color: C.teal, width: 1 }
      });
      s.addImage({ data: ico, x: x + 0.12, y: 4.62, w: 0.32, h: 0.32 });
      s.addText(title, {
        x: x + 0.5, y: 4.56, w: 1.18, h: 0.28,
        fontSize: 9, color: C.teal, bold: true
      });
      s.addText(sub, {
        x: x + 0.5, y: 4.84, w: 1.18, h: 0.28,
        fontSize: 8.5, color: C.muted
      });
    });
  }

  // ══════════════════════════════════════════════════════════════
  // SLIDE 10 — ML MODEL & RESULTS
  // ══════════════════════════════════════════════════════════════
  {
    const s = addSlide(); slideBg(s);
    header(s, "ML MODEL DEVELOPMENT & RESULTS", C.teal);
    footer(s, 10);

    s.addText("5 Models Trained → XGBoost Selected as Best Performer", {
      x: 0.3, y: 0.82, w: 9.4, h: 0.38,
      fontSize: 14, color: C.teal, bold: true
    });

    // Accuracy bar chart
    s.addChart(pres.charts.BAR, [{
      name: "Test Accuracy (%)",
      labels: ["Logistic\nRegression", "Random\nForest", "Extra\nTrees", "Gradient\nBoosting", "XGBoost"],
      values: [98.15, 99.45, 99.25, 99.70, 99.95]
    }], {
      x: 0.3, y: 1.32, w: 4.5, h: 2.6,
      barDir: "col",
      chartColors: ["1C7293", "1C7293", "1C7293", "028090", "00C9B1"],
      chartArea: { fill: { color: C.bgCard } },
      catAxisLabelColor: C.offWhite,
      valAxisLabelColor: C.muted,
      valGridLine: { color: "1A3A7A" },
      catGridLine: { style: "none" },
      showValue: true,
      dataLabelColor: C.white,
      dataLabelFontSize: 9,
      showLegend: false,
      showTitle: true, title: "Test Accuracy (%)", titleColor: C.teal, titleFontSize: 11,
      valAxisMinVal: 97, valAxisMaxVal: 100,
    });

    // AUC chart
    s.addChart(pres.charts.BAR, [{
      name: "AUC-ROC",
      labels: ["Log. Reg.", "Rand. Forest", "Extra Trees", "Grad. Boost", "XGBoost"],
      values: [0.996, 0.9999, 0.9998, 1.0, 1.0]
    }], {
      x: 5.0, y: 1.32, w: 4.7, h: 2.6,
      barDir: "col",
      chartColors: ["1C7293", "1C7293", "1C7293", "028090", "00C9B1"],
      chartArea: { fill: { color: C.bgCard } },
      catAxisLabelColor: C.offWhite,
      valAxisLabelColor: C.muted,
      valGridLine: { color: "1A3A7A" },
      catGridLine: { style: "none" },
      showValue: true,
      dataLabelColor: C.white,
      dataLabelFontSize: 9,
      showLegend: false,
      showTitle: true, title: "AUC-ROC Score", titleColor: C.teal, titleFontSize: 11,
      valAxisMinVal: 0.99, valAxisMaxVal: 1.001,
    });

    // Feature importance callout
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.3, y: 4.1, w: 9.4, h: 1.3,
      fill: { color: C.bgCard }, line: { color: C.gold, width: 1.5 }
    });
    s.addText("TOP FEATURES DRIVING SHORTLISTING DECISIONS (Feature Importance)", {
      x: 0.45, y: 4.14, w: 9.1, h: 0.3,
      fontSize: 10, color: C.gold, bold: true
    });

    const features = [
      ["exp_in_range", 0.38],
      ["combined_match_score", 0.27],
      ["edu_meets_minimum", 0.14],
      ["edu_level_match", 0.10],
      ["skills_overlap_ratio", 0.06],
      ["Gender", 0.004],
    ];
    features.forEach(([name, imp], i) => {
      const x = 0.45 + i * 1.55;
      const barH = imp * 3.0;
      s.addText(name.replace(/_/g, "\n"), {
        x, y: 4.46, w: 1.45, h: 0.45,
        fontSize: 7.5, color: C.muted, align: "center"
      });
      const color = name === "Gender" ? C.red : C.teal;
      s.addShape(pres.shapes.RECTANGLE, {
        x: x + 0.2, y: 5.38 - barH * 0.28, w: 1.05, h: barH * 0.28 + 0.02,
        fill: { color }, line: { color }
      });
      s.addText(`${(imp * 100).toFixed(1)}%`, {
        x, y: 4.9, w: 1.45, h: 0.28,
        fontSize: 9, color, bold: true, align: "center"
      });
    });
    s.addText("★ Gender & Age show near-zero importance → Merit-based, bias-aware decisions confirmed", {
      x: 0.45, y: 5.32, w: 9.1, h: 0.25,
      fontSize: 9, color: C.green, bold: true
    });
  }

  // ══════════════════════════════════════════════════════════════
  // SLIDE 11 — CONFUSION MATRICES
  // ══════════════════════════════════════════════════════════════
  {
    const s = addSlide(); slideBg(s);
    header(s, "MODEL EVALUATION — CONFUSION MATRICES", C.cyan);
    footer(s, 11);

    s.addText("XGBoost achieved near-perfect classification — only 1 false negative, 0 false positives", {
      x: 0.3, y: 0.82, w: 9.4, h: 0.38,
      fontSize: 13, color: C.teal, italic: true
    });

    const models = [
      { name: "Logistic Regression", acc: "98.15%", auc: "0.9960", tn: 1451, fp: 26, fn: 11, tp: 512, c: "888888" },
      { name: "Random Forest",       acc: "99.45%", auc: "0.9999", tn: 1475, fp: 2, fn: 9,  tp: 514, c: "1C7293" },
      { name: "Extra Trees",         acc: "99.25%", auc: "0.9998", tn: 1475, fp: 2, fn: 13, tp: 510, c: "028090" },
      { name: "Gradient Boosting",   acc: "99.70%", auc: "1.0000", tn: 1475, fp: 2, fn: 4,  tp: 519, c: "02C39A" },
      { name: "XGBoost ★",           acc: "99.95%", auc: "1.0000", tn: 1477, fp: 0, fn: 1,  tp: 522, c: "00C9B1" },
    ];

    models.forEach((m, i) => {
      const x = 0.3 + i * 1.9;
      s.addText(m.name, {
        x, y: 1.32, w: 1.75, h: 0.35,
        fontSize: 8.5, color: `${m.c}`, bold: true, align: "center"
      });
      s.addText(`Acc: ${m.acc}\nAUC: ${m.auc}`, {
        x, y: 1.65, w: 1.75, h: 0.42,
        fontSize: 8.5, color: C.muted, align: "center"
      });

      // 2x2 confusion matrix
      const cells = [
        { val: m.tn, label: "TN", color: "0D9488" },
        { val: m.fp, label: "FP", color: m.fp > 0 ? "B91C1C" : "3A4A3A" },
        { val: m.fn, label: "FN", color: m.fn > 0 ? "B91C1C" : "3A4A3A" },
        { val: m.tp, label: "TP", color: "0D9488" },
      ];
      cells.forEach((cell, ci) => {
        const cx2 = x + (ci % 2) * 0.875;
        const cy2 = 2.18 + Math.floor(ci / 2) * 0.88;
        s.addShape(pres.shapes.RECTANGLE, {
          x: cx2, y: cy2, w: 0.875, h: 0.88,
          fill: { color: cell.color }, line: { color: C.bgCard, width: 1 }
        });
        s.addText(String(cell.val), {
          x: cx2, y: cy2 + 0.08, w: 0.875, h: 0.45,
          fontSize: 16, color: C.white, bold: true, align: "center"
        });
        s.addText(cell.label, {
          x: cx2, y: cy2 + 0.52, w: 0.875, h: 0.28,
          fontSize: 8.5, color: "rgba(255,255,255,0.7)", align: "center"
        });
      });
    });

    // Legend
    s.addText("TN = True Negative   TP = True Positive   FP = False Positive   FN = False Negative", {
      x: 0.3, y: 4.1, w: 9.4, h: 0.28,
      fontSize: 9, color: C.muted, align: "center"
    });

    // XGBoost highlight box
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.3, y: 4.45, w: 9.4, h: 0.9,
      fill: { color: "0A3A4A" }, line: { color: C.teal, width: 2 }
    });
    s.addImage({ data: icons.star, x: 0.45, y: 4.65, w: 0.38, h: 0.38 });
    s.addText([
      { text: "XGBoost Best Performance: ", options: { color: C.teal, bold: true } },
      { text: "99.95% accuracy  |  AUC-ROC 1.00  |  F1-Score 0.999  |  Only 1 missed candidate out of 523 shortlisted in test set", options: { color: C.white } }
    ], {
      x: 0.9, y: 4.52, w: 8.6, h: 0.76,
      fontSize: 11.5, valign: "middle"
    });
  }

  // ══════════════════════════════════════════════════════════════
  // SLIDE 12 — DATA INTERPRETATION (engineered features)
  // ══════════════════════════════════════════════════════════════
  {
    const s = addSlide(); slideBg(s);
    header(s, "DATA ANALYSIS & INTERPRETATION", C.gold);
    footer(s, 12);

    s.addText("Engineered Features vs Shortlisting Outcome — Key Patterns", {
      x: 0.3, y: 0.82, w: 9.4, h: 0.38,
      fontSize: 14, color: C.gold, bold: true
    });

    // Feature analysis charts
    s.addChart(pres.charts.BAR, [
      { name: "Not Shortlisted", labels: ["skills_ratio", "cert_ratio", "combined_score", "exp_in_range", "edu_match", "field_match"], values: [0.437, 0.329, 0.526, 0.521, 0.277, 0.180] },
    ], {
      x: 0.3, y: 1.32, w: 5.5, h: 2.95,
      barDir: "col",
      chartColors: ["00C9B1"],
      chartArea: { fill: { color: C.bgCard } },
      catAxisLabelColor: C.offWhite,
      valAxisLabelColor: C.muted,
      valGridLine: { color: "1A3A7A" },
      catGridLine: { style: "none" },
      showValue: true,
      dataLabelColor: C.white,
      dataLabelFontSize: 9,
      showLegend: false,
      showTitle: true,
      title: "Correlation with Shortlisting Outcome (absolute)",
      titleColor: C.gold, titleFontSize: 11,
    });

    // Interpretation cards
    const interps = [
      [C.teal, "combined_match_score (r=0.53)", "Highest single predictor — blends education, skills, experience into one score"],
      [C.gold, "exp_in_range (r=0.52)",          "Whether candidate's experience fits the job range — binary but very powerful"],
      [C.cyan, "skills_overlap_ratio (r=0.44)",  "Fraction of required skills the applicant actually declared — strong signal"],
      [C.green,"edu_level_match (r=0.28)",        "Having the right education level matters, but less than skills & experience"],
    ];
    interps.forEach(([color, title, desc], i) => {
      const y = 1.32 + i * 1.0;
      s.addShape(pres.shapes.RECTANGLE, {
        x: 6.0, y, w: 3.75, h: 0.88,
        fill: { color: C.bgCard }, line: { color: color, width: 1.5 }
      });
      s.addShape(pres.shapes.RECTANGLE, {
        x: 6.0, y, w: 0.12, h: 0.88,
        fill: { color: color }, line: { color: color }
      });
      s.addText(title, {
        x: 6.18, y: y + 0.06, w: 3.48, h: 0.3,
        fontSize: 10, color: color, bold: true
      });
      s.addText(desc, {
        x: 6.18, y: y + 0.36, w: 3.48, h: 0.44,
        fontSize: 9.5, color: C.offWhite
      });
    });

    // Heatmap note
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.3, y: 4.42, w: 9.4, h: 0.9,
      fill: { color: C.bgCard }, line: { color: C.muted, width: 1 }
    });
    s.addText([
      { text: "Correlation Heatmap Finding: ", options: { color: C.gold, bold: true } },
      { text: "Gender has correlation of ~0.00 with shortlisting, confirming the model makes merit-based decisions. skills_overlap_count and skills_overlap_ratio are nearly identical (r=1.00) showing multicollinearity — model handles this correctly through feature scaling.", options: { color: C.offWhite } }
    ], {
      x: 0.45, y: 4.48, w: 9.1, h: 0.78,
      fontSize: 10, valign: "middle"
    });
  }

  // ══════════════════════════════════════════════════════════════
  // SLIDE 13 — SYSTEM FEATURES / SCREENSHOTS
  // ══════════════════════════════════════════════════════════════
  {
    const s = addSlide(); slideBg(s);
    header(s, "SYSTEM FEATURES & USER INTERFACES", C.teal);
    footer(s, 13);

    s.addText("Three Role-Based Dashboards — Applicant / HR / Administrator", {
      x: 0.3, y: 0.82, w: 9.4, h: 0.38,
      fontSize: 14, color: C.teal, bold: true
    });

    const roles = [
      {
        icon: icons.users, color: C.gold, title: "JOB APPLICANT",
        features: [
          "Register & browse job postings",
          "Upload 4 documents (ID, CV, Diploma, Certificate)",
          "Real-time document quality check at upload",
          "View AI shortlisting decision & score",
          "Read detailed AI explanation of outcome",
        ]
      },
      {
        icon: icons.clip, color: C.teal, title: "HR PROFESSIONAL",
        features: [
          "Create and publish job postings with criteria",
          "Trigger AI shortlisting for all candidates at once",
          "View ranked candidates with AI scores",
          "Download applicant documents",
          "Generate shortlisting reports with averages",
        ]
      },
      {
        icon: icons.shield, color: C.cyan, title: "SYSTEM ADMINISTRATOR",
        features: [
          "Manage all users (create, delete, change roles)",
          "View complete system audit log",
          "Monitor ML & OCR service status",
          "Access cross-position shortlisting reports",
          "View user feedback & ratings",
        ]
      },
    ];

    roles.forEach(({ icon, color, title, features }, i) => {
      const x = 0.3 + i * 3.25;
      s.addShape(pres.shapes.RECTANGLE, {
        x, y: 1.32, w: 3.1, h: 3.95,
        fill: { color: C.bgCard }, line: { color: color, width: 2 }, shadow: makeShadow()
      });
      s.addShape(pres.shapes.RECTANGLE, {
        x, y: 1.32, w: 3.1, h: 0.62,
        fill: { color: color === C.gold ? "2A1800" : color === C.teal ? "003A3A" : "001A3A" },
        line: { color: color, width: 2 }
      });
      s.addImage({ data: icon, x: x + 0.18, y: 1.39, w: 0.42, h: 0.42 });
      s.addText(title, {
        x: x + 0.68, y: 1.4, w: 2.28, h: 0.42,
        fontSize: 12, color: color, bold: true, valign: "middle"
      });

      features.forEach((f, fi) => {
        s.addImage({ data: icons.arrow, x: x + 0.15, y: 2.05 + fi * 0.62, w: 0.22, h: 0.22 });
        s.addText(f, {
          x: x + 0.45, y: 2.0 + fi * 0.62, w: 2.55, h: 0.55,
          fontSize: 10, color: C.offWhite, valign: "middle"
        });
      });
    });

    // Bottom tech bar
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.3, y: 5.35, w: 9.4, h: 0.15,
      fill: { color: C.teal }, line: { color: C.teal }
    });
  }

  // ══════════════════════════════════════════════════════════════
  // SLIDE 14 — COMPARISON WITH EXISTING SYSTEMS
  // ══════════════════════════════════════════════════════════════
  {
    const s = addSlide(); slideBg(s);
    header(s, "COMPARISON: EXISTING SYSTEMS vs THIS SYSTEM", C.gold);
    footer(s, 14);

    s.addText("Addressing Gaps in Current Recruitment Tools Used in Rwanda & East Africa", {
      x: 0.3, y: 0.82, w: 9.4, h: 0.38,
      fontSize: 13, color: C.gold, italic: true
    });

    // Comparison table
    const rows = [
      ["FEATURE / CAPABILITY",              "Manual Process", "Basic ATS Tools", "This System"],
      ["Multi-document processing (4 types)", "❌ Manual",      "⚠ CV only",       "✅ Full"],
      ["OCR text extraction",                "❌ None",         "⚠ Limited",       "✅ All 4 docs"],
      ["Identity verification (Name match)", "❌ None",         "❌ None",          "✅ AI-powered"],
      ["ML-based candidate scoring",         "❌ None",         "⚠ Rule-based",    "✅ XGBoost"],
      ["Generative AI explanations",         "❌ None",         "❌ None",          "✅ Claude LLM"],
      ["Bias-aware merit scoring",           "❌ Biased",       "⚠ Partial",       "✅ Verified"],
      ["Audit trail & transparency",         "❌ None",         "⚠ Basic logs",    "✅ Full logs"],
      ["Cost / Local adaptability",          "High time cost", "Expensive SaaS",  "✅ Local, Free"],
    ];

    const colW = [3.2, 1.9, 1.9, 2.2];
    const colX = [0.3, 3.52, 5.44, 7.36];
    const rowH = 0.47;

    rows.forEach((row, ri) => {
      row.forEach((cell, ci) => {
        const y = 1.32 + ri * rowH;
        const isHeader = ri === 0;
        const isThisSystem = ci === 3;
        const fillColor = isHeader ? "1A3A7A" : isThisSystem ? "0A3A4A" : C.bgCard;
        const textColor = isHeader ? C.gold : isThisSystem ? C.teal : (cell.startsWith("❌") ? C.red : cell.startsWith("⚠") ? C.gold : C.offWhite);

        s.addShape(pres.shapes.RECTANGLE, {
          x: colX[ci], y, w: colW[ci] - 0.06, h: rowH,
          fill: { color: fillColor },
          line: { color: isThisSystem ? C.teal : "1A3A7A", width: isThisSystem ? 1.5 : 0.5 }
        });
        s.addText(cell, {
          x: colX[ci] + 0.08, y, w: colW[ci] - 0.22, h: rowH,
          fontSize: isHeader ? 10 : 10, color: textColor,
          bold: isHeader || isThisSystem, valign: "middle"
        });
      });
    });
  }

  // ══════════════════════════════════════════════════════════════
  // SLIDE 15 — CONCLUSION
  // ══════════════════════════════════════════════════════════════
  {
    const s = addSlide(); slideBg(s);
    header(s, "CONCLUSION", C.teal);
    footer(s, 15);

    s.addText("What Was Achieved — Objectives Met", {
      x: 0.3, y: 0.82, w: 9.4, h: 0.38,
      fontSize: 16, color: C.teal, bold: true
    });

    const conclusions = [
      [icons.check, C.green,  "SO1 ✓", "Manual shortlisting bottlenecks identified; 80% of HR spend 3+ hrs/day on document review"],
      [icons.db,    C.teal,   "SO2 ✓", "3-role SQLite schema designed — users, jobs, applications, documents, audit logs"],
      [icons.file,  C.gold,   "SO3 ✓", "OCR pipeline processes all 4 document types (ID, CV, Diploma, Certificate)"],
      [icons.shield,C.cyan,   "SO4 ✓", "Document verification checks identity, field of study, education level before processing"],
      [icons.robot, C.teal,   "SO5 ✓", "XGBoost model: 99.95% accuracy, AUC 1.00, F1 > 0.999 — near-perfect classification"],
      [icons.brain, C.gold,   "SO6 ✓", "Claude LLM via OpenRouter generates human-readable per-candidate explanations"],
      [icons.cog,   C.green,  "SO7 ✓", "React.js dashboards delivered for Admin, HR, and Applicant — fully functional"],
    ];

    conclusions.forEach(([ico, color, label, text], i) => {
      const col = i < 4 ? 0 : 1;
      const row = i < 4 ? i : i - 4;
      const x = col === 0 ? 0.3 : 5.15;
      const y = 1.32 + row * 0.98;

      s.addShape(pres.shapes.RECTANGLE, {
        x, y, w: 4.6, h: 0.84,
        fill: { color: C.bgCard }, line: { color: color, width: 1 }
      });
      s.addImage({ data: ico, x: x + 0.12, y: y + 0.22, w: 0.38, h: 0.38 });
      s.addText(label, {
        x: x + 0.6, y: y + 0.06, w: 0.65, h: 0.3,
        fontSize: 10, color: color, bold: true
      });
      s.addText(text, {
        x: x + 1.28, y: y + 0.08, w: 3.2, h: 0.68,
        fontSize: 10, color: C.offWhite, valign: "middle"
      });
    });

    // Impact statement
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.3, y: 5.15, w: 9.4, h: 0.32,
      fill: { color: "0A3A4A" }, line: { color: C.teal, width: 1.5 }
    });
    s.addText("🎯  The system reduces shortlisting time dramatically, improves fairness, and delivers transparent, auditable AI-powered recruitment decisions for Rwanda.", {
      x: 0.45, y: 5.17, w: 9.1, h: 0.28,
      fontSize: 10, color: C.white, bold: true
    });
  }

  // ══════════════════════════════════════════════════════════════
  // SLIDE 16 — RECOMMENDATIONS & THANK YOU
  // ══════════════════════════════════════════════════════════════
  {
    const s = addSlide();
    s.background = { color: C.bg };

    // Header accent
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0, y: 0, w: 10, h: 0.72,
      fill: { color: C.bgLight }, line: { color: C.bgLight }
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0, y: 0, w: 0.18, h: 0.72,
      fill: { color: C.gold }, line: { color: C.gold }
    });
    s.addText("RECOMMENDATIONS & FUTURE WORK", {
      x: 0.28, y: 0, w: 9.5, h: 0.72,
      fontSize: 22, bold: true, color: C.white, fontFace: "Arial Black", valign: "middle", margin: 0
    });
    footer(s, 16);

    const recs = [
      [icons.db,    C.teal, "Real Org Data",         "Retrain model on real historical Rwandan recruitment data"],
      [icons.file,  C.gold, "Multi-language OCR",    "Add Kinyarwanda & French support for local documents"],
      [icons.cog,   C.cyan, "Cloud Deployment",      "Docker + cloud hosting for multi-user concurrent access"],
      [icons.brain, C.green,"Mobile App",            "Companion mobile app for applicants (mobile-first Rwanda)"],
      [icons.shield,C.teal, "NIDA Integration",      "Real-time National ID verification via Rwanda NIDA API"],
      [icons.balance,C.gold,"Bias Auditing",         "Demographic parity & equalized odds fairness reporting"],
    ];

    recs.forEach(([ico, color, title, desc], i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = 0.3 + col * 3.2;
      const y = 0.88 + row * 1.42;

      s.addShape(pres.shapes.RECTANGLE, {
        x, y, w: 3.05, h: 1.22,
        fill: { color: C.bgCard }, line: { color: color, width: 1.5 }
      });
      s.addImage({ data: ico, x: x + 0.15, y: y + 0.12, w: 0.38, h: 0.38 });
      s.addText(title, {
        x: x + 0.62, y: y + 0.1, w: 2.32, h: 0.32,
        fontSize: 11, color: color, bold: true
      });
      s.addText(desc, {
        x: x + 0.62, y: y + 0.42, w: 2.32, h: 0.72,
        fontSize: 10, color: C.offWhite
      });
    });

    // Thank you section
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0, y: 3.88, w: 10, h: 1.75,
      fill: { color: C.bgLight }, line: { color: C.bgLight }
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0, y: 3.88, w: 10, h: 0.06,
      fill: { color: C.teal }, line: { color: C.teal }
    });
    s.addText("THANK YOU", {
      x: 0.3, y: 3.98, w: 9.4, h: 0.5,
      fontSize: 28, color: C.teal, bold: true, fontFace: "Arial Black", align: "center"
    });
    s.addText("Gertrude IRIMASO  |  25RP19175  |  Supervisor: Judith BIZIMANA", {
      x: 0.3, y: 4.48, w: 9.4, h: 0.3,
      fontSize: 12, color: C.offWhite, align: "center"
    });
    s.addText("Department of ICT — Information Technology  |  Rwanda Polytechnic, Huye College  |  2026", {
      x: 0.3, y: 4.85, w: 9.4, h: 0.28,
      fontSize: 10, color: C.muted, align: "center", italic: true
    });

    // Questions prompt
    s.addShape(pres.shapes.RECTANGLE, {
      x: 3.2, y: 5.2, w: 3.6, h: 0.32,
      fill: { color: C.teal }, line: { color: C.teal }
    });
    s.addText("Questions & Discussion Welcome", {
      x: 3.2, y: 5.2, w: 3.6, h: 0.32,
      fontSize: 11, color: C.bg, bold: true, align: "center", valign: "middle"
    });
  }

  // Write file
console.log("✅ Report generated at:", outputPath);

  console.log("Done.");
}

build().catch(console.error);
