# Deploy NodeX Terminal to AWS Amplify Hosting

This repository is a Vite + React single-page application. The `amplify.yml` file
sets Node.js 22, installs dependencies, runs TypeScript validation, builds the
frontend, and publishes the `dist` directory. The `public/_redirects` file
keeps client-side routes working after refresh.

## Create the AWS deployment

1. Push/merge the deployment preparation pull request into `main`.
2. Sign in to the AWS Console and open **AWS Amplify**.
3. Choose **Create new app** / **Host web app**.
4. Select **GitHub**, authorize AWS Amplify, and choose
   `happyiyate-hash/nodex-engine`.
5. Select the `main` branch.
6. Review the detected build settings. Amplify should use the repository's
   `amplify.yml`; the build output directory is `dist`.
7. Save and deploy. Wait for the build to finish, then open the generated
   Amplify app URL.

## First deployment environment

No backend URL is required to publish the frontend. Leave
`VITE_NODEX_API_URL` and `VITE_NODEX_WS_URL` unset for the first deployment.
After the Rust backend has a public HTTPS/WSS address, enter those two public
service URLs in **Settings → Axum Rust Backend & WebSocket Gateway** and save.

Example formats (replace with your real host):

- REST base: `https://your-backend.example.com`
- WebSocket: `wss://your-backend.example.com/api/v1/ws`

The dashboard stores only these public connection URLs in that browser's
local storage. They are not AWS secrets and are not shared between browsers
or devices. Do not paste RPC provider API keys, passwords, private keys, or
other secrets into browser local storage.

## Backend requirements before connecting

- The Rust service must be reachable over HTTPS and WSS.
- Configure backend CORS to allow the exact Amplify app origin.
- Configure TLS and a reverse proxy for the Rust service.
- Add authentication and rate limiting before exposing sensitive engine
  controls publicly. The current frontend connection form does not provide
  an authentication credential field.
- Keep Solana RPC/Geyser credentials on the Rust server as environment
  variables; never put them in Vite `VITE_*` variables.

## Automatic deployments

Once connected, Amplify can automatically rebuild the app whenever changes
are pushed to the selected `main` branch.
