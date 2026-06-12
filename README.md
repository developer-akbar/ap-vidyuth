# AP Vidyuth — APSPDCL Bill Tracker

A privacy-first electricity bill tracking app for APSPDCL consumers, built with **React 18 + Vite + Capacitor 6**. Runs as a native Android app and a modern PWA, with all data stored entirely on-device.

---

## ⚡ Features

### 🏠 Dashboard (Electricity)
- **Multi-Service Tracking** — Monitor multiple APSPDCL connections from a single unified view
- **Card View Modes** — Switch between **Classic** (header-focused) and **Quick Glance** (metrics + history chips) with persisted preference
- **Smart Card Expansion** — Expand any card for a high-density summary: billed units, 3-month history chips, granular insights
- **Pinning** — Pin important services to the top with a visual indicator for quick access
- **Pull-to-Refresh** — Swipe down to refresh bill data for all services at once
- **Bulk Actions** — Long-press or checkbox select to trash, restore, or purge multiple services in one shot
- **Trash & Recovery** — Accidentally deleted a service? Restore it anytime from Trash with full history preserved
- **Visual Feedback** — Smooth auto-scroll and highlight animations when adding or restoring services

### 📊 Bill Intelligence
- **18-Month Historical Trend Charts** — Visualize your consumption and bill amount over time
- **Granular Bill Breakup** — Energy Charges, Fixed Charges, Fuel Surcharge, ISD, Arrears
- **Monthly Usage Predictions** — Automatically projects end-of-month units and bill based on logged readings and trends
- **Spike Detection** — Flags unusual month-over-month usage increases
- **Bill Prediction** — Projects your end-of-month bill from mid-month meter readings
- **About Info** — Quick access to service metadata: Circle, Division, Section

### 📖 Meter Reading Log
- **Mid-Month Meter Logging** — Record manual meter readings to track real-time usage
- **Sync & History** — 12-month history view synced between Consumption Insights and Bill Predictor
- **Reading Continuity** — Seamlessly continues from the last billed reading

### 🏆 Payment Streak
- **On-Time Payment Tracking** — Tracks your consecutive on-time payment consistency
- **Motivational Badges** — 🔥 streak badges and status icons (✅ paid / 🕒 pending / ❌ missed) integrated directly into payment history

### 🎯 Budget Goal
- **Per-Service Monthly Budget** — Set a ₹ target for each service
- **Progress Bar** — Visual progress toward your monthly budget cap

### 💸 Cost Split Tracker
- **Split Bills Among People** — Divide electricity cost among N housemates or family members
- **Per-Person Settlement** — Mark each person as paid individually

### 🔔 Notifications
- **Push Notifications** — Bill due alerts delivered to your device
- **Notification Inbox** — In-app inbox to view and manage past notifications
- **Android Shortcuts** — Long-press the app icon to directly refresh bills or navigate to payments

### 📱 Overview Tab
- **Cross-Service Summary** — Total amount due, total units this month, year-to-date spend and units across all services
- **Year in Review** — Annual consumption and spend breakdown per service
- **Share Summary** — Share a formatted bill table directly from the app

### 🔌 Appliance Calculator
- **Usage Estimator** — Estimate monthly electricity cost by entering your appliances and daily usage hours

### ⚙️ Settings & Customisation
- **Calculation Settings** — Configure tariff slabs, arrears deduction behaviour, and BillDesk vs. APSPDCL data source preference
- **Prefix Migration** — Handles automatic migration from old to new APSPDCL service number format
- **Density Control** — Comfortable or Compact layout density
- **Light / Dark / System Theme** — Native support for both themes with automatic system preference detection
- **Language Toggle** — Full i18n support with dynamically toggleable **English** and **Telugu**
- **Backup & Restore** — Export and import all data as a local JSON file

### 🔐 Privacy & Security
- **Privacy-First Local Storage** — All data stored on-device (IndexedDB for Web / SQLite for Android). Nothing sent to any cloud
- **Privacy Policy** — Accessible in-app without login
- **Offline Support** — All cached data remains accessible with no internet connection

### 🧪 Experimental
- **Dynamic UPI QR Payments** — Reverse-engineered APSPDCL UPI logic generates dynamic payment QR codes. Requires Bill Generation Time (HHMM) for a valid VPA. Manual override available. *Do not use for high-value payments without validation — official "Pay Now" redirection remains the primary safe method.*

---

## 🛠️ Tech Stack

| Domain | Technology |
|---|---|
| **Frontend UI** | React 18, Recharts, Vanilla CSS (CSS variables) |
| **Mobile Bridge** | Capacitor 6 |
| **Local Storage** | IndexedDB (`idb`) for Web, SQLite for Android |
| **Backend Proxy** | Node.js + Express (scraping, CORS bypass, OCR) |
| **Image Processing** | `sharp` (noise reduction), `tesseract.js` (OCR) |
| **Internationalisation** | i18next (English + Telugu) |
| **Push Notifications** | `@capacitor/push-notifications` |

---

## 🚀 Setup & Installation

### 1. Environment Variables
Create a `.env` file in the root directory based on `.env.example`:
```env
VITE_API_URL=http://<YOUR_LAN_IP>:4201/api
```
Use your LAN IP for local development. For production (Vercel), use your public Vercel URL.

### 2. Backend Deployment (Public Access)
```bash
npm i -g vercel
vercel --prod
```
Update `.env` with the production Vercel URL after deployment.

### 3. Local Development
```bash
npm install
npm run dev        # Starts UI + local API proxy
```

### 4. Building for Android (Capacitor)
```bash
npm run build              # Build web assets
npx cap sync android       # Sync to Android
npx cap open android       # Open in Android Studio
```

---

## 📁 Project Structure

```
src/
├── app/                   # App shell, routing, theme
├── features/
│   └── electricity/       # All electricity bill tracking features
│       ├── components/    # BudgetGoal, PaymentStreak, MeterReadingLog, CostSplitTracker, etc.
│       ├── hooks/         # useElectricityServices (data layer)
│       └── utils/         # Billing calculations, notifications
├── shared/
│   ├── components/        # ConfirmDialog, Loader, etc.
│   ├── db/                # Unified storage abstraction (IndexedDB + SQLite)
│   └── hooks/             # useNetwork, etc.
└── styles/                # global.css (CSS variable design system)
```

The `src/features` folder is modular — additional tracking domains (Water, Broadband, Gas) can be added alongside `electricity/` and share the same `src/shared/db` storage layer.

---

## 📦 Package ID
`com.akbar.apvidyuth`