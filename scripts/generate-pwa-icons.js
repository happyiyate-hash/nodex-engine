import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const sourceIcon = path.join(projectRoot, 'assets', 'icon.png');
const sourceSplash = path.join(projectRoot, 'assets', 'splash.png');
const publicIconsDir = path.join(projectRoot, 'public', 'icons');

for (const [label, filePath] of [['launcher icon', sourceIcon], ['splash artwork', sourceSplash]]) {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
    throw new Error(`Missing required NodeX ${label}: ${path.relative(projectRoot, filePath)}`);
  }
}

fs.mkdirSync(publicIconsDir, { recursive: true });

async function generateIcons() {
  console.log('Generating every web/PWA icon from assets/icon.png...');

  await sharp(sourceIcon).resize(192, 192, { fit: 'contain', background: '#000000' })
    .png().toFile(path.join(publicIconsDir, 'icon-192.png'));
  await sharp(sourceIcon).resize(512, 512, { fit: 'contain', background: '#000000' })
    .png().toFile(path.join(publicIconsDir, 'icon-512.png'));
  await sharp(sourceIcon).resize(180, 180, { fit: 'contain', background: '#000000' })
    .png().toFile(path.join(publicIconsDir, 'apple-touch-icon.png'));

  const maskableIcon = await sharp(sourceIcon)
    .resize(410, 410, { fit: 'contain', background: '#080808' })
    .png().toBuffer();

  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 8, g: 8, b: 8, alpha: 1 },
    },
  })
    .composite([{ input: maskableIcon, gravity: 'center' }])
    .png()
    .toFile(path.join(publicIconsDir, 'icon-maskable-512.png'));

  await sharp(sourceIcon)
    .resize(64, 64, { fit: 'contain', background: '#000000' })
    .png()
    .toFile(path.join(projectRoot, 'public', 'favicon.png'));

  fs.copyFileSync(path.join(publicIconsDir, 'icon-192.png'), path.join(projectRoot, 'public', 'pwa-192x192.png'));
  fs.copyFileSync(path.join(publicIconsDir, 'icon-512.png'), path.join(projectRoot, 'public', 'pwa-512x512.png'));

  console.log('Web/PWA icons generated from assets/icon.png. Android splash artwork source: assets/splash.png.');
}

generateIcons().catch((error) => {
  console.error('NodeX artwork generation failed:', error);
  process.exit(1);
});
