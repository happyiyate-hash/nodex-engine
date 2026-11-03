# Deploying NodeX Terminal to Render

This repository includes a production-ready Render Blueprint specification (`render.yaml`) and an optimized Express production server (`server.ts`).

## Automated Render Blueprint Setup

1. **Push your code to GitHub / GitLab**.
2. Log in to [Render Dashboard](https://dashboard.render.com/).
3. Click **New +** > **Blueprint**.
4. Connect this repository.
5. Render will detect `render.yaml` and display the proposed services:
   - **nodex-terminal** (Node.js Web Service, `plan: free`)
   - **nodex-terminal-static** (Static Site CDN, `plan: free`)
6. Review the settings. Notice:
   > *"All future updates to your Blueprint file will be synced automatically, which may change your costs."*
   
   Since both services specify `plan: free`, the monthly cost is **$0.00**.
7. Click **Apply**. Render will automatically run the build and start your terminal.

---

## Service Specifications

### 1. Web Service (`nodex-terminal`)
- **Runtime**: Node.js
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm run start`
- **Port**: Bound to `$PORT` (defaults to 10000 on Render)
- **Health Check**: `/healthz` (zero-downtime rolling deploys)

### 2. Static Site (`nodex-terminal-static`)
- **Runtime**: Static
- **Build Command**: `npm install && npm run build`
- **Publish Directory**: `./dist`
- **Routing**: Single Page Application rewrite rule (`/* -> /index.html`)

---

## Local Production Testing

To test the production build and server locally before deploying:

```bash
# 1. Build the Vite frontend and bundle server.ts
npm run build

# 2. Run the production server
npm run start
```

Visit `http://localhost:3000` or `http://localhost:3000/healthz`.
