/**
 * AP Vidyuth — Local API Server
 *
 * Runs at http://localhost:4100 alongside the Vite dev server.
 * The Vite proxy forwards /api/* → http://localhost:4100/api/*.
 *
 * On Android (Capacitor), point VITE_API_URL to this machine's LAN IP,
 * e.g. http://192.168.1.x:4100/api — or run the server on the same machine
 * you deploy to.
 *
 * REST endpoints:
 *   GET  /api/services              → list all active services (slim DTO)
 *   GET  /api/services/trash        → list trash
 *   POST /api/services/validate     → validate a service number (1 APSPDCL call)
 *   POST /api/services/:id/refresh  → fetch + process bill data (2 APSPDCL calls)
 *   POST /api/services/refresh-all  → refresh all (sequential, 2 calls each)
 *
 * NOTE: This server has NO database. It is a pure processing proxy.
 * Persistence (IndexedDB / SQLite) stays in the client as before.
 * The server only:
 *   1. Calls raw APSPDCL endpoints
 *   2. Processes + normalises the response
 *   3. Returns a clean, minimal DTO
 */

import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { solveCaptchaImage } from './utils/billdesk/ocr.js';
import { scrapeBillDeskSession } from './utils/billdesk/session.js';
import { Redis } from '@upstash/redis';
import admin from 'firebase-admin';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { initDb } from './migrations.js';

dotenv.config();

let pgPool = null;
let initDbPromise = null;

async function ensureDb() {
  if (pgPool) return pgPool;
  if (!initDbPromise) {
    initDbPromise = initDb().then(p => {
      pgPool = p;
      return p;
    }).catch(err => {
      console.error('[api] Failed to initialize DB pool:', err.message);
      initDbPromise = null; // reset to allow retry on next request
      return null;
    });
  }
  return initDbPromise;
}

// Start DB initialization in the background
ensureDb().catch(() => {});

// ── Vercel & Access Grant Utilities ──────────────────────────────────────────

function generateGrantToken(deviceId, email) {
  const secret = process.env.INTERNAL_SECRET || 'fallback-secret-ap-vidyuth';
  return crypto.createHmac('sha256', secret)
    .update(`${deviceId}:${email}`)
    .digest('hex');
}

function verifyGrantToken(token, deviceId, email) {
  const expectedToken = generateGrantToken(deviceId, email);
  return token === expectedToken;
}

async function getVercelDeviceWhitelist() {
  const token = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID || 'prj_L72mlnVsVIUrccddgXv4s66OCGpB';
  const teamId = process.env.VERCEL_TEAM_ID || 'team_4IzMW96EbuIOHjgUo1ej1Wu1';

  if (!token) {
    console.warn('[vercel] VERCEL_API_TOKEN is not configured.');
    return { error: 'VERCEL_API_TOKEN is not configured', value: '', exists: false };
  }

  const queryParams = teamId ? `?teamId=${teamId}` : '';
  const baseUrl = `https://api.vercel.com/v9/projects/${projectId}/env`;

  try {
    const listRes = await fetch(`${baseUrl}${queryParams}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!listRes.ok) {
      const errText = await listRes.text();
      console.error(`[vercel] Failed to list env variables: ${listRes.status} ${errText}`);
      return { error: `Failed to list env variables: ${listRes.status}`, value: '', exists: false };
    }

    const { envs } = await listRes.json();
    const existingVar = envs.find(e => e.key === 'ALLOWED_DEVICE_IDS');
    
    if (existingVar) {
      return { value: existingVar.value || '', id: existingVar.id, exists: true };
    }
    return { value: '', exists: false };
  } catch (err) {
    console.error('[vercel] Error fetching env variables:', err.message);
    return { error: err.message, value: '', exists: false };
  }
}

async function updateVercelDeviceWhitelist(newValue) {
  const token = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID || 'prj_L72mlnVsVIUrccddgXv4s66OCGpB';
  const teamId = process.env.VERCEL_TEAM_ID || 'team_4IzMW96EbuIOHjgUo1ej1Wu1';

  if (!token) {
    throw new Error('VERCEL_API_TOKEN is not configured.');
  }

  const queryParams = teamId ? `?teamId=${teamId}` : '';
  const baseUrl = `https://api.vercel.com/v9/projects/${projectId}/env`;

  const existing = await getVercelDeviceWhitelist();
  if (existing.error) {
    throw new Error(existing.error);
  }

  if (existing.exists && existing.id) {
    const updateRes = await fetch(`${baseUrl}/${existing.id}${queryParams}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        value: newValue,
        type: 'plain',
        target: ['production', 'preview', 'development']
      })
    });

    if (!updateRes.ok) {
      const errText = await updateRes.text();
      throw new Error(`Failed to update Vercel variable: ${updateRes.status} ${errText}`);
    }
    return { status: 'updated' };
  } else {
    const createRes = await fetch(`${baseUrl}${queryParams}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        key: 'ALLOWED_DEVICE_IDS',
        value: newValue,
        type: 'plain',
        target: ['production', 'preview', 'development']
      })
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`Failed to create Vercel variable: ${createRes.status} ${errText}`);
    }
    return { status: 'created' };
  }
}

async function sendApprovalEmail(userEmail, userName, deviceId) {
  const { 
    VITE_SMTP_HOST, 
    VITE_SMTP_PORT, 
    VITE_SMTP_USER, 
    VITE_SMTP_PASSWORD
  } = process.env;

  if (!VITE_SMTP_USER || !VITE_SMTP_PASSWORD) {
    console.warn('[api] SMTP configuration missing, skipping approval email');
    return;
  }

  const transporter = nodemailer.createTransport({
    host: VITE_SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(VITE_SMTP_PORT || '465'),
    secure: (VITE_SMTP_PORT || '465') === '465',
    auth: {
      user: VITE_SMTP_USER,
      pass: VITE_SMTP_PASSWORD,
    },
  });

  const mailOptions = {
    from: `"AP Vidyuth App" <${VITE_SMTP_USER}>`,
    to: userEmail,
    subject: 'Pro Access Granted! - AP Vidyuth',
    text: `Hi ${userName},\n\n` +
          `Your request for Pro Access on AP Vidyuth has been approved!\n` +
          `Your device ID (${deviceId}) has been successfully whitelisted.\n\n` +
          `You can now track unlimited services and access premium features. Simply reopen the app to activate your Pro access.\n\n` +
          `Thank you for your support!\n\n` +
          `Best regards,\n` +
          `AP Vidyuth Team`,
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px; background-color: #ffffff; color: #1f2937;">
        <h2 style="color: #10b981; margin-top: 0;">Pro Access Active! 🎉</h2>
        <p>Hi <strong>${userName}</strong>,</p>
        <p>We are pleased to inform you that your request for Pro Access on <strong>AP Vidyuth</strong> has been approved and activated.</p>
        <div style="background-color: #f3f4f6; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 13px; margin: 16px 0; word-break: break-all;">
          <strong>Whitelisted Device ID:</strong><br/>
          ${deviceId}
        </div>
        <p>You can now track unlimited electricity services, view detailed bill histories, and unlock all premium features.</p>
        <p style="font-style: italic; color: #6b7280; font-size: 14px;">Please close and reopen the app if Pro features are not instantly visible.</p>
        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
        <p style="font-size: 12px; color: #9ca3af; margin-bottom: 0;">This is an automated notification from the AP Vidyuth app server.</p>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
}

async function sendPlanUpdateEmail(userEmail, userName, oldPlan, newPlan, serviceLimit) {
  const { 
    VITE_SMTP_HOST, 
    VITE_SMTP_PORT, 
    VITE_SMTP_USER, 
    VITE_SMTP_PASSWORD
  } = process.env;

  if (!VITE_SMTP_USER || !VITE_SMTP_PASSWORD) {
    console.warn('[api] SMTP configuration missing, skipping plan update email');
    return;
  }

  const transporter = nodemailer.createTransport({
    host: VITE_SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(VITE_SMTP_PORT || '465'),
    secure: (VITE_SMTP_PORT || '465') === '465',
    auth: {
      user: VITE_SMTP_USER,
      pass: VITE_SMTP_PASSWORD,
    },
  });

  const displayLimit = serviceLimit === 999999 ? 'Unlimited' : serviceLimit;

  const mailOptions = {
    from: `"AP Vidyuth App" <${VITE_SMTP_USER}>`,
    to: userEmail,
    subject: 'Subscription Plan Updated - AP Vidyuth',
    text: `Hi ${userName},\n\n` +
          `Your subscription plan on AP Vidyuth has been updated by the administrator.\n\n` +
          `Previous Plan: ${oldPlan}\n` +
          `New Plan: ${newPlan} (Max Services: ${displayLimit})\n\n` +
          `Thank you for using AP Vidyuth!\n\n` +
          `Best regards,\n` +
          `AP Vidyuth Team`,
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px; background-color: #ffffff; color: #1f2937;">
        <h2 style="color: #6366f1; margin-top: 0;">Subscription Plan Updated ⚡</h2>
        <p>Hi <strong>${userName}</strong>,</p>
        <p>Your subscription plan on <strong>AP Vidyuth</strong> has been successfully updated by the administrator.</p>
        <div style="background-color: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 4px 0; color: #6b7280; font-size: 14px;">Previous Plan:</td>
              <td style="padding: 4px 0; color: #1f2937; font-size: 14px; font-weight: 600; text-transform: uppercase;">${oldPlan}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280; font-size: 14px;">New Plan:</td>
              <td style="padding: 4px 0; color: #6366f1; font-size: 14px; font-weight: 700; text-transform: uppercase;">${newPlan}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280; font-size: 14px;">Service Limit:</td>
              <td style="padding: 4px 0; color: #1f2937; font-size: 14px; font-weight: 600;">${displayLimit} active services</td>
            </tr>
          </table>
        </div>
        <p>If you have any questions or require custom limits, please reach out to our team.</p>
        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
        <p style="font-size: 12px; color: #9ca3af; margin-bottom: 0; text-align: center;">AP Vidyuth Team</p>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
}

async function sendDeclineEmail(userEmail, userName, reason) {
  const { 
    VITE_SMTP_HOST, 
    VITE_SMTP_PORT, 
    VITE_SMTP_USER, 
    VITE_SMTP_PASSWORD
  } = process.env;

  if (!VITE_SMTP_USER || !VITE_SMTP_PASSWORD) {
    console.warn('[api] SMTP configuration missing, skipping decline email');
    return;
  }

  const transporter = nodemailer.createTransport({
    host: VITE_SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(VITE_SMTP_PORT || '465'),
    secure: (VITE_SMTP_PORT || '465') === '465',
    auth: {
      user: VITE_SMTP_USER,
      pass: VITE_SMTP_PASSWORD,
    },
  });

  const mailOptions = {
    from: `"AP Vidyuth App" <${VITE_SMTP_USER}>`,
    to: userEmail,
    subject: 'Request for Pro Access Declined - AP Vidyuth',
    text: `Hi ${userName},\n\n` +
          `Your request for Pro access has been reviewed and declined by the administrator.\n\n` +
          `Reason:\n${reason || 'No specific reason provided.'}\n\n` +
          `If this issue can be resolved, please try requesting access again after some time.\n\n` +
          `Best regards,\n` +
          `AP Vidyuth Team`,
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px; background-color: #ffffff; color: #1f2937;">
        <h2 style="color: #ef4444; margin-top: 0;">Request Declined ❌</h2>
        <p>Hi <strong>${userName}</strong>,</p>
        <p>Your request for <strong>AP Vidyuth Pro</strong> access has been reviewed and declined by the administrator.</p>
        <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; border-radius: 4px; margin: 16px 0;">
          <p style="margin: 0; font-weight: 600; color: #991b1b; font-size: 14px;">Reason for Decline:</p>
          <p style="margin: 6px 0 0; color: #7f1d1d; font-size: 14px; font-style: italic;">"${reason || 'No specific reason provided.'}"</p>
        </div>
        <p>If you can address the reason mentioned above, please feel free to submit a new request after some time.</p>
        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
        <p style="font-size: 12px; color: #9ca3af; margin-bottom: 0; text-align: center;">AP Vidyuth Team</p>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
}

// ── Notification Infrastructure ──────────────────────────────────────────────

const redis = process.env.UPSTASH_REDIS_REST_URL
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('[api] Firebase Admin initialized');
  } catch (err) {
    console.error('[api] Failed to initialize Firebase Admin:', err);
  }
}

const app = express();
const PORT = process.env.API_PORT || 4100;

app.use(cors());
app.use(express.json());

// Ensure database pool is initialized before handling requests
app.use(async (req, res, next) => {
  try {
    await ensureDb();
  } catch (err) {
    console.error('[api] DB initialization middleware error:', err.message);
  }
  next();
});

// ── APSPDCL raw client (server-side only) ─────────────────────────────────────

const APSPDCL_BASE = 'https://apspdcl.in/ConsumerDashboard/public';
const BILLDESK_URL = 'https://payments.billdesk.com/MercOnline/SPDCLController';

/**
 * Standard POST helper for APSPDCL Consumer Dashboard endpoints.
 */
async function apspdclPost(endpoint, serviceNumber) {
  const res = await fetch(`${APSPDCL_BASE}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: new URLSearchParams({ uscno: String(serviceNumber) }).toString(),
  });
  if (!res.ok) throw new Error(`APSPDCL ${endpoint} responded with ${res.status}`);
  const text = await res.text();
  if (!text || !text.trim()) return { data: [] };
  try {
    const data = JSON.parse(text);
    if (data.status === 'error' && data.message) {
      const err = new Error(data.message);
      err.apiStatus = 'error';
      throw err;
    }
    return data;
  }
  catch (err) {
    if (err.apiStatus === 'error') throw err;
    throw new Error(`APSPDCL ${endpoint} returned invalid response`);
  }
}

/**
 * High-level BillDesk fetcher with auto-solve fallback.
 */
async function fetchBillDeskBill(serviceNumber, billdeskSession) {
  if (billdeskSession) {
    const { reqtoken, captcha, cookie } = billdeskSession;
    return await executeBillDeskRequest(serviceNumber, reqtoken, captcha, cookie);
  }

  // Auto-solve with retries if no session provided (e.g. background refresh)
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const baseCookie = process.env.BILLDESK_COOKIE || process.env.BILLDESK_COOKIES || '';
      const session = await scrapeBillDeskSession(baseCookie);
      const captchaText = await solveCaptchaImage(session.cookie);

      if (!captchaText || captchaText.length < 5) continue;

      const html = await executeBillDeskRequestRaw(serviceNumber, session.reqtoken, captchaText, session.cookie);
      const htmlLower = html.toLowerCase();

      if (htmlLower.includes('wrong captcha') || htmlLower.includes('invalid captcha') || htmlLower.includes('incorrect captcha') || htmlLower.includes('enter valid captcha')) {
         continue;
      }
      return parseBillDeskHtml(html);
    } catch (err) {
      console.error(`[api] fetchBillDeskBill attempt ${attempt} error:`, err);
    }
  }
  return null;
}

/**
 * Raw POST request to BillDesk SPDCL controller.
 */
async function executeBillDeskRequestRaw(serviceNumber, reqtoken, jcaptchaVal, cookie) {
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Origin': 'https://payments.billdesk.com',
    'Referer': 'https://payments.billdesk.com/MercOnline/SPDCLController',
    'User-Agent': 'Mozilla/5.0',
  };
  if (cookie) headers.Cookie = cookie;

  const body = new URLSearchParams({
    reqid: 'confirm',
    reqtoken: reqtoken || '',
    txtCustomerID: String(serviceNumber),
    jcaptchaVal: jcaptchaVal || '',
  }).toString();

  const res = await fetch(BILLDESK_URL, { method: 'POST', headers, body });
  if (!res.ok) throw new Error(`BillDesk responded with ${res.status}`);
  return await res.text();
}

/**
 * Execute BillDesk request and parse the result.
 */
async function executeBillDeskRequest(serviceNumber, reqtoken, jcaptchaVal, cookie) {
  const html = await executeBillDeskRequestRaw(serviceNumber, reqtoken, jcaptchaVal, cookie);
  return parseBillDeskHtml(html);
}

/**
 * Regex-based parser for BillDesk consumer detail HTML.
 */
function parseBillDeskHtml(html) {
  const parseField = (label) => {
    const patterns = [
      // 1. Label in TD, Value in next TD (with or without colon)
      new RegExp(`<td[^>]*>\\s*${label}\\s*[:\\-]?\\s*</td>\\s*<td[^>]*>([^<]+)</td>`, 'i'),
      // 2. Label in TH, Value in next TD
      new RegExp(`<th[^>]*>\\s*${label}\\s*[:\\-]?\\s*</th>\\s*<td[^>]*>([^<]+)</td>`, 'i'),
      // 3. Label and Value in same cell or text block (e.g. "Label: Value")
      // Must follow a tag closing or newline to avoid attribute matching
      new RegExp(`(?:>|\\n)\\s*${label}\\s*[:\\-]\\s*([^<\\n\\(]+)`, 'i'),
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1].trim()) {
        const val = match[1].trim().replace(/\s+/g, ' ');
        // Final safety check: if it looks like HTML code, skip it
        if (val.includes('<') || val.includes('="') || val.includes('viewport')) continue;
        return val;
      }
    }
    return null;
  };

  const parseNumber = (value) => {
    if (value == null) return null;
    const normalized = String(value).replace(/[^0-9.]/g, '').trim();
    return normalized === '' ? null : Number(normalized);
  };

  const customerName = parseField('Customer Name') || parseField('Consumer Name');
  const uniqueServiceNumber = parseField('Unique Service Number') || parseField('Service Number');
  const divisionCode = parseField('Division Code');
  const circleName = parseField('Circle Name');
  const billAmount = parseNumber(parseField('Bill Amount'));
  const currentDemand = parseNumber(parseField('Current Demand'));
  const rawBillDate = parseField('Bill Date');
  const rawBillTime = parseField('Bill Time') || parseField('Generation Time') || parseField('Reading Time') || parseField('Reading Date');
  const rawDueDate = parseField('Due Date');

  // Deep extract time (HHMM) from available fields for UPI QR accuracy
  let extractedTime = null;
  const timeRegex = /(\d{1,2})[:](\d{2})/;
  if (rawBillTime && timeRegex.test(rawBillTime)) {
    const match = rawBillTime.match(timeRegex);
    extractedTime = match[0].replace(':', '');
  } else if (rawBillDate && timeRegex.test(rawBillDate)) {
    const match = rawBillDate.match(timeRegex);
    if (match) extractedTime = match[0].replace(':', '');
  }

  console.log('[api] BillDesk parse candidates', {
    customerName,
    uniqueServiceNumber,
    divisionCode,
    circleName,
    billAmount,
    currentDemand,
    rawBillDate,
    rawBillTime,
    extractedTime,
  });

  const billDeskAmount = currentDemand === 0 ? 0 : (currentDemand ?? billAmount ?? null);

  return {
    customerName,
    uniqueServiceNumber,
    divisionCode,
    circleName,
    billDeskAmount,
    billDeskBillAmount: billAmount,
    billDeskCurrentDemand: currentDemand,
    billDeskIsPaid: currentDemand === 0,
    billDeskBillDate: rawBillDate,
    billDeskBillTime: extractedTime,
    billDeskDueDate: rawDueDate,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_MAP = {
  JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,
  JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11,
};

/**
 * Intelligent date parser for APSPDCL (DD-MMM-YY) and BillDesk (DD/MM/YY) formats.
 * Prevents locale-dependent day/month swapping.
 */
function parseDate(v, timeStr) {
  if (!v) return null;
  const original = String(v).trim();
  const fullStr = original.toUpperCase();

  let d, m, y;

  // 1. Match DD-MMM-YY (e.g. 02-MAY-26) or DD-MMM-YYYY
  const mmmMatch = fullStr.match(/(\d{1,2})-(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)-(\d{2,4})/);
  if (mmmMatch) {
    d = parseInt(mmmMatch[1], 10);
    m = MONTH_MAP[mmmMatch[2]];
    y = parseInt(mmmMatch[3], 10);
    if (y < 100) y += 2000;
  }
  // 2. Match DD/MM/YY (e.g. 02/05/26) or DD/MM/YYYY
  else {
    const slashMatch = fullStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (slashMatch) {
      d = parseInt(slashMatch[1], 10);
      m = parseInt(slashMatch[2], 10) - 1;
      y = parseInt(slashMatch[3], 10);
      if (y < 100) y += 2000;
    }
  }

  // If manual parsing succeeded, create Date object in UTC
  if (d !== undefined && m !== undefined && m >= 0 && m <= 11 && y !== undefined) {
    const date = new Date(Date.UTC(y, m, d));
    if (timeStr) {
      const tMatch = String(timeStr).match(/(\d{1,2})[:](\d{2})/);
      if (tMatch) date.setUTCHours(parseInt(tMatch[1], 10), parseInt(tMatch[2], 10));
    }
    return date;
  }

  // 3. Fallback to standard JS parsing for anything else (e.g. YYYY-MM-DD)
  let fallbackStr = original;
  if (timeStr && !fallbackStr.includes(':')) fallbackStr += ' ' + String(timeStr).trim();
  const ts = Date.parse(fallbackStr.replace(/-/g, ' '));
  return isNaN(ts) ? null : new Date(ts);
}

function toNum(v) {
  const n = Number(String(v || '0').replace(/,/g, ''));
  return isFinite(n) ? n : 0;
}

/**
 * Maps raw APSPDCL bill row to unified DTO.
 */
function normaliseBill(row) {
  // Deep search for time in APSPDCL raw fields
  const rawDateWithTime = row.reading_date || row.readingdate || row.bill_gen_time || row.closingDate || '';
  const timeMatch = rawDateWithTime.match(/(\d{1,2})[:](\d{2})/);
  const extractedTime = timeMatch ? timeMatch[0].replace(':', '') : null;

  return {
    closingDate:  parseDate(row.closingDate || row.reading_date),
    closingTime:  extractedTime,
    dueDate:      parseDate(row.duedate || row.due_date),
    billedUnits:  toNum(row.billedUnits || row.units),
    billAmount:   toNum(row.billAmount || row.amount),
    ec:    toNum(row.ec),
    fixchg:toNum(row.fixchg),
    cc:    toNum(row.cc),
    ed:    toNum(row.ed),
    fsa:   toNum(row.fsa),
    irda:  toNum(row.irda),
    othchg:toNum(row.othchg),
    sur:   toNum(row.sur),
    isd:   toNum(row.isd),  // Initial Security Deposit
    category: row.category,
    closingRdg: toNum(row.closingRdg),
    ctrLoad: toNum(row.ctrLoad),
  };
}

/**
 * Matches payment records against bills to determine real-time status.
 */
function analysePayments(rawPayments, bills, currentBillAmountOverride = null) {
  const empty = { isPaid:false, paidDate:null, receiptNumber:null, paidAmount:null, currentPaymentTotal:0, arrears:[], arrearsTotal:0, divname: null, secname: null };
  if (!Array.isArray(rawPayments) || !rawPayments.length || !bills?.length) {
    if (Array.isArray(rawPayments) && rawPayments.length > 0) {
       return { ...empty, divname: rawPayments[0].divname, secname: rawPayments[0].secname };
    }
    return empty;
  }

  const latest     = bills[0];
  const billDate   = latest.closingDate;
  const billAmount = currentBillAmountOverride ?? latest.billAmount;

  const payments = rawPayments
    .map(p => ({
      date:      parseDate(p.prdate),
      amount:    toNum(p.billamt),
      counter:   p.counter,
      receiptNo: p.prno || null
    }))
    .filter(p => p.date)
    .sort((a, b) => b.date - a.date);

  const paymentsAsc = [...payments].sort((a, b) => a.date - b.date);
  let currentTotal = 0;
  let currentPaidDate = null;
  let currentReceiptNo = null;
  for (const p of paymentsAsc) {
    if (p.date < billDate) continue;  // Ignore payments before bill closes
    currentTotal += p.amount;
    currentPaidDate = p.date;
    currentReceiptNo = p.receiptNo;
  }

  // If there are any payments after the bill closes, we consider it paid.
  // This handles cases where the paid amount is slightly less than the bill amount due to ISD adjustments
  // (e.g. paid 2139 for a 2174 bill) and the BillDesk API is unavailable to provide the exact demand.
  if (currentTotal > 0) {
    return {
      isPaid: true,
      paidDate: currentPaidDate,
      receiptNumber: currentReceiptNo,
      paidAmount: currentTotal,
      currentPaymentTotal: currentTotal,
      arrears: [],
      arrearsTotal: 0,
      divname: rawPayments[0].divname,
      secname: rawPayments[0].secname
    };
  }

  // Current bill not paid. Find arrears (advance payments for current bill).
  let arrears = [];
  if (bills.length > 1) {
    const prevBill = bills[1];
    const prevDate = prevBill.closingDate;
    const prevAmount = prevBill.billAmount;

    // Find which payments settle the previous bill
    // These are payments after prev bill closed but before current bill closes,
    // accumulated until reaching prev bill's amount
    const prevSettlePayments = [];
    let prevAccum = 0;
    for (const p of paymentsAsc) {
      if (p.date <= prevDate || p.date >= billDate) continue;
      prevSettlePayments.push(p);
      prevAccum += p.amount;
      if (prevAccum >= prevAmount) break;
    }

    const prevSettleSet = new Set(prevSettlePayments);
    arrears = payments.filter(p => {
      if (p.date <= prevDate || p.date >= billDate) return false;
      return !prevSettleSet.has(p);
    });
  }

  const arrearsTotal = arrears.reduce((s, p) => s + p.amount, 0);
  const latestPayment = payments[0];

  return {
    isPaid: false,
    paidDate: currentPaidDate || latestPayment?.date || null,
    receiptNumber: currentReceiptNo || latestPayment?.receiptNo || null,
    paidAmount: currentTotal > 0 ? currentTotal : latestPayment?.amount || null,
    currentPaymentTotal: currentTotal,
    arrears,
    arrearsTotal,
    divname: rawPayments[0].divname,
    secname: rawPayments[0].secname
  };
}

/**
 * Detailed bill breakup calculator.
 */
function buildBreakup(bill, arrearPayments, arrearsTotal, currentPaymentTotal = 0, finalBillAmount = null, isdAmount = 0) {    
  // Calculate Gross Total as sum of components
  const ec = toNum(bill.ec);
  const fixchg = toNum(bill.fixchg);
  const cc = toNum(bill.cc);
  const ed = toNum(bill.ed);
  const fsa = toNum(bill.fsa);
  const grossTotal = ec + fixchg + cc + ed + fsa;
  const roundedGrossTotal = Math.round(grossTotal);

  // Net Due = Gross Total - Arrears + isdAmount
  const netDue = Math.max(0, roundedGrossTotal - arrearsTotal + isdAmount);

  return {
    ec:      bill.ec,
    fixchg:  bill.fixchg,
    cc:      bill.cc,
    ed:      bill.ed,
    fsa:     bill.fsa,
    isd:     isdAmount,                        // Reconciled Initial Security Deposit
    isdOriginal: toNum(bill.isd),             // APSPDCL-reported deposit value
    grossTotal:        roundedGrossTotal,
    currentMonthBill:  roundedGrossTotal,
    arrears:           arrearsTotal,
    arrearPayments,
    arrearsTotal,
    isdAmount,
    totalBill:         netDue,
    netDue:            netDue,
  };
}

/**
 * Migration helper for old 23233... series.
 */
function getMigratedNumber(sn) {
  if (!sn || sn.length !== 13) return null;
  // The user specifically requested: 23233... → 55513...
  if (sn.startsWith('23233')) {
    return '55513' + sn.substring(5);
  }
  return null;
}

/**
 * Core processor: given a service number, fetch from APSPDCL and return a clean snapshot DTO.
 * Returns null if the service number is unknown / has no data.
 * Throws only on network failures.
 */
async function buildSnapshot(serviceNumber, billdeskSession) {
  // 1. Initial BillDesk check with original number
  let billDeskData = null;
  let billDeskError = null;
  let activeNumber = serviceNumber;
  let migratedServiceNumber = null;

  try {
    billDeskData = await fetchBillDeskBill(serviceNumber, billdeskSession);
  } catch (error) {
    billDeskError = 'Connection failed';
  }

  // 2. Migration Logic: If original fails, try migrated number
  if (!billDeskData) {
    const candidate = getMigratedNumber(serviceNumber);
    if (candidate) {
      console.log(`[api] Attempting migration check: ${serviceNumber} → ${candidate}`);
      try {
        const migratedData = await fetchBillDeskBill(candidate, billdeskSession);
        if (migratedData) {
          billDeskData = migratedData;
          activeNumber = candidate;
          migratedServiceNumber = candidate;
          console.log(`[api] Migration confirmed: ${serviceNumber} → ${activeNumber}`);
        }
      } catch (err) {
        console.warn(`[api] Migration check failed for ${candidate}`, err);
      }
    }
  }

  // Also check if the successful BillDesk call itself suggested a migration
  const billDeskUnique = billDeskData?.uniqueServiceNumber;
  if (billDeskUnique && billDeskUnique !== activeNumber && billDeskUnique !== serviceNumber) {
    migratedServiceNumber = billDeskUnique;
    activeNumber = billDeskUnique;
    console.log(`[api] BillDesk internal migration detected: ${serviceNumber} → ${activeNumber}`);
  }

  // 2.5 Validation: If BillDesk found nothing meaningful, ABORT.
  // This prevents adding invalid numbers that just happen to be 13 digits.
  const isPlaceholder = (name) => {
    if (!name) return true;
    const n = name.toUpperCase().trim();
    return n === 'UNKNOWN' || n === 'N/A' || n === 'NA' || n === '-' || n === '—' || n === '.';
  };

  if (!billDeskData || isPlaceholder(billDeskData.customerName) || !billDeskData.uniqueServiceNumber) {
    console.warn(`[api] Snapshot aborted: BillDesk data incomplete or placeholder for ${serviceNumber}`, {
      hasData: !!billDeskData,
      name: billDeskData?.customerName,
      uniqueNo: billDeskData?.uniqueServiceNumber
    });
    return null;
  }

  // 3. Fetch History using the active (potentially migrated) number
  const targetNumber = activeNumber;
  const [billResult, paymentResult] = await Promise.allSettled([
    apspdclPost('publicbillhistory', targetNumber),
    apspdclPost('publicpaymenthistory', targetNumber),
  ]);

  const billData    = billResult.status === 'fulfilled' ? billResult.value : null;
  const paymentData = paymentResult.status === 'fulfilled' ? paymentResult.value : { data: [] };

  let apspdclError = null;
  let bills = [];
  if (!billData || !Array.isArray(billData.data) || !billData.data.length) {
    const errorMsg = billData?.message || billData?.error || (billResult.status === 'rejected' ? billResult.reason?.message : '');
    apspdclError = errorMsg.toLowerCase().includes('not found')
      ? 'APSPDCL history servers are down. Please try again later.'
      : (errorMsg ? `APSPDCL Sync Failed: ${errorMsg}` : 'APSPDCL history servers are down. Please try again later.');
  } else {
    bills = billData.data
      .map(normaliseBill)
      .filter(b => b.closingDate)
      .sort((a, b) => b.closingDate - a.closingDate);
  }

  if (paymentResult.status === 'rejected' && !apspdclError) {
    apspdclError = 'APSPDCL history servers are down. Please try again later.';
  }

  if (!bills.length && !billDeskData) {
    throw new Error(apspdclError || billDeskError || 'Validation failed. All upstream servers are down. Please try again later.');
  }

  // 4. Extract data and build DTO
  const billDeskAmount = billDeskData?.billDeskAmount ?? null;
  const billDeskBillAmount = billDeskData?.billDeskBillAmount ?? null;
  const billDeskIsPaid = billDeskData?.billDeskIsPaid === true;
  const billDeskBillDate = billDeskData?.billDeskBillDate;
  const billDeskDueDate = billDeskData?.billDeskDueDate;

  const latest       = bills[0] || null;
  const now          = new Date();
  const currentYear  = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();

  const hasCurrentMonthBill = bills.some(
    b => b.closingDate.getUTCFullYear() === currentYear && b.closingDate.getUTCMonth() === currentMonth
  );

  const pay = analysePayments(paymentData.data || [], bills, billDeskAmount ?? undefined);

  let status;
  if (!bills.length)          status = billDeskIsPaid ? 'PAID' : ((billDeskAmount > 0) ? 'DUE' : 'UNKNOWN');
  else if (!hasCurrentMonthBill) status = 'NO_DUES';
  else if (pay.isPaid)        status = 'PAID';
  else if (billDeskIsPaid)    status = 'PAID';
  else if ((billDeskAmount ?? latest.billAmount) > 0) status = 'DUE';
  else                        status = 'UNKNOWN';

  const finalDueAmount = billDeskAmount ?? latest?.billAmount ?? 0;
  const publicDueAmount = latest?.billAmount ?? 0;
  const billDeskSource = billDeskAmount != null ? 'BILLDESK' : (bills.length ? 'APSPDCL' : 'UNKNOWN');

  let breakup = null;
  let isdAmount = 0;
  let amountDue = 0;

  if (latest) {
    const grossTotal = toNum(latest.ec) + toNum(latest.fixchg) + toNum(latest.cc) + toNum(latest.ed) + toNum(latest.fsa);
    const roundedGrossTotal = Math.round(grossTotal);
    const originalBillAmountForIsd = billDeskAmount ?? latest.billAmount;
    isdAmount = originalBillAmountForIsd != null ? originalBillAmountForIsd - (roundedGrossTotal - pay.arrearsTotal) : 0;
    breakup = buildBreakup(latest, pay.arrears, pay.arrearsTotal, pay.currentPaymentTotal || 0, finalDueAmount, isdAmount);       
    amountDue = status === 'DUE' ? (breakup?.netDue ?? finalDueAmount) : 0;
  } else {
    amountDue = status === 'DUE' ? finalDueAmount : 0;
  }

  // ── Parse all payments ────────────────────────────────────────────────────
  const allPayments = (paymentData.data || [])
    .map(p => ({ date: parseDate(p.prdate), amount: toNum(p.billamt), counter: p.counter, receiptNo: p.prno || null }))
    .filter(p => p.date)
    .sort((a, b) => b.date - a.date); // newest first

  const paymentsAsc = [...allPayments].reverse(); // oldest first for settlement calc

  // ── Build bill history (up to 12 months, excl. current) ──────────────────
  const pastBills = bills.filter(
    b => !(b.closingDate.getUTCFullYear() === currentYear && b.closingDate.getUTCMonth() === currentMonth)
  );

  function findSettlementDate(bill, nextBillClosingDate) {
    const windowEnd = nextBillClosingDate ?? new Date(8640000000000000);
    let accum = 0;
    let lastDate = null;
    for (const p of paymentsAsc) {
      if (p.date <= bill.closingDate || p.date >= windowEnd) continue;
      accum += p.amount;
      lastDate = p.date;
      if (accum >= bill.billAmount) break;
    }
    return lastDate;
  }

  const history = pastBills.slice(0, 3).map((bill, i) => {
    const nextClose = pastBills[i - 1]?.closingDate ?? (hasCurrentMonthBill ? latest.closingDate : null);
    const paidDate = findSettlementDate(bill, nextClose);
    return {
      billDate:    bill.closingDate.toISOString(),
      paidDate:    paidDate?.toISOString() || null,
      billAmount:  bill.billAmount,
      billedUnits: bill.billedUnits,
    };
  });

  const billHistory18 = pastBills.slice(0, 18).map((bill, i) => {
    const nextClose = pastBills[i - 1]?.closingDate ?? (hasCurrentMonthBill ? latest.closingDate : null);
    const paidDate = findSettlementDate(bill, nextClose);
    return {
      billDate:    bill.closingDate.toISOString(),
      dueDate:     bill.dueDate?.toISOString() || null,
      paidDate:    paidDate?.toISOString() || null,
      billAmount:  bill.billAmount,
      billedUnits: bill.billedUnits,
      isPaid:      paidDate !== null,
    };
  });

  const paymentHistory12 = allPayments.slice(0, 12).map((p, i) => ({
    counter:   p.counter,
    date:      p.date.toISOString(),
    amount:    p.amount,
    receiptNo: p.receiptNo,
  }));

  const hasCurrentMonthBillData = hasCurrentMonthBill || billDeskBillAmount != null;
  const trendMonths = [
    ...(hasCurrentMonthBill ? [{
      month:       `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`,
      billAmount:  billDeskBillAmount ?? latest.billAmount,
      amountDue:   amountDue,
      billedUnits: latest.billedUnits,
      status,
    }] : (billDeskBillAmount != null ? [{
      month:       `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`,
      billAmount:  billDeskBillAmount,
      amountDue:   amountDue,
      billedUnits: 0,
      status,
    }] : [])),
    ...pastBills.slice(0, hasCurrentMonthBillData ? 17 : 18).map(b => ({
      month:       `${b.closingDate.getUTCFullYear()}-${String(b.closingDate.getUTCMonth() + 1).padStart(2, '0')}`,
      billAmount:  b.billAmount,
      amountDue:   b.billAmount,
      billedUnits: b.billedUnits,
      status:      'PAID',
    })),
  ].reverse();

  // ── Insights ──────────────────────────────────────────────────────────────
  const pastAmounts  = trendMonths.map((m) => m.billAmount);
  const pastUnits    = trendMonths.map((m) => m.billedUnits);
  const historicalAmounts = hasCurrentMonthBillData ? pastAmounts.slice(0, -1) : pastAmounts;
  const historicalUnits   = pastUnits; // Include current month as per user request for insights accuracy

  function avg(arr) { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0; }
  function max(arr) { return arr.length ? Math.max(...arr) : 0; }
  function min(arr) { return arr.length ? Math.min(...arr) : 0; }

  const avgAmount   = avg(pastAmounts);
  const avgAmount6m = avg(historicalAmounts.slice(-6));
  const avgAmount12m = avg(historicalAmounts.slice(-12));
  const avgUnits    = avg(pastUnits);
  const avgUnits6m  = avg(historicalUnits.slice(-6));
  const avgUnits12m = avg(historicalUnits.slice(-12));
  const maxAmount   = max(pastAmounts);
  const minAmount   = min(pastAmounts);
  const maxUnits    = max(pastUnits);
  const minUnits    = min(pastUnits);
  const avgCostPerUnit = avgUnits > 0 ? avgAmount / avgUnits : 0;

  const currentInsightAmount = billDeskBillAmount ?? latest?.billAmount ?? 0;
  const currentInsightUnits  = hasCurrentMonthBill ? latest.billedUnits : 0;

  const recent3Avg  = avg(pastAmounts.slice(-3));
  const unitSpike   = avgUnits > 0 && currentInsightUnits > avgUnits * 1.25;
  const amountSpike = recent3Avg > 0 && currentInsightAmount > recent3Avg * 1.25;

  const targetMonthNumber = ((currentMonth + 1) % 12) + 1;
  const targetMonthYear = currentMonth === 11 ? currentYear : currentYear - 1;
  const sameMonthHistory = trendMonths.filter((m) => {
    const [yr, mo] = m.month.split('-').map(Number);
    return mo === targetMonthNumber && yr === targetMonthYear;
  });

  function rangeFor(values) {
    if (!values.length) return null;
    const minValue = Math.round(Math.min(...values));
    const maxValue = Math.round(Math.max(...values));
    return minValue === maxValue ? `${minValue}` : `${minValue} - ${maxValue}`;
  }

  const fallbackMonths = trendMonths.slice(-3);
  const fallbackBillValues = fallbackMonths.map((m) => m.billAmount).filter((v) => typeof v === 'number');
  const fallbackUnitValues = fallbackMonths.map((m) => m.billedUnits).filter((v) => typeof v === 'number');

  const predictedNextBill = sameMonthHistory.length
    ? Math.round(avg(sameMonthHistory.map((m) => m.billAmount)))
    : fallbackBillValues.length >= 2
      ? Math.round(avg(fallbackBillValues))
      : null;

  const predictedNextUnits = sameMonthHistory.length
    ? Math.round(avg(sameMonthHistory.map((m) => m.billedUnits)))
    : fallbackUnitValues.length >= 2
      ? Math.round(avg(fallbackUnitValues))
      : null;

  const predictedNextBillRange = rangeFor(sameMonthHistory.length ? sameMonthHistory.map(m => m.billAmount) : fallbackBillValues);
  const predictedNextUnitsRange = rangeFor(sameMonthHistory.length ? sameMonthHistory.map(m => m.billedUnits) : fallbackUnitValues);

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthLabel = `${MONTHS[targetMonthNumber - 1]}-${targetMonthYear}`;
  const predictedBasis = sameMonthHistory.length ? `based on ${monthLabel} last year` : 'based on recent trend';

  const maxBill = trendMonths.reduce((best, month) => !best || month.billAmount > best.billAmount ? month : best, null);
  const minBill = trendMonths.reduce((best, month) => !best || month.billAmount < best.billAmount ? month : best, null);

  const prevMonthBill = pastBills[0] || null;
  const sameMonthLastYear = pastBills.find(b => {
    const d = b.closingDate;
    return d.getUTCMonth() === currentMonth && d.getUTCFullYear() === currentYear - 1;
  }) || null;

  function pct(change, base) {
    if (!base || typeof base !== 'number' || base === 0) return null;
    return Number(((change / base) * 100).toFixed(0));
  }

  const insights = {
    avgAmount: Math.round(avgAmount), avgAmount6m: Math.round(avgAmount6m), avgAmount12m: Math.round(avgAmount12m),
    avgUnits: Math.round(avgUnits), avgUnits6m: Math.round(avgUnits6m), avgUnits12m: Math.round(avgUnits12m),
    maxAmount, minAmount, maxUnits, minUnits, avgCostPerUnit: Number(avgCostPerUnit.toFixed(2)),
    predictedNextBill, predictedNextBillRange, predictedNextUnits, predictedNextUnitsRange, predictedBasis,
    maxAmountMonth: maxBill?.month || null, minAmountMonth: minBill?.month || null,
    unitSpike, amountSpike,
    vsLastMonth: prevMonthBill ? {
      amount: currentInsightAmount - prevMonthBill.billAmount,
      amountPct: pct(currentInsightAmount - prevMonthBill.billAmount, prevMonthBill.billAmount),
      units: currentInsightUnits - prevMonthBill.billedUnits,
      unitsPct: pct(currentInsightUnits - prevMonthBill.billedUnits, prevMonthBill.billedUnits),
    } : null,
    vsSameMonthLastYear: sameMonthLastYear ? {
      amount: currentInsightAmount - sameMonthLastYear.billAmount,
      amountPct: pct(currentInsightAmount - sameMonthLastYear.billAmount, sameMonthLastYear.billAmount),
      units: currentInsightUnits - sameMonthLastYear.billedUnits,
      unitsPct: pct(currentInsightUnits - sameMonthLastYear.billedUnits, sameMonthLastYear.billedUnits),
    } : null,
  };

  const finalCustomerName = billDeskData?.customerName ?? latest?.customerName ?? null;

  // FINAL HARD VALIDATION: If we have no customer name AND no bill history,
  // it is not a valid APSPDCL service number. ABORT.
  if (isPlaceholder(finalCustomerName) && bills.length === 0) {
    console.warn(`[api] Final validation failed for ${serviceNumber}: No customer name and no history.`);
    return null;
  }

  return {
    serviceNumber,
    migratedServiceNumber,
    customerName: finalCustomerName,
    billDate: (billDeskBillDate && parseDate(billDeskBillDate)) ? parseDate(billDeskBillDate).toISOString() : (latest ? latest.closingDate.toISOString() : new Date().toISOString()),
    billTime: billDeskData?.billDeskBillTime || latest?.closingTime || null,
    dueDate: (billDeskDueDate && parseDate(billDeskDueDate)) ? parseDate(billDeskDueDate).toISOString() : (latest?.dueDate?.toISOString() || null),
    billedUnits: latest?.billedUnits ?? null,
    billAmount: finalDueAmount,
    publicBillAmount: publicDueAmount,
    billDeskAmount: billDeskAmount ?? null,
    billDeskBillAmount: billDeskBillAmount ?? null,
    billDeskCurrentDemand: billDeskData?.billDeskCurrentDemand ?? null,
    billDeskError,
    apspdclError,
    amountDue,
    status,
    isPaid: status === 'PAID' || status === 'NO_DUES',
    paidDate: pay.paidDate?.toISOString() || null,
    receiptNumber: pay.receiptNumber,
    paidAmount: pay.isPaid ? pay.paidAmount : (status === 'PAID' ? (billDeskBillAmount ?? latest?.billAmount ?? 0) : null),     
    billBreakup: breakup,
    category:    latest?.category ?? null,
    closingRdg:  latest?.closingRdg ?? null,
    ctrLoad:     latest?.ctrLoad ?? null,
    divisionCode: billDeskData?.divisionCode ?? pay.divname ?? null,
    circleName:  billDeskData?.circleName ?? null,
    divisionName: pay.divname ?? null,
    sectionName: pay.secname ?? null,
    uniqueServiceNumber: billDeskData?.uniqueServiceNumber ?? serviceNumber,
    lastThreeAmounts: history,
    billHistory: billHistory18,
    paymentHistory: paymentHistory12,
    trendData: trendMonths,
    isdAmount,
    billDeskSource,
    insights,
    fetchedAt: new Date().toISOString(),
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/api/services', (_req, res) => {
  res.json({ ok: true, services: [] });
});

app.get('/api/services/trash', (_req, res) => {
  res.json({ ok: true, services: [] });
});

app.post('/api/services/validate', async (req, res) => {
  const { serviceNumber, billdeskSession } = req.body || {};
  if (!serviceNumber || !/^\d{13}$/.test(serviceNumber)) {
    return res.status(400).json({ ok: false, error: 'Service number must be 13 digits' });
  }
  try {
    const snapshot = await buildSnapshot(serviceNumber, billdeskSession);
    if (!snapshot) {
      return res.status(404).json({ ok: false, error: 'Invalid APSPDCL service number — no bill history found' });
    }
    res.json({ ok: true, snapshot });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message || 'APSPDCL unavailable' });
  }
});

app.post('/api/services/:serviceNumber/refresh', async (req, res) => {
  const { serviceNumber } = req.params;
  const { billdeskSession } = req.body || {};
  if (!/^\d{13}$/.test(serviceNumber)) {
    return res.status(400).json({ ok: false, error: 'Invalid service number' });
  }
  try {
    const snapshot = await buildSnapshot(serviceNumber, billdeskSession);
    if (!snapshot) {
      return res.status(404).json({ ok: false, error: 'No data found for this service number' });
    }
    res.json({ ok: true, snapshot });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message || 'APSPDCL unavailable' });
  }
});

app.post('/api/services/refresh-all', async (req, res) => {
  const { services: inputServices, serviceNumbers, billdeskSession } = req.body || {};

  let servicesToProcess = [];
  if (Array.isArray(inputServices)) {
    servicesToProcess = inputServices;
  } else if (Array.isArray(serviceNumbers)) {
    servicesToProcess = serviceNumbers.map(sn => ({ serviceNumber: sn }));
  } else {
    return res.status(400).json({ ok: false, error: 'CRITICAL_ERROR: services or serviceNumbers array is required' });
  }

  const results = [];
  for (const s of servicesToProcess) {
    try {
      const snapshot = await buildSnapshot(s.serviceNumber, billdeskSession);
      results.push(snapshot
        ? { id: s.id, serviceNumber: s.serviceNumber, ok: true, snapshot }
        : { id: s.id, serviceNumber: s.serviceNumber, ok: false, error: 'No data returned' });
    } catch (err) {
      results.push({ id: s.id, serviceNumber: s.serviceNumber, ok: false, error: err.message || 'Fetch failed' });
    }
  }

  res.json({
    ok: true,
    succeeded: results.filter(r => r.ok).length,
    failed:    results.filter(r => !r.ok).length,
    results,
  });
});

app.post('/api/billdesk/validate-session', async (req, res) => {
  const { serviceNumber, billdeskSession } = req.body || {};
  if (!serviceNumber || !billdeskSession) {
    return res.status(400).json({ ok: false, error: 'Missing parameters' });
  }

  const { reqtoken, captcha, cookie } = billdeskSession;
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Origin': 'https://payments.billdesk.com',
    'Referer': 'https://payments.billdesk.com/MercOnline/SPDCLController',
    'User-Agent': 'Mozilla/5.0',
  };
  if (cookie) headers.Cookie = cookie;

  const body = new URLSearchParams({
    reqid: 'confirm',
    reqtoken: reqtoken || '',
    txtCustomerID: String(serviceNumber),
    jcaptchaVal: captcha || '',
  }).toString();

  try {
    const bdRes = await fetch(BILLDESK_URL, { method: 'POST', headers, body });
    if (!bdRes.ok) throw new Error(`BillDesk returned ${bdRes.status}`);
    const html = await bdRes.text();

    const errorMatch = html.match(/<div id="error_msg"[^>]*>[\s\S]*?<p>([^<]+)<\/p>/i);
    if (errorMatch) {
      return res.json({ ok: false, error: errorMatch[1].trim() });
    }

    const htmlLower = html.toLowerCase();
    if (htmlLower.includes('wrong captcha') || htmlLower.includes('invalid captcha') || htmlLower.includes('incorrect captcha') || htmlLower.includes('enter valid captcha')) {
      return res.json({ ok: false, error: 'Invalid Captcha' });
    }

    if (!htmlLower.includes('customer name') && !htmlLower.includes('consumer name') && !htmlLower.includes('bill amount') && htmlLower.includes('please enter captcha here')) {
      const errTrMatch = html.match(/<div id="errTr"[^>]*>([^<]+)<\/div>/i);
      const colorRedMatch = html.match(/<div[^>]*class="[^"]*color_red[^"]*"[^>]*>([^<]+)<\/div>/i);
      const errText = (errTrMatch && errTrMatch[1].trim()) || (colorRedMatch && colorRedMatch[1].trim()) || 'Validation failed';
      return res.json({ ok: false, error: errText });
    }

    return res.json({ ok: true });
  } catch (err) {
    return res.status(502).json({ ok: false, error: err.message });
  }
});

app.get('/api/billdesk/init-session', async (req, res) => {
  try {
    const baseCookie = process.env.BILLDESK_COOKIE || process.env.BILLDESK_COOKIES || '';
    const session = await scrapeBillDeskSession(baseCookie);
    res.json({ ok: true, ...session });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/billdesk/captcha-image', async (req, res) => {
  try {
    const cookie = req.query.cookie;
    if (!cookie) return res.status(400).send('Missing cookie parameter');

    const imgRes = await fetch('https://payments.billdesk.com/MercOnline/NumericCaptchaServlet', {
      headers: {
        'Cookie': cookie,
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://payments.billdesk.com/MercOnline/SPDCLController'
      }
    });

    if (!imgRes.ok) throw new Error(`Image fetch failed with status ${imgRes.status}`);

    res.setHeader('Content-Type', imgRes.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'no-store, max-age=0');

    const arrayBuffer = await imgRes.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error('[api] Captcha image fetch failed:', err);
    res.status(502).send('Failed to fetch captcha image');
  }
});

app.post('/api/billdesk/auto-session', async (req, res) => {
  const { serviceNumber } = req.body || {};
  if (!serviceNumber) {
    return res.status(400).json({ ok: false, error: 'Missing serviceNumber' });
  }

  const start = Date.now();
  const LIMIT = 9000; // 9s limit for Vercel
  let lastError = 'Failed to solve captcha';

  // Reduce to 2 attempts to fit in 10s Vercel limit
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (Date.now() - start > LIMIT) break;

    try {
      const baseCookie = process.env.BILLDESK_COOKIE || process.env.BILLDESK_COOKIES || '';
      const session = await scrapeBillDeskSession(baseCookie);
      const captchaText = await solveCaptchaImage(session.cookie);

      if (!captchaText || captchaText.length < 5) continue;

      session.captcha = captchaText;
      const headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://payments.billdesk.com',
        'Referer': 'https://payments.billdesk.com/MercOnline/SPDCLController',
        'User-Agent': 'Mozilla/5.0',
        'Cookie': session.cookie
      };

      const body = new URLSearchParams({
        reqid: 'confirm',
        reqtoken: session.reqtoken || '',
        txtCustomerID: String(serviceNumber),
        jcaptchaVal: session.captcha || '',
      }).toString();

      const bdRes = await fetch(BILLDESK_URL, { method: 'POST', headers, body });
      if (!bdRes.ok) throw new Error(`BillDesk returned ${bdRes.status}`);
      const html = await bdRes.text();
      const htmlLower = html.toLowerCase();

      if (htmlLower.includes('wrong captcha') || htmlLower.includes('invalid captcha') || htmlLower.includes('incorrect captcha') || htmlLower.includes('enter valid captcha')) {
         console.warn(`[api] Attempt ${attempt} failed: Wrong Captcha ("${captchaText}")`);
         continue;
      }

      session.timestamp = Date.now();
      console.log(`[api] Auto-session successful in ${Date.now() - start}ms`);
      return res.json({ ok: true, session });

    } catch (err) {
      console.error(`[api] auto-session attempt ${attempt} error:`, err.message);
      lastError = err.message;
    }
  }

  return res.json({ ok: false, error: lastError, time: Date.now() - start });
});

// ── Notification Routes ───────────────────────────────────────────────────

app.post('/api/notifications/register', async (req, res) => {
  const { token, serviceNumbers } = req.body || {};
  if (!token || !Array.isArray(serviceNumbers)) {
    return res.status(400).json({ ok: false, error: 'Missing token or serviceNumbers' });
  }
  if (!redis) return res.status(503).json({ ok: false, error: 'Redis not configured' });
  try {
    await redis.set(`push_token:${token}`, JSON.stringify(serviceNumbers), { ex: 60 * 60 * 24 * 30 });
    await redis.sadd('all_push_tokens', token);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Internal server error' });
  }
});

app.get('/api/notifications/check', async (req, res) => {
  const { secret, type: checkType } = req.query;
  const authHeader = req.headers.authorization;
  const isAuthorized = secret === process.env.INTERNAL_SECRET || authHeader === `Bearer ${process.env.CRON_SECRET}`;

  if (!isAuthorized) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  if (!redis || !admin.apps.length) return res.status(503).json({ ok: false, error: 'Redis/Firebase not configured' });

  const start = Date.now();
  const VERCEL_TIMEOUT = 9500; // 9.5s guard for 10s limit

  try {
    const tokens = await redis.smembers('all_push_tokens');
    const results = [];
    const now = new Date();

    for (const token of tokens) {
      // Guard: If we are close to Vercel's 10s timeout, stop processing more tokens
      if (Date.now() - start > VERCEL_TIMEOUT) {
        console.warn('[cron] Approaching timeout, stopping early');
        break;
      }

      const serviceNumbersStr = await redis.get(`push_token:${token}`);
      if (!serviceNumbersStr) continue;
      const sns = typeof serviceNumbersStr === 'string' ? JSON.parse(serviceNumbersStr) : serviceNumbersStr;
      const notifiedSns = [];

      for (const sn of sns) {
        // Nested Guard: Check timeout before each service check
        if (Date.now() - start > VERCEL_TIMEOUT) break;

        try {
          const snapshot = await buildSnapshot(sn);
          if (!snapshot || snapshot.isPaid || snapshot.amountDue <= 0) continue;

          const dueDate = snapshot.dueDate ? new Date(snapshot.dueDate) : null;
          const billDate = snapshot.billDate ? new Date(snapshot.billDate) : null;
          if (!dueDate) continue;

          const diffDays = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
          const isNewBill = billDate && (now - billDate) < (24 * 60 * 60 * 1000);

          let should = false, title = '', body = '', type = '';

          if (checkType === 'TIPS') {
             const month = now.getMonth();
             const circle = snapshot.circleName?.toUpperCase() || 'GENERAL';
             should = true; type = 'ENERGY_TIP';
             if (month >= 2 && month <= 5) {
               title = 'Summer Saving Tip ☀️';
               body = circle.includes('TIRUPATI') || circle.includes('NELLORE') 
                 ? 'It is hot in Rayalaseema! Keep curtains closed to reduce AC load.'
                 : 'Summer is here! Clean your AC filter today to save up to 5% on your bill.';
             } else {
               title = 'Smart Saving Tip 💡';
               body = 'Unplugging your TV and Laptop at night can save you up to 10 units a month.';
             }
          }
          else if (checkType === 'GENERATION') {
            if (isNewBill) { should = true; title = 'New Bill Generated'; body = `A new bill of ₹${snapshot.amountDue} for ${sn}.`; type = 'BILL_GENERATED'; }
          } else {
            if (diffDays <= 4 && diffDays >= 0) { should = true; title = 'Bill Due Soon'; body = `Your bill of ₹${snapshot.amountDue} for ${sn} is due in ${diffDays} days.`; type = 'BILL_REMINDER'; }
            else if (diffDays < 0) { should = true; title = 'Bill Overdue'; body = `Your bill of ₹${snapshot.amountDue} for ${sn} is overdue!`; type = 'BILL_OVERDUE'; }
          }

          if (should) {
            const dedupKey = type === 'ENERGY_TIP' 
              ? `sent_tip:${token.substring(0, 15)}:${type}:${now.getFullYear()}:${Math.floor(now.getTime() / (7 * 24 * 60 * 60 * 1000))}`
              : `sent_notif:${token.substring(0, 20)}:${sn}:${snapshot.amountDue}:${type}`;
            
            if (!(await redis.get(dedupKey))) {
              notifiedSns.push({ sn, title, body, type, dedupKey });
            }
          }
        } catch (err) {
          console.error(`[cron] Build snapshot failed for ${sn}:`, err.message);
        }
      }

      if (notifiedSns.length > 0) {
        let st = notifiedSns[0].title, sb = notifiedSns[0].body, dls = notifiedSns[0].sn;
        if (notifiedSns.length > 1) {
          st = checkType === 'GENERATION' ? 'New Bills Generated' : 'Bill Alerts';
          sb = `Multiple bills (${notifiedSns.length}) require attention. Tap to view.`;
          dls = '';
        }
        try {
          await admin.messaging().send({ token, notification: { title: st, body: sb }, data: { serviceNumber: dls, type: notifiedSns.length > 1 ? 'MULTI_UPDATE' : notifiedSns[0].type } });
          for (const item of notifiedSns) await redis.set(item.dedupKey, '1', { ex: 60 * 60 * 24 * 30 });
          results.push({ token, count: notifiedSns.length });
        } catch (err) {
          console.error('[cron] FCM send failed:', err.message);
        }
      }
    }
    res.json({ ok: true, results, processed: tokens.length, time: Date.now() - start });
  } catch (err) {
    console.error('[cron] Global error:', err);
    res.status(500).json({ ok: false, error: 'Internal error' });
  }
});

app.post('/api/request-access', async (req, res) => {
  const { deviceId, message, type, name, userEmail, deviceName, deviceType, osName, userAgent, requestedPlan } = req.body || {};

  // Pro requests/withdrawals require profile name and email completed
  if (!userEmail || !name) {
    return res.status(400).json({ ok: false, error: 'Please complete your profile before requesting Pro access.' });
  }

  // Update request status in Postgres if database pool is active
  if (pgPool) {
    try {
      if (type === 'WITHDRAW') {
        await pgPool.query(
          `INSERT INTO users (name, email, device_id, role, profile_completed, registered_at, last_seen_at, pro_request_status)
           VALUES ($1, $2, $3, 'STANDARD', true, NOW(), NOW(), 'WITHDRAWN')
           ON CONFLICT (email)
           DO UPDATE SET
             role = 'STANDARD',
             pro_source = NULL,
             pro_request_status = 'WITHDRAWN',
             last_seen_at = NOW()`,
          [name || 'User', userEmail, deviceId || null]
        );
      } else {
        await pgPool.query(
          `INSERT INTO users (name, email, device_id, role, profile_completed, registered_at, last_seen_at, pro_request_status, pro_requested_at, pro_request_message, requested_plan)
           VALUES ($1, $2, $3, 'STANDARD', true, NOW(), NOW(), 'PENDING', NOW(), $4, $5)
           ON CONFLICT (email)
           DO UPDATE SET 
             name = COALESCE(users.name, EXCLUDED.name),
             device_id = COALESCE(users.device_id, EXCLUDED.device_id),
             profile_completed = true,
             last_seen_at = NOW(),
             pro_request_status = 'PENDING',
             pro_requested_at = NOW(),
             pro_request_message = EXCLUDED.pro_request_message,
             requested_plan = EXCLUDED.requested_plan`,
          [name || 'User', userEmail, deviceId || null, message || 'No message', requestedPlan || 'BRONZE']
        );
        // Also insert an admin notification about the request
        await pgPool.query(
          `INSERT INTO notifications (user_id, title, message)
           VALUES (NULL, 'Pro Request Pending', $1)`,
          [`User ${name} (${userEmail}) has requested the ${requestedPlan || 'BRONZE'} plan. Reason: "${message || 'None'}"`]
        );
      }
    } catch (err) {
      console.error('[api] Failed to update request status in Vercel Postgres:', err.message);
    }
  }
  const { 
    VITE_SMTP_HOST, 
    VITE_SMTP_PORT, 
    VITE_SMTP_USER, 
    VITE_SMTP_PASSWORD,
    VITE_TO_EMAIL
  } = process.env;

  if (!VITE_SMTP_USER || !VITE_SMTP_PASSWORD) {
    console.error('[api] SMTP configuration missing');
    return res.status(503).json({ ok: false, error: 'Email service unavailable' });
  }

  const transporter = nodemailer.createTransport({
    host: VITE_SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(VITE_SMTP_PORT || '465'),
    secure: (VITE_SMTP_PORT || '465') === '465',
    auth: {
      user: VITE_SMTP_USER,
      pass: VITE_SMTP_PASSWORD,
    },
  });

  const isWithdraw = type === 'WITHDRAW';
  const toEmail = VITE_TO_EMAIL || 'mail.developer.akbar@gmail.com';
  const reqIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';

  // Get public server URL base
  const getPublicServerUrl = () => {
    if (process.env.PUBLIC_SERVER_URL) {
      return process.env.PUBLIC_SERVER_URL.replace(/\/$/, '');
    }
    const host = req.get('host');
    const protocol = req.protocol;
    if (host) {
      return `${protocol}://${host}`;
    }
    if (process.env.VERCEL_URL) {
      return `https://${process.env.VERCEL_URL}`;
    }
    return 'https://ap-vidyuth.vercel.app';
  };

  const serverUrl = getPublicServerUrl();

  // 1. Fetch current Vercel whitelist to verify duplicates / remove entries
  let currentWhitelist = '';
  let entries = [];
  try {
    const vercelRes = await getVercelDeviceWhitelist();
    if (!vercelRes.error) {
      currentWhitelist = vercelRes.value || '';
      entries = currentWhitelist.split(',').map(item => item.trim()).filter(Boolean);
    } else {
      console.warn('[api] Could not fetch Vercel whitelist for checking:', vercelRes.error);
      currentWhitelist = process.env.ALLOWED_DEVICE_IDS || '';
      entries = currentWhitelist.split(',').map(item => item.trim()).filter(Boolean);
    }
  } catch (err) {
    console.error('[api] Whitelist fetch error:', err.message);
    currentWhitelist = process.env.ALLOWED_DEVICE_IDS || '';
    entries = currentWhitelist.split(',').map(item => item.trim()).filter(Boolean);
  }

  if (isWithdraw) {
    // ──── WITHDRAW FLOW (Automated Revocation) ────
    console.log(`[api] Processing withdrawal for email: ${userEmail}, deviceId: ${deviceId}`);
    
    // Find device ID of the user email if not provided in the request
    let resolvedDeviceId = deviceId;
    const emailEntry = entries.find(item => item.split(':')[0].toLowerCase() === (userEmail || '').toLowerCase());
    if (emailEntry) {
      resolvedDeviceId = emailEntry.split(':')[1] || resolvedDeviceId;
    }

    // Filter out entries matching this email or device ID
    const filteredEntries = entries.filter(item => {
      const parts = item.split(':');
      const itemEmail = parts[0];
      const itemDevId = parts[1];
      
      const emailMatches = userEmail && itemEmail.toLowerCase() === userEmail.toLowerCase();
      const devIdMatches = resolvedDeviceId && itemDevId === resolvedDeviceId;
      
      return !emailMatches && !devIdMatches;
    });

    const newWhitelistValue = filteredEntries.join(',');

    // Update Vercel
    let vercelUpdated = false;
    try {
      if (process.env.VERCEL_API_TOKEN) {
        await updateVercelDeviceWhitelist(newWhitelistValue);
        vercelUpdated = true;
        console.log('[api] Vercel whitelist updated after withdrawal');
      }
    } catch (err) {
      console.error('[api] Failed to update Vercel variable on withdrawal:', err.message);
    }

    // Update Redis
    let redisUpdated = false;
    if (redis) {
      try {
        if (resolvedDeviceId) {
          await redis.srem('allowed_device_ids', resolvedDeviceId);
        }
        if (deviceId && deviceId !== resolvedDeviceId) {
          await redis.srem('allowed_device_ids', deviceId);
        }
        redisUpdated = true;
        console.log('[api] Redis whitelist updated after withdrawal');
      } catch (err) {
        console.error('[api] Redis remove failed on withdrawal:', err.message);
      }
    }

    // Send confirmation email to User
    try {
      const userMailOptions = {
        from: `"AP Vidyuth App" <${VITE_SMTP_USER}>`,
        to: userEmail,
        subject: 'Pro Subscription Withdrawn - AP Vidyuth',
        text: `Hi ${name || 'User'},\n\n` +
              `Your AP Vidyuth Pro subscription has been successfully withdrawn.\n` +
              `Your device ID (${resolvedDeviceId || 'N/A'}) has been removed from our whitelist.\n\n` +
              `If you did not request this, or if you want to activate Pro again, please raise a request inside the app.\n\n` +
              `Thank you for using AP Vidyuth.\n\n` +
              `Best regards,\n` +
              `AP Vidyuth Team`,
        html: `
          <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px; background-color: #ffffff; color: #1f2937;">
            <h2 style="color: #ef4444; margin-top: 0;">Subscription Withdrawn</h2>
            <p>Hi <strong>${name || 'User'}</strong>,</p>
            <p>Your <strong>AP Vidyuth Pro</strong> subscription has been successfully withdrawn.</p>
            <div style="background-color: #f3f4f6; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 13px; margin: 16px 0; word-break: break-all;">
              <strong>Removed Device ID:</strong><br/>
              ${resolvedDeviceId || 'N/A'}
            </div>
            <p>Your device has been removed from our whitelist. If you need Pro access again in the future, you can submit a new request within the app.</p>
            <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
            <p style="font-size: 12px; color: #9ca3af; margin-bottom: 0;">AP Vidyuth Team</p>
          </div>
        `
      };
      await transporter.sendMail(userMailOptions);
    } catch (err) {
      console.error('[api] Failed to send user withdraw confirmation email:', err.message);
    }

    // Send notification email to Developer/Manager
    try {
      const devMailOptions = {
        from: `"AP Vidyuth App" <${VITE_SMTP_USER}>`,
        to: toEmail,
        subject: `Pro Subscription Withdrawn - ${name || 'User'}`,
        html: `
          <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px; background-color: #0b0f19; color: #f3f4f6;">
            <h2 style="color: #ef4444; margin-top: 0;">Subscription Withdrawn Notification</h2>
            <p>User <strong>${name || 'User'}</strong> (${userEmail}) has withdrawn their Pro subscription.</p>
            <div style="background-color: #111827; border: 1px solid #1f2937; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 13px; margin: 16px 0; word-break: break-all;">
              <strong>User Email:</strong> ${userEmail}<br/>
              <strong>Device ID:</strong> ${resolvedDeviceId || 'N/A'}<br/>
              <strong>Vercel Env Updated:</strong> ${vercelUpdated ? 'Yes' : 'No (Token or configuration missing)'}<br/>
              <strong>Redis Updated:</strong> ${redisUpdated ? 'Yes' : 'No'}
            </div>
            <p style="color: #9ca3af; font-size: 14px;">User message/reason: "${message || 'None'}"</p>
          </div>
        `
      };
      await transporter.sendMail(devMailOptions);
    } catch (err) {
      console.error('[api] Failed to send developer withdraw notification email:', err.message);
    }

    return res.json({ ok: true, message: 'Subscription successfully withdrawn.' });
  }

  // ──── ACCESS FLOW ────
  
  // 1. Duplicate email/device check
  const existingUserEntry = entries.find(item => {
    const parts = item.split(':');
    return parts[0].toLowerCase() === (userEmail || '').toLowerCase();
  });

  if (existingUserEntry) {
    const parts = existingUserEntry.split(':');
    const existingDeviceId = parts[1];
    const existingDeviceName = parts[2] || 'another device';

    if (existingDeviceId !== deviceId) {
      // Duplicate Email registered with ANOTHER device ID! Reject and show device name.
      console.warn(`[api] Registration rejected: ${userEmail} is already registered on device ${existingDeviceId} (${existingDeviceName})`);
      return res.status(400).json({ 
        ok: false, 
        error: `You are already registered with another device (${existingDeviceName}). Please revoke the access for that device first, then raise the request again.` 
      });
    } else {
      // Same device and same email: Access is already active! Just return success.
      return res.json({ ok: true, message: 'Pro access is already active on this device!' });
    }
  }

  // 2. Send email to Developer/Manager with Grant Access button
  const subject = 'Pro Access Request - AP Vidyuth';
  const grantToken = generateGrantToken(deviceId || '', userEmail || '');
  const grantAccessUrl = `${serverUrl}/api/grant-access?deviceId=${encodeURIComponent(deviceId || '')}&email=${encodeURIComponent(userEmail || '')}&name=${encodeURIComponent(name || '')}&deviceName=${encodeURIComponent(deviceName || '')}&token=${grantToken}`;

  const mailOptions = {
    from: `"AP Vidyuth App" <${VITE_SMTP_USER}>`,
    to: toEmail,
    replyTo: userEmail || VITE_SMTP_USER,
    subject: subject,
    text: `New Request from AP Vidyuth App\n\n` +
          `Type: ACCESS\n` +
          `Name: ${name || 'Not provided'}\n` +
          `Email: ${userEmail || 'Not provided'}\n` +
          `Requested Plan: ${requestedPlan || 'BRONZE'}\n` +
          `Device ID: ${deviceId || 'Unknown'}\n` +
          `Device Name: ${deviceName || 'Unknown'}\n` +
          `Platform: ${deviceType || 'Browser'} (${osName || 'Unknown OS'})\n\n` +
          `User Message:\n${message || 'No additional message provided.'}\n\n` +
          `Grant Access URL (Paste in browser):\n${grantAccessUrl}\n\n` +
          `--- End of Request ---`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px; background-color: #0b0f19; color: #f3f4f6;">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="display: inline-block; padding: 8px 16px; background-color: #1e3a8a; border-radius: 20px; color: #3b82f6; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">
            New Request
          </div>
          <h2 style="color: #ffffff; margin-top: 12px; margin-bottom: 4px; font-size: 20px;">Pro Access Request</h2>
          <p style="color: #9ca3af; margin: 0; font-size: 14px;">AP Vidyuth App</p>
        </div>

        <div style="background-color: #111827; border: 1px solid #1f2937; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
          <h3 style="color: #3b82f6; margin-top: 0; margin-bottom: 12px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em;">User Details</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 6px 0; color: #6b7280; font-size: 14px; width: 120px; font-weight: 500;">Name:</td>
              <td style="padding: 6px 0; color: #f3f4f6; font-size: 14px; font-weight: 600;">${name || 'Not provided'}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6b7280; font-size: 14px; font-weight: 500;">Email:</td>
              <td style="padding: 6px 0; color: #f3f4f6; font-size: 14px; font-weight: 600;"><a href="mailto:${userEmail}" style="color: #3b82f6; text-decoration: none;">${userEmail || 'Not provided'}</a></td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6b7280; font-size: 14px; font-weight: 500;">Requested Plan:</td>
              <td style="padding: 6px 0; color: #f59e0b; font-size: 14px; font-weight: 600; text-transform: uppercase;">${requestedPlan || 'BRONZE'}</td>
            </tr>
          </table>
        </div>

        <div style="background-color: #111827; border: 1px solid #1f2937; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
          <h3 style="color: #10b981; margin-top: 0; margin-bottom: 12px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em;">Device Details</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 6px 0; color: #6b7280; font-size: 14px; width: 120px; font-weight: 500;">Device Name:</td>
              <td style="padding: 6px 0; color: #f3f4f6; font-size: 14px; font-weight: 600;">${deviceName || 'Unknown'}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6b7280; font-size: 14px; font-weight: 500;">Platform:</td>
              <td style="padding: 6px 0; color: #f3f4f6; font-size: 14px; font-weight: 600;">${deviceType || 'Browser'} (${osName || 'Unknown OS'})</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6b7280; font-size: 14px; font-weight: 500;">Device ID:</td>
              <td style="padding: 6px 0; color: #a7f3d0; font-family: monospace; font-size: 12px; word-break: break-all;">${deviceId || 'Unknown'}</td>
            </tr>
          </table>
        </div>

        <div style="background-color: #111827; border: 1px solid #1f2937; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
          <h3 style="color: #f59e0b; margin-top: 0; margin-bottom: 8px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em;">User Message</h3>
          <p style="margin: 0; color: #d1d5db; font-size: 14px; line-height: 1.6; font-style: italic;">"${message || 'No additional message provided.'}"</p>
        </div>

        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${grantAccessUrl}" style="background-color: #10b981; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.2); transition: background-color 0.2s;">
            Grant Pro Access
          </a>
          <p style="color: #6b7280; font-size: 11px; margin-top: 10px;">Clicking this will automatically add the Device ID to Vercel and notify the user.</p>
        </div>

        <hr style="border: 0; border-top: 1px solid #1f2937; margin: 24px 0;" />
        <div style="font-size: 11px; color: #4b5563; word-break: break-all;">
          <strong>Request Meta:</strong><br/>
          User Agent: ${userAgent || 'N/A'}<br/>
          IP: ${reqIp || 'N/A'}<br/>
          Time: ${new Date().toISOString()}
        </div>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    res.json({ ok: true, message: 'Request sent successfully' });
  } catch (err) {
    console.error('[api] Email failed:', err.message);
    res.status(502).json({ ok: false, error: 'Failed to send request' });
  }
});

// Simple in-memory cache to prevent duplicate processing on rapid reloads
const processedApprovals = new Set();

app.get('/api/grant-access', async (req, res) => {
  const { deviceId, email, name, token } = req.query;

  if (!deviceId || !email || !token) {
    return res.status(400).send('<h1>Bad Request</h1><p>Missing required parameters.</p>');
  }

  // 1. Verify token
  if (!verifyGrantToken(token, deviceId, email)) {
    return res.status(403).send('<h1>Access Denied</h1><p>Invalid or expired grant token.</p>');
  }

  // Clean device name (no colons or commas) - declared early so it's always available
  let cleanDeviceName = 'Unknown Device';
  const deviceNameFromQuery = req.query.deviceName;
  if (deviceNameFromQuery) {
    cleanDeviceName = String(deviceNameFromQuery).replace(/[:]/g, '-').replace(/[,]/g, '-').trim();
  }

  let alreadyWhitelisted = false;

  // Check in-memory cache first to avoid slow Redis/Vercel queries on rapid page reloads
  if (processedApprovals.has(token)) {
    alreadyWhitelisted = true;
  }

  // Check Redis next as it is much faster than Vercel API and has immediate propagation
  if (!alreadyWhitelisted && redis) {
    try {
      const isMember = await redis.sismember('allowed_device_ids', deviceId);
      if (isMember) {
        alreadyWhitelisted = true;
        processedApprovals.add(token); // Populate in-memory cache for this token
      }
    } catch (err) {
      console.error('[api] Redis whitelist check failed on grant-access:', err.message);
    }
  }

  try {
    if (!alreadyWhitelisted) {
      // 2. Fetch current whitelist to append mapping
      let currentWhitelist = '';
      let entries = [];
      try {
        const vercelRes = await getVercelDeviceWhitelist();
        if (!vercelRes.error) {
          currentWhitelist = vercelRes.value || '';
          entries = currentWhitelist.split(',').map(item => item.trim()).filter(Boolean);
        } else {
          throw new Error(vercelRes.error);
        }
      } catch (err) {
        console.error('[api] Failed to get Vercel whitelist:', err.message);
        throw new Error(`Failed to read Vercel environment variables: ${err.message}. Please verify VERCEL_API_TOKEN configuration.`);
      }

      // Check if duplicate email with another device exists (double check at approval time)
      const emailIndex = entries.findIndex(item => item.split(':')[0].toLowerCase() === email.toLowerCase());

      const timestamp = new Date().toISOString().split('.')[0] + 'Z';
      const mappingEntry = `${email}:${deviceId}:${cleanDeviceName}:${timestamp}`;

      if (emailIndex >= 0) {
        const existingParts = entries[emailIndex].split(':');
        if (existingParts[1] !== deviceId) {
          throw new Error(`Email ${email} is already whitelisted for another device: ${existingParts[2] || 'another device'}. Please revoke that first.`);
        }
        alreadyWhitelisted = true;
      }

      if (!alreadyWhitelisted) {
        // Append mapping
        entries.push(mappingEntry);
        const newWhitelistValue = entries.join(',');

        // 3. Update Vercel
        await updateVercelDeviceWhitelist(newWhitelistValue);
        
        // 4. Update Upstash Redis
        if (redis) {
          await redis.sadd('allowed_device_ids', deviceId);
        }

        // 5. Send approval confirmation email to the user
        await sendApprovalEmail(email, name || 'User', deviceId);
      }

      // Update Postgres Database with PRO role
      if (pgPool) {
        try {
          await pgPool.query(
            `INSERT INTO users (name, email, device_id, role, profile_completed, registered_at, pro_granted_at, last_seen_at, pro_request_status)
             VALUES ($1, $2, $3, 'PRO', true, NOW(), NOW(), NOW(), 'APPROVED')
             ON CONFLICT (email)
             DO UPDATE SET
               name = COALESCE(users.name, EXCLUDED.name),
               device_id = COALESCE(users.device_id, EXCLUDED.device_id),
               role = 'PRO',
               profile_completed = true,
               pro_granted_at = NOW(),
               last_seen_at = NOW(),
               pro_request_status = 'APPROVED'`,
            [name || 'User', email, deviceId || null]
          );
          
          // Fetch user ID to create notification
          const userRes = await pgPool.query('SELECT id FROM users WHERE email = $1', [email]);
          if (userRes.rows.length > 0) {
            const notifCheck = await pgPool.query(
              "SELECT id FROM notifications WHERE user_id = $1 AND title = 'Pro Access Active'",
              [userRes.rows[0].id]
            );
            if (notifCheck.rows.length === 0) {
              await pgPool.query(
                `INSERT INTO notifications (user_id, title, message)
                 VALUES ($1, 'Pro Access Active', 'Your AP Vidyuth Pro access has been activated.')`,
                [userRes.rows[0].id]
              );
            }
          }
        } catch (err) {
          console.error('[api] Failed to update role in Postgres on grant-access:', err.message);
        }
      }

      // Mark this request/token as processed in memory
      processedApprovals.add(token);
    }

    // 6. Respond with a gorgeous success page
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Pro Access Granted</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background-color: #0b0f19;
            color: #f3f4f6;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            padding: 16px;
            box-sizing: border-box;
          }
          .card {
            background-color: #111827;
            border: 1px solid #1f2937;
            border-radius: 16px;
            padding: 40px 24px;
            width: 100%;
            max-width: 480px;
            text-align: center;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.6);
          }
          .icon {
            font-size: 56px;
            margin-bottom: 20px;
            display: inline-block;
            line-height: 1;
          }
          h1 {
            color: #10b981;
            margin-top: 0;
            margin-bottom: 12px;
            font-size: 24px;
            font-weight: 700;
          }
          p {
            color: #9ca3af;
            line-height: 1.6;
            margin-top: 0;
            margin-bottom: 24px;
            font-size: 15px;
          }
          .details {
            background-color: #1f2937;
            border: 1px solid #374151;
            padding: 20px;
            border-radius: 12px;
            text-align: left;
            margin-bottom: 32px;
            font-size: 14px;
          }
          .detail-item {
            margin: 10px 0;
            display: flex;
            flex-direction: column;
          }
          .detail-item:first-child { margin-top: 0; }
          .detail-item:last-child { margin-bottom: 0; }
          .detail-label {
            color: #6b7280;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 4px;
            font-weight: 600;
          }
          .detail-value {
            color: #f3f4f6;
            font-family: monospace;
            word-break: break-all;
            font-weight: 500;
          }
          .btn {
            background-color: #10b981;
            color: white;
            text-decoration: none;
            padding: 14px 28px;
            border-radius: 8px;
            font-weight: 700;
            font-size: 16px;
            display: inline-block;
            transition: all 0.2s;
            box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.2);
          }
          .btn:hover {
            background-color: #059669;
            transform: translateY(-1px);
          }
        </style>
      </head>
      <body>
        <div class="card">
          <span class="icon">⚡</span>
          <h1>Pro Access Active!</h1>
          <p>${alreadyWhitelisted ? 'This device was already whitelisted. No additional action was taken.' : 'The device has been successfully whitelisted. An approval confirmation email has been sent to the user.'}</p>
          <div class="details">
            <div class="detail-item">
              <span class="detail-label">User Name</span>
              <span class="detail-value" style="font-family: inherit; font-size: 15px;">${name || 'N/A'}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">User Email</span>
              <span class="detail-value" style="font-family: inherit; font-size: 15px;">${email}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Device Name</span>
              <span class="detail-value" style="font-family: inherit; font-size: 15px;">${cleanDeviceName}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Device ID</span>
              <span class="detail-value">${deviceId}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Action Status</span>
              <span class="detail-value" style="color: #60a5fa;">${alreadyWhitelisted ? 'Already Whitelisted (No changes made)' : 'Vercel whitelisted, Redis updated, Email sent'}</span>
            </div>
          </div>
          <a href="https://ap-vidyuth.vercel.app" class="btn">Close Window</a>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('[api] Grant access failed:', err);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Error Granting Access</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background-color: #0b0f19;
            color: #f3f4f6;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            padding: 16px;
            box-sizing: border-box;
          }
          .card {
            background-color: #111827;
            border: 1px solid #ef4444;
            border-radius: 16px;
            padding: 40px 24px;
            width: 100%;
            max-width: 480px;
            text-align: center;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.6);
          }
          .icon {
            font-size: 56px;
            margin-bottom: 20px;
            display: inline-block;
          }
          h1 {
            color: #ef4444;
            margin-top: 0;
            margin-bottom: 12px;
            font-size: 24px;
          }
          p {
            color: #9ca3af;
            line-height: 1.6;
            font-size: 15px;
            margin-bottom: 0;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <span class="icon">❌</span>
          <h1>Failed to Grant Access</h1>
          <p>${err.message || 'An unexpected error occurred while updating variables.'}</p>
        </div>
      </body>
      </html>
    `);
  }
});

app.post('/api/validate-coupon', async (req, res) => {
  const { code, deviceId } = req.body || {};
  const validCode = process.env.AP_VIDYUTH_SERVICE_COUPON;
  
  // 1. Device Whitelist Bypass (Works even if code is empty)
  if (deviceId) {
    // Check Vercel Postgres first if database pool is active
    if (pgPool) {
      try {
        const userRes = await pgPool.query(
          "SELECT role, pro_source FROM users WHERE device_id = $1",
          [deviceId]
        );
        if (userRes.rows.length > 0 && userRes.rows[0].role === 'PRO') {
          const source = userRes.rows[0].pro_source || 'admin';
          return res.json({ ok: true, message: 'Pro Access Granted (Device Whitelisted)', source });
        }
      } catch (err) {
        console.error('[api] Postgres whitelist check failed in validate-coupon:', err.message);
      }
    }

    // If Redis is configured, treat it as the primary real-time whitelist database
    if (redis) {
      try {
        const isWhitelisted = await redis.sismember('allowed_device_ids', deviceId);
        if (isWhitelisted) {
          return res.json({ ok: true, message: 'Pro Access Granted (Device Whitelisted)' });
        }
      } catch (err) {
        console.error('[api] Redis whitelist check failed in validate-coupon:', err.message);
      }
    }

    // Check Vercel API if token is configured for dynamic, real-time sync.
    // This handles withdrawal/revocation immediately without needing a server rebuild.
    let isWhitelistedInVercel = false;
    if (process.env.VERCEL_API_TOKEN) {
      try {
        const vercelRes = await getVercelDeviceWhitelist();
        if (!vercelRes.error) {
          const currentWhitelist = vercelRes.value || '';
          const entries = currentWhitelist.split(',').map(item => item.trim()).filter(Boolean);
          const allowedDevices = entries.map(item => item.includes(':') ? item.split(':')[1] : item);
          if (allowedDevices.includes(deviceId)) {
            isWhitelistedInVercel = true;
            // Hot-cache it in Redis for instant subsequent checks
            if (redis) {
              await redis.sadd('allowed_device_ids', deviceId);
            }
          }
        }
      } catch (err) {
        console.error('[api] Dynamic Vercel check failed in validate-coupon:', err.message);
      }
    } else {
      // Fallback to static process.env.ALLOWED_DEVICE_IDS if Vercel API is not configured
      const entries = (process.env.ALLOWED_DEVICE_IDS || '').split(',').map(id => id.trim()).filter(Boolean);
      const allowedDevices = entries.map(item => item.includes(':') ? item.split(':')[1] : item);
      if (allowedDevices.includes(deviceId)) {
        isWhitelistedInVercel = true;
      }
    }

    if (isWhitelistedInVercel) {
      return res.json({ ok: true, message: 'Pro Access Granted (Device Whitelisted)' });
    }
  }

  // 2. Master Coupon Validation
  if (!validCode || !code) {
    return res.status(code ? 503 : 401).json({ ok: false, error: code ? 'Coupon system not configured' : 'Valid Coupon Code or Whitelisted Device Required' });
  }

  const normalizedInput = String(code || '').trim().toUpperCase();
  const normalizedValid = String(validCode).trim().toUpperCase();

  if (normalizedInput === normalizedValid) {
    // Determine user identity from Bearer token
    const authHeader = req.headers.authorization;
    let email = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const session = verifyUserToken(token);
      if (session) {
        email = session.email;
      }
    }

    if (pgPool) {
      try {
        if (email) {
          // Upsert registered user to PRO DIAMOND (unlimited)
          await pgPool.query(
            `INSERT INTO users (name, email, device_id, role, plan_name, service_limit, pro_source, pro_request_status, pro_granted_at, last_seen_at)
             VALUES ('User', $1, $2, 'PRO', 'DIAMOND', 999999, 'coupon', 'APPROVED', NOW(), NOW())
             ON CONFLICT (email)
             DO UPDATE SET 
               role = 'PRO',
               plan_name = 'DIAMOND',
               service_limit = 999999,
               pro_source = 'coupon',
               pro_request_status = 'APPROVED',
               pro_granted_at = NOW(),
               device_id = COALESCE(users.device_id, EXCLUDED.device_id),
               last_seen_at = NOW()`,
            [email, deviceId || null]
          );
        } else if (deviceId) {
          // Check if an anonymous user with this device ID exists
          const existingRes = await pgPool.query('SELECT id FROM users WHERE device_id = $1', [deviceId]);
          if (existingRes.rows.length > 0) {
            // Update all matching devices
            await pgPool.query(
              `UPDATE users 
               SET role = 'PRO',
                   plan_name = 'DIAMOND',
                   service_limit = 999999,
                   pro_source = 'coupon',
                   pro_request_status = 'APPROVED',
                   pro_granted_at = NOW(),
                   last_seen_at = NOW()
               WHERE device_id = $1`,
              [deviceId]
            );
          } else {
            // Insert a new anonymous user with PRO DIAMOND status
            await pgPool.query(
              `INSERT INTO users (name, email, device_id, role, plan_name, service_limit, pro_source, pro_request_status, pro_granted_at, last_seen_at)
               VALUES ('Anonymous User', NULL, $1, 'PRO', 'DIAMOND', 999999, 'coupon', 'APPROVED', NOW(), NOW())`,
              [deviceId]
            );
          }
        }
      } catch (err) {
        console.error('[api] Failed to update user database in validate-coupon:', err.message);
      }
    }

    // Update Vercel whitelist dynamically if VERCEL_API_TOKEN is set
    if (process.env.VERCEL_API_TOKEN && (email || deviceId)) {
      try {
        const vercelRes = await getVercelDeviceWhitelist();
        if (!vercelRes.error) {
          const currentWhitelist = vercelRes.value || '';
          let entries = currentWhitelist.split(',').map(item => item.trim()).filter(Boolean);
          const targetEmail = email || `unregistered-${deviceId || 'unknown'}`;
          const timestamp = new Date().toISOString().split('.')[0] + 'Z';
          const mappingEntry = `${targetEmail}:${deviceId || 'Unknown_Device'}:Coupon_Activated:${timestamp}`;

          const emailIdx = entries.findIndex(item => item.split(':')[0].toLowerCase() === targetEmail.toLowerCase());
          if (emailIdx >= 0) {
            entries[emailIdx] = mappingEntry;
          } else {
            entries.push(mappingEntry);
          }
          await updateVercelDeviceWhitelist(entries.join(','));
        }
      } catch (err) {
        console.error('[api] Failed to update Vercel whitelist in validate-coupon:', err.message);
      }
    }

    // Add to Redis whitelist
    if (redis && deviceId) {
      try {
        await redis.sadd('allowed_device_ids', deviceId);
      } catch (err) {
        console.error('[api] Failed to add to Redis whitelist in validate-coupon:', err.message);
      }
    }

    res.json({ ok: true, message: 'Pro Access Granted' });
  } else {
    res.status(401).json({ ok: false, error: 'Invalid Coupon Code' });
  }
});

// ── Admin Authentication Helpers & Middleware ─────────────────────────────────

function getExpectedAdminToken() {
  const secret = process.env.INTERNAL_SECRET || 'fallback-secret-ap-vidyuth';
  const user = process.env.ADMIN_USER || 'admin';
  const pass = process.env.ADMIN_PASSWORD || 'super-secret-password';
  return crypto.createHmac('sha256', secret)
    .update(`${user}:${pass}`)
    .digest('hex');
}

function verifyAdminToken(token) {
  if (!token) return false;
  const expected = getExpectedAdminToken();
  return token === expected;
}

function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, error: 'Unauthorized Access' });
  }
  const token = authHeader.split(' ')[1];
  if (!verifyAdminToken(token)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized Access' });
  }
  next();
}

// ── Profile, Tracking & Admin API Endpoints ────────────────────────────────────

// Save user profile details (registers Standard users)
app.post('/api/users/profile', async (req, res) => {
  const { name, email, deviceId, heardFrom } = req.body || {};
  if (!name || !email) {
    return res.status(400).json({ ok: false, error: 'Name and email are required' });
  }
  if (!pgPool) {
    return res.json({ ok: true, offline: true, message: 'Profile saved locally (Database offline)' });
  }
  try {
    const result = await pgPool.query(
      `INSERT INTO users (name, email, device_id, role, profile_completed, registered_at, last_seen_at, heard_from)
       VALUES ($1, $2, $3, 'STANDARD', true, NOW(), NOW(), $4)
       ON CONFLICT (email) 
       DO UPDATE SET 
         name = EXCLUDED.name,
         device_id = EXCLUDED.device_id,
         profile_completed = true,
         last_seen_at = NOW(),
         heard_from = COALESCE(EXCLUDED.heard_from, users.heard_from)
       RETURNING *`,
      [name, email, deviceId || null, heardFrom || null]
    );
    res.json({ ok: true, user: result.rows[0] });
  } catch (err) {
    console.error('[api] Save profile failed:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update last_seen_at for active user tracking
app.post('/api/users/track', async (req, res) => {
  let { deviceId, email, services } = req.body || {};
  
  if (email === 'null' || email === 'undefined' || email === '') {
    email = null;
  }
  if (deviceId === 'null' || deviceId === 'undefined' || deviceId === '') {
    deviceId = null;
  }

  if (!deviceId && !email) {
    return res.status(400).json({ ok: false, error: 'DeviceId or email is required' });
  }
  if (!pgPool) {
    return res.json({ ok: true, offline: true });
  }

  const hasServices = (Array.isArray(services) && services.length > 0) || req.body.hasServices === true;

  try {
    let user = null;
    if (email) {
      const emailRes = await pgPool.query('SELECT * FROM users WHERE email = $1', [email]);
      if (emailRes.rows.length > 0) {
        user = emailRes.rows[0];
        await pgPool.query(
          `UPDATE users 
           SET last_seen_at = NOW(), 
               device_id = COALESCE(device_id, $1) 
           WHERE id = $2`,
          [deviceId || null, user.id]
        );
      } else {
        const insertRes = await pgPool.query(
          `INSERT INTO users (name, email, device_id, role, profile_completed, registered_at, last_seen_at)
           VALUES ($1, $2, $3, 'STANDARD', true, NOW(), NOW())
           RETURNING *`,
          ['User', email, deviceId || null]
        );
        user = insertRes.rows[0];
      }
    } else if (deviceId) {
      const deviceRes = await pgPool.query('SELECT * FROM users WHERE device_id = $1', [deviceId]);
      if (deviceRes.rows.length > 0) {
        user = deviceRes.rows[0];
        await pgPool.query(
          'UPDATE users SET last_seen_at = NOW() WHERE id = $1',
          [user.id]
        );
      } else if (hasServices) {
        const insertRes = await pgPool.query(
          `INSERT INTO users (name, email, device_id, role, profile_completed, registered_at, last_seen_at)
           VALUES ($1, NULL, $2, 'STANDARD', false, NOW(), NOW())
           RETURNING *`,
          ['Anonymous User', deviceId]
        );
        user = insertRes.rows[0];
      }
    }

    // Sync services if this is an anonymous/unregistered user
    if (user && !user.email && Array.isArray(services)) {
      try {
        const client = await pgPool.connect();
        try {
          await client.query('BEGIN');
          // 1. Get existing service numbers for this anonymous user
          const existingRes = await client.query(
            'SELECT service_number FROM user_services WHERE user_id = $1',
            [user.id]
          );
          const existingNums = new Set(existingRes.rows.map(r => r.service_number));
          const incomingNums = new Set(services.map(s => s.serviceNumber || s.service_number).filter(Boolean));

          // 2. Delete services no longer present
          const toDelete = [...existingNums].filter(num => !incomingNums.has(num));
          if (toDelete.length > 0) {
            await client.query(
              'DELETE FROM user_services WHERE user_id = $1 AND service_number = ANY($2)',
              [user.id, toDelete]
            );
          }

          // 3. Insert or update current services
          for (const s of services) {
            const serviceNum = s.serviceNumber || s.service_number;
            if (!serviceNum) continue;

            const params = [user.id, ...dbSerializeService(s)];
            await client.query(
              `INSERT INTO user_services (
                user_id, service_number, label, customer_name, last_bill_date, last_due_date,
                last_amount_due, last_billed_units, last_three_amounts, last_status, last_fetched_at,
                history_fetched_at, last_reported_bill_date, bill_time, bill_no_prefix, last_refreshed_date, last_error,
                is_paid, paid_date, receipt_number, paid_amount, bill_breakup, bill_history,
                payment_history, trend_data, insights, category, closing_rdg, ctr_load,
                division_code, division_name, circle_name, section_name, unique_service_number,
                pinned, pinned_at, is_deleted, deleted_at, created_at, updated_at
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40
              )
              ON CONFLICT (user_id, service_number)
              DO UPDATE SET
                label = EXCLUDED.label,
                customer_name = EXCLUDED.customer_name,
                last_bill_date = EXCLUDED.last_bill_date,
                last_due_date = EXCLUDED.last_due_date,
                last_amount_due = EXCLUDED.last_amount_due,
                last_billed_units = EXCLUDED.last_billed_units,
                last_three_amounts = EXCLUDED.last_three_amounts,
                last_status = EXCLUDED.last_status,
                last_fetched_at = EXCLUDED.last_fetched_at,
                history_fetched_at = EXCLUDED.history_fetched_at,
                last_reported_bill_date = EXCLUDED.last_reported_bill_date,
                bill_time = EXCLUDED.bill_time,
                bill_no_prefix = EXCLUDED.bill_no_prefix,
                last_refreshed_date = EXCLUDED.last_refreshed_date,
                last_error = EXCLUDED.last_error,
                is_paid = EXCLUDED.is_paid,
                paid_date = EXCLUDED.paid_date,
                receipt_number = EXCLUDED.receipt_number,
                paid_amount = EXCLUDED.paid_amount,
                bill_breakup = EXCLUDED.bill_breakup,
                bill_history = EXCLUDED.bill_history,
                payment_history = EXCLUDED.payment_history,
                trend_data = EXCLUDED.trend_data,
                insights = EXCLUDED.insights,
                category = EXCLUDED.category,
                closing_rdg = EXCLUDED.closing_rdg,
                ctr_load = EXCLUDED.ctr_load,
                division_code = EXCLUDED.division_code,
                division_name = EXCLUDED.division_name,
                circle_name = EXCLUDED.circle_name,
                section_name = EXCLUDED.section_name,
                unique_service_number = EXCLUDED.unique_service_number,
                pinned = EXCLUDED.pinned,
                pinned_at = EXCLUDED.pinned_at,
                is_deleted = EXCLUDED.is_deleted,
                deleted_at = EXCLUDED.deleted_at,
                updated_at = EXCLUDED.updated_at`,
              params
            );
          }
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK');
          console.error('[api] Anonymous services transaction failed:', err.message);
        } finally {
          client.release();
        }
      } catch (err) {
        console.error('[api] Failed to get db connection for anonymous services sync:', err.message);
      }
    }

    if (user) {
      res.json({
        ok: true,
        user: {
          role: user.role,
          planName: user.plan_name || 'FREE',
          serviceLimit: user.service_limit || 4
        }
      });
    } else {
      res.json({ ok: true });
    }
  } catch (err) {
    console.error('[api] User tracking failed:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Fetch active user notifications
app.get('/api/users/notifications', async (req, res) => {
  const { deviceId, email } = req.query;
  if (!deviceId && !email) {
    return res.status(400).json({ ok: false, error: 'DeviceId or email is required' });
  }
  if (!pgPool) {
    return res.json({ ok: true, notifications: [], offline: true });
  }
  try {
    const result = await pgPool.query(
      `SELECT n.* FROM notifications n
       JOIN users u ON n.user_id = u.id
       WHERE u.device_id = $1 OR u.email = $2
       ORDER BY n.created_at DESC`,
      [deviceId || null, email || null]
    );
    res.json({ ok: true, notifications: result.rows });
  } catch (err) {
    console.error('[api] Fetch notifications failed:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Mark user notifications as read
app.post('/api/users/notifications/read', async (req, res) => {
  const { deviceId, email } = req.body || {};
  if (!deviceId && !email) {
    return res.status(400).json({ ok: false, error: 'DeviceId or email is required' });
  }
  if (!pgPool) {
    return res.json({ ok: true, offline: true });
  }
  try {
    await pgPool.query(
      `UPDATE notifications 
       SET is_read = true 
       WHERE user_id IN (SELECT id FROM users WHERE device_id = $1 OR email = $2)`,
      [deviceId || null, email || null]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[api] Read notifications failed:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── User Authentication & Database Synchronization Endpoints ───────────────────

// Password Hashing helpers using native Node crypto.pbkdf2Sync
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedPasswordHash) {
  if (!storedPasswordHash) return false;
  const parts = storedPasswordHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, hash] = parts;
  const checkHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return hash === checkHash;
}

// Stateless HMAC session token helpers
function generateUserToken(userId, email, role) {
  const secret = process.env.INTERNAL_SECRET || 'fallback-secret-ap-vidyuth';
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
  const payload = JSON.stringify({ userId, email, role, expiresAt });
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(JSON.stringify({ payload, signature })).toString('base64');
}

function verifyUserToken(token) {
  try {
    if (!token) return null;
    const raw = Buffer.from(token, 'base64').toString('utf8');
    const { payload, signature } = JSON.parse(raw);
    const secret = process.env.INTERNAL_SECRET || 'fallback-secret-ap-vidyuth';
    const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    if (signature !== expectedSignature) return null;
    const data = JSON.parse(payload);
    if (Date.now() > data.expiresAt) return null;
    return data;
  } catch (err) {
    return null;
  }
}

// User session verification middleware
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, error: 'Unauthorized Session' });
  }
  const token = authHeader.split(' ')[1];
  const session = verifyUserToken(token);
  if (!session) {
    return res.status(401).json({ ok: false, error: 'Unauthorized Session' });
  }
  req.user = session;
  next();
}

// Serialize service record to database query parameters
function dbSerializeService(s) {
  return [
    s.serviceNumber || s.service_number,
    s.label || null,
    s.customerName || s.customer_name || null,
    s.lastBillDate || s.last_bill_date || null,
    s.lastDueDate || s.last_due_date || null,
    s.lastAmountDue != null ? parseFloat(s.lastAmountDue) : null,
    s.lastBilledUnits != null ? parseFloat(s.lastBilledUnits) : null,
    s.lastThreeAmounts ? (typeof s.lastThreeAmounts === 'string' ? s.lastThreeAmounts : JSON.stringify(s.lastThreeAmounts)) : '[]',
    s.lastStatus || s.last_status || 'UNKNOWN',
    s.lastFetchedAt || s.last_fetched_at || null,
    s.historyFetchedAt || s.history_fetched_at || null,
    s.lastReportedBillDate || s.last_reported_bill_date || null,
    s.billTime || s.bill_time || null,
    s.billNoPrefix || s.bill_no_prefix || null,
    s.lastRefreshedDate || s.last_refreshed_date || null,
    s.lastError || s.last_error || null,
    s.isPaid === true || s.is_paid === true,
    s.paidDate || s.paid_date || null,
    s.receiptNumber || s.receipt_number || null,
    s.paidAmount != null ? parseFloat(s.paidAmount) : null,
    s.billBreakup ? (typeof s.billBreakup === 'string' ? s.billBreakup : JSON.stringify(s.billBreakup)) : null,
    s.billHistory ? (typeof s.billHistory === 'string' ? s.billHistory : JSON.stringify(s.billHistory)) : '[]',
    s.paymentHistory ? (typeof s.paymentHistory === 'string' ? s.paymentHistory : JSON.stringify(s.paymentHistory)) : '[]',
    s.trendData ? (typeof s.trendData === 'string' ? s.trendData : JSON.stringify(s.trendData)) : '[]',
    s.insights ? (typeof s.insights === 'string' ? s.insights : JSON.stringify(s.insights)) : null,
    s.category || null,
    s.closingRdg != null ? parseFloat(s.closingRdg) : null,
    s.ctrLoad != null ? parseFloat(s.ctrLoad) : null,
    s.divisionCode || s.division_code || null,
    s.divisionName || s.division_name || null,
    s.circleName || s.circle_name || null,
    s.sectionName || s.section_name || null,
    s.uniqueServiceNumber || s.unique_service_number || s.serviceNumber || s.service_number || null,
    s.pinned === true,
    s.pinnedAt || s.pinned_at || null,
    s.isDeleted === true || s.is_deleted === true,
    s.deletedAt || s.deleted_at || null,
    s.createdAt || s.created_at || new Date().toISOString(),
    s.updatedAt || s.updated_at || new Date().toISOString()
  ];
}

// Deserialize service row back to camelCase frontend model
function dbDeserializeService(row) {
  if (!row) return null;
  return {
    id: row.id,
    serviceNumber: row.service_number,
    label: row.label,
    customerName: row.customer_name,
    lastBillDate: row.last_bill_date ? new Date(row.last_bill_date).toISOString() : null,
    lastDueDate: row.last_due_date ? new Date(row.last_due_date).toISOString() : null,
    lastAmountDue: row.last_amount_due != null ? parseFloat(row.last_amount_due) : null,
    lastBilledUnits: row.last_billed_units != null ? parseFloat(row.last_billed_units) : null,
    lastThreeAmounts: typeof row.last_three_amounts === 'string' ? JSON.parse(row.last_three_amounts) : row.last_three_amounts || [],
    lastStatus: row.last_status,
    lastFetchedAt: row.last_fetched_at ? new Date(row.last_fetched_at).toISOString() : null,
    historyFetchedAt: row.history_fetched_at ? new Date(row.history_fetched_at).toISOString() : null,
    lastReportedBillDate: row.last_reported_bill_date ? new Date(row.last_reported_bill_date).toISOString() : null,
    billTime: row.bill_time,
    billNoPrefix: row.bill_no_prefix,
    lastRefreshedDate: row.last_refreshed_date ? new Date(row.last_refreshed_date).toISOString() : null,
    lastError: row.last_error,
    isPaid: !!row.is_paid,
    paidDate: row.paid_date ? new Date(row.paid_date).toISOString() : null,
    receiptNumber: row.receipt_number,
    paidAmount: row.paid_amount != null ? parseFloat(row.paid_amount) : null,
    billBreakup: typeof row.bill_breakup === 'string' ? JSON.parse(row.bill_breakup) : row.bill_breakup || null,
    billHistory: typeof row.bill_history === 'string' ? JSON.parse(row.bill_history) : row.bill_history || [],
    paymentHistory: typeof row.payment_history === 'string' ? JSON.parse(row.payment_history) : row.payment_history || [],
    trendData: typeof row.trend_data === 'string' ? JSON.parse(row.trend_data) : row.trend_data || [],
    insights: typeof row.insights === 'string' ? JSON.parse(row.insights) : row.insights || null,
    category: row.category,
    closingRdg: row.closing_rdg != null ? parseFloat(row.closing_rdg) : null,
    ctrLoad: row.ctr_load != null ? parseFloat(row.ctr_load) : null,
    divisionCode: row.division_code,
    divisionName: row.division_name,
    circleName: row.circle_name,
    sectionName: row.section_name,
    uniqueServiceNumber: row.unique_service_number,
    pinned: !!row.pinned,
    pinnedAt: row.pinned_at ? new Date(row.pinned_at).toISOString() : null,
    isDeleted: !!row.is_deleted,
    deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

// ── Auth Endpoints ──

// User Registration Route
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, heardFrom, deviceId } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ ok: false, error: 'Name, email, and password are required' });
  }
  if (!pgPool) {
    return res.status(503).json({ ok: false, error: 'Database not available' });
  }
  try {
    const checkRes = await pgPool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (checkRes.rows.length > 0) {
      const existingUser = checkRes.rows[0];
      if (existingUser.password_hash) {
        return res.status(400).json({ ok: false, error: 'Email already registered. Please log in.' });
      }
      // Adopt existing user details without password
      const passHash = hashPassword(password);
      const updateRes = await pgPool.query(
        `UPDATE users
         SET name = $1, password_hash = $2, profile_completed = true, last_seen_at = NOW(), device_id = COALESCE(device_id, $3)
         WHERE email = $4
         RETURNING *`,
        [name, passHash, deviceId || null, email]
      );
      const user = updateRes.rows[0];
      const token = generateUserToken(user.id, user.email, user.role);
      return res.json({
        ok: true,
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          theme: user.theme,
          density: user.density,
          language: user.language,
          planName: user.plan_name || 'FREE',
          serviceLimit: user.service_limit || 4
        }
      });
    }

    // Check if there is an anonymous user with this deviceId
    if (deviceId) {
      const anonRes = await pgPool.query('SELECT * FROM users WHERE device_id = $1 AND email IS NULL', [deviceId]);
      if (anonRes.rows.length > 0) {
        const passHash = hashPassword(password);
        const updateRes = await pgPool.query(
          `UPDATE users
           SET name = $1, email = $2, password_hash = $3, profile_completed = true, last_seen_at = NOW(), heard_from = COALESCE(heard_from, $4)
           WHERE id = $5
           RETURNING *`,
          [name, email, passHash, heardFrom || null, anonRes.rows[0].id]
        );
        const user = updateRes.rows[0];
        const token = generateUserToken(user.id, user.email, user.role);
        return res.json({
          ok: true,
          token,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            theme: user.theme,
            density: user.density,
            language: user.language,
            planName: user.plan_name || 'FREE',
            serviceLimit: user.service_limit || 4
          }
        });
      }
    }

    // New user signup
    const passHash = hashPassword(password);
    const result = await pgPool.query(
      `INSERT INTO users (name, email, password_hash, role, profile_completed, registered_at, last_seen_at, heard_from, device_id)
       VALUES ($1, $2, $3, 'STANDARD', true, NOW(), NOW(), $4, $5)
       RETURNING *`,
      [name, email, passHash, heardFrom || null, deviceId || null]
    );
    const user = result.rows[0];
    const token = generateUserToken(user.id, user.email, user.role);
    res.json({
      ok: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        theme: user.theme,
        density: user.density,
        language: user.language,
        planName: user.plan_name || 'FREE',
        serviceLimit: user.service_limit || 4
      }
    });
  } catch (err) {
    console.error('[api] Register failed:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// User Login Route
app.post('/api/auth/login', async (req, res) => {
  const { email, password, deviceId } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ ok: false, error: 'Email and password are required' });
  }
  if (!pgPool) {
    return res.status(503).json({ ok: false, error: 'Database not available' });
  }
  try {
    const result = await pgPool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ ok: false, error: 'Invalid email or password' });
    }
    const user = result.rows[0];
    if (!user.password_hash) {
      return res.status(400).json({ ok: false, error: 'Account registered but password not set. Please sign up again.' });
    }
    if (!verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ ok: false, error: 'Invalid email or password' });
    }
    // Update active connection and deviceId
    await pgPool.query(
      `UPDATE users 
       SET last_seen_at = NOW(), 
           device_id = COALESCE(device_id, $1) 
       WHERE id = $2`,
      [deviceId || null, user.id]
    );
    const token = generateUserToken(user.id, user.email, user.role);
    res.json({
      ok: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        theme: user.theme,
        density: user.density,
        language: user.language,
        planName: user.plan_name || 'FREE',
        serviceLimit: user.service_limit || 4
      }
    });
  } catch (err) {
    console.error('[api] Login failed:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Forgot Password Route
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  if (!email) {
    return res.status(400).json({ ok: false, error: 'Email is required' });
  }
  if (!pgPool) {
    return res.status(503).json({ ok: false, error: 'Database not available' });
  }
  try {
    const checkRes = await pgPool.query('SELECT id, name FROM users WHERE email = $1', [email]);
    if (checkRes.rows.length === 0) {
      // Return success even if email is not registered for security
      return res.json({ ok: true, message: 'If that email is registered, we have sent a reset password link.' });
    }
    const user = checkRes.rows[0];
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600000); // 1 hour

    await pgPool.query(
      'UPDATE users SET reset_token = $1, reset_expires = $2 WHERE id = $3',
      [token, expires, user.id]
    );

    const frontendUrl = process.env.FRONTEND_URL || req.headers.origin || 'http://localhost:5173';
    const resetUrl = `${frontendUrl}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const mailOptions = {
      from: process.env.SMTP_FROM || `"AP Vidyuth" <noreply@apvidyuth.in>`,
      to: email,
      subject: 'Reset Password Request - AP Vidyuth',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px;">
          <h2 style="color: #6366f1; text-align: center;">AP Vidyuth Password Reset</h2>
          <p>Hello ${user.name || 'User'},</p>
          <p>We received a request to reset the password for your AP Vidyuth account.</p>
          <p>Please click the button below to set a new password. This link will expire in 1 hour:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">Reset Password</a>
          </div>
          <p>If you did not request a password reset, please ignore this email.</p>
          <p style="font-size: 12px; color: #666; border-top: 1px solid #eee; padding-top: 10px; margin-top: 30px;">
            This is an automated message, please do not reply directly.
          </p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    res.json({ ok: true, message: 'If that email is registered, we have sent a reset password link.' });
  } catch (err) {
    console.error('[api] Forgot password failed:', err.message);
    res.status(500).json({ ok: false, error: 'Failed to process forgot password request: ' + err.message });
  }
});

// Reset Password Route
app.post('/api/auth/reset-password', async (req, res) => {
  const { email, token, newPassword } = req.body || {};
  if (!email || !token || !newPassword) {
    return res.status(400).json({ ok: false, error: 'Email, token, and new password are required' });
  }
  if (!pgPool) {
    return res.status(503).json({ ok: false, error: 'Database not available' });
  }
  try {
    const result = await pgPool.query(
      'SELECT id, reset_token, reset_expires FROM users WHERE email = $1',
      [email]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ ok: false, error: 'Invalid request or token has expired.' });
    }
    const user = result.rows[0];
    if (!user.reset_token || user.reset_token !== token) {
      return res.status(400).json({ ok: false, error: 'Invalid reset token' });
    }
    if (new Date() > new Date(user.reset_expires)) {
      return res.status(400).json({ ok: false, error: 'Reset token has expired' });
    }

    const passHash = hashPassword(newPassword);
    await pgPool.query(
      `UPDATE users
       SET password_hash = $1, reset_token = NULL, reset_expires = NULL, last_seen_at = NOW()
       WHERE id = $2`,
      [passHash, user.id]
    );

    res.json({ ok: true, message: 'Password has been reset successfully.' });
  } catch (err) {
    console.error('[api] Reset password failed:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Change Password Route
app.post('/api/auth/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ ok: false, error: 'Current password and new password are required' });
  }
  if (!pgPool) {
    return res.status(503).json({ ok: false, error: 'Database not available' });
  }
  try {
    const userId = req.user.userId;
    const result = await pgPool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }
    const user = result.rows[0];
    if (!verifyPassword(currentPassword, user.password_hash)) {
      return res.status(401).json({ ok: false, error: 'Incorrect current password' });
    }

    const newHash = hashPassword(newPassword);
    await pgPool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, userId]);
    res.json({ ok: true, message: 'Password updated successfully' });
  } catch (err) {
    console.error('[api] Change password failed:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update User Settings Route
app.post('/api/users/settings', requireAuth, async (req, res) => {
  const { theme, density, language } = req.body || {};
  if (!pgPool) {
    return res.status(503).json({ ok: false, error: 'Database not available' });
  }
  const userId = req.user.userId;
  try {
    await pgPool.query(
      `UPDATE users 
       SET 
         theme = COALESCE($1, theme), 
         density = COALESCE($2, density), 
         language = COALESCE($3, language) 
       WHERE id = $4`,
      [theme || null, density || null, language || null, userId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[api] Update user settings failed:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Database Sync Endpoints ──

// Sync and Merge Data Route
app.post('/api/sync/merge', requireAuth, async (req, res) => {
  const { services, readings } = req.body || {};
  if (!pgPool) {
    return res.status(503).json({ ok: false, error: 'Database not available' });
  }
  const userId = req.user.userId;
  try {
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');

      // 1. Merge services
      if (Array.isArray(services)) {
        for (const s of services) {
          const serviceNum = s.serviceNumber;
          if (!serviceNum) continue;

          const existRes = await client.query(
            'SELECT id, updated_at FROM user_services WHERE user_id = $1 AND service_number = $2',
            [userId, serviceNum]
          );

          if (existRes.rows.length === 0) {
            const params = [userId, ...dbSerializeService(s)];
            await client.query(
              `INSERT INTO user_services (
                user_id, service_number, label, customer_name, last_bill_date, last_due_date,
                last_amount_due, last_billed_units, last_three_amounts, last_status, last_fetched_at,
                history_fetched_at, last_reported_bill_date, bill_time, bill_no_prefix, last_refreshed_date, last_error,
                is_paid, paid_date, receipt_number, paid_amount, bill_breakup, bill_history,
                payment_history, trend_data, insights, category, closing_rdg, ctr_load,
                division_code, division_name, circle_name, section_name, unique_service_number,
                pinned, pinned_at, is_deleted, deleted_at, created_at, updated_at
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40
              )`,
              params
            );
          } else {
            const dbUpdatedAt = new Date(existRes.rows[0].updated_at);
            const localUpdatedAt = s.updatedAt ? new Date(s.updatedAt) : new Date(0);

            if (localUpdatedAt > dbUpdatedAt) {
              const params = dbSerializeService(s);
              params.push(userId, serviceNum);
              await client.query(
                `UPDATE user_services SET
                  label=$1, customer_name=$2, last_bill_date=$3, last_due_date=$4,
                  last_amount_due=$5, last_billed_units=$6, last_three_amounts=$7, last_status=$8,
                  last_fetched_at=$9, history_fetched_at=$10, last_reported_bill_date=$11, bill_time=$12, bill_no_prefix=$13, last_refreshed_date=$14, last_error=$15, is_paid=$16, paid_date=$17,
                  receipt_number=$18, paid_amount=$19, bill_breakup=$20, bill_history=$21,
                  payment_history=$22, trend_data=$23, insights=$24,
                  category=$25, closing_rdg=$26, ctr_load=$27,
                  division_code=$28, division_name=$29, circle_name=$30, section_name=$31, unique_service_number=$32,
                  pinned=$33, pinned_at=$34, is_deleted=$35, deleted_at=$36, created_at=$37, updated_at=$38
                 WHERE user_id=$39 AND service_number=$40`,
                params
              );
            }
          }
        }
      }

      // 2. Merge readings
      if (readings && typeof readings === 'object') {
        for (const [serviceNum, readingList] of Object.entries(readings)) {
          if (!Array.isArray(readingList)) continue;
          for (const r of readingList) {
            const dateVal = r.date ? new Date(r.date) : new Date();
            const readingVal = parseFloat(r.reading);
            const remarks = r.unitsSoFar ? `unitsSoFar:${r.unitsSoFar}` : null;
            if (!isNaN(readingVal)) {
              await client.query(
                `INSERT INTO user_readings (user_id, service_number, reading_date, reading_value, remarks)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (user_id, service_number, reading_date)
                 DO UPDATE SET
                   reading_value = EXCLUDED.reading_value,
                   remarks = COALESCE(EXCLUDED.remarks, user_readings.remarks)`,
                [userId, serviceNum, dateVal, readingVal, remarks]
              );
            }
          }
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // 3. Retrieve all services and readings for returning
    const servicesRes = await pgPool.query(
      'SELECT * FROM user_services WHERE user_id = $1',
      [userId]
    );
    const readingsRes = await pgPool.query(
      'SELECT * FROM user_readings WHERE user_id = $1',
      [userId]
    );

    const mergedServices = servicesRes.rows.map(dbDeserializeService);
    const mergedReadings = {};
    for (const r of readingsRes.rows) {
      const sn = r.service_number;
      if (!mergedReadings[sn]) mergedReadings[sn] = [];
      let unitsSoFar = 0;
      if (r.remarks && r.remarks.startsWith('unitsSoFar:')) {
        unitsSoFar = parseFloat(r.remarks.split(':')[1]) || 0;
      }
      mergedReadings[sn].push({
        date: new Date(r.reading_date).toISOString(),
        reading: parseFloat(r.reading_value),
        unitsSoFar
      });
    }

    res.json({
      ok: true,
      services: mergedServices,
      readings: mergedReadings
    });
  } catch (err) {
    console.error('[api] Merge failed:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Single Service Push Route
app.post('/api/sync/push-service', requireAuth, async (req, res) => {
  const { service } = req.body || {};
  if (!service) {
    return res.status(400).json({ ok: false, error: 'Service is required' });
  }
  if (!pgPool) {
    return res.status(503).json({ ok: false, error: 'Database not available' });
  }
  const userId = req.user.userId;
  try {
    const params = [userId, ...dbSerializeService(service)];
    const query = `
      INSERT INTO user_services (
        user_id, service_number, label, customer_name, last_bill_date, last_due_date,
        last_amount_due, last_billed_units, last_three_amounts, last_status, last_fetched_at,
        history_fetched_at, last_reported_bill_date, bill_time, bill_no_prefix, last_refreshed_date, last_error,
        is_paid, paid_date, receipt_number, paid_amount, bill_breakup, bill_history,
        payment_history, trend_data, insights, category, closing_rdg, ctr_load,
        division_code, division_name, circle_name, section_name, unique_service_number,
        pinned, pinned_at, is_deleted, deleted_at, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40
      )
      ON CONFLICT (user_id, service_number)
      DO UPDATE SET
        label = EXCLUDED.label,
        customer_name = EXCLUDED.customer_name,
        last_bill_date = EXCLUDED.last_bill_date,
        last_due_date = EXCLUDED.last_due_date,
        last_amount_due = EXCLUDED.last_amount_due,
        last_billed_units = EXCLUDED.last_billed_units,
        last_three_amounts = EXCLUDED.last_three_amounts,
        last_status = EXCLUDED.last_status,
        last_fetched_at = EXCLUDED.last_fetched_at,
        history_fetched_at = EXCLUDED.history_fetched_at,
        last_reported_bill_date = EXCLUDED.last_reported_bill_date,
        bill_time = EXCLUDED.bill_time,
        bill_no_prefix = EXCLUDED.bill_no_prefix,
        last_refreshed_date = EXCLUDED.last_refreshed_date,
        last_error = EXCLUDED.last_error,
        is_paid = EXCLUDED.is_paid,
        paid_date = EXCLUDED.paid_date,
        receipt_number = EXCLUDED.receipt_number,
        paid_amount = EXCLUDED.paid_amount,
        bill_breakup = EXCLUDED.bill_breakup,
        bill_history = EXCLUDED.bill_history,
        payment_history = EXCLUDED.payment_history,
        trend_data = EXCLUDED.trend_data,
        insights = EXCLUDED.insights,
        category = EXCLUDED.category,
        closing_rdg = EXCLUDED.closing_rdg,
        ctr_load = EXCLUDED.ctr_load,
        division_code = EXCLUDED.division_code,
        division_name = EXCLUDED.division_name,
        circle_name = EXCLUDED.circle_name,
        section_name = EXCLUDED.section_name,
        unique_service_number = EXCLUDED.unique_service_number,
        pinned = EXCLUDED.pinned,
        pinned_at = EXCLUDED.pinned_at,
        is_deleted = EXCLUDED.is_deleted,
        deleted_at = EXCLUDED.deleted_at,
        updated_at = EXCLUDED.updated_at
      RETURNING *`;

    const result = await pgPool.query(query, params);
    res.json({ ok: true, service: dbDeserializeService(result.rows[0]) });
  } catch (err) {
    console.error('[api] Push service failed:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Single Service Delete Sync Route
app.post('/api/sync/delete-service', requireAuth, async (req, res) => {
  const { serviceNumber, permanent } = req.body || {};
  if (!serviceNumber) {
    return res.status(400).json({ ok: false, error: 'serviceNumber is required' });
  }
  if (!pgPool) {
    return res.status(503).json({ ok: false, error: 'Database not available' });
  }
  const userId = req.user.userId;
  try {
    if (permanent) {
      await pgPool.query(
        'DELETE FROM user_services WHERE user_id = $1 AND service_number = $2',
        [userId, serviceNumber]
      );
    } else {
      await pgPool.query(
        `UPDATE user_services
         SET is_deleted = true, deleted_at = NOW(), pinned = false, pinned_at = null, updated_at = NOW()
         WHERE user_id = $1 AND service_number = $2`,
        [userId, serviceNumber]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[api] Delete service failed:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Push Readings Sync Route
app.post('/api/sync/push-readings', requireAuth, async (req, res) => {
  const { serviceNumber, readings } = req.body || {};
  if (!serviceNumber || !Array.isArray(readings)) {
    return res.status(400).json({ ok: false, error: 'serviceNumber and readings array are required' });
  }
  if (!pgPool) {
    return res.status(503).json({ ok: false, error: 'Database not available' });
  }
  const userId = req.user.userId;
  try {
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      // Delete existing readings for this service number
      await client.query(
        'DELETE FROM user_readings WHERE user_id = $1 AND service_number = $2',
        [userId, serviceNumber]
      );
      // Insert new values
      for (const r of readings) {
        const dateVal = r.date ? new Date(r.date) : new Date();
        const readingVal = parseFloat(r.reading);
        const remarks = r.unitsSoFar ? `unitsSoFar:${r.unitsSoFar}` : null;
        if (!isNaN(readingVal)) {
          await client.query(
            `INSERT INTO user_readings (user_id, service_number, reading_date, reading_value, remarks)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (user_id, service_number, reading_date)
             DO UPDATE SET reading_value = EXCLUDED.reading_value, remarks = EXCLUDED.remarks`,
            [userId, serviceNumber, dateVal, readingVal, remarks]
          );
        }
      }
      await client.query('COMMIT');
      res.json({ ok: true });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[api] Push readings failed:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Admin Authentication Login
app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body || {};
  const expectedUser = process.env.ADMIN_USER || 'admin';
  const expectedPass = process.env.ADMIN_PASSWORD || 'super-secret-password';
  if (username === expectedUser && password === expectedPass) {
    res.json({ ok: true, token: getExpectedAdminToken() });
  } else {
    res.status(401).json({ ok: false, error: 'Unauthorized Access' });
  }
});

// Admin Stats
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  if (!pgPool) {
    return res.status(503).json({ ok: false, error: 'Database not available' });
  }
  try {
    const totalRes = await pgPool.query('SELECT COUNT(*) FROM users');
    const registeredRes = await pgPool.query('SELECT COUNT(*) FROM users WHERE email IS NOT NULL');
    const unregisteredRes = await pgPool.query('SELECT COUNT(*) FROM users WHERE email IS NULL');
    const pendingRes = await pgPool.query("SELECT COUNT(*) FROM users WHERE pro_request_status = 'PENDING'");
    res.json({
      ok: true,
      stats: {
        total: parseInt(totalRes.rows[0].count),
        registered: parseInt(registeredRes.rows[0].count),
        unregistered: parseInt(unregisteredRes.rows[0].count),
        pending: parseInt(pendingRes.rows[0].count)
      }
    });
  } catch (err) {
    console.error('[api] Admin stats failed:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Admin Users list
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  if (!pgPool) {
    return res.status(503).json({ ok: false, error: 'Database not available' });
  }
  try {
    const standardUsers = await pgPool.query(
      "SELECT id, name, email, device_id, registered_at, last_seen_at, heard_from, pro_request_status, pro_requested_at, pro_request_message, decline_reason, plan_name, service_limit, requested_plan FROM users WHERE role = 'STANDARD' ORDER BY registered_at DESC"
    );
    const proUsers = await pgPool.query(
      "SELECT id, name, email, device_id, registered_at, pro_granted_at, last_seen_at, heard_from, plan_name, service_limit, requested_plan FROM users WHERE role = 'PRO' ORDER BY pro_granted_at DESC"
    );
    res.json({
      ok: true,
      standard: standardUsers.rows,
      pro: proUsers.rows
    });
  } catch (err) {
    console.error('[api] Admin fetch users failed:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Admin Grant/Modify Plan
app.post('/api/admin/grant', requireAdmin, async (req, res) => {
  const { userId, planName } = req.body || {};
  if (!userId) return res.status(400).json({ ok: false, error: 'userId is required' });
  if (!pgPool) return res.status(503).json({ ok: false, error: 'Database not available' });
  
  const PLAN_LIMITS = {
    'FREE': 4,
    'BRONZE': 8,
    'SILVER': 16,
    'GOLD': 32,
    'PLATINUM': 64,
    'DIAMOND': 999999
  };
  
  const plan = (planName || 'DIAMOND').toUpperCase();
  const limit = PLAN_LIMITS[plan] ?? 4;
  const isPro = plan !== 'FREE';
  const role = isPro ? 'PRO' : 'STANDARD';

  try {
    const userRes = await pgPool.query('SELECT name, email, device_id, role, plan_name FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }
    const { name, email, device_id: deviceId, plan_name: oldPlan } = userRes.rows[0];
    
    // 1. Update database role and plan settings
    await pgPool.query(
      `UPDATE users 
       SET role = $1, plan_name = $2, service_limit = $3, pro_granted_at = CASE WHEN $1 = 'PRO' THEN NOW() ELSE pro_granted_at END, pro_request_status = CASE WHEN $1 = 'PRO' THEN 'APPROVED' ELSE 'NONE' END
       WHERE id = $4`,
      [role, plan, limit, userId]
    );
    
    // 2. Add/remove whitelist dynamically to Vercel variable (if token exists)
    if (process.env.VERCEL_API_TOKEN) {
      try {
        const vercelRes = await getVercelDeviceWhitelist();
        if (!vercelRes.error) {
          const currentWhitelist = vercelRes.value || '';
          let entries = currentWhitelist.split(',').map(item => item.trim()).filter(Boolean);
          const targetEmail = email || `unregistered-${deviceId || 'unknown'}`;
          
          if (isPro) {
            const emailIdx = entries.findIndex(item => item.split(':')[0].toLowerCase() === targetEmail.toLowerCase());
            const timestamp = new Date().toISOString().split('.')[0] + 'Z';
            const mappingEntry = `${targetEmail}:${deviceId || 'Unknown_Device'}:Admin_Granted:${timestamp}`;
            
            if (emailIdx >= 0) {
              entries[emailIdx] = mappingEntry;
            } else {
              entries.push(mappingEntry);
            }
          } else {
            entries = entries.filter(item => {
              const parts = item.split(':');
              const itemEmail = parts[0];
              const itemDevId = parts[1];
              const emailMatches = itemEmail.toLowerCase() === targetEmail.toLowerCase();
              const devIdMatches = deviceId && itemDevId === deviceId;
              return !emailMatches && !devIdMatches;
            });
          }
          await updateVercelDeviceWhitelist(entries.join(','));
        }
      } catch (err) {
        console.error('[api] Admin grant Vercel update failed:', err.message);
      }
    }
    
    // 3. Update Redis for instant bypass
    if (redis && deviceId) {
      if (isPro) {
        await redis.sadd('allowed_device_ids', deviceId);
      } else {
        await redis.srem('allowed_device_ids', deviceId);
      }
    }
    
    // 4. Create Notification
    const notifMsg = isPro 
      ? `Your subscription has been updated to the ${plan} Plan (max ${limit === 999999 ? 'unlimited' : limit} services).`
      : 'Your Pro access has been deactivated, and your plan reverted to Free.';
    await pgPool.query(
      `INSERT INTO notifications (user_id, title, message)
       VALUES ($1, 'Subscription Plan Updated', $2)`,
      [userId, notifMsg]
    );
    
    // 5. Send plan change confirmation email
    if (email) {
      try {
        await sendPlanUpdateEmail(email, name || 'User', oldPlan || 'FREE', plan, limit);
      } catch (err) {
        console.error('[api] Plan update confirmation email failed:', err.message);
      }
    }
    
    res.json({ ok: true, message: `Subscription plan successfully updated to ${plan}.` });
  } catch (err) {
    console.error('[api] Admin grant failed:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Admin Decline Request
app.post('/api/admin/decline', requireAdmin, async (req, res) => {
  const { userId, reason } = req.body || {};
  if (!userId) return res.status(400).json({ ok: false, error: 'userId is required' });
  if (!pgPool) return res.status(503).json({ ok: false, error: 'Database not available' });

  try {
    const userRes = await pgPool.query('SELECT name, email, device_id FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }
    const { name, email, device_id: deviceId } = userRes.rows[0];

    // 1. Update database: decline request status, save reason, ensure role is STANDARD and plan is FREE
    await pgPool.query(
      `UPDATE users 
       SET pro_request_status = 'DECLINED',
           decline_reason = $1,
           role = 'STANDARD',
           plan_name = 'FREE',
           service_limit = 4,
           pro_source = NULL
       WHERE id = $2`,
      [reason || null, userId]
    );

    // 2. Remove from whitelist (safety measure)
    if (process.env.VERCEL_API_TOKEN) {
      try {
        const vercelRes = await getVercelDeviceWhitelist();
        if (!vercelRes.error) {
          const currentWhitelist = vercelRes.value || '';
          let entries = currentWhitelist.split(',').map(item => item.trim()).filter(Boolean);
          const targetEmail = email || `unregistered-${deviceId || 'unknown'}`;
          
          entries = entries.filter(item => {
            const parts = item.split(':');
            const itemEmail = parts[0];
            const itemDevId = parts[1];
            const emailMatches = itemEmail.toLowerCase() === targetEmail.toLowerCase();
            const devIdMatches = deviceId && itemDevId === deviceId;
            return !emailMatches && !devIdMatches;
          });
          await updateVercelDeviceWhitelist(entries.join(','));
        }
      } catch (err) {
        console.error('[api] Admin decline Vercel update failed:', err.message);
      }
    }

    if (redis && deviceId) {
      await redis.srem('allowed_device_ids', deviceId);
    }

    // 3. Create Notification
    const notifMsg = `Your request for Pro access was declined. Reason: ${reason || 'None provided'}. Please try again later.`;
    await pgPool.query(
      `INSERT INTO notifications (user_id, title, message)
       VALUES ($1, 'Request Declined', $2)`,
      [userId, notifMsg]
    );

    // 4. Send decline email to user (if email exists)
    if (email) {
      try {
        await sendDeclineEmail(email, name || 'User', reason);
      } catch (err) {
        console.error('[api] Decline confirmation email failed:', err.message);
      }
    }

    res.json({ ok: true, message: 'Request successfully declined.' });
  } catch (err) {
    console.error('[api] Admin decline failed:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Admin Revoke Pro
app.post('/api/admin/revoke', requireAdmin, async (req, res) => {
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ ok: false, error: 'userId is required' });
  if (!pgPool) return res.status(503).json({ ok: false, error: 'Database not available' });
  
  try {
    const userRes = await pgPool.query('SELECT name, email, device_id FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }
    const { name, email, device_id: deviceId } = userRes.rows[0];
    
    // 1. Update database role
    await pgPool.query(
      `UPDATE users 
       SET role = 'STANDARD', pro_source = NULL, pro_request_status = 'NONE', plan_name = 'FREE', service_limit = 4
       WHERE id = $1`,
      [userId]
    );
    
    // 2. Remove from Vercel variable (if token exists)
    if (process.env.VERCEL_API_TOKEN) {
      try {
        const vercelRes = await getVercelDeviceWhitelist();
        if (!vercelRes.error) {
          const currentWhitelist = vercelRes.value || '';
          const entries = currentWhitelist.split(',').map(item => item.trim()).filter(Boolean);
          const targetEmail = email || `unregistered-${deviceId || 'unknown'}`;
          
          const filteredEntries = entries.filter(item => {
            const parts = item.split(':');
            const itemEmail = parts[0];
            const itemDevId = parts[1];
            const emailMatches = itemEmail.toLowerCase() === targetEmail.toLowerCase();
            const devIdMatches = deviceId && itemDevId === deviceId;
            return !emailMatches && !devIdMatches;
          });
          await updateVercelDeviceWhitelist(filteredEntries.join(','));
        }
      } catch (err) {
        console.error('[api] Admin revoke Vercel update failed:', err.message);
      }
    }
    
    // 3. Remove from Redis
    if (redis && deviceId) {
      await redis.srem('allowed_device_ids', deviceId);
    }
    
    // 4. Create Notification
    await pgPool.query(
      `INSERT INTO notifications (user_id, title, message)
       VALUES ($1, 'Pro Access Revoked', 'Your AP Vidyuth Pro access has been revoked.')`,
      [userId]
    );
    
    // 5. Send revocation email
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.VITE_SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.VITE_SMTP_PORT || '465'),
        secure: (process.env.VITE_SMTP_PORT || '465') === '465',
        auth: {
          user: process.env.VITE_SMTP_USER,
          pass: process.env.VITE_SMTP_PASSWORD,
        },
      });
      await transporter.sendMail({
        from: `"AP Vidyuth App" <${process.env.VITE_SMTP_USER}>`,
        to: email,
        subject: 'Pro Subscription Withdrawn - AP Vidyuth',
        text: `Hi ${name || 'User'},\n\nYour AP Vidyuth Pro subscription has been withdrawn by the administrator.\n\nBest regards,\nAP Vidyuth Team`,
        html: `<div style="font-family: sans-serif; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px; max-width: 500px;"><h2 style="color:#ef4444;margin-top:0;">Pro Access Revoked</h2><p>Hi <strong>${name || 'User'}</strong>,</p><p>Your <strong>AP Vidyuth Pro</strong> access has been deactivated by the administrator.</p></div>`
      });
    } catch (err) {
      console.error('[api] Revoke confirmation email failed:', err.message);
    }
    
    res.json({ ok: true, message: 'Pro access successfully revoked.' });
  } catch (err) {
    console.error('[api] Admin revoke failed:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));
app.use((_req, res) => res.status(404).json({ ok: false, error: 'Not found' }));
app.use((err, _req, res, _next) => res.status(500).json({ ok: false, error: 'Internal error' }));

if (process.env.NODE_ENV !== 'production' || process.env.API_PORT) {
  app.listen(PORT, () => {});
}

export default app;
