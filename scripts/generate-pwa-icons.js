import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const publicIconsDir = path.resolve('public/icons');
const svgPath = path.join(publicIconsDir, 'icon.svg');

if (!fs.existsSync(publicIconsDir)) {
  fs.mkdirSync(publicIconsDir, { recursive: true });
}

async function generateIcons() {
  console.log('Rendering PWA icons from SVG...');
  const svgBuffer = fs.readFileSync(svgPath);

  // 192x192 standard icon
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.join(publicIconsDir, 'icon-192.png'));
  console.log('✓ icon-192.png created');

  // 512x512 standard icon
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(publicIconsDir, 'icon-512.png'));
  console.log('✓ icon-512.png created');

  // 180x180 Apple touch icon
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.join(publicIconsDir, 'apple-touch-icon.png'));
  console.log('✓ apple-touch-icon.png created');

  // 512x512 Maskable icon (with 10% inner padding so critical content stays within circular safe zone)
  const innerIcon = await sharp(svgBuffer)
    .resize(410, 410)
    .toBuffer();

  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 8, g: 8, b: 8, alpha: 1 }
    }
  })
    .composite([{ input: innerIcon, gravity: 'center' }])
    .png()
    .toFile(path.join(publicIconsDir, 'icon-maskable-512.png'));
  console.log('✓ icon-maskable-512.png created');

  // Also copy to root public for convenience
  fs.copyFileSync(path.join(publicIconsDir, 'apple-touch-icon.png'), path.resolve('public/apple-touch-icon.png'));
  fs.copyFileSync(path.join(publicIconsDir, 'icon-192.png'), path.resolve('public/pwa-192x192.png'));
  fs.copyFileSync(path.join(publicIconsDir, 'icon-512.png'), path.resolve('public/pwa-512x512.png'));
  fs.copyFileSync(path.join(publicIconsDir, 'icon.svg'), path.resolve('public/favicon.svg'));

  console.log('All PWA icon assets generated successfully!');
}

generateIcons().catch((err) => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
