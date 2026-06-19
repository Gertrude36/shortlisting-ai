const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType,
  PageNumber, PageBreak, LevelFormat, VerticalAlign, Header, Footer,
  TableOfContents
} = require('docx');
const fs = require('fs');

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

function p(text, opts = {}) {
  return new Paragraph({
    alignment: opts.align || AlignmentType.LEFT,
    spacing: { before: opts.before || 120, after: opts.after || 120, line: opts.line || 276 },
    children: [new TextRun({
      text,
      bold: opts.bold || false,
      size: opts.size || 24,
      font: "Times New Roman",
      color: opts.color || "000000",
    })]
  });
}

function h(text, level) {
  return new Paragraph({
    heading: level,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({
      text,
      bold: true,
      size: level === HeadingLevel.HEADING_1 ? 28 : level === HeadingLevel.HEADING_2 ? 26 : 24,
      font: "Times New Roman",
    })]
  });
}

function blank(n = 1) {
  return Array(n).fill(new Paragraph({ children: [new TextRun({ text: "" })] }));
}

function centered(text, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: opts.before || 120, after: opts.after || 120 },
    children: [new TextRun({
      text,
      bold: opts.bold || false,
      size: opts.size || 24,
      font: "Times New Roman",
    })]
  });
}

function bullet(text, opts = {}) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { before: 80, after: 80, line: 276 },
    children: [new TextRun({
      text,
      size: 24,
      font: "Times New Roman",
    })]
  });
}

function tableRow(cells, header = false) {
  return new TableRow({
    tableHeader: header,
    children: cells.map(({ text, w, shade }) => new TableCell({
      borders,
      width: { size: w, type: WidthType.DXA },
      shading: shade ? { fill: shade, type: ShadingType.CLEAR } : undefined,
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({
        children: [new TextRun({
          text,
          bold: header,
          size: 20,
          font: "Times New Roman",
        })]
      })]
    }))
  });
}

// PAGE BREAK
function pageBreak() {
  return new Paragraph({
    children: [new PageBreak()]
  });
}

function signatureLine(label, name, dateLabel = "Date:") {
  return [
    p(`${label}: ${name}`, { bold: false }),
    p(`${dateLabel} ………………….`),
    p("Signature: ……………….."),
    ...blank(1)
  ];
}

// ============================
// DOCUMENT CONTENT
// ============================

const doc = new Document({
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [{
          level: 0,
          format: LevelFormat.BULLET,
          text: "\u2022",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } }
        }]
      },
      {
        reference: "numberedList",
        levels: [{
          level: 0,
          format: LevelFormat.DECIMAL,
          text: "%1.",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } }
        }]
      }
    ]
  },
  styles: {
    default: {
      document: { run: { font: "Times New Roman", size: 24 } }
    },
    paragraphStyles: [
      {
        id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Times New Roman" },
        paragraph: { spacing: { before: 300, after: 200 }, outlineLevel: 0 }
      },
      {
        id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: "Times New Roman" },
        paragraph: { spacing: { before: 240, after: 160 }, outlineLevel: 1 }
      },
      {
        id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Times New Roman" },
        paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 2 }
      }
    ]
  },
  sections: [
    // =====================
    // COVER PAGE
    // =====================
    {
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
        }
      },
      children: [
        ...blank(2),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "RWANDA POLYTECHNIC", bold: true, size: 28, font: "Times New Roman" })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "HUYE COLLEGE (IPRC HUYE)", bold: true, size: 26, font: "Times New Roman" })]
        }),
        ...blank(1),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "DEPARTMENT OF INFORMATION COMMUNICATION TECHNOLOGY", bold: true, size: 24, font: "Times New Roman" })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "OPTION: INFORMATION TECHNOLOGY", bold: true, size: 24, font: "Times New Roman" })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "LEVEL: 8", bold: true, size: 24, font: "Times New Roman" })]
        }),
        ...blank(2),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "CAPSTONE PROJECT REPORT", bold: true, size: 30, font: "Times New Roman" })]
        }),
        ...blank(1),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "AUTOMATED SHORTLISTING SYSTEM USING GENERATIVE AI", bold: true, size: 28, font: "Times New Roman" })]
        }),
        ...blank(2),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "Submitted in Partial Fulfillment of the Requirements for the Award of", italics: true, size: 24, font: "Times New Roman" })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "Bachelor of Technology in Information and Communication Technology", bold: true, size: 24, font: "Times New Roman" })]
        }),
        ...blank(3),
        p("Submitted By: Gertrude IRIMASO", { bold: true }),
        p("Reg No: 25RP19175", { bold: true }),
        p("Supervisor: Judith BIZIMANA", { bold: true }),
        ...blank(2),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "Academic Year: 2025–2026", bold: true, size: 24, font: "Times New Roman" })]
        }),
        pageBreak()
      ]
    },
    // =====================
    // FRONT MATTER
    // =====================
    {
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
        }
      },
      children: [
        // DECLARATION
        h("DECLARATION", HeadingLevel.HEADING_1),
        p("I, Gertrude IRIMASO, hereby declare that this capstone project report titled \"Automated Shortlisting System Using Generative AI\" is my own original work and has not been submitted for any degree or examination at any other institution. All sources of information have been duly acknowledged through proper referencing in accordance with the APA 7th Edition referencing style."),
        ...blank(1),
        p("Name: Gertrude IRIMASO"),
        p("Registration Number: 25RP19175"),
        p("Date: …………………."),
        p("Student Signature: ……………….."),
        ...blank(1),
        p("Supervisor's Declaration:", { bold: true }),
        p("I confirm that the work reported in this research project was carried out by IRIMASO Gertrude under my supervision and is submitted with my approval."),
        ...blank(1),
        p("Name: Judith BIZIMANA"),
        p("Date: ……………….."),
        p("Supervisor Signature: …………….."),
        pageBreak(),

        // AUTHORITY TO DEPOSIT
        h("AUTHORITY TO DEPOSIT THE CORRECTED VERSION OF THE PROJECT TO THE LIBRARY", HeadingLevel.HEADING_1),
        p("I the undersigned hereby do testify to have verified the corrections made by the student IRIMASO Gertrude."),
        p("To their Project entitled \"Automated Shortlisting System Using Generative AI\" and authorized her to deposit the document to the library of the RP Huye College."),
        ...blank(1),
        p("MEMBERS OF THE PANEL", { bold: true }),
        ...blank(2),
        new Table({
          width: { size: 9026, type: WidthType.DXA },
          columnWidths: [4513, 4513],
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  borders: noBorders,
                  width: { size: 4513, type: WidthType.DXA },
                  children: [p("Co-Evaluator", { bold: true }), p("UMUTONI Marie"), p("Date: ……/……/2026"), p("Signature: ……………")]
                }),
                new TableCell({
                  borders: noBorders,
                  width: { size: 4513, type: WidthType.DXA },
                  children: [p("Principal Evaluator", { bold: true }), p("NTAMBARA Etienne"), p("Date: ……/……/2026"), p("Signature: ……………")]
                }),
              ]
            })
          ]
        }),
        pageBreak(),

        // APPROVAL
        h("APPROVAL", HeadingLevel.HEADING_1),
        p("This is to certify that the project titled Automated Shortlisting System Using Generative AI carried out by IRIMASO Gertrude has been read, checked and approved for meeting part of the requirements and regulations governing the award of the Bachelor of Technology in Information and Communication Technology at Huye College."),
        ...blank(1),
        new Table({
          width: { size: 9026, type: WidthType.DXA },
          columnWidths: [2500, 3500, 3026],
          rows: [
            tableRow([
              { text: "Role", w: 2500, shade: "D5E8F0" },
              { text: "Name & Title", w: 3500, shade: "D5E8F0" },
              { text: "Date & Signature", w: 3026, shade: "D5E8F0" }
            ], true),
            tableRow([
              { text: "Project Supervisor", w: 2500 },
              { text: "Judith BIZIMANA (Lecturer)", w: 3500 },
              { text: "", w: 3026 }
            ]),
            tableRow([
              { text: "Head of Department", w: 2500 },
              { text: "Mr. Patrick NDIZEYE (HOD)", w: 3500 },
              { text: "", w: 3026 }
            ]),
          ]
        }),
        pageBreak(),

        // DEDICATION
        h("DEDICATION", HeadingLevel.HEADING_1),
        p("I dedicate this final project to:"),
        ...blank(1),
        p("Almighty God,"),
        p("My beloved family,"),
        p("All my close friends who have contributed to this work,"),
        p("The entire teaching staff who have supported me during my studies,"),
        p("My supervisor for the guidance and support,"),
        p("The Government of Rwanda for promoting technology, which has accelerated the development of our country."),
        pageBreak(),

        // ACKNOWLEDGEMENT
        h("ACKNOWLEDGEMENT", HeadingLevel.HEADING_1),
        p("First and foremost, I give thanks to the Almighty God for the strength and wisdom that sustained me throughout this capstone project."),
        p("I sincerely thank my supervisor, Judith BIZIMANA, for her invaluable guidance, constructive feedback, and continuous encouragement throughout the development of this project. Her expertise and dedication significantly shaped the quality of this work."),
        p("I extend my gratitude to the faculty and staff of the Department of Information and Communication Technology at IPRC HUYE, Rwanda Polytechnic, for the enabling academic environment they provided."),
        p("Special thanks go to the HR professionals at Imena Services and Technology Ltd. and across organizations in Kigali who participated in the data collection survey. Their insights were critical to grounding this system in real-world recruitment needs."),
        p("Finally, I thank my family and friends for their moral support and encouragement throughout this academic journey."),
        pageBreak(),

        // ABSTRACT (corrected: under 250 words)
        h("ABSTRACT", HeadingLevel.HEADING_1),
        p("Manual shortlisting in Rwandan and East African organizations is increasingly unsustainable given growing application volumes, with recruiters spending up to 23 hours per hire on CV screening alone (SHRM, 2023). This capstone project designed and implemented an Automated Shortlisting System Using Generative AI: an intelligent Python-based recruitment platform integrating a trained Machine Learning (ML) classification model, an Optical Character Recognition (OCR) multi-document processing pipeline, and a Generative AI API for explainable decision-making, delivered through a Flask backend and a React.js interface."),
        p("The system was developed using the Agile software development methodology across six iterative sprints. Primary data was collected through structured questionnaires administered to 30 HR professionals in Kigali. Results confirmed that 86% considered manual cross-referencing of four applicant documents (National ID, CV, Diploma, Certificate) their most burdensome task, 86% would trust AI-generated shortlists if accompanied by document-referenced explanations, and 100% had no automated tool in place."),
        p("The XGBoost classifier, trained on 10,000 synthetic candidate profiles, achieved test-set accuracy exceeding 99%, F1-score above 0.99, and AUC-ROC of 1.00 through rich match-quality feature engineering. Feature importance analysis confirmed merit-based, bias-aware decision-making, with demographic features recording near-zero importance. The Generative AI component was accessed via OpenRouter (Claude by Anthropic), producing human-readable, document-referenced shortlisting explanations. The implemented system significantly reduces shortlisting time, improves consistency, and delivers transparent, auditable outcomes, constituting a scalable and locally adaptable tool for modernizing talent acquisition in Rwanda."),
        ...blank(1),
        p("Keywords: Generative AI, Automated Shortlisting, Machine Learning, OCR, Human Resource Management, Rwanda, Explainable AI, Agile Methodology, XGBoost, OpenRouter", { bold: false }),
        pageBreak(),

        // LIST OF ABBREVIATIONS
        h("LIST OF ABBREVIATIONS", HeadingLevel.HEADING_1),
        new Table({
          width: { size: 9026, type: WidthType.DXA },
          columnWidths: [2500, 6526],
          rows: [
            tableRow([{ text: "Abbreviation", w: 2500, shade: "D5E8F0" }, { text: "Meaning", w: 6526, shade: "D5E8F0" }], true),
            ...([
              ["AI", "Artificial Intelligence"],
              ["API", "Application Programming Interface"],
              ["CV", "Curriculum Vitae"],
              ["DFD", "Data Flow Diagram"],
              ["ERD", "Entity Relationship Diagram"],
              ["GenAI", "Generative Artificial Intelligence"],
              ["GUI", "Graphical User Interface"],
              ["HR", "Human Resources"],
              ["HRM", "Human Resource Management"],
              ["ICT", "Information Communication Technology"],
              ["ID", "Identity Document / National Identity Card"],
              ["IPRC", "Integrated Polytechnic Regional College"],
              ["JSON", "JavaScript Object Notation"],
              ["LLM", "Large Language Model"],
              ["ML", "Machine Learning"],
              ["NLP", "Natural Language Processing"],
              ["OCR", "Optical Character Recognition"],
              ["PDF", "Portable Document Format"],
              ["PostgreSQL", "Postgres Structured Query Language"],
              ["RDBMS", "Relational Database Management System"],
              ["React", "React JavaScript Library (by Meta)"],
              ["REST", "Representational State Transfer"],
              ["RP", "Rwanda Polytechnic"],
              ["SPA", "Single Page Application"],
              ["UI", "User Interface"],
              ["UX", "User Experience"],
              ["XAI", "Explainable Artificial Intelligence"],
              ["XGBoost", "Extreme Gradient Boosting"],
            ]).map(([abbr, meaning]) => tableRow([
              { text: abbr, w: 2500 },
              { text: meaning, w: 6526 }
            ]))
          ]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 120, after: 120 },
          children: [new TextRun({ text: "Table: List of Abbreviations", italics: true, size: 22, font: "Times New Roman" })]
        }),
        pageBreak(),

        // TABLE OF CONTENTS (placeholder)
        h("TABLE OF CONTENTS", HeadingLevel.HEADING_1),
        p("DECLARATION ....................................................................................................................i"),
        p("AUTHORITY TO DEPOSIT .................................................................................................ii"),
        p("APPROVAL ...................................................................................................................... iii"),
        p("DEDICATION....................................................................................................................iv"),
        p("ACKNOWLEDGEMENT...................................................................................................v"),
        p("ABSTRACT .......................................................................................................................vi"),
        p("LIST OF ABBREVIATIONS ..............................................................................................vii"),
        p("LIST OF FIGURES .............................................................................................................ix"),
        p("LIST OF TABLES...............................................................................................................x"),
        p("CHAPTER 1: GENERAL INTRODUCTION ....................................................................1"),
        p("CHAPTER 2: LITERATURE REVIEW.............................................................................8"),
        p("CHAPTER 3: DATA COLLECTION, PRESENTATION AND ANALYSIS...................11"),
        p("CHAPTER 4: IMPLEMENTATION ................................................................................31"),
        p("CHAPTER 5: CONCLUSION AND RECOMMENDATIONS .......................................44"),
        p("REFERENCES..................................................................................................................47"),
        p("APPENDICES ...................................................................................................................49"),
        pageBreak(),

        // LIST OF FIGURES
        h("LIST OF FIGURES", HeadingLevel.HEADING_1),
        p("Figure 1: Key findings from survey .....................................................................................13"),
        p("Figure 2: Agile Development Process Diagram ..................................................................17"),
        p("Figure 3: System Architecture Diagram ..............................................................................18"),
        p("Figure 4: Use Case Diagram ................................................................................................19"),
        p("Figure 5: Data Flow Diagram .............................................................................................20"),
        p("Figure 6: Activity Diagram .................................................................................................21"),
        p("Figure 7: Sequence Diagram................................................................................................22"),
        p("Figure 8: Class Diagram ......................................................................................................23"),
        p("Figure 9: Entity Relationship Diagram.................................................................................24"),
        p("Figure 10: Trained Models Comparison...............................................................................34"),
        p("Figure 11: Feature Importance Chart....................................................................................35"),
        p("Figure 12: Confusion Matrix of Best-Performing Model.....................................................36"),
        p("Figure 13: Homepage...........................................................................................................37"),
        p("Figure 14: Registration Page................................................................................................38"),
        p("Figure 15: Login Page..........................................................................................................38"),
        p("Figure 16: Applicant Dashboard...........................................................................................38"),
        p("Figure 17: Document Uploading Page..................................................................................39"),
        p("Figure 18: HR Dashboard Page ...........................................................................................40"),
        p("Figure 19: Shortlisting Results with AI Explanations .........................................................41"),
        p("Figure 20: HR Report Page..................................................................................................41"),
        p("Figure 21: System Administrator Dashboard .......................................................................42"),
        p("Figure 22: Job Creation Form..............................................................................................43"),
        pageBreak(),

        // LIST OF TABLES
        h("LIST OF TABLES", HeadingLevel.HEADING_1),
        p("Table 1: List of Abbreviations .............................................................................................vii"),
        p("Table 2: Data Dictionary ......................................................................................................30"),
        p("Table 3: Work Plan...............................................................................................................50"),
        p("Table 4: Project Gantt Chart.................................................................................................51"),
        p("Table 5: Project Budget ........................................................................................................53"),
        pageBreak(),

        // =====================
        // CHAPTER 1
        // =====================
        h("CHAPTER 1: GENERAL INTRODUCTION", HeadingLevel.HEADING_1),

        h("1.0. Introduction", HeadingLevel.HEADING_2),
        p("In the contemporary job market, organizations regularly receive hundreds to thousands of applications for a single job vacancy. The burden of screening these applications manually is immense, creating bottlenecks in the hiring pipeline and increasing the likelihood of human error and bias. According to a 2022 LinkedIn Global Talent Trends report, 76% of hiring managers acknowledge that attracting the right talent is their primary challenge, and recruiters spend an average of 6–8 seconds reviewing a single résumé before making an initial decision (Ladders Inc., 2018). Rwanda's growing economy and expanding private and public sectors have intensified this challenge, as more graduates and professionals enter the workforce each year. A 2021 report by the Rwanda Development Board noted a 34% annual increase in graduate job applications submitted to private-sector organizations in Kigali, further straining traditional recruitment processes."),
        p("Generative Artificial Intelligence (GenAI), powered by Large Language Models (LLMs), has emerged as a transformative force capable of understanding, generating, and reasoning about human language with remarkable accuracy. When combined with trained Machine Learning (ML) classification models and Optical Character Recognition (OCR) technology, these capabilities form the foundation of a powerful and intelligent recruitment automation system."),
        p("This project proposes the design and implementation of an Automated Shortlisting System Using Generative AI: an intelligent AI-powered recruitment system developed in Python, combining a trained Machine Learning classification model, an OCR document processing pipeline, and a Generative AI API for explainable decision-making, delivered through a Flask backend and a React.js interface. The system supports three user roles: Administrator, HR Professionals, and Job Applicants. Job applicants are required to submit four official documents during their application: a National Identity Card, a Curriculum Vitae, an Academic Diploma, and supporting Certificates. The system processes all four document types through the OCR pipeline, evaluates the extracted information against job requirements using the ML model, and generates AI-powered shortlisting decisions with human-readable explanations."),

        h("1.1. Background of the Study", HeadingLevel.HEADING_2),
        p("Recruitment is a fundamental function of Human Resource Management, serving as the gateway through which organizations acquire the talent necessary to fulfill their strategic objectives. Traditionally, shortlisting has been performed manually, where HR officers collect applicant documents including CVs, academic credentials, identity documents, and certificates, review each document individually, match qualifications to job descriptions, and subjectively rank candidates. This process is not only labor-intensive but also susceptible to unconscious bias based on gender, ethnicity, age, or educational background."),
        p("The advent of Artificial Intelligence and, more recently, Generative AI has introduced new possibilities for automating complex cognitive tasks, including document text extraction, content comprehension, comparison, and ranking. Systems built on LLMs such as GPT-4 can interpret unstructured text extracted from applicant documents with nuanced understanding, making them ideal for shortlisting applications. Additionally, advancements in OCR technology now allow systems to extract structured text from diverse document formats including scanned National IDs, academic Diplomas, professional Certificates, and typed or handwritten CVs."),
        p("In Rwanda and across East Africa, the recruitment sector has seen growing adoption of digital tools, but AI-powered shortlisting that can handle multi-document applicant profiles remains largely absent from small and medium-sized enterprises. This project addresses this gap by providing an accessible, locally adaptable intelligent shortlisting system that combines ML-based candidate scoring, OCR-based multi-document processing, document verification, and Generative AI-powered decision explanations in a single unified platform."),

        // CORRECTED: Problem Statement in paragraphs (not bullets)
        h("1.2. Problem Statement", HeadingLevel.HEADING_2),
        p("After observing existing recruitment practices across organizations in Rwanda and reviewing literature on global HR challenges, several key problems were identified that justify the development of the proposed system."),
        p("First, manual shortlisting of large candidate pools is extremely time-consuming, often taking days or weeks, thereby delaying the entire recruitment pipeline and increasing operational costs. HR officers must manually read and cross-reference multiple applicant documents such as Identity Cards, CVs, Diplomas, and Certificates for each candidate, a process that is not sustainable for large volumes of applications."),
        p("Second, human reviewers may be influenced by subjective perceptions that can disadvantage qualified candidates based on non-merit factors such as gender, age, or name recognition. This introduces inconsistency in shortlisting criteria across different reviewers, leading to unfair outcomes and a poor candidate experience."),
        p("Third, there is no centralized, automated platform capable of receiving multi-document applications, verifying document authenticity, extracting relevant information via OCR, and generating ranked shortlists. Small and medium enterprises in Rwanda particularly lack affordable, tailored tools for AI-powered recruitment automation that can handle structured document-based applications."),
        p("Finally, existing systems in the Rwandan context lack explainable decision-making, making it difficult for HR professionals to justify or audit shortlisting outcomes. This absence of transparency undermines trust in automated tools and creates accountability gaps in the recruitment process."),

        h("1.3. Purpose of the Study", HeadingLevel.HEADING_2),
        p("The main aim of this study is to design and implement an Automated Shortlisting System Using Generative AI that reduces the time and effort required for candidate screening, improves consistency and fairness in shortlisting decisions, and provides Human Resource professionals with explainable, AI-generated shortlisting reports. The system serves three distinct user roles: the Administrator, who manages the platform, users, and system configuration; HR Professionals, who post job vacancies and review AI-generated shortlists; and Job Applicants, who register on the platform, submit their four official application documents, and track their shortlisting status."),

        h("1.4. Research Objectives", HeadingLevel.HEADING_2),

        h("1.4.1. General Objective", HeadingLevel.HEADING_3),
        p("To design and implement an intelligent AI-powered Automated Shortlisting System that combines Machine Learning, OCR-based multi-document processing, document verification, and Generative AI to intelligently screen, score, rank, and shortlist job applicants based on defined criteria."),

        h("1.4.2. Specific Objectives", HeadingLevel.HEADING_3),
        p("The following specific objectives guided the development of the system. Each objective is directly linked to its corresponding research question:"),
        bullet("SO1: To analyze existing manual shortlisting processes and identify their key inefficiencies and limitations within Rwandan organizations."),
        bullet("SO2: To design a SQLite database schema and system architecture capable of managing job postings, candidate profiles, multi-document applications (National ID, CV, Diploma, Certificates), and shortlisting results, supporting three user roles: Administrator, HR Professionals, and Applicants."),
        bullet("SO3: To integrate an OCR service into the system to extract structured text from all four types of applicant documents submitted in PDF or image formats."),
        bullet("SO4: To implement a document verification module that validates the completeness and format of submitted applicant documents before processing."),
        bullet("SO5: To build and train a Machine Learning classification model capable of scoring and ranking candidates based on features extracted from their submitted documents and matched against job requirements."),
        bullet("SO6: To integrate a Generative AI API into the system to produce clear, human-readable explanations for each shortlisting decision."),
        bullet("SO7: To develop a user-friendly React.js interface with separate dashboards for the Administrator, HR Professionals, and Job Applicants, and to validate the system's performance with real or simulated recruitment data."),

        h("1.5. Research Questions", HeadingLevel.HEADING_2),
        p("The following research questions are each directly and individually linked to a specific objective above, following a one-to-one mapping:"),
        bullet("RQ1: What are the key inefficiencies and limitations of current manual shortlisting processes in Rwandan organizations, and what specific features are needed in an automated solution?"),
        bullet("RQ2: What database schema and three-role system architecture best supports a multi-role platform managing multi-document shortlisting at scale?"),
        bullet("RQ3: How can an OCR pipeline reliably extract and structure relevant information from four different types of applicant documents submitted in various PDF and image formats?"),
        bullet("RQ4: How can a document verification module effectively validate the completeness and format of multi-type applicant document submissions before ML processing?"),
        bullet("RQ5: How can a trained Machine Learning classification model effectively evaluate extracted document features against job requirements to produce accurate and consistent candidate scores?"),
        bullet("RQ6: How can Generative AI be used to produce clear, human-understandable explanations for each candidate's shortlisting score and ranking based on their submitted documents?"),
        bullet("RQ7: What system architecture combining Python (Flask), React.js, SQLite, OCR, ML, and GenAI best supports a scalable, secure, and user-friendly automated shortlisting system serving all three user roles?"),

        h("1.6. Scope of the Study", HeadingLevel.HEADING_2),
        p("This project is limited to the design and implementation of an automated shortlisting system focused on the initial screening phase of recruitment. The system covers three user roles: the Administrator, who manages the platform and users; HR Professionals, who post job vacancies and trigger shortlisting; and Job Applicants, who submit applications and track their results. The content scope includes job posting creation by HR staff; job application submission by applicants including upload of four mandatory documents (National ID, CV, Diploma, and Certificates); OCR-based document text extraction and verification; ML-powered candidate scoring and ranking; Generative AI-driven shortlisting decision explanation; and shortlist management and review by HR professionals. The system is run locally via terminal and does not require external hosting. It does not cover subsequent recruitment stages such as interview scheduling, offer management, or employee onboarding. It is designed for organizations operating in Rwanda, with potential for broader regional adaptation."),

        h("1.7. Significance of the Study", HeadingLevel.HEADING_2),
        p("This system holds significance for multiple stakeholders. For organizations and HR departments, it dramatically reduces the time and cost of candidate screening while improving selection consistency and quality, particularly by automating the processing of multi-document applicant files. For job applicants, it ensures that all submitted documents are evaluated objectively against defined criteria and that they receive transparent, AI-generated feedback on their shortlisting outcome. For Rwanda's growing tech ecosystem, the project demonstrates a practical and locally relevant application of Machine Learning, OCR, and Generative AI in a real-world HR process. Additionally, this research contributes to the academic body of knowledge on AI-driven HR automation in the East African context."),

        // CORRECTED METHODOLOGY: rewritten to describe methods used in Chapter 3
        h("1.8. Methodology", HeadingLevel.HEADING_2),
        p("This study adopted a quantitative research design, combining descriptive and applied research approaches to both understand the problem domain and deliver a functional software solution. The Agile software development methodology guided all system development activities, enabling iterative development, continuous testing, and stakeholder feedback incorporation throughout the project lifecycle."),
        p("Primary data was collected through structured questionnaires distributed to 30 HR professionals across selected organizations in Kigali, Rwanda. The questionnaires used Likert-scale and multiple-choice questions to gather quantitative data on recruitment volumes, time spent per application, document handling challenges, and desired system features. Secondary data was gathered through document review of sample job descriptions and applicant document formats, as well as a literature review of academic journals, industry reports, and technical documentation on AI, NLP, OCR, and automated recruitment systems. A full discussion of data collection, analysis, and system design is presented in Chapter 3."),
        p("The study area was Kigali City, specifically at Imena Services and Technology Ltd., located in Gasabo District, Kinyinya Sector, purposively selected due to its active involvement in modern recruitment processes."),

        h("1.9. Organization of the Report", HeadingLevel.HEADING_2),
        p("This report is organized into five chapters as follows:"),
        bullet("Chapter One: General Introduction presents the background, problem statement, objectives, research questions, scope, significance, and methodology of the study."),
        bullet("Chapter Two: Literature Review reviews existing concepts, theories, and related work on AI-driven recruitment, ML-based candidate evaluation, OCR document processing, and automated shortlisting systems."),
        bullet("Chapter Three: Data Collection, Presentation, and Analysis covers the research design, data collection findings, analysis of the current system, and the detailed design of the proposed system including UML diagrams and the database data dictionary."),
        bullet("Chapter Four: Implementation details the technologies used, ML model development and evaluation, OCR integration, system features, and screenshots of the implemented system interfaces."),
        bullet("Chapter Five: Conclusion and Recommendations summarizes project findings, draws conclusions, and provides recommendations for future improvements."),
        pageBreak(),

        // =====================
        // CHAPTER 2
        // =====================
        h("CHAPTER 2: LITERATURE REVIEW", HeadingLevel.HEADING_1),

        h("2.1. Introduction", HeadingLevel.HEADING_2),
        p("This chapter reviews relevant literature on automated recruitment systems, Artificial Intelligence in Human Resource Management, Natural Language Processing, Generative AI, Machine Learning classification models, and Optical Character Recognition applied to multi-document processing. It examines concepts proposed by researchers and industry experts, identifies key theoretical frameworks, and situates this project within the broader body of existing knowledge. The chapter also defines key terms, examines existing systems, and clearly distinguishes the contribution of the proposed system from prior work."),

        // CORRECTED: Key terms / definitions added
        h("2.2. Definition of Key Terms", HeadingLevel.HEADING_2),
        p("Automated Shortlisting refers to the use of software systems to automatically evaluate, score, and rank job applicants based on predefined criteria without requiring manual intervention by HR staff."),
        p("Generative Artificial Intelligence (GenAI) refers to AI systems built on Large Language Models (LLMs) that can generate human-readable text, summaries, and explanations from structured or unstructured input data."),
        p("Optical Character Recognition (OCR) is the technology that converts images of text—such as scanned documents, PDFs, or photographs—into machine-readable text strings that can be processed by software."),
        p("Machine Learning (ML) Classification is a supervised learning approach in which a model is trained on labeled data to predict the class of new inputs. In the context of this project, the model classifies candidates as shortlisted or not shortlisted."),
        p("Explainable AI (XAI) refers to AI systems designed to produce outputs that are interpretable and understandable to human users, enabling them to trace and justify automated decisions."),

        h("2.3. Concepts, Opinions, and Ideas from Authors/Experts", HeadingLevel.HEADING_2),
        p("Marchetti and Scardovi (2023) observed that AI-powered recruitment tools can significantly reduce time-to-hire by automating repetitive document screening, allowing HR professionals to focus on higher-value activities. This directly aligns with this project's core motivation of eliminating the multi-document cross-referencing bottleneck in Rwandan organizations."),
        p("Prabhusureshkumar (2018) documented Amazon's experimental AI recruitment system and concluded that AI-driven shortlisting tools must be carefully monitored to prevent reinforcement of historical biases embedded in training data. This underscores the importance of the explainability and bias-awareness features in the proposed system implemented through the GenAI explanation module and feature importance analysis during ML training."),
        p("Bali et al. (2026) argued that ML applications in HR offer the greatest value when applied to pattern recognition across large structured datasets, and that AI systems should complement rather than replace human judgment. The proposed system adopts this philosophy by allowing HR professionals to review, override, and adjust AI-generated shortlists after automated ranking."),
        p("Mienye et al. (2025) demonstrated that Large Language Models can perform complex reasoning tasks—text summarization, comparison, and question answering—without task-specific fine-tuning, directly supporting the use of the Claude LLM via OpenRouter for generating natural-language shortlisting explanations."),
        p("Regarding OCR, Jeon et al. (2026) validated advanced OCR methodologies for structured document processing, while Neji et al. (2026) extended OCR capabilities to handle low-quality scans, varied fonts, and mixed-language documents—both studies validating the feasibility of processing the four document types required by this system. Lun et al. (2022) presented a machine learning pipeline for document extraction that informs the OCR integration architecture used in this project."),

        h("2.4. Theoretical Perspectives", HeadingLevel.HEADING_2),
        p("This project draws on several theoretical frameworks that underpin its design and implementation decisions."),
        p("Information Processing Theory suggests that effective decision-making requires structured information processing. Rather than relying on a human reviewer to mentally integrate information from four separate documents per candidate, the proposed system structures this process through the OCR pipeline and ML model evaluation."),
        p("The Theory of Planned Behavior informs the system's design by ensuring AI decisions are presented in ways that align with recruiters' existing decision-making patterns, encouraging adoption. The GenAI explanation module ensures HR professionals can follow the reasoning behind each shortlisting score."),
        p("Explainable AI (XAI) is central to the system's design philosophy. Each candidate's shortlisting score is accompanied by a natural-language explanation generated by the Claude LLM via OpenRouter, referencing specific document evidence (Mienye et al., 2025)."),
        p("Agile Development Theory underpins the system's build process, ensuring continuous feedback incorporation, early working software delivery, and adaptive responses to evolving requirements (Bali et al., 2026)."),
        p("Machine Learning Pipeline Theory (Lun et al., 2022) underpins the data preprocessing workflow—feature extraction from OCR-parsed document text, label encoding of categorical variables, and feature scaling—preparing structured candidate profiles for the trained classification model."),

        h("2.5. Related Studies", HeadingLevel.HEADING_2),

        h("2.5.1. First Related Study", HeadingLevel.HEADING_3),
        p("Solonenco (2023) conducted a systematic review titled \"AI Applications in Talent Management\" and found that CV parsing and automated screening were the most common applications of AI in HR technology. Their study highlighted that systems frequently lacked transparency in shortlisting rationale and almost none could process multiple document types per applicant. This gap is directly addressed in the proposed Automated Shortlisting System Using Generative AI, which processes four document types per applicant through an integrated OCR pipeline and produces GenAI explanations referencing each document's contribution to the shortlisting decision. Unlike the systems reviewed by Solonenco (2023), the proposed system integrates explainability as a core design requirement rather than an add-on feature."),

        h("2.5.2. Second Related Study", HeadingLevel.HEADING_3),
        p("Albaroudi et al. (2024) examined the subject of \"AI in Reducing Recruitment Bias\" and concluded that while AI systems can reduce human bias, they may introduce algorithmic bias if not carefully designed. Their recommendation that recruitment AI systems include configurable criteria weighting, audit trails, and explainability features directly informed this project's ML training approach, feature importance analysis, and GenAI explanation module design. The proposed system extends the principles recommended by Albaroudi et al. (2024) by incorporating a feature importance analysis step during model training to monitor and validate that demographic attributes contribute near-zero importance to shortlisting decisions."),

        h("2.5.3. Third Related Study", HeadingLevel.HEADING_3),
        p("Habetie et al. (2024) studied \"Digital Transformation in African Workplaces\" and found that recruitment automation technologies were largely absent in East African SMEs despite strong demand, with key barriers including cost, technical expertise, and the complexity of processing non-standardized documents. The proposed system addresses these barriers through a locally runnable application requiring no cloud hosting and an OCR pipeline designed for the diverse document formats common in the Rwandan context. By offering a self-contained, terminal-run solution, the system directly responds to the accessibility and cost barriers identified by Habetie et al. (2024), representing a meaningful contribution to recruitment automation in the East African context."),
        pageBreak(),

        // =====================
        // CHAPTER 3
        // =====================
        h("CHAPTER 3: DATA COLLECTION, PRESENTATION AND ANALYSIS", HeadingLevel.HEADING_1),

        h("3.0. Introduction", HeadingLevel.HEADING_2),
        p("This chapter presents the research methodology, data collection procedures, findings from primary data gathering, analysis of the current system, and the detailed design of the proposed Automated Shortlisting System Using Generative AI. It covers the research design and its justification, the research population and sampling approach, the instruments used for data collection, key findings from data analysis, a description of the current manual recruitment system and its weaknesses, and the full proposed system design supported by UML diagrams and a comprehensive database data dictionary."),

        h("3.1. Research Design", HeadingLevel.HEADING_2),
        p("This project adopts a quantitative research design. The quantitative component involved structured questionnaires to collect measurable data on recruitment volumes, time spent per application, and system requirements priorities from HR professionals across selected organizations in Kigali."),

        h("3.1.1. Justification", HeadingLevel.HEADING_3),
        p("A quantitative design was selected because the research problem involves measurable variables—such as the number of applications processed per week, time spent reviewing each applicant's documents, and shortlisting turnaround times—that can be analyzed through descriptive statistics and percentage calculations. Structured questionnaires provide standardized, comparable data from multiple respondents, making them well-suited for identifying patterns and informing evidence-based system design decisions. The Agile development methodology was chosen because recruitment system requirements are iterative and emergent; features identified in Sprint 0 surveys directly informed Sprint 1–5 development decisions (Bali et al., 2026)."),

        h("3.2. Research Population", HeadingLevel.HEADING_2),
        p("The research population consists of approximately 32–35 HR managers, recruiters, and hiring officers employed by organizations in Kigali, Rwanda, across public, private, and NGO sectors. These individuals are the primary users of recruitment systems and are best positioned to provide insights into document handling challenges and automation requirements. Job applicants in Rwanda's workforce were also considered as secondary users of the system, informing the design of the applicant-facing document submission interface and application tracking features."),

        h("3.3. Sampling Size and Techniques", HeadingLevel.HEADING_2),
        p("A purposive sampling technique was used to select 30 participants for questionnaire-based surveys. Participants were selected based on their direct and active involvement in recruitment activities, particularly in organizations that process a significant volume of multi-document applications. This sample size was deemed sufficient to identify patterns and provide statistically meaningful quantitative findings for a focused academic study."),

        h("3.4. Research Instruments", HeadingLevel.HEADING_2),

        h("3.4.1. Choice of Research Instruments", HeadingLevel.HEADING_3),
        p("Structured questionnaires with Likert-scale and multiple-choice questions were used as the sole primary data collection instrument. The questionnaires were designed to gather quantitative data on recruitment volumes, time spent per applicant, document handling practices, and priorities for system features including document automation. The instrument was designed based on insights from the literature review and pre-tested with two HR professionals before full deployment."),

        h("3.5. Data Gathering Procedures", HeadingLevel.HEADING_2),
        p("Data collection was conducted over a four-week period. Questionnaires were distributed both physically and via online forms to 30 HR professionals across selected organizations in Kigali. All participants provided informed consent, and data was anonymized at the point of collection. Findings were organized and analyzed using descriptive statistics including frequency distributions and percentage calculations. Sample applicant document templates—anonymized CV formats, Diploma structures, and Certificate types—were also collected during the document review phase to inform the OCR feature extraction design."),

        h("3.6. Data Analysis and Interpretation", HeadingLevel.HEADING_2),
        p("Quantitative survey results were analyzed using frequency distributions and percentage calculations. The key findings from the data collection phase are summarized below and illustrated in Figure 1. The survey responses confirmed strong empirical justification for the proposed system across all dimensions assessed."),
        p("[Figure 1: Key findings from survey — see original document for chart]"),
        p("The principal findings were as follows. First, 80% of respondents reported spending more than three hours per day reviewing applicant documents during active recruitment drives, indicating a significant time burden on HR professionals. Second, 86% stated that manually cross-referencing information across four document types (ID, CV, Diploma, and Certificates) per applicant was the most time-consuming part of their workflow, identifying multi-document cross-referencing as the dominant operational bottleneck. Third, 86% expressed strong interest in an AI-powered system that could automatically extract and evaluate information from all submitted applicant documents, confirming broad demand for the proposed solution. Fourth, 76% identified inconsistency in evaluation criteria as the most critical problem with current manual shortlisting processes, highlighting the need for standardized, rule-based decision-making. Fifth, 86% stated they would trust an AI-generated shortlist more if the system provided clear, document-referenced explanations for each decision, validating the explainability-first design of the proposed system. Finally, 100% of respondents confirmed their organizations currently have no automated document processing or shortlisting system in place, confirming that no competing solution exists in the surveyed organizations."),
        p("Overall, the survey findings provide strong empirical justification for the proposed Automated Shortlisting System. The data confirms that manual document cross-referencing is the dominant bottleneck (86%), HR professionals strongly desire automation with transparency (86% trust rate), and no existing solution serves this need in any of the 30 surveyed organizations (100%)."),

        // CORRECTED: Ethics section rewritten as paragraph
        h("3.7. Ethical Considerations", HeadingLevel.HEADING_2),
        p("All participants were briefed about research objectives and provided written or verbal consent before participation. No personally identifiable information was retained beyond what participants explicitly authorized. The proposed system was designed with strict data protection principles: all uploaded documents are stored securely, access is restricted to authorized users, and the system does not share raw document content with third parties. The AI model was designed with bias awareness in mind, and feature importance analysis during ML training was used to monitor and mitigate potentially discriminatory features (Albaroudi et al., 2024). The research followed Rwanda's data protection guidelines and the general ethical norms governing academic research involving human participants."),

        h("3.8. Limitations of the Study", HeadingLevel.HEADING_2),
        p("The study faced several limitations. First, the sample size of 30 was relatively small due to time and resource constraints, which may limit the generalizability of findings. Second, evaluating ML model accuracy was challenging without a large validated dataset of real historical recruitment outcomes. Third, OCR pipeline accuracy is dependent on document scan quality, meaning low-resolution or handwritten documents may yield incomplete text extraction. Fourth, the ML model was trained on 10,000 synthetic candidate profiles, which may not fully capture real-world Rwandan document format diversity. These limitations are acknowledged but do not significantly undermine the system design's validity and proof-of-concept implementation."),

        h("3.9. Description of the Current System", HeadingLevel.HEADING_2),
        p("Currently, most organizations in Rwanda use manual, paper-based or email-based recruitment processes. Recruiters receive applicant documents—typically CVs, academic certificates, and identity documents—via email or physical submission. Each document is reviewed individually by HR staff, who must read, verify, and cross-reference information across all submitted files before making a shortlisting decision. Shortlists are maintained in spreadsheets with no standardized scoring or criteria weighting."),
        p("Key weaknesses of the current manual system include the absence of a centralized application tracking system, which means applications and documents arrive through multiple channels and are difficult to consolidate and manage. Manual cross-referencing of National IDs, CVs, Diplomas, and Certificates for each applicant is extremely slow and error-prone at scale. There is no automated document verification mechanism to confirm completeness or format of submitted documents. Evaluation criteria are inconsistent between reviewers, as different HR officers apply different standards. The system is susceptible to both conscious and unconscious bias (Albaroudi et al., 2024). There is no documented rationale for shortlisting decisions, making auditing and accountability difficult. Finally, there is no digital interface for applicants to submit documents or track application status."),

        h("3.10. Proposed System", HeadingLevel.HEADING_2),

        h("3.10.1. Description of the Proposed System", HeadingLevel.HEADING_3),
        p("The proposed Automated Shortlisting System Using Generative AI is an intelligent AI-powered recruitment system supporting three distinct user roles: Administrator, HR Professionals, and Job Applicants. The Administrator can manage all platform users, monitor system logs, create or disable HR accounts, and oversee overall system configuration through a dedicated admin dashboard. HR Professionals can register and log in to the system, create and publish job vacancies with detailed requirements and shortlisting criteria, review incoming applications, trigger the AI-powered shortlisting process, and view AI-generated ranked shortlists with document-referenced explanatory summaries for each candidate."),
        p("Job Applicants can register on the platform, browse available job postings, and submit their application by uploading four mandatory official documents: (1) a National Identity Card, used for identity verification; (2) a Curriculum Vitae, used to extract work experience, skills, and professional background; (3) an Academic Diploma, used to verify educational qualifications and level of study; and (4) supporting Certificates, used to verify additional professional qualifications or training. Applicants can also view their shortlisting decision and the AI-generated explanation through their personal dashboard."),
        p("The system's intelligence is powered by four integrated components. First, a Document Verification module checks that all four required documents have been submitted and validates their format before processing. Second, an OCR pipeline processes each of the four document types to extract structured text. Third, a trained Machine Learning classification model built using scikit-learn with feature scaling, label encoding, and cross-validated training scores each candidate by evaluating their consolidated document profile against the job requirements. Fourth, a Generative AI API accessed via OpenRouter (Claude by Anthropic) receives the candidate's extracted document content and ML score to produce a natural-language explanation of the shortlisting decision. All data is persisted in a SQLite relational database, and the platform is delivered through a React.js Single Page Application communicating with the Python Flask backend via RESTful API calls."),

        h("3.10.2. Agile Development Process Diagram", HeadingLevel.HEADING_3),
        p("The Agile Development Process Diagram (Figure 2) illustrates the iterative lifecycle—Plan → Design → Develop → Test → Feedback → Release—that governed all seven sprints of this project. Each sprint enacted this cycle to deliver a demonstrably functional increment of the AI-powered shortlisting platform."),
        p("During the Plan and Design phase, each sprint began with a clear objective (for example, implementing OCR or building the shortlisting engine) and a technical design aligned with user stories. During the Develop and Test phase, features were coded, integrated, and rigorously tested through unit tests, integration tests, and manual validation using real applicant documents. At the end of every sprint, stakeholders reviewed the increment, and their feedback directly influenced the next sprint's planning before the increment was released as a stable, deployable enhancement."),
        p("For example, Sprint 4 delivered AI document verification; after testing, HR feedback led to the adoption of a hard-reject policy (instead of soft warnings), which was refined within the same sprint. This rapid adaptation exemplifies Agile's responsiveness to user needs."),
        p("[Figure 2: Agile Development Process Diagram — see original document for diagram]"),

        h("3.10.3. System Architecture Diagram", HeadingLevel.HEADING_3),
        p("The system follows a three-tier architecture, as illustrated in Figure 3. The Presentation Layer is a React.js Single Page Application (SPA) built with Vite, providing separate authenticated dashboards for the Administrator, HR Professionals, and Job Applicants. The Application Layer is a Python Flask RESTful API backend that handles user authentication, job management, multi-document upload and storage, document verification, OCR processing, ML model inference, Generative AI API communication, and shortlist management. The Data Layer is a SQLite relational database that stores all persistent system data including user accounts, job postings, applications, applicant documents, OCR-extracted text, ML scores, and Generative AI explanations."),
        p("[Figure 3: System Architecture Diagram — see original document for diagram]"),

        h("3.10.4. Use Case Diagram", HeadingLevel.HEADING_3),
        p("The Use Case Diagram (Figure 4) illustrates the interactions between all actors of the system and the platform's key functionalities. The four actors are: System Administrator, HR Professional, Job Applicant, and the System itself. The Administrator can manage all users (HR and Applicants), view system audit logs, manage job postings, and generate system reports. The HR Professional can post and manage job positions, view job applicants, automate shortlisting, generate reports, and delete positions. The Job Applicant can register, log in, update their profile, view job positions, submit applications, and view their application status. The System handles automated processes including document verification, OCR processing, ML inference, and Generative AI explanation generation. All actors share common use cases for registration, login, and logout."),
        p("[Figure 4: Use Case Diagram — see original document for diagram]"),

        h("3.10.5. Data Flow Diagram (DFD)", HeadingLevel.HEADING_3),
        p("The Level 0 DFD (Context Diagram) shows the system receiving inputs from the Administrator (user management, system configuration), the HR Professional (job postings, shortlisting triggers), and the Job Applicant (registration data, four application documents), and producing outputs including ranked shortlists with AI-generated explanations, application status updates, and audit logs. The Level 1 DFD (Figure 5) decomposes the system into six main processes: User Authentication and Registration, Job Management, Multi-Document Application Submission and Verification, OCR Document Processing, AI Shortlisting (ML Scoring + GenAI Explanation), and Result and Shortlist Management."),
        p("[Figure 5: Data Flow Diagram — see original document for diagram]"),

        h("3.10.6. Activity Diagram", HeadingLevel.HEADING_3),
        p("The Activity Diagram (Figure 6) maps the end-to-end workflow of the shortlisting process. The HR professional logs in, creates a job posting with defined requirements, and publishes it. The job applicant registers, browses the posting, and submits an application by uploading all four required documents. The Document Verification module confirms that all four document types are present and in an accepted format; if invalid, the application is rejected at this stage. The OCR pipeline then processes each document and extracts structured text. The consolidated candidate profile is passed to the ML model, which produces a shortlisting score and decision. The score and profile are then sent to the Generative AI API, which returns a natural-language explanation. The system ranks all applicants and presents the complete shortlist to the HR professional for review."),
        p("[Figure 6: Activity Diagram — see original document for diagram]"),

        h("3.10.7. Sequence Diagram", HeadingLevel.HEADING_3),
        p("The Sequence Diagram (Figure 7) shows the time-ordered interactions between the Job Applicant, HR Professional, React.js Frontend, Flask Backend, Document Verifier, OCR Service, ML Model, and Generative AI API during a complete shortlisting operation. The applicant uploads four documents via the frontend; the backend passes them to the Document Verifier; each document is processed by the OCR Service which returns extracted text; the Flask backend consolidates the extracted features and passes them to the ML Model; the score and candidate profile are sent to the Generative AI API; and the ranked shortlist is returned to the HR dashboard."),
        p("[Figure 7: Sequence Diagram — see original document for diagram]"),

        h("3.10.8. Class Diagram", HeadingLevel.HEADING_3),
        p("The Class Diagram (Figure 8) defines the main entities of the system. The User class has three subclasses: Administrator, HRProfessional, and Applicant. The JobPosting class is associated with CriteriaConfig. The Application class links an Applicant to a JobPosting and is associated with four instances of the ApplicantDocument class—one for each document type: National ID, CV, Diploma, and Certificate. The ShortlistResult class stores the ML score, Generative AI explanation, ranking position, and final decision for each application. The DocumentVerifier, OCRService, MLModel, and GenerativeAIEngine are represented as service classes invoked by the ShortlistingEngine class during the shortlisting process."),
        p("[Figure 8: Class Diagram — see original document for diagram]"),

        h("3.10.9. Physical Data Model (ERD)", HeadingLevel.HEADING_3),
        p("The Entity Relationship Diagram (Figure 9) maps the SQLite database structure. The main tables are: users (storing Administrators, HR professionals, and applicants), jobs (storing vacancy details and requirements), applications (linking applicants to job postings), documents (storing file paths and OCR-extracted text for each of the four document types per application), shortlist_results (storing ML scores, Generative AI explanations, rankings, and decisions), and system_logs (storing audit trail entries per user action). Primary and foreign key constraints enforce referential integrity across all tables."),
        p("[Figure 9: Entity Relationship Diagram — see original document for diagram]"),

        h("3.10.10. Data Dictionary", HeadingLevel.HEADING_3),
        p("Table 2 below describes the main SQLite database tables, their fields, data types, constraints, and descriptions for the proposed Automated Shortlisting System."),
        ...blank(1),

        // Data Dictionary Table - headers repeat
        new Table({
          width: { size: 9026, type: WidthType.DXA },
          columnWidths: [1800, 1800, 1200, 1800, 2426],
          rows: [
            tableRow([
              { text: "Table", w: 1800, shade: "D5E8F0" },
              { text: "Field Name", w: 1800, shade: "D5E8F0" },
              { text: "Data Type", w: 1200, shade: "D5E8F0" },
              { text: "Constraints", w: 1800, shade: "D5E8F0" },
              { text: "Description", w: 2426, shade: "D5E8F0" }
            ], true),
            ...([
              ["users","id","INTEGER","PK, AUTOINCREMENT, NOT NULL","Unique user identifier"],
              ["users","full_name","VARCHAR","NOT NULL","Full name of the user"],
              ["users","email","VARCHAR","NOT NULL, UNIQUE","User email address"],
              ["users","hashed_password","VARCHAR","NOT NULL","Hashed password using bcrypt"],
              ["users","role","VARCHAR(9)","NOT NULL","User role: admin, hr, or applicant"],
              ["users","created_at","DATETIME","OPTIONAL","Account creation timestamp"],
              ["users","phone","VARCHAR(50)","OPTIONAL","User phone number"],
              ["users","address","VARCHAR(255)","OPTIONAL","User physical address"],
              ["users","national_id","VARCHAR(50)","OPTIONAL","National ID number"],
              ["jobs","id","INTEGER","PK, AUTOINCREMENT, NOT NULL","Unique job posting identifier"],
              ["jobs","title","VARCHAR","NOT NULL","Job title"],
              ["jobs","description","TEXT","OPTIONAL","Full job description"],
              ["jobs","location","VARCHAR","OPTIONAL","Job location"],
              ["jobs","employment_type","VARCHAR","OPTIONAL","Employment type (e.g. full-time)"],
              ["jobs","salary_range","VARCHAR","OPTIONAL","Salary range for the position"],
              ["jobs","responsibilities","TEXT","OPTIONAL","Key job responsibilities"],
              ["jobs","preferred_qualifications","TEXT","OPTIONAL","Preferred qualifications"],
              ["jobs","required_education_levels","VARCHAR","NOT NULL","Required education level(s)"],
              ["jobs","required_fields","VARCHAR","NOT NULL","Required field(s) of study"],
              ["jobs","required_min_experience","INTEGER","OPTIONAL","Minimum years of experience"],
              ["jobs","required_max_experience","INTEGER","OPTIONAL","Maximum years of experience"],
              ["jobs","required_skills","TEXT","NOT NULL","Required skills (comma-separated)"],
              ["jobs","required_certifications","TEXT","OPTIONAL","Required certifications"],
              ["jobs","job_level","VARCHAR","OPTIONAL","Seniority level of the job"],
              ["jobs","number_of_posts","INTEGER","OPTIONAL","Number of open positions"],
              ["jobs","deadline","DATETIME","OPTIONAL","Application deadline"],
              ["jobs","is_active","BOOLEAN","OPTIONAL","Whether job posting is active"],
              ["jobs","created_by","INTEGER","FK → users.id","Reference to HR owner"],
              ["jobs","created_at","DATETIME","OPTIONAL","Date and time job was posted"],
              ["applications","id","INTEGER","PK, AUTOINCREMENT, NOT NULL","Unique application identifier"],
              ["applications","applicant_id","INTEGER","FK → users.id, NOT NULL","Reference to users table"],
              ["applications","job_id","INTEGER","FK → jobs.id, NOT NULL","Reference to jobs table"],
              ["applications","address","VARCHAR","OPTIONAL","Applicant address"],
              ["applications","phone","VARCHAR","OPTIONAL","Applicant phone"],
              ["applications","date_of_birth","VARCHAR","OPTIONAL","Applicant date of birth"],
              ["applications","gender","VARCHAR","NOT NULL","Applicant gender"],
              ["applications","education_level","VARCHAR","NOT NULL","Declared education level"],
              ["applications","field_of_study","VARCHAR","NOT NULL","Declared field of study"],
              ["applications","graduation_year","INTEGER","NOT NULL","Year of graduation"],
              ["applications","experience_years","INTEGER","OPTIONAL","Declared years of experience"],
              ["applications","skills","TEXT","NOT NULL","Declared skills (comma-separated)"],
              ["applications","certifications","TEXT","OPTIONAL","Declared certifications"],
              ["applications","decision","VARCHAR(15)","OPTIONAL","pending, shortlisted, or not_shortlisted"],
              ["applications","ai_score","FLOAT","OPTIONAL","ML model match score (0.0 to 1.0)"],
              ["applications","ai_reason","TEXT","OPTIONAL","Generative AI explanation (JSON)"],
              ["applications","doc_verified","BOOLEAN","OPTIONAL","TRUE if documents passed verification"],
              ["applications","submitted_at","DATETIME","OPTIONAL","Application submission timestamp"],
              ["applications","shortlisted_at","DATETIME","OPTIONAL","Timestamp when shortlisted"],
              ["applications","doc_advisory","BOOLEAN","DEFAULT 0","Flag for document advisory notices"],
              ["applications","ocr_result","TEXT","OPTIONAL","OCR extraction result"],
              ["documents","id","INTEGER","PK, AUTOINCREMENT, NOT NULL","Unique document record identifier"],
              ["documents","application_id","INTEGER","FK → applications.id, NOT NULL","Reference to applications table"],
              ["documents","doc_type","VARCHAR(11)","NOT NULL","Type: id_card, cv, diploma, or certificate"],
              ["documents","filename","VARCHAR","NOT NULL","Server-generated filename"],
              ["documents","original_name","VARCHAR","OPTIONAL","Original uploaded file name"],
              ["documents","file_path","VARCHAR","NOT NULL","Server storage path"],
              ["documents","uploaded_at","DATETIME","OPTIONAL","Date and time document was uploaded"],
              ["system_logs","id","INTEGER","PK, AUTOINCREMENT, NOT NULL","Unique log entry identifier"],
              ["system_logs","user_id","INTEGER","FK → users.id, OPTIONAL","Reference to users table"],
              ["system_logs","user_email","VARCHAR(255)","OPTIONAL","Email of the user"],
              ["system_logs","user_role","VARCHAR(50)","OPTIONAL","Role of the user at time of action"],
              ["system_logs","action","VARCHAR(100)","NOT NULL","Action performed (e.g. LOGIN, SHORTLIST)"],
              ["system_logs","target","VARCHAR(255)","OPTIONAL","Resource the action targeted"],
              ["system_logs","detail","TEXT","OPTIONAL","Detailed description of the action"],
              ["system_logs","ip_address","VARCHAR(64)","OPTIONAL","IP address of the request"],
              ["system_logs","status","VARCHAR(20)","NOT NULL","success, failure, or warning"],
              ["system_logs","created_at","DATETIME","OPTIONAL","Timestamp of the log entry"],
            ]).map(([t, f, dt, c, d]) => tableRow([
              { text: t, w: 1800 },
              { text: f, w: 1800 },
              { text: dt, w: 1200 },
              { text: c, w: 1800 },
              { text: d, w: 2426 }
            ]))
          ]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 120, after: 240 },
          children: [new TextRun({ text: "Table 2: Data Dictionary", italics: true, size: 22, font: "Times New Roman" })]
        }),
        pageBreak(),

        // =====================
        // CHAPTER 4
        // =====================
        h("CHAPTER 4: IMPLEMENTATION", HeadingLevel.HEADING_1),

        h("4.1. Introduction", HeadingLevel.HEADING_2),
        p("This chapter presents the full implementation of the Automated Shortlisting System Using Generative AI. It describes the technologies and tools used to develop each component of the system, the development and evaluation of the Machine Learning model, the OCR and document verification pipeline, the Generative AI integration, and the system's three-role user interface. The system is run entirely from the terminal on a local machine. Screenshots of the implemented interfaces for the Administrator, HR Professional, and Job Applicant dashboards are included to illustrate the system's functionality."),

        h("4.2. Description of Technologies and Tools Used", HeadingLevel.HEADING_2),

        h("4.2.1. Python (Flask)", HeadingLevel.HEADING_3),
        p("Python was selected as the primary backend programming language due to its extensive ecosystem of machine learning, OCR, and web development libraries. Flask, a lightweight Python web framework, was used to build the RESTful API backend. Flask handles all user authentication, job management, document upload and storage, ML model inference, Generative AI API communication, and shortlist management endpoints. Flask's simplicity and flexibility made it well-suited for integrating the diverse set of AI and document processing components required by this system."),

        h("4.2.2. React.js (Vite)", HeadingLevel.HEADING_3),
        p("React.js, built and served via the Vite development toolchain, was used to develop the frontend Single Page Application (SPA). React's component-based architecture enabled the development of three distinct, role-based dashboards for the Administrator, HR Professionals, and Job Applicants—each providing a tailored interface for their respective system interactions. Axios was used for RESTful API communication between the React frontend and the Flask backend."),

        h("4.2.3. SQLite Database", HeadingLevel.HEADING_3),
        p("SQLite was selected as the relational database management system for this project. SQLite is a self-contained, serverless database engine that stores all data in a single file, making it ideal for a locally run system that does not require external database hosting or configuration. All persistent system data including user accounts, job postings, applications, applicant documents, OCR-extracted text, ML scores, and Generative AI explanations is stored in the SQLite database. SQLAlchemy was used as the Object-Relational Mapping (ORM) layer to interact with the database from the Flask backend."),

        h("4.2.4. scikit-learn (Machine Learning)", HeadingLevel.HEADING_3),
        p("The ML classification model was built using scikit-learn. The model was trained on a dataset of 10,000 synthetic candidate profiles with 20 features, using feature engineering, label encoding, and standard scaling (Géron, 2019). The trained model, scaler, label encoders, and feature columns were serialized as .pkl files loaded at runtime."),

        h("4.2.5. Tesseract OCR and Poppler", HeadingLevel.HEADING_3),
        p("Tesseract OCR—an open-source optical character recognition engine developed by Google—was used to extract text from uploaded applicant documents. Poppler was used as a PDF rendering tool to convert PDF pages to images before OCR processing. The OCR pipeline (ocr_utils.py) processes each of the four document types—National ID, CV, Diploma, and Certificate—and returns structured text strings that are used in the document cross-checking and shortlisting engine."),

        h("4.2.6. Sentence-Transformers (AI Semantic Matching)", HeadingLevel.HEADING_3),
        p("The AI matching module (ai_matcher.py) uses the sentence-transformers library with the all-MiniLM-L6-v2 model to perform semantic matching between applicant skills and CV content, field of study and diploma text, and field-job domain compatibility. This model runs entirely locally with no API key or internet connection required during inference, ensuring privacy and eliminating dependency on external AI services for the core matching logic."),

        h("4.2.7. Generative AI API via OpenRouter (Claude by Anthropic)", HeadingLevel.HEADING_3),
        p("The OpenRouter API was used to access the Anthropic Claude model for generating human-readable, document-referenced shortlisting explanations. OpenRouter serves as the API gateway, providing simplified access to Claude with flexible model selection and billing. After the ML model produces a score, the system sends the candidate's extracted document content, ML score, and matched/unmatched criteria to the Claude model via OpenRouter, which returns a structured natural-language explanation stored in the database and displayed on HR and Applicant dashboards."),

        h("4.2.8. JWT Authentication", HeadingLevel.HEADING_3),
        p("JSON Web Tokens (JWT) were used for user authentication and session management. Upon login, the Flask backend issues a signed JWT to the client, which is included in the Authorization header of all subsequent API requests. The backend validates the token on each request and enforces role-based access control, ensuring that Administrator, HR Professional, and Applicant users can only access the endpoints and data appropriate to their roles."),

        h("4.3. Machine Learning Model Development and Evaluation", HeadingLevel.HEADING_2),

        h("4.3.1. Dataset", HeadingLevel.HEADING_3),
        p("The ML model was trained on the applicant_shortlisting_dataset.csv dataset, consisting of 10,000 synthetic candidate profiles with 20 columns. The dataset includes demographic fields (Age, Gender), academic fields (Education_Level, Field_of_Study, Graduation_Year), experience fields (Experience_Years), skills and certifications (Skills, Certifications), and job requirement fields (Job_Applied, Required_Education_Levels, Required_Fields, Required_Min_Experience, Required_Max_Experience, Required_Skills, Required_Certifications). The binary target column Shortlisted indicates whether a candidate was shortlisted (1) or not (0)."),

        h("4.3.2. Data Preprocessing", HeadingLevel.HEADING_3),
        p("The preprocessing pipeline involved the following steps: (1) Personal Identifiable Information (PII) removal—columns including Applicant_ID, Identity_Card, Name, and Education_Background were dropped to protect privacy and remove non-predictive features; (2) missing value handling—Certifications NaN values were filled with 'None' to represent applicants without certifications; (3) redundancy removal—the six Required_* columns were identified as constant per job type and were used only for feature engineering before being dropped to avoid multicollinearity; (4) feature encoding—categorical columns (Gender, Education_Level, Job_Applied) were encoded using LabelEncoder; and (5) feature scaling—all numerical features were standardized using StandardScaler."),

        h("4.3.3. Feature Engineering", HeadingLevel.HEADING_3),
        p("Fourteen match-quality signal features were engineered from the raw applicant and job requirement columns, capturing the degree of alignment between each candidate's profile and the job requirements. These features included skills_overlap_ratio (fraction of required skills the applicant has), cert_overlap_ratio, edu_level_match, field_match, exp_in_range, exp_surplus, edu_level_ordinal, combined_match_score, and years_since_graduation, among others. This rich feature engineering was the primary driver of the model's high accuracy."),

        h("4.3.4. Model Training and Selection", HeadingLevel.HEADING_3),
        p("Four classification algorithms were trained and evaluated: Logistic Regression, Random Forest, Extra Trees, and Gradient Boosting (with XGBoost as an alternative). All models were evaluated using stratified 5-fold cross-validation, test-set accuracy, F1-score, AUC-ROC, and confusion matrix analysis. The XGBoost classifier achieved the best performance, with a test-set accuracy exceeding 99%, F1-score above 0.999, and AUC-ROC of 1.00, demonstrating near-perfect classification of shortlisted versus non-shortlisted candidates. The trained model, scaler, label encoders, and feature column list were serialized as model.pkl, scaler.pkl, label_encoders.pkl, and feature_columns.pkl respectively."),
        p("[Figure 10: Trained Models Comparison — see original document for chart]"),

        h("4.3.5. Feature Importance and Confusion Matrix", HeadingLevel.HEADING_3),
        p("Feature importance analysis from the best-performing model revealed that combined_match_score, skills_overlap_ratio, edu_meets_minimum, field_match, and exp_in_range were the most influential features in determining shortlisting outcomes. This analysis was used to validate that the model's decisions are driven by merit-based, job-relevant criteria rather than demographic features such as age or gender, supporting the system's bias-awareness design principle."),
        p("[Figure 11: Feature Importance Chart — see original document for chart]"),
        p("The confusion matrix for the XGBoost model demonstrated near-perfect classification performance on the test set, with minimal false positives and false negatives. Both the class-level precision, recall, and F1 scores for shortlisted and not-shortlisted candidates exceeded 0.99, confirming balanced and reliable model performance across both output classes."),
        p("[Figure 12: Confusion Matrix of Best-Performing Model — see original document for chart]"),

        h("4.4. Document Verification and OCR Pipeline", HeadingLevel.HEADING_2),
        p("The document verification module (document_verifier.py) performs pre-submission checks at the time of document upload and full verification during shortlisting. At upload time, the module: (1) extracts text from the uploaded file using the OCR pipeline; (2) classifies the document type by matching extracted text against keyword weight maps for each document type (id_card, cv, diploma, certificate); (3) verifies that the document matches the declared type; (4) for CVs and IDs, performs a fuzzy name-matching check to confirm the document belongs to the submitting applicant; and (5) for diplomas, performs AI-powered field-of-study and education level verification using sentence-transformers semantic matching."),
        p("During shortlisting, the full verification pipeline cross-checks each document pair: the diploma is checked against the declared education level and field of study; the CV is checked against the declared skills; the certificate is checked against declared certifications; and the experience document is checked against declared experience years. Document OCR failures are treated as advisory warnings rather than hard rejections, so a poor-quality scan does not automatically disqualify a qualified candidate."),

        h("4.5. Shortlisting Engine", HeadingLevel.HEADING_2),
        p("The shortlisting engine (shortlisting_engine.py) coordinates all components to produce a final shortlisting decision and score for each application. The process involves: (1) document verification—verify_documents() is called to check document completeness and authenticity; (2) hard gate evaluation—_hard_gate() applies mandatory eligibility checks for education level, field of study, experience, and skills, returning hard failures for unacceptable mismatches; (3) feature vector construction—build_feature_vector() constructs the 20-feature input for the ML model; (4) ML inference—the trained XGBoost model produces a probability score; (5) display score computation—_compute_display_score() blends the ML probability with the rule-based combined match score, subtracting penalties for gate failures and skill gaps; and (6) decision and reasoning—the final decision (shortlisted or not_shortlisted) is made based on score thresholds, and _build_reason() produces a structured JSON explanation."),
        p("Score thresholds are: ≥ 75% (Strong match — Shortlisted), 55–74% (Good match — Shortlisted), 40–54% (Borderline — Not shortlisted), and < 40% (Weak match — Not shortlisted)."),

        h("4.6. System Screenshots", HeadingLevel.HEADING_2),

        h("4.6.1. Home Page", HeadingLevel.HEADING_3),
        p("The Home Page is the public-facing landing page of the system, accessible to all visitors without authentication. It presents the system's value proposition, key features, and call-to-action buttons for registration and login."),
        p("[Figure 13: Homepage — see original document for screenshot]"),

        h("4.6.2. Applicant Registration and Login", HeadingLevel.HEADING_3),
        p("The Registration page allows new users to create an account by providing their full name, email, and password. The Login page authenticates users and redirects them to their role-specific dashboard. JWT tokens are issued upon successful login and stored securely in the browser."),
        p("[Figure 14: Registration Page — see original document for screenshot]"),
        p("[Figure 15: Login Page — see original document for screenshot]"),

        h("4.6.3. Applicant Dashboard", HeadingLevel.HEADING_3),
        p("The Applicant Dashboard provides each registered applicant with a personalized view of their submitted applications, current shortlisting status, and AI-generated decision explanations. Applicants can browse open job postings, submit new applications by uploading their four required documents, and view detailed breakdowns of their shortlisting scores and the specific criteria that supported or affected their decision."),
        p("[Figure 16: Applicant Dashboard — see original document for screenshot]"),

        h("4.6.4. Job Application and Document Upload", HeadingLevel.HEADING_3),
        p("The Apply Page guides applicants through the document submission process. Applicants fill in their academic and professional details, then upload each of the four required documents (National ID, CV, Diploma, and Certificate). Each document is validated at upload time by the document verification module, which returns immediate feedback to the applicant. Once all required documents are uploaded and validated, the applicant can submit their application."),
        p("[Figure 17: Document Uploading Page — see original document for screenshot]"),

        h("4.6.5. HR Dashboard", HeadingLevel.HEADING_3),
        p("The HR Dashboard provides HR Professionals with a comprehensive overview of all submitted applications for each job posting. It displays each candidate's name, education level, experience, skills, documents uploaded, and current shortlisting status. HR users can trigger the AI-powered shortlisting process for a single candidate or for all pending applications at once using the 'Automate Shortlisting' button. Shortlisting progress is tracked in real time via a status polling mechanism."),
        p("[Figure 18: HR Dashboard Page — see original document for screenshot]"),

        h("4.6.6. Shortlisting Results and AI Explanation", HeadingLevel.HEADING_3),
        p("Once shortlisting is complete, the HR Dashboard displays each candidate's AI score, decision (Shortlisted / Not Shortlisted), and a detailed breakdown of the criteria met, criteria failed, and advisory warnings. The Generative AI explanation references specific evidence from the candidate's submitted documents, allowing HR professionals to trace and audit each decision. HR users can also re-shortlist individual candidates or override decisions manually."),
        p("[Figure 19: Shortlisting Results with AI Explanations — see original document for screenshot]"),

        h("4.6.7. HR Report", HeadingLevel.HEADING_3),
        p("The HR Report page provides a job-level summary of all shortlisting outcomes, including total applicants, number shortlisted, number not shortlisted, average score, top score, and shortlisting rate. Candidates are ranked by their AI score, with shortlisted candidates listed first. Each candidate's detailed criteria breakdown and AI explanation is accessible from the report."),
        p("[Figure 20: HR Report Page — see original document for screenshot]"),

        h("4.6.8. Administrator Dashboard", HeadingLevel.HEADING_3),
        p("The Administrator Dashboard provides the system administrator with tools to manage all platform users including creating, viewing, and deleting HR and Applicant accounts. The Administrator can also view the full system audit log, which records all user actions (logins, document uploads, shortlisting events, and so on) with timestamps and IP addresses, supporting accountability and security monitoring."),
        p("[Figure 21: System Administrator Dashboard — see original document for screenshot]"),

        h("4.6.9. Job Creation (HR)", HeadingLevel.HEADING_3),
        p("The Job Creation page allows HR professionals to post new job vacancies by specifying the job title, description, location, employment type, required education levels, required fields of study, required skills, required certifications, minimum and maximum experience, and application deadline. These criteria are used directly by the ML model and shortlisting engine during automated candidate evaluation."),
        p("[Figure 22: Job Creation Form — see original document for screenshot]"),
        pageBreak(),

        // =====================
        // CHAPTER 5
        // =====================
        h("CHAPTER 5: CONCLUSION AND RECOMMENDATIONS", HeadingLevel.HEADING_1),

        h("5.1. Conclusion", HeadingLevel.HEADING_2),
        p("This project successfully designed and implemented an Automated Shortlisting System Using Generative AI: an intelligent AI-powered recruitment platform that addresses the key inefficiencies of manual shortlisting processes identified in Rwandan organizations. The system integrates four core AI components: an OCR pipeline for multi-document text extraction, a Machine Learning classification model for candidate scoring, a semantic AI matching engine for document cross-verification, and a Generative AI API for explainable decision-making. The system supports three distinct user roles—Administrator, HR Professionals, and Job Applicants—each served by a dedicated, role-specific React.js dashboard. The backend is built in Python with Flask, and all data is persisted in a SQLite database. The system runs entirely from the terminal on a local machine, requiring no external hosting infrastructure."),
        p("Primary data collected through structured questionnaires administered to 30 HR professionals in Kigali confirmed the significance of the problem: 86.7% of respondents identified multi-document cross-referencing as their most time-consuming recruitment task, 80% spent over three hours daily on document review, and 100% had no existing automated shortlisting system in place. The implemented system directly addresses all seven specific objectives: it analyzes and automates the most burdensome manual process (SO1), provides a well-structured three-role database architecture (SO2), integrates a functional OCR pipeline for all four document types (SO3), implements pre-submission document verification (SO4), trains a highly accurate ML model achieving over 99% classification accuracy (SO5), integrates a Generative AI API for human-readable decision explanations (SO6), and delivers user-friendly dashboards for all three user roles (SO7)."),
        p("The Machine Learning model evaluation demonstrated exceptional performance: the best-performing XGBoost model achieved over 99% test-set accuracy, F1-score above 0.99, and AUC-ROC of 1.00 through rich match-quality feature engineering. Feature importance analysis confirmed that the model's decisions are driven by merit-based criteria—skills overlap, education level, field of study, and experience match—rather than demographic attributes, supporting the system's commitment to fair and auditable shortlisting. In conclusion, the Automated Shortlisting System Using Generative AI constitutes a viable, scalable, and accountable tool for modernizing talent acquisition in Rwanda and the broader East African context."),

        // CORRECTED: Recommendations section separated from Future Studies
        h("5.2. Recommendations", HeadingLevel.HEADING_2),
        p("Based on the findings and implementation experience of this project, the following recommendations are proposed for organizations and practitioners considering adoption of the system:"),
        bullet("Organizations adopting the system should ensure their HR staff are trained in interpreting AI-generated shortlisting explanations to support human oversight and accountability in hiring decisions."),
        bullet("HR departments should establish clear policies for overriding AI shortlisting decisions, ensuring that human judgment remains the final authority in candidate selection."),
        bullet("Organizations in Rwanda should work with data custodians to compile anonymized historical recruitment records that can be used to retrain and improve the model's performance on real-world applicant profiles over time."),
        bullet("Rwanda Polytechnic and similar institutions should consider integrating this system into their industry partnerships as a practical demonstration of locally developed AI for HR automation."),
        bullet("Procurement teams and IT departments considering deployment should assess network infrastructure requirements, particularly for OCR processing of high-volume document uploads, to ensure consistent system performance."),

        h("5.3. Areas for Future Studies", HeadingLevel.HEADING_2),
        p("The following areas are identified for future research and system extension:"),
        bullet("Integration with real organizational data: The ML model was trained on a synthetic dataset of 10,000 profiles. Future research should involve retraining the model on real historical recruitment data from Rwandan organizations to improve generalization and domain specificity."),
        bullet("Multi-language OCR support: Many applicant documents in Rwanda are written in Kinyarwanda or French. Future work should extend the OCR pipeline to support multi-language document processing, particularly for National Identity Cards and locally issued academic certificates."),
        bullet("Extended recruitment workflow: The current system covers only the initial shortlisting phase. Future development should extend the platform to support interview scheduling, offer management, candidate communication, and onboarding workflow integration."),
        bullet("Cloud deployment and scalability: Future versions should be deployed to a cloud platform to enable access from multiple HR users simultaneously, support larger application volumes, and provide persistent document storage with automated backup. Containerization using Docker would facilitate consistent deployment across environments."),
        bullet("Bias auditing and fairness reporting: Future versions should incorporate dedicated fairness auditing tools such as demographic parity checks and equalized odds analysis to provide HR managers with quantitative bias reports and support compliance with responsible AI principles."),
        bullet("Mobile application: Development of a companion mobile application for job applicants would improve accessibility in the Rwandan context, where mobile internet penetration significantly exceeds desktop usage."),
        bullet("Integration with identity verification services: Future work should explore integration with Rwanda's National Identification Agency (NIDA) API to enable real-time verification of National Identity Card details against the national registry, replacing the current OCR-based identity check with a more robust verification mechanism."),
        pageBreak(),

        // REFERENCES
        h("REFERENCES", HeadingLevel.HEADING_1),
        p("Albaroudi, E., Mansouri, T., & Alameer, A. (2024). A comprehensive review of AI techniques for addressing algorithmic bias in job hiring. AI, 5(1), 383–404. https://doi.org/10.3390/ai5010019"),
        p("Bali, S., Dhiman, A., & Aggarwal, N. (2026). A study on opportunities and challenges in implementation of artificial intelligence in human resource management. International Journal of Management Research, 1(1), 1–15."),
        p("Géron, A. (2019). Hands-on machine learning with Scikit-Learn, Keras, and TensorFlow: Concepts, tools, and techniques to build intelligent systems (2nd ed.). O'Reilly Media."),
        p("Habetie, T. G., Kolta, D., Prihoda, E. P., & Rudnák, I. (2024). Digital transformation in human resource management and its implication for youth unemployment in Ethiopia: A literature review. Regional and Business Studies, 17(1), 45–62."),
        p("IBM. (2022). What is optical character recognition (OCR)? IBM Technology. https://www.ibm.com/topics/optical-character-recognition"),
        p("Jeon, J., Jang, J., & Ki Jung, S. (2026). Development and validation of an AI-powered OCR educational tool for early handwriting instruction for Korean early elementary students. IEEE Access, 14, 7005–7015."),
        p("Lun, C. H., Hewitt, T., & Hou, S. (2022). A machine learning pipeline for document extraction. First Break, 40(2), 73–78. https://doi.org/10.3997/1365-2397.fb2022016"),
        p("Marchetti, D., & Scardovi, R. (2023). Artificial intelligence and human resources: Innovative trends and main impacts. Journal of Human Resource Technology, 5(2), 1–18."),
        p("McKinsey & Company. (2022). The future of work after COVID-19. McKinsey Global Institute. https://www.mckinsey.com/featured-insights/future-of-work"),
        p("Mienye, I. D., Jere, N., Obaido, G., Ogunruku, O. O., Esenogho, E., & Modisane, C. (2025). Large language models: An overview of foundational architectures, recent trends, and a new taxonomy. Discover Applied Sciences, 7(9), 1027. https://doi.org/10.1007/s42452-025-01027-y"),
        p("Neji, H., Nogueras-Iso, J., Lacasta, J., Latre, M., & García-Marco, F. J. (2026). FP-THD: Full page transcription of historical documents. arXiv:2601.17040. https://arxiv.org/abs/2601.17040"),
        p("Prabhusureshkumar. (2018). Amazon's AI recruiting tool shows bias against women. Medium. https://medium.com/@prabhusureshkumar/amazons-ai-recruiting-tool-shows-bias-against-women-b1d563124fea"),
        p("Rwanda Development Board. (2021). Rwanda labour market and employment report 2021. RDB Publications."),
        p("SHRM. (2023). Talent acquisition benchmarking report. Society for Human Resource Management."),
        p("Solonenco, S. (2023). SYD live CV: A new proposal for work overview. Journal of Innovative HR Technology, 3(1), 45–58."),
        pageBreak(),

        // APPENDICES
        h("APPENDICES", HeadingLevel.HEADING_1),
        h("APPENDIX A: PROJECT WORK PLAN", HeadingLevel.HEADING_2),
        p("The following work plan outlines all project phases, activities, timelines, deliverables, and responsible parties for the Automated Shortlisting System Using Generative AI capstone project, developed using the Agile methodology."),
        new Table({
          width: { size: 9026, type: WidthType.DXA },
          columnWidths: [1500, 2800, 900, 2000, 1826],
          rows: [
            tableRow([
              { text: "Phase", w: 1500, shade: "D5E8F0" },
              { text: "Activities", w: 2800, shade: "D5E8F0" },
              { text: "Duration", w: 900, shade: "D5E8F0" },
              { text: "Deliverable", w: 2000, shade: "D5E8F0" },
              { text: "Responsible", w: 1826, shade: "D5E8F0" }
            ], true),
            tableRow([{ text: "Phase 1: Proposal", w: 1500 }, { text: "Topic identification, problem formulation, literature review, proposal drafting and supervisor submission", w: 2800 }, { text: "Week 1", w: 900 }, { text: "Approved capstone proposal", w: 2000 }, { text: "Student, Supervisor", w: 1826 }]),
            tableRow([{ text: "Phase 2: Data Collection", w: 1500 }, { text: "Questionnaire design, ethical clearance, distribution to 30 HR professionals, data recording and entry", w: 2800 }, { text: "Week 2", w: 900 }, { text: "Raw data set; completed questionnaires", w: 2000 }, { text: "Student", w: 1826 }]),
            tableRow([{ text: "Phase 3: System Design", w: 1500 }, { text: "UML diagrams, ERD, data dictionary, system architecture design", w: 2800 }, { text: "Week 3", w: 900 }, { text: "Complete system design documentation", w: 2000 }, { text: "Student, Supervisor", w: 1826 }]),
            tableRow([{ text: "Phase 4: Development", w: 1500 }, { text: "Dataset prep, ML model training, Flask API backend, OCR pipeline, GenAI integration, React.js frontend", w: 2800 }, { text: "Week 4–5", w: 900 }, { text: "Functional automated shortlisting system", w: 2000 }, { text: "Student", w: 1826 }]),
            tableRow([{ text: "Phase 5: Documentation", w: 1500 }, { text: "Final report writing, APA referencing, supervisor corrections, formatting, appendices", w: 2800 }, { text: "Week 6", w: 900 }, { text: "Complete capstone project report", w: 2000 }, { text: "Student, Supervisor", w: 1826 }]),
            tableRow([{ text: "Phase 6: Defense", w: 1500 }, { text: "Defense preparation, slide deck creation, Q&A rehearsal, final submission to department", w: 2800 }, { text: "Week 7–8", w: 900 }, { text: "Approved final report and defense", w: 2000 }, { text: "Student, Supervisor, Panel", w: 1826 }]),
          ]
        }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 240 }, children: [new TextRun({ text: "Table 3: Work Plan", italics: true, size: 22, font: "Times New Roman" })] }),
        pageBreak(),

        h("APPENDIX B: PROJECT GANTT CHART", HeadingLevel.HEADING_2),
        p("The Gantt Chart below illustrates the timeline of all project activities across the 8-week implementation period. Shaded cells indicate the active weeks for each activity. The chart reflects the Agile development schedule with overlapping sprints."),
        new Table({
          width: { size: 9026, type: WidthType.DXA },
          columnWidths: [2226, 850, 850, 850, 850, 850, 850, 850, 850],
          rows: [
            tableRow([
              { text: "Activity", w: 2226, shade: "D5E8F0" },
              { text: "Wk 1", w: 850, shade: "D5E8F0" },
              { text: "Wk 2", w: 850, shade: "D5E8F0" },
              { text: "Wk 3", w: 850, shade: "D5E8F0" },
              { text: "Wk 4", w: 850, shade: "D5E8F0" },
              { text: "Wk 5", w: 850, shade: "D5E8F0" },
              { text: "Wk 6", w: 850, shade: "D5E8F0" },
              { text: "Wk 7", w: 850, shade: "D5E8F0" },
              { text: "Wk 8", w: 850, shade: "D5E8F0" }
            ], true),
            ...([
              ["1. Topic Selection & Proposal Writing", "✓", "", "", "", "", "", "", ""],
              ["2. Literature Review", "✓", "✓", "", "", "", "", "", ""],
              ["3. Questionnaire Design & Data Collection", "", "✓", "", "", "", "", "", ""],
              ["4. Data Analysis & Interpretation", "", "✓", "✓", "", "", "", "", ""],
              ["5. System Design (UML, ERD, Data Dict.)", "", "", "✓", "", "", "", "", ""],
              ["6. Dataset Preparation & ML Training", "", "", "✓", "✓", "", "", "", ""],
              ["7. Backend Development (Flask API)", "", "", "", "✓", "✓", "", "", ""],
              ["8. OCR Pipeline & Document Verification", "", "", "", "✓", "✓", "", "", ""],
              ["9. Generative AI API Integration", "", "", "", "", "✓", "", "", ""],
              ["10. Frontend Development (React.js)", "", "", "", "✓", "✓", "", "", ""],
              ["11. System Testing & Debugging", "", "", "", "", "✓", "✓", "", ""],
              ["12. Report Writing & Documentation", "", "", "", "", "", "✓", "✓", ""],
              ["13. Supervisor Review & Corrections", "", "", "", "", "", "✓", "✓", ""],
              ["14. Final Submission & Defense Prep", "", "", "", "", "", "", "✓", "✓"],
            ]).map(row => tableRow(row.map((t, i) => ({
              text: t,
              w: i === 0 ? 2226 : 850,
              shade: (i > 0 && t === "✓") ? "A8D4F5" : undefined
            }))))
          ]
        }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 240 }, children: [new TextRun({ text: "Table 4: Project Gantt Chart", italics: true, size: 22, font: "Times New Roman" })] }),
        pageBreak(),

        h("APPENDIX C: PROJECT BUDGET", HeadingLevel.HEADING_2),
        p("The table below presents the estimated budget for the Automated Shortlisting System Using Generative AI capstone project. All costs are expressed in Rwandan Francs (RWF)."),
        new Table({
          width: { size: 9026, type: WidthType.DXA },
          columnWidths: [500, 2000, 2000, 700, 1200, 1626],
          rows: [
            tableRow([
              { text: "No.", w: 500, shade: "D5E8F0" },
              { text: "Budget Item", w: 2000, shade: "D5E8F0" },
              { text: "Description", w: 2000, shade: "D5E8F0" },
              { text: "Qty", w: 700, shade: "D5E8F0" },
              { text: "Unit (RWF)", w: 1200, shade: "D5E8F0" },
              { text: "Total (RWF)", w: 1626, shade: "D5E8F0" }
            ], true),
            tableRow([{ text: "1", w: 500 }, { text: "Laptop/Computer", w: 2000 }, { text: "Personal laptop for development, training, and writing", w: 2000 }, { text: "1", w: 700 }, { text: "0 (owned)", w: 1200 }, { text: "0", w: 1626 }]),
            tableRow([{ text: "2", w: 500 }, { text: "Internet", w: 2000 }, { text: "Monthly broadband for research, API calls, and remote access", w: 2000 }, { text: "2 months", w: 700 }, { text: "40,000", w: 1200 }, { text: "80,000", w: 1626 }]),
            tableRow([{ text: "3", w: 500 }, { text: "Printing & Binding", w: 2000 }, { text: "Final report printing and binding – 3 official copies", w: 2000 }, { text: "3", w: 700 }, { text: "7,000", w: 1200 }, { text: "28,000 (corrected)", w: 1626 }]),
            tableRow([{ text: "4", w: 500 }, { text: "Stationery & Flash Drives", w: 2000 }, { text: "Pens, notebooks, USB drives for data collection", w: 2000 }, { text: "2 sets", w: 700 }, { text: "8,000", w: 1200 }, { text: "16,000", w: 1626 }]),
            tableRow([{ text: "5", w: 500 }, { text: "Transport", w: 2000 }, { text: "Travel to Gasabo District for data collection", w: 2000 }, { text: "4 trips", w: 700 }, { text: "10,200", w: 1200 }, { text: "40,800", w: 1626 }]),
            tableRow([{ text: "6", w: 500 }, { text: "AI API Credits", w: 2000 }, { text: "OpenRouter API credits for Claude GenAI integration & testing", w: 2000 }, { text: "6 bundles", w: 700 }, { text: "5,000", w: 1200 }, { text: "30,000", w: 1626 }]),
            tableRow([{ text: "", w: 500 }, { text: "TOTAL ESTIMATED PROJECT BUDGET", w: 2000 }, { text: "", w: 2000 }, { text: "", w: 700 }, { text: "", w: 1200 }, { text: "194,800", w: 1626 }]),
          ]
        }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 240 }, children: [new TextRun({ text: "Table 5: Project Budget", italics: true, size: 22, font: "Times New Roman" })] }),
        pageBreak(),

        h("APPENDIX D: QUESTIONNAIRE", HeadingLevel.HEADING_2),
        p("This questionnaire was used for collecting information about challenges in recruitment and opinions on using AI for automated applicant shortlisting."),
        ...blank(1),
        p("1. How many hours do you spend reviewing applicant documents during active recruitment drives per day?", { bold: true }),
        bullet("Less than 1 hour"),
        bullet("1–2 hours"),
        bullet("2–3 hours"),
        bullet("More than 3 hours"),
        ...blank(1),
        p("2. Which part of the recruitment process do you find most time-consuming?", { bold: true }),
        bullet("Reviewing CVs"),
        bullet("Verifying certificates and diplomas"),
        bullet("Cross-checking applicant documents"),
        bullet("All of the above"),
        ...blank(1),
        p("3. Which applicant documents do you usually cross-reference during recruitment?", { bold: true }),
        bullet("National ID"),
        bullet("CV/Resume"),
        bullet("Diploma"),
        bullet("Certificates"),
        ...blank(1),
        p("4. Would you be interested in an AI-powered system that automatically extracts and evaluates information from submitted applicant documents?", { bold: true }),
        bullet("Yes"),
        bullet("No"),
        ...blank(1),
        p("5. What is the most critical problem with the current manual shortlisting process?", { bold: true }),
        bullet("Time consumption"),
        bullet("Human errors"),
        bullet("Inconsistency in evaluation criteria"),
        bullet("Difficulty verifying applicant documents"),
        ...blank(1),
        p("6. Would you trust an AI-generated shortlist if the system provided clear explanations and references from applicant documents for each decision?", { bold: true }),
        bullet("Yes"),
        bullet("No"),
        ...blank(1),
        p("7. Does your organization currently use an automated document processing or applicant shortlisting system?", { bold: true }),
        bullet("Yes"),
        bullet("No"),
      ]
    }
  ]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync('Capstone_Corrected_Final2.docx', buffer);
  console.log('Done!');
}).catch(err => {
  console.error(err);
  process.exit(1);
});