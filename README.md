# APSPDCL Bill Dashboard

A modern, privacy-first personal tracking dashboard built with **React 18 + Vite + Capacitor**. Currently focused on comprehensive electricity bill tracking (specifically APSPDCL and BillDesk integrations), it is designed to run seamlessly in modern web browsers and as a native Android app.

---

## ⚡ Key Features

- **Multi-Service Tracking:** Monitor multiple APSPDCL electricity connections from a single, unified view.        
- **Pinning Services:** Pin important services to the top of the dashboard with a visual indicator for quick access.
- **Bulk Actions:** Select multiple services via long-press or checkboxes to trash, restore, or purge them in one shot.
- **Trash & Recovery:** Accidental deletions are a thing of the past. Move services to Trash and restore them anytime with full history preserved.
- **Dynamic UPI QR Payments (In Progress):** Generate custom UPI QR codes for instant bill payments directly to APSPDCL. (Experimental)
- **Visual Feedback:** Smooth auto-scroll and highlight animations when adding or restoring services.
- **Customizable Card Appearance:** Switch between a minimal **Classic** view (header-focused) and a data-rich **Quick Glance** view (includes metrics and history chips) with a single tap. Preferences are automatically persisted.
- **Smart Expansion:** Regardless of the active view mode, expanding a card provides an instant high-density summary, including billed units, 3-month history chips, and granular insights.
- **Multi-Language Support:** Full i18n support with dynamically toggleable English and Telugu options.
- **Rich Visualizations:**
  - 18-month historical trend charts.
  - Granular bill breakups (Energy Charges, Fixed Charges, Fuel Surcharge, ISD, Arrears).    
  - Monthly usage predictions and spike detection.
- **Automated Captcha Solving:** Custom Node.js proxy server utilizing OCR to automatically solve BillDesk Captchas.
- **Hybrid Fallback:** Graceful degradation to manual Captcha entry if OCR fails.
- **Service Migration:** Automatically handles the shift from old service numbers to the new unique numbering system.
- **About Info:** Quick access to service metadata like Circle, Division, and Section.
- **Light / Dark Mode:** Native support for both themes with a clean, modern SaaS aesthetic.
- **Payment Streak:** Tracks your on-time payment consistency with motivational badges (🔥) and status icons (✅/🕒/❌) integrated directly into your payment history.
- **Mid-Month Meter Logging:** Log manual meter readings to track usage in real-time.
- **Bill Prediction:** Automatically projects your end-of-month bill and units based on logged readings and historical trends.
- **Sync & History:** Seamlessly synchronizes reading logs between Consumption Insights and Bill Predictor with a detailed 12-month history view.
- **Privacy-First Storage:** All data is stored locally on your device (IndexedDB for Web, SQLite for Android).

---

## 🧪 Experimental Feature: Dynamic QR Payments

We have reverse-engineered the APSPDCL UPI logic to generate dynamic payment links. 

**Note on "The Hard Part":**
A valid APSPDCL VPA requires the exact **Bill Generation Time (HHMM)**. Since this is not always available in public history APIs, we have implemented:
- **Deep Time Extraction:** Automatically scanning raw API responses for hidden timestamps.
- **Manual Override:** Allowing users to enter the generation time directly from their physical receipt to ensure 100% accurate QR codes.

*Current Status: Experimental. Do not use for high-value payments without validation. Official "Pay Now" redirection remains the primary safe method.*

---

## 🛠️ Architecture & Tech Stack

| Domain | Technology |
|---|---|
| **Frontend UI** | React 18, Recharts, Vanilla CSS (variables-driven) |
| **Mobile Bridge** | Capacitor 5 |
| **Local Storage** | IndexedDB (`idb`) for Web, SQLite for Android |
| **Backend Proxy** | Node.js + Express (Scraping, CORS bypass, OCR) |
| **Image Processing** | `sharp` (noise reduction), `tesseract.js` (OCR) |

---

## 🚀 Setup & Installation

### 1. Environment Variables
Create a `.env` file in the root directory based on `.env.example`:
```env
VITE_API_URL=http://<YOUR_LAN_IP>:4201/api
```
For local development, use your LAN IP. For production (Vercel), use your public Vercel URL.

### 2. Backend Deployment (Public Access)
To access the app from anywhere:
1. Install Vercel CLI: `npm i -g vercel`
2. Run `vercel --prod` in the project root.
3. Once deployed, update your `.env` file with the production URL.

### 3. Local Development
- **Install Dependencies**: `npm install`
- **Run Dev Server**: `npm run dev` (Starts both UI and local API proxy)

### 4. Building for Android (Capacitor)
1. **Build the Web Assets**: `npm run build`
2. **Sync to Android**: `npx cap sync android`
3. **Run via Android Studio**: `npx cap open android`

---

## 🔧 Extensibility

The codebase is structured modularly. The `src/features` folder is designed so you can easily plug in new tracking domains (Water, Broadband, Subscriptions) and link them to the shared local storage wrapper in `src/shared/db`.
