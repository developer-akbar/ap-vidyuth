/**
 * qrcode.js
 * 
 * Logic to dynamically generate APSPDCL UPI Payment Strings based on reverse engineering.
 * Supports multiple versions: 
 * - 'legacy': The original format used since mid-2023.
 * - 'dynamic': The new format observed in June 2026.
 */

/**
 * Global Configuration for QR Version.
 * Default is 'legacy' to maintain compatibility until fully tested.
 */
export const APSPDCL_QR_VERSION = 'dynamic'; // 'legacy' | 'dynamic'

// ── Reusable Builders ──────────────────────────────────────────────────────────

/**
 * Deterministic helper to clean customer name for VPA inclusion.
 * Strips non-alphabetic characters (including spaces), converts to lowercase, and limits to 10 characters.
 */
function getCleanName(name) {
  if (!name) return 'consumer';
  return name.replace(/[^a-zA-Z]/g, '').toLowerCase().substring(0, 10);
}

/**
 * Deterministic helper to format date as YYMMDD.
 */
function getVpaDate(dateStr) {
  const dateObj = dateStr ? new Date(dateStr) : new Date();
  const yy = String(dateObj.getUTCFullYear()).slice(-2);
  const mm = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getUTCDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

// ── Legacy Format Builders ───────────────────────────────────────────────────

const LegacyBuilders = {
  pa: (service, dateCode, timeCode) => {
    const cleanName = getCleanName(service.customerName);
    return `${service.serviceNumber}.${dateCode}${timeCode}.${cleanName}@indianbk`;
  },
  tr: (service, dateCode, timeCode) => {
    // Legacy TR pattern: [PREFIX]5002[MMYY][HHMM][RANDOM_PADDING]
    const prefix = service.serviceNumber.substring(0, 3);
    const mm = dateCode.substring(2, 4);
    const yy = dateCode.substring(0, 2);
    const randomSS = String(Math.floor(Math.random() * 60)).padStart(2, '0');
    const randomHHMM = String(Math.floor(1000 + Math.random() * 8999));
    return `${prefix}5002${mm}${yy}${timeCode}${randomSS}${randomHHMM}`.substring(0, 21);
  },
  pn: () => 'APSPDCL',
  tn: () => 'APSPDCL-Bill-Payment'
};

// ── Dynamic Format Builders (New 2026 Format) ────────────────────────────────

const DynamicBuilders = {
  /**
   * New PA Structure: apspdcl-dqr-prod.1782844199.<TR>.<SN>@sbi
   */
  pa: (service, tr) => {
    return `apspdcl-dqr-prod.1782844199.${tr}.${service.serviceNumber}@sbi`;
  },
  /**
   * New TR Observation: 555510206261742291626
   * Structure:
   * - '5' + <first 4 digits of SN>
   * - DDMMYY (from receipt)
   * - HHMM (from receipt)
   * - SS (seconds from receipt)
   * - '1626' static suffix
   */
  tr: (service, dateCode, timeCode) => {
    const prefix = '5' + service.serviceNumber.substring(0, 4);
    
    const yy = dateCode.substring(0, 2);
    const mm = dateCode.substring(2, 4);
    const dd = dateCode.substring(4, 6);
    const ddmmyy = `${dd}${mm}${yy}`;
    
    const hhmm = timeCode.substring(0, 4);
    const ss = timeCode.length >= 6 ? timeCode.substring(4, 6) : String(Math.floor(Math.random() * 60)).padStart(2, '0');
    const staticSuffix = '1626';
    
    return `${prefix}${ddmmyy}${hhmm}${ss}${staticSuffix}`;
  },
  /**
   * New PN Structure: APSPDCL_<NAME>_<SN>
   */
  pn: (service) => {
    const cleanName = getCleanName(service.customerName);
    return `APSPDCL_${cleanName}_${service.serviceNumber}`;
  },
  /**
   * New TN Structure: billpay_<NAME>_<SN>
   */
  tn: (service) => {
    const cleanName = getCleanName(service.customerName);
    return `billpay_${cleanName}_${service.serviceNumber}`;
  }
};

// ── Main Generator ──────────────────────────────────────────────────────────

/**
 * Generates the UPI payment string for a given service.
 * Handles both legacy and new dynamic formats.
 * 
 * Deterministic inputs:
 * - serviceNumber
 * - customerName
 * - lastBillDate -> dateCode (YYMMDD)
 * - billTime -> timeCode (HHMMSS)
 * - publicBillAmount -> amount
 */
export function generateAPSPDCLUpiString(service, version = APSPDCL_QR_VERSION) {
  if (!service || !service.serviceNumber) return null;

  // 1. Prepare deterministic data
  // Prioritize amountDue (final payable) or billDeskAmount (live demand) over gross bill.
  const rawAmount = service.amountDue || service.billDeskAmount || service.publicBillAmount || service.lastAmountDue || 0;
  const amount = Number(rawAmount).toFixed(2);
  const dateCode = getVpaDate(service.lastBillDate);
  const timeCode = service.billTime || '000000';

  if (version === 'dynamic') {
    /**
     * DYNAMIC FORMAT (New)
     * upi://pay?ver=01&pa=[PA]&pn=[PN]&mc=4900&tr=[TR]&am=[AM]&cu=INR&mode=01&purpose=00&qrMedium=04&tn=[TN]
     */
    const tr = DynamicBuilders.tr(service, dateCode, timeCode);
    const pa = DynamicBuilders.pa(service, tr);
    const pn = DynamicBuilders.pn(service);
    const tn = DynamicBuilders.tn(service);

    return `upi://pay?ver=01&pa=${pa}&pn=${pn}&mc=4900&tr=${tr}&am=${amount}&cu=INR&mode=01&purpose=00&qrMedium=04&tn=${tn}`;
  } else {
    /**
     * LEGACY FORMAT (Old)
     * upi://pay?ver=01&mode=02&appid=com.apspdcl.ebs&tr=[TR]&mc=5411&pa=[PA]&pn=[PN]&tn=[TN]&am=[AM]&cu=INR&qrMedium=03
     */
    const pa = LegacyBuilders.pa(service, dateCode, timeCode);
    const tr = LegacyBuilders.tr(service, dateCode, timeCode);
    const pn = LegacyBuilders.pn();
    const tn = LegacyBuilders.tn();

    return `upi://pay?ver=01&mode=02&appid=com.apspdcl.ebs&tr=${tr}&mc=5411&pa=${pa}&pn=${pn}&tn=${tn}&am=${amount}&cu=INR&qrMedium=03`;
  }
}
