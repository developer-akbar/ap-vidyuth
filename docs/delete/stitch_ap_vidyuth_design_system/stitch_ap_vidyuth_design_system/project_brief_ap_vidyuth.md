# Project Brief: AP Vidyuth Utility Management

## 1. Project Overview
AP Vidyuth is a high-fidelity utility management platform designed to provide users with a centralized, data-driven interface for tracking electricity consumption, managing multiple service connections, and handling billing and payments. The platform targets both residential and commercial users, offering a refined SaaS-inspired aesthetic.

## 2. Visual Identity (Vidyuth Indigo)
The design system follows a **Dark Slate + Indigo** aesthetic, emphasizing clarity, professional trust, and modern efficiency.

*   **Primary Brand Color**: Indigo (`#4f46e5`) - Used for primary actions, active states, and brand highlights.
*   **Typography**: *Plus Jakarta Sans* - Selected for its high legibility and contemporary feel.
*   **Surface System**: A layered approach using subtle grays and slates to create depth and hierarchy without heavy shadows.
*   **Semantic Language**:
    *   **Success/Paid**: Emerald Green (`#059669`)
    *   **Danger/Due**: Crimson Red (`#e11d48`)
    *   **Neutral/Info**: Slate Blue (`#475569`)

## 3. Core Experience & Features

### 3.1 Centralized Dashboard
A bird's-eye view of the user's utility profile.
*   **Total Dues Summary**: Real-time tracking of outstanding balances across all accounts.
*   **Active Services**: Quick-access cards for primary connections with status indicators (Paid/Due).
*   **Usage Trends**: High-level historical aggregation to show monthly cost variations.

### 3.2 Multi-Account Management
Designed for users with multiple properties or meters.
*   **Connection Cards**: Standardized "Service Cards" (scards) displaying current balance, next reading dates, and connection health.
*   **Onboarding**: "Connect New Service" workflow for registering residential or commercial meters.

### 3.3 Advanced Billing & Payments
A transparent look at costs and transaction history.
*   **Breakup Panels**: Detailed breakdown of charges including Fixed Charges, Energy Consumption (units), and Taxes/Surcharges.
*   **Payment History**: Searchable archive of past invoices and payment receipts with PDF export capabilities.
*   **Auto-Pay Management**: Status controls for automated recurring billing.

### 3.4 Usage Analytics & Insights
Data-rich environment for monitoring consumption behavior.
*   **Consumption Trends**: Interactive line charts comparing current usage against previous periods.
*   **Peak Usage Hours**: Identification of high-load windows (Evening Peak vs. Off-peak).
*   **Device-Level Analysis**: Granular breakdown of consumption by category (Air Conditioning, EV Charging, etc.).

## 4. Technical Specifications

### 4.1 Layout Architecture
*   **Shell**: Multi-layout system with a fixed desktop sidebar and a responsive mobile bottom navigation.
*   **Responsive Breakpoints**:
    *   **Desktop**: Full sidebar (`224px`), multi-column grids.
    *   **Tablet (1024px)**: Collapsed sidebar (`196px`), 2-column stats.
    *   **Mobile (700px)**: Sidebar hidden, bottom nav active, single-column touch-friendly cards.

### 4.2 Interactive Patterns
*   **Micro-interactions**: Scale transforms (`0.97`) on button activation for tactile feedback.
*   **State Management**: Semantic badges and status dots that dynamically update based on billing status.
*   **Sticky Elements**: Blurred backdrop headers for persistent navigation during long scrolls.

## 5. Future Roadmap
*   **Smart Home Integration**: Real-time IoT meter syncing.
*   **Localized Notifications**: Push alerts for high-usage thresholds or scheduled maintenance.
*   **Sustainability Tracking**: Deeper carbon footprint analysis and renewable energy offset suggestions.