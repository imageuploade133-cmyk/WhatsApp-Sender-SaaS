# WhatsApp Sender SaaS

A complete production-quality, single-container WhatsApp Sender SaaS application that allows users to link their personal WhatsApp account by scanning a QR code and dispatch single or bulk WhatsApp messages. Built cleanly inside a single unified repository and deployable as a single Render Web Service.

## Features

- **Local Administrator Login**: Simple, secure cookie-based auth using `ADMIN_EMAIL` and `ADMIN_PASSWORD` env variables.
- **Dynamic Connection Status**: Real-time status reporting (`Disconnected`, `Generating QR`, `Waiting for Scan`, `Connected`, `Reconnecting`, `Error`).
- **QR Code Scanning**: Seamless Base64 data URL rendering for pairing with automatic detection.
- **Persistent Session Storage**: Utilizing `whatsapp-web.js` `LocalAuth` stored under `.auth/` directory.
- **Single Messaging Form**: Inputs with full front-to-back Zod validation and delivery feedback.
- **Bulk Messaging Queue**: Sequential dispatching (non-simultaneous) with random delays (default 5–10s), live progress tracking, and controls to **Pause**, **Resume**, or **Cancel** active queues.
- **Contact Database Management**: File uploads (CSV and Excel `.xlsx` spreadsheets) and manual entries in a searchable and clearable database.
- **Delivery Log History**: An in-memory, real-time dispatch log tracking recipient, text, timestamp, delivery status, and errors.
- **100% Database-Free**: Clean state design built on node memory buffers, standard streams, and persistent session files.

---

## Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, Lucide Icons, React Hook Form, Zod.
- **Backend Services**: Express.js (custom integrated Next.js server), whatsapp-web.js, Puppeteer, Multer, CSV-Parser, XLSX.

---

## Folder Structure

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
│   │   └── api.ts        # Fully integrated backend REST API endpoints
│   └── services/
│     ├── whatsappService.ts  # WhatsApp client state, event, and browser hook
│     ├── bulkService.ts      # Non-blocking sequential job dispatcher
│     ├── contactsService.ts  # CSV/Excel parsers and contact cataloging
│     └── historyService.ts   # Memory buffer logs for sent/failed history
├── .auth/                # (Auto-generated) Secure LocalAuth session files
├── render.yaml           # Deployment blueprint config for Render Web Services
├── package.json          # Dependency and custom script listings
└── tsconfig.json         # Strict TypeScript settings
```

---

## Environment Variables

Configure these variables locally in a `.env` file or within the Render dashboard:

| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `ADMIN_EMAIL` | Administrator authorization username | `admin@test.com` |
| `ADMIN_PASSWORD` | Administrator authorization password | `admin123` |
| `PORT` | The port the application binds to | `3000` |
| `PUPPETEER_EXECUTABLE_PATH` | Path to google-chrome (optional fallback) | `/usr/bin/google-chrome` |

---

## Local Development Guide

### 1. Prerequisites
Ensure you have Node.js (v18 or higher) and npm installed:
```bash
node -v
npm -v
```

### 2. Setup Dependencies
Clone the repository, then install packages:
```bash
npm install
```

### 3. Running Locally
Run the Custom Express + Next.js server in development mode:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your web browser.

- Sign in using:
  - **Email**: `admin@test.com` (or your configured `ADMIN_EMAIL`)
  - **Password**: `admin123` (or your configured `ADMIN_PASSWORD`)

---

## Production Deployment on Render

This repository includes a `render.yaml` configuration file allowing you to deploy the entire SaaS in minutes.

### Standard Setup

1. Create a new **Web Service** on [Render](https://render.com).
2. Connect your GitHub repository.
3. Configure the settings:
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
4. Add the **Environment Variables**:
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD`
   - `PORT` (set to `3000`)
5. Deploy!

### Note on Persistent Sessions
To prevent QR codes from expiring or being lost when Render restarts, the `render.yaml` template defines a persistent Disk mount at `/.auth` which retains your WhatsApp credentials across code deployments and restarts.

---

## Error Handling & Resiliency

- **Automatic Reconnection**: If connection to WhatsApp web times out, the server attempts state recovery.
- **Browser Crashes**: Handled cleanly without killing the parent Node/Express process.
- **Invalid Number Verification**: Prior to sending, `isRegisteredUser()` is called on whatsapp-web.js to protect sending limits and prevent message delivery blocks.
- **Duplicates Cleaner**: Uploaded contact sheets automatically strip non-digits and eliminate overlapping rows.
