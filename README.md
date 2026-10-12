# Sobai Ke Janao Admin Panel

**Phase 2 Status: CODE PASS + LIVE PASS**

Administration and operational management interface for the **Sobai Ke Janao** civic reporting and community engagement platform.

---

## Overview

Sobai Ke Janao Admin Panel provides municipal administrators, operations teams, and moderators with tools to oversee citizen complaints, moderate public community feed posts, dispatch and track official department responses, manage category taxonomies, visualize geographic complaint distributions, monitor user roles and permissions, review administrative audit trails, and configure system preferences.

---

## Features

- **Dashboard & Overview**: Real-time summary metrics of total, pending, resolved, and active complaints, status distributions, category summaries, and recent activity logs.
- **Complaint Management**: Comprehensive complaint registry with tabular and mobile-optimized card views, multi-criteria filtering (status, ward, category, priority), detail inspection drawer with timeline history, and status progression workflows.
- **Feed Moderation**: Community feed moderation module supporting dual-state workflows (`unpublished` and `published`), content review, title/description editing, and feed publishing/unpublishing actions.
- **Response Management**: Official department responses workflow with status filtering, response templates, verification badges, and resolution logging.
- **Category Management**: Hierarchical categorization for civic issues with category and subcategory creation, editing, and icon management.
- **Interactive Map View**: Geographic mapping of reported issues with status-coded markers, zone/ward boundaries, and interactive detail popups.
- **Users & Permissions**: Role-Based Access Control (RBAC) directory supporting Admin, Moderator, and Officer roles with permission management.
- **Operational Analytics**: Visual charts for complaint trends, resolution time averages, ward-level heatmaps, and category breakdowns.
- **Audit Logs**: Immutable timeline of administrative actions, actor identifications, IP logs, and change diffs.
- **System Settings & Localization**: Complete dual-language support (**English** & **Bengali**) with instant language switching and system/light/dark theme toggles.
- **Resilient Data Architecture**: Transparent service layer featuring real API transport with automatic fallback to client-side mock storage during network failure or offline usage.

---

## Tech Stack

- **Framework**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Build Tool**: [Vite 6](https://vitejs.dev/)
- **Routing**: [React Router v7](https://reactrouter.com/) (Hash-based routing for static hosting compatibility)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Animations**: [Motion](https://motion.dev/)

---

## Architecture

```
UI Components (Pages / Layouts / Modules)
       ↓
API Services (complaintApi, feedApi, categoryApi, userApi, etc.)
       ↓
API Client (apiClient — fetch transport with request/response interceptors)
       ↓ (Network failure / Offline / Mock fallback mode)
Fallback Services (complaintFallback, feedFallback, etc.)
       ↓
Mock Data Store
```

---

## Getting Started

### Prerequisites

- **Node.js**: `18.x`, `20.x`, or `22.x`
- **Package Manager**: `npm`, `pnpm`, or `yarn`

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/sobaike-admin-panel.git
   cd sobaike-admin-panel
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   ```bash
   cp .env.example .env
   ```

### Development

Start the local Vite development server:

```bash
npm run dev
```

The application will be accessible at `http://localhost:3000`.

---

## Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts the Vite development server on port 3000 |
| `npm run build` | Compiles TypeScript and builds production assets in `dist/` |
| `npm run preview` | Serves the production build locally for testing |
| `npm run lint` | Runs TypeScript type checking (`tsc --noEmit`) |
| `npm run clean` | Cleans build artifacts and dist directory |

---

## Environment Setup

The application supports optional environment variables defined in `.env.example`:

```env
# Optional API endpoint. If empty, offline mock services are used automatically.
VITE_API_BASE_URL=

# Environment mode (development | production)
VITE_APP_ENV=development

# Base URL path for sub-directory hosting (e.g. "/admin-sobaike-janao/" for GitHub Pages)
VITE_BASE_PATH=/
```

---

## Deployment

The static build output in `dist/` is self-contained and compatible with any static hosting service.

### GitHub Pages (Automated via GitHub Actions)

This repository includes a pre-configured GitHub Actions workflow at `.github/workflows/deploy.yml`:
1. In your GitHub repository, go to **Settings** > **Pages**.
2. Under **Build and deployment** > **Source**, select **GitHub Actions**.
3. Push to the `main` branch to trigger automatic build and deployment.

### Vercel / Netlify / Cloudflare Pages

1. Connect your repository to your hosting provider.
2. Set build configuration:
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`

---

## Project Structure

```
sobaike-admin-panel/
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Pages CI/CD workflow
├── src/
│   ├── assets/                 # Static visual assets and icons
│   ├── components/             # Reusable UI and domain-specific components
│   │   ├── common/             # Error boundaries, modals, cards
│   │   ├── complaints/         # Complaint tables, drawers, mobile cards, filters
│   │   ├── feed/               # Feed tables, detail drawers, status tabs, cards
│   │   ├── layout/             # Admin sidebar, header, navigation, layout wrappers
│   │   └── ui/                 # Buttons, inputs, badges, modals, typography
│   ├── config/                 # Navigation menus, app constants, API configuration
│   ├── context/                # Language (EN/BN) and Theme providers
│   ├── hooks/                  # Custom React hooks (debounce, responsive, data fetching)
│   ├── pages/                  # Page-level components for each primary route
│   │   ├── Dashboard/          # Operational metrics and activity summary
│   │   ├── Complaints/         # Citizen complaint management
│   │   ├── Feed/               # Community feed moderation
│   │   ├── Responses/          # Official department response queue
│   │   ├── Categories/         # Taxonomy hierarchy management
│   │   ├── Map/                # Geographic map monitoring
│   │   ├── Users/              # User permissions and role assignments
│   │   ├── Analytics/          # Reporting, metrics, and trends
│   │   ├── Audit/              # Administrative audit logs
│   │   └── Settings/           # Preferences and configuration
│   ├── routes/                 # Route declarations and path definitions
│   ├── services/               # API clients, transport layers, and mock data stores
│   ├── themes/                 # Theme tokens and style utilities
│   ├── types/                  # TypeScript interface definitions
│   └── utils/                  # Utility helpers (date formatters, feed actions, cn)
├── .env.example                # Template for environment variables
├── .gitignore                  # Git ignore definitions
├── index.html                  # Application HTML entry point
├── package.json                # Project dependencies and script declarations
├── tsconfig.json               # TypeScript compiler options
└── vite.config.ts              # Vite bundler configuration
```

---

## License

MIT License or proprietary as designated by the project maintainers.
