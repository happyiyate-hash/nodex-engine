# NodeX Android app

NodeX keeps its existing React/Vite frontend. Capacitor packages the production `dist/` output into an Android WebView; it does not create a second UI or change the backend.

## Local Android setup

Requirements: Node.js 22+, Android Studio, Android SDK, and Java 21.

```bash
npm install
npm run android:prepare
```

The prepare command builds the frontend, creates the Android platform from `capacitor.config.ts`, and syncs the web assets.

After the first prepare:

```bash
npm run android:sync
npm run android:debug
```

The debug APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`.

The Android project is generated from the checked-in Capacitor configuration during CI rather than storing generated Gradle files in this web-first repository. Native customizations should be added to the generation process before relying on them.

## GitHub Actions APK builds

The **Android APK** workflow runs on pushes to `main`, version tags (`v*`), and manual dispatch from the Actions tab. It type-checks and builds the React app, generates Android assets from the existing NodeX icon, creates the Capacitor Android project, and builds both debug and release APK variants.

Download `NodeX-Android-APKs` from the completed workflow run's **Artifacts** section.

### APK signing

If no signing secrets are configured, CI signs the release variant with the runner's temporary Android debug key. This is suitable for personal installation/testing only. The key changes between CI runs, so a later APK may not be able to update an installation made from an earlier run. This is not a Play Store signing identity.

For a stable install/update identity, create and safely back up your own Android upload/release keystore, then add these repository Actions secrets:

- `ANDROID_KEYSTORE_BASE64`: the keystore file encoded as one base64 string
- `ANDROID_KEY_ALIAS`: the key alias inside the keystore
- `ANDROID_KEYSTORE_PASSWORD`: the keystore password
- `ANDROID_KEY_PASSWORD`: the key password

Never commit the keystore or its passwords to this repository. With all four secrets configured, CI signs the release APK using that persistent key and publishes the APK to GitHub Releases when a `v*` tag is pushed.

## App/backend connection

The Android app uses the same NodeX Settings screen and the same HTTPS/WSS backend URLs as the browser app. Save the backend URL and operator API key in the app's Settings after installation. The app remains in paper mode; this Capacitor integration does not enable wallet signing or real-money execution.
