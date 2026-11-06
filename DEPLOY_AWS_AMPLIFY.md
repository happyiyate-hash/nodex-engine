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

No backend URL is required to publish the frontend. The frontend contains no
default Rust backend URL. After deploying a compatible Rust backend, open
**Settings → API & Connections** in the app and enter:

- **REST API base URL** — the backend origin, for example
  `https://your-backend.example.com`
- **WebSocket URL** — optional full endpoint, for example
  `wss://your-backend.example.com/api/v1/ws`. Leave blank to derive it
  from the REST URL.
- **Backend operator API key** — the key configured by that Rust backend
  administrator. It is used for protected engine operations and to request
  short-lived WebSocket tickets.

Save the settings, then use **Test full connection**. These settings are
stored in the current browser's local storage and are not shared with other
browsers or devices. A browser-stored operator key is not a secure vault;
restrict access to the browser profile and do not expose a shared operator
key in a public client. A production multi-user deployment should use
individual user authentication and short-lived user tokens.

## Backend-only credentials

Solana RPC provider keys, Helius credentials, Yellowstone/gRPC credentials,
database credentials, wallet private keys and signing secrets must remain
on the Rust backend in its server-side environment or secret manager. Do not
put them in Vite `VITE_*` variables or browser settings. The frontend needs
the backend URL and the operator/user credential accepted by that backend;
it does not need direct access to infrastructure or wallet secrets.

The Rust backend must be reachable over HTTPS and WSS, and its CORS policy
must allow the exact frontend origin. Configure TLS, reverse-proxy WebSocket
upgrades, authentication and rate limiting before exposing operator controls
publicly.

## Automatic deployments

Once connected, Amplify can automatically rebuild the app whenever changes
are pushed to the selected `main` branch.
