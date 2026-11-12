# Android app artwork

Place the two Android artwork source images in this folder:

- `icon.png` — NodeX launcher icon shown on the Android phone home screen.
- `splash.png` — NodeX artwork shown while the Android app opens.

Use PNG files and keep these exact filenames. The Android GitHub Actions workflow reads these files directly and generates the required Android icon and splash sizes automatically.

The existing `public/icons/` files remain the website/PWA icons; they are not used as the source for the Android launcher icon or splash artwork.

The Android build now checks that both files exist and stops with a clear error if either is missing. Upload the actual image files here before running the Android build.
