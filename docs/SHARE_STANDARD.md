# Task: Standardize Share Message Formatting in AP Vidyuth

## Context

AP Vidyuth is an Android electricity bill tracker for APSPDCL consumers (React + Vite + Capacitor + SQLite). It has 5 user-facing share flows and 4 clipboard copy utilities. The share messages need to be standardized for WhatsApp (primary target) while remaining readable on SMS and other channels.

## Ground Rules (apply to ALL share messages)

- Use `*text*` for bold headers and labels (WhatsApp markdown)
- Use `_text_` for the footer (WhatsApp italic)
- Footer is always: `_Shared via AP Vidyuth_`
- App link is always a bare URL (no `Link:` prefix) — WhatsApp auto-previews it
- One blank line between sections; no blank line before footer
- Units: always spell out `units` (never `u` or `Units`)
- Currency: Indian locale formatting `₹X,XXX` — no decimals for whole rupee amounts
- Dates: `DD MMM YYYY` format (e.g. `14 Jun 2026`) — unambiguous across locales
- No ``` monospace fences — use plain-text aligned lists instead
- No ASCII pipe tables — use `Name   ₹Amount · Units` format with `────` divider

## Files to Update

Update the following functions with the message formats below. Do not change function signatures, triggers, or any logic — only the string content of the share/copy message.

---

### 1. YearInReview.jsx — `handleShare`

**Trigger:** "Share 2026 Summary" button  

```
⚡ *2026 Electricity Summary*

💰 Total Spent: ₹X,XXX
🔌 Total Units: X,XXX units
📈 Highest: May 2026 — ₹X,XXX
📉 Lowest: Mar 2026 — ₹X,XXX
🏆 Most efficient: [Service Name] (₹X.XX/unit)

https://ap-vidyuth.vercel.app
_Shared via AP Vidyuth_
```

---

### 2. Overview Tab — `handleShareSummary`

**Trigger:** Share icon in sticky header  

```
⚡ *Electricity Bill — Jun 2026*

Home       ₹1,200 · 150 units
Shop         ₹850 · 110 units
────────────────────
Total      ₹2,050 · 260 units

https://ap-vidyuth.vercel.app
_Shared via AP Vidyuth_
```

Notes:
- Generate rows dynamically from all services in view
- Right-align amounts and unit counts to a fixed column width based on the longest service name
- Use `────` as the divider (repeat to match the row width)
- Always show Total row

---

### 3. ElectricityDashboard.jsx — `handleShareSelected`

**Trigger:** Share button in multi-select bottom toolbar  

Same format as #2 but only for selected services:

```
⚡ *Electricity Bill — Jun 2026*

[Selected services only — same alignment as #2]
────────────────────
Total      ₹X,XXX · XXX units

https://ap-vidyuth.vercel.app
_Shared via AP Vidyuth_
```

---

### 4a. Dashboard — `handleShare` (PAID status)

**Trigger:** "Share Status" icon on service card  

```
⚡ *Electricity Bill — Payment Receipt*

*Service:* [Customer Name]
*SC No:* 555XXXXXXXXXX
*Amount Paid:* ₹X,XXX
*Paid On:* DD MMM YYYY
*Status:* ✅ Successfully Paid

https://ap-vidyuth.vercel.app/555XXXXXXXXXX
_Shared via AP Vidyuth_
```

---

### 4b. Dashboard — `handleShare` (DUE status)

```
⚡ *Electricity Bill — Amount Due*

*Service:* [Customer Name]
*SC No:* 555XXXXXXXXXX
*Amount Due:* ₹X,XXX
*Due Date:* DD MMM YYYY
*Status:* ⏳ Payment Pending

Late payment may attract additional charges.

https://ap-vidyuth.vercel.app/555XXXXXXXXXX
_Shared via AP Vidyuth_
```

---

### 5. Service Card — `handleShareMonthlyReport`

**Trigger:** "Share Monthly Usage Report" in Consumption Insights  

```
📊 *Electricity Usage — June 2026*

*Service:* [Name] (555XXXXXXXXXX)
*Units Used:* XXX units  📉 -12% vs last month
*Amount:* ₹X,XXX

*Insights:*
- Avg monthly spend: ₹X,XXX
- Highest on record: ₹X,XXX
- Cost per unit: ₹X.XX

*Next bill estimate:* ~₹X,XXX

https://ap-vidyuth.vercel.app/555XXXXXXXXXX
_Shared via AP Vidyuth_
```

Notes:
- Trend emoji: `📉` for decrease, `📈` for increase, omit the trend line entirely if no prior month exists
- Trend percentage: always show as absolute value with sign (`-12%` or `+8%`)
- If next bill estimate is unavailable, omit that line entirely

---

### 6. Clipboard Copies — NO CHANGES

The following are raw utility copies, not share messages. Keep them exactly as-is:

- `copyUpiString` (QRCodeDialog.jsx) — raw UPI URI string
- `handleCopySelected` (ElectricityDashboard.jsx) — `Name:ServiceNumber` comma-separated
- `copyAllNumbers` (Toolbar.jsx) — comma-separated service numbers
- `copyNum` (ServiceCard.jsx) — single 13-digit service number

---

## Utility Helper (add to shareUtils.js or equivalent)

Add a `formatIndianCurrency(amount)` helper if not already present:

```js
export const formatIndianCurrency = (amount) =>
  Math.round(amount).toLocaleString('en-IN');

export const formatShareDate = (dateStr) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  // produces "14 Jun 2026"
};
```

Use these helpers consistently across all share functions.

## What NOT to Change

- Function names and signatures
- Trigger elements (buttons, icons)
- Any logic for computing values (amounts, units, averages, estimates)
- navigator.share() / fallback mechanism
- Any non-share clipboard copy functions