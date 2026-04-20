/**
 * ocrClient.js  —  TalentScreen OCR Integration Helper
 * Uses native fetch (Node.js 18+) — no extra dependencies needed.
 */

const fs = require('fs');
const FormData = require('form-data');

const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL || 'http://localhost:5050';

// ── Health Check ──────────────────────────────────────────────────────────────
async function isOcrAvailable() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(`${OCR_SERVICE_URL}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const json = await res.json();
    return json.status === 'ok';
  } catch (err) {
    console.error('[OCR] Health check failed:', err.message);
    return false;
  }
}

// ── Single File OCR ───────────────────────────────────────────────────────────
async function extractText(fileOrPath, filename) {
  const buffer = typeof fileOrPath === 'string'
    ? fs.readFileSync(fileOrPath)
    : fileOrPath;

  const form = new FormData();
  form.append('file', buffer, { filename });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    const res = await fetch(`${OCR_SERVICE_URL}/ocr`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders(),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      return { success: false, error: err.error || `HTTP ${res.status}` };
    }

    return await res.json();
  } catch (err) {
    return { success: false, error: `OCR service unreachable: ${err.message}` };
  }
}

// ── Batch OCR ─────────────────────────────────────────────────────────────────
async function extractTextBatch(files) {
  const form = new FormData();
  for (const { buffer, filename } of files) {
    form.append('files[]', buffer, { filename });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    const res = await fetch(`${OCR_SERVICE_URL}/ocr/batch`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders(),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    return data.results;
  } catch (err) {
    return files.map(({ filename }) => ({
      filename,
      success: false,
      error: `OCR service unreachable: ${err.message}`,
    }));
  }
}

module.exports = { isOcrAvailable, extractText, extractTextBatch, OCR_SERVICE_URL };