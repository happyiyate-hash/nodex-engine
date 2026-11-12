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

## GitHub Actions Release APK builds

The **Android APK** workflow (`.github/workflows/android-apk.yml`) runs on pushes to `main`, version tags (`v*`), and manual dispatch from the GitHub Actions tab. It type-checks and builds the React app, prepares Capacitor Android assets, builds the **Release APK** with Gradle, 4-byte page-aligns the APK with `zipalign`, signs it with `apksigner` (V1, V2, and V3 signatures enabled), and uploads `NodeX-Android-Release-APK`.

Download `NodeX-Android-Release-APK` from the completed workflow run's **Artifacts** section, or find it directly under GitHub Releases when a `v*` tag is pushed.

### APK signing

- **Without secrets**: CI automatically creates a valid release keystore and signs the Release APK.
- **With persistent secrets**: To use your own release key so that app updates install seamlessly over previous versions without needing to uninstall, add these GitHub Repository Secrets (**Settings** > **Secrets and variables** > **Actions**):
  - `ANDROID_KEYSTORE_BASE64`: Your release keystore file encoded in base64.
    - On Linux/macOS: `base64 -w 0 nodex-release.keystore` (or `base64 -i nodex-release.keystore` on macOS)
    - On Windows (PowerShell): `[Convert]::ToBase64String([IO.File]::ReadAllBytes("nodex-release.keystore"))`
  - `ANDROID_KEYSTORE_PASSWORD`: The keystore password.
  - `ANDROID_KEY_ALIAS`: The key alias (e.g. `nodex-release`).
  - `ANDROID_KEY_PASSWORD`: The key password (or leave empty if it matches the keystore password).

To generate a PKCS12 release keystore locally:
```bash
keytool -genkeypair -v -keystore nodex-release.keystore -storetype PKCS12 -alias nodex-release -keyalg RSA -keysize 2048 -validity 10000
```
*(Note: With modern PKCS12 keystores, the keystore password and key password are identical, avoiding `BadPaddingException`)*

## App/backend connection

The Android app uses the same NodeX Settings screen and the same HTTPS/WSS backend URLs as the browser app. Save the backend URL and operator API key in the app's Settings after installation. The app remains in paper mode; this Capacitor integration does not enable wallet signing or real-money execution.
