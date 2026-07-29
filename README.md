# WhatsApp Sender SaaS (Migrated to Evolution API + Baileys)

A complete, production-grade, database-free WhatsApp Sender SaaS application that allows users to link their personal WhatsApp accounts and dispatch single or bulk WhatsApp messages.

We have permanently **migrated away from `whatsapp-web.js` + Puppeteer to the RESTful Evolution API (powered by Baileys)**. This resolves all upstream production issues, including unstable browser environments, hanging dispatches, lost sessions on restart, and high CPU/RAM resource spikes.

---

## 🚀 Migrated Architecture

The application is deployed using a decoupled, highly stable production-ready architecture:

```
[ Next.js + Tailwind Frontend ]
              ↓
  (HTTP / API endpoints)
              ↓
[ Express Backend (Our App) ]  ──(Persistent Disk)──→ [ /.auth/active-sessions.json ]
              ↓
  (REST API + API Key Auth)
              ↓
[ Evolution API Server ] (Separate Service)
              ↓
         [ Baileys ]
              ↓
         [ WhatsApp ]
```

### Key Architectural Benefits:
- **No Puppeteer / No Chrome**: Zero browser-automation dependency. Eliminates container crashes, out-of-memory issues, and complicated Chrome binary installation steps.
- **Multi-User SaaS Session Isolation**: Every user gets their own dedicated, isolated Evolution API Baileys instance named `instance-[sanitized-email]`. No shared sessions, no security leaks, and complete privacy.
- **Reliable Instance Persistence**: All WhatsApp sessions and pairings are managed and stored securely by the Evolution API server's PostgreSQL/Redis database, surviving restarts effortlessly.
- **Instant Connection Sync**: Employs a case-insensitive unauthenticated webhook receiver at `/api/whatsapp/webhook` to handle instant delivery updates, status changes, and incoming messages from the Evolution API.

---

## 📁 Folder Structure

```
├── app/                  # Next.js App Router (Views, Layouts, Pages)
│   ├── fonts/            # Standard fonts
│   ├── login/            # Admin authorization screen
│   ├── globals.css       # Tailwind stylesheet
│   ├── layout.tsx        # HTML wrapper
│   └── page.tsx          # Interactive SaaS Dashboard tabs and logic
├── server/               # Custom Express server
│   ├── index.ts          # Bootstrapping Express & Next.js handler
│   ├── routes/
│   │   └── api.ts        # Fully integrated backend REST API endpoints (including Webhooks)
│   └── services/
│     ├── whatsappService.ts  # Evolution API client wrapper & state sync
│     ├── bulkService.ts      # Non-blocking sequential job dispatcher
│     ├── contactsService.ts  # CSV/Excel parsers and contact cataloging
│     └── historyService.ts   # Memory buffer logs for sent/failed history
├── .auth/                # (Auto-generated) Secure persistent session mappings
├── render.yaml           # Deployment blueprint config for Render
├── package.json          # Dependency listings
└── tsconfig.json         # TypeScript settings
```

---

## 🔑 Environment Variables

Configure these variables locally in your `.env` file or in your cloud provider's dashboard:

| Variable | Description | Example / Default |
| :--- | :--- | :--- |
| `ADMIN_EMAIL` | Administrator authorization username / login email | `admin@test.com` |
| `ADMIN_PASSWORD` | Administrator authorization password | `admin123` |
| `PORT` | The port our Express application binds to | `3000` |
| `NODE_ENV` | Mode of operation | `production` |
| `EVOLUTION_API_URL` | **URL of your deployed Evolution API service** | `https://your-evolution-api.up.railway.app` |
| `EVOLUTION_API_KEY` | **Global authentication token of your Evolution API service** | `your-secret-global-api-key` |

---

## 🚂 Railway & Render Deployment Guide

To deploy this commercial SaaS, you will deploy **two separate services** in the same project:

### Step 1: Deploy Evolution API Server
We recommend using the official, stable release of the Evolution API.
1. Deploy the official Evolution API image (`evolutionapi/evolution-api:latest`) as a service on **Railway** or **Render**.
2. Provision a **PostgreSQL** database and **Redis** cache, then link them to your Evolution API service.
3. Configure the following variables on your Evolution API service:
   - `DATABASE_ENABLED=true`
   - `DATABASE_CONNECTION_URI=postgresql://user:pass@host:port/dbname`
   - `CACHE_REDIS_ENABLED=true`
   - `CACHE_REDIS_URI=redis://host:port`
   - `AUTHENTICATION_API_KEY=your-secret-global-api-key`
   - `WEBHOOK_GLOBAL_ENABLED=true`
   - `WEBHOOK_GLOBAL_URL=https://your-saas-app.up.railway.app/api/whatsapp/webhook`

### Step 2: Deploy this SaaS Application
1. Create a new service and connect this GitHub repository.
2. Railway/Render will automatically detect the build configurations via `nixpacks.toml` or `package.json`.
3. Configure the environment variables (listed in the table above), pointing `EVOLUTION_API_URL` to your Step 1 service URL.
4. Mount a persistent disk at `/.auth` to ensure the session token-to-email mapping (`/.auth/active-sessions.json`) is securely persisted across server restarts.

---

## 🛠️ Local Development

### 1. Setup Dependencies
```bash
npm install
```

### 2. Configure Environment
Create a `.env` file in the root directory:
```env
ADMIN_EMAIL=admin@test.com
ADMIN_PASSWORD=admin123
PORT=3000
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=your-secret-global-api-key
```

### 3. Running Locally
Run the Express + Next.js server in development mode:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) and login with your admin email.

---

## ⚡ API Endpoint Mappings & Webhooks

- **Connect**: `POST /api/whatsapp/connect` (Creates Baileys instance dynamically and generates pairing QR)
- **Disconnect**: `POST /api/whatsapp/disconnect` (Deletes instance / logs out)
- **Status Check**: `GET /api/whatsapp/status` (Polls real-time connection info)
- **Message Send**: `POST /api/whatsapp/send` (Dispatches message via Baileys instantly)
- **Webhook Endpoint**: `POST /api/whatsapp/webhook` (Processes realtime event callbacks: `CONNECTION_UPDATE`, `MESSAGES_UPSERT`, `SEND_MESSAGE`)
