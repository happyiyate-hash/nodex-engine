# NodeX artwork source files

These two files are the **single source of truth** for NodeX branding:

- `assets/icon.png` — Android launcher icon, website favicon, PWA icons, and the in-app header/sidebar logo.
- `assets/splash.png` — native Android launch/splash artwork.

The build regenerates the website/PWA icon files from `assets/icon.png` automatically whenever `npm run build` runs. The Android APK workflow also generates native Android launcher and splash resources from these same two source files.

Do not update `public/icons/icon-192.png`, `public/icons/icon-512.png`, or other generated icon files by hand. They are build outputs and will be overwritten from `assets/icon.png`.

The old SVG branding files are no longer used as a source for the app icon or PWA branding.
