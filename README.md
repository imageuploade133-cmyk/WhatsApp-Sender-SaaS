# 🚀 Easy Single-Deploy WhatsApp Sender SaaS

This is a complete, production-ready, **100% database-free, SQL-free, Redis-free, and Docker-free** WhatsApp Sender SaaS application.

It is designed to be **extremely simple to deploy** and runs perfectly on any **Free Tier** cloud hosting provider (such as **Render**, **Railway**, or **Koyeb**) as a single standalone container!

---

## 🌟 Supported Hosting Servers (Free Plans)

The application can be deployed with one-click on the following free hosting providers:

| Hosting Provider | Plan Tier | Persistent Storage Supported? | Deployment Type |
| :--- | :--- | :--- | :--- |
| **Render** | **Free / Individual** | **Yes** (via Mount Volume) | Single Web Service |
| **Railway** | **Developer / Free** | **Yes** (via Volume Mount) | Single Web Service |
| **Koyeb** | **Free Tier** | **Yes** (via Volume) | Single Web Service |

---

## ⚡ How It Works (Robust & Simple)

Unlike complicated applications that require separate PostgreSQL databases, Redis queues, and Docker-Compose setups, this application is **completely self-contained**:
- **Zero Database / Zero SQL**: Contact spreadsheets (CSVs/Excel) and logs are managed natively in standard streams and node memory buffers.
- **Persistent Sessions**: Your WhatsApp pairing (QR code scan) is saved locally on disk under the `/.auth` directory. By mounting a free persistent disk/volume to `/.auth` on your host, **your session will survive restarts and code redeployments forever** (you scan the QR code once and never have to scan again!).
- **Error-Free Linking**: Built on an optimized, duplicate-event-fixed version of `whatsapp-web.js` paired with an offline cached copy of WhatsApp Web `2.3000.1041652166-alpha` to ensure QR codes load instantly and messages never hang.

---

## 🚀 1-Click Deployment Instructions

Select your preferred server below for step-by-step deployment instructions:

### Option A: Deployment on Render (Recommended Free Server)

This repository includes a `render.yaml` configuration file allowing you to deploy the entire SaaS in minutes with persistent session disk support.

1. Create a free account on **[Render](https://render.com)**.
2. Click **New +** and select **Web Service**.
3. Connect your GitHub repository.
4. Configure the following settings:
   - **Name**: `whatsapp-sender-saas`
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
5. Click **Advanced** and add these **Environment Variables**:
   - `ADMIN_EMAIL` = `your-login-email@example.com` (Used to log into your SaaS panel)
   - `ADMIN_PASSWORD` = `your-secure-password` (Used to log into your SaaS panel)
   - `PORT` = `3000`
6. Scroll down to **Disks**, click **Add Disk**:
   - **Name**: `whatsapp-session-disk`
   - **Mount Path**: `/.auth`
   - **Size**: `1 GiB` (This is Render's free persistent disk size!)
7. Click **Create Web Service**.

🎉 Done! Once the deployment completes, open your provided Render URL, log in with your email and password, scan the QR code once, and start sending messages!

---

### Option B: Deployment on Railway (Alternative Free Server)

1. Create a free account on **[Railway](https://railway.app)**.
2. Click **New Project** and select **Deploy from GitHub**.
3. Select this repository.
4. Add these **Environment Variables**:
   - `ADMIN_EMAIL` = `your-login-email@example.com`
   - `ADMIN_PASSWORD` = `your-secure-password`
   - `PORT` = `3000`
   - `NODE_ENV` = `production`
5. Go to your service's **Settings** tab, scroll down to **Volumes**, and click **Add Volume**:
   - **Mount Path**: `/.auth`
   - **Size**: `1 GB` (To persist your WhatsApp session)
6. Click **Deploy**.

🎉 Done! Your service is live and persistent on Railway!

---

## 🛠️ Local Development (Run on your Computer)

Ensure you have Node.js (v18 or higher) and npm installed:

### 1. Install dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Create a file named `.env` in the root of the project and add:
```env
ADMIN_EMAIL=admin@test.com
ADMIN_PASSWORD=admin123
PORT=3000
```

### 3. Run the development server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your web browser. Log in using `admin@test.com` and `admin123`.
