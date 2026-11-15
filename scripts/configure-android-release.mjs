import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const gradlePath = join(process.cwd(), 'android', 'app', 'build.gradle');
let gradle = readFileSync(gradlePath, 'utf8');

const releaseMatch = /release\\s*\\{/m.exec(gradle);
if (!releaseMatch) {
  throw new Error('Could not find the Android release buildType in android/app/build.gradle.');
}

const blockStart = releaseMatch.index + releaseMatch[0].length;
let depth = 1;
let blockEnd = -1;
for (let index = blockStart; index < gradle.length; index += 1) {
  if (gradle[index] === '{') depth += 1;
  if (gradle[index] === '}') depth -= 1;
  if (depth === 0) {
    blockEnd = index;
    break;
  }
}
if (blockEnd < 0) throw new Error('Could not parse the Android release buildType block.');

let releaseBlock = gradle.slice(blockStart, blockEnd);
releaseBlock = releaseBlock.replace(/^\\s*minifyEnabled\\s+false\\s*$/m, '');
releaseBlock = releaseBlock.replace(/^\\s*shrinkResources\\s+false\\s*$/m, '');
releaseBlock = releaseBlock.replace(
  /getDefaultProguardFile\\(['"]proguard-android(?:-optimize)?\\.txt['"]\\)/,
  "getDefaultProguardFile('proguard-android-optimize.txt')",
);

if (!/^\\s*minifyEnabled\\s+true\\s*$/m.test(releaseBlock)) {
  releaseBlock = "    minifyEnabled true\\n" + releaseBlock;
}
if (!/^\\s*shrinkResources\\s+true\\s*$/m.test(releaseBlock)) {
  releaseBlock = "    shrinkResources true\\n" + releaseBlock;
}
if (!releaseBlock.includes("getDefaultProguardFile('proguard-android-optimize.txt')")) {
  releaseBlock = "    proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'\\n" + releaseBlock;
}

gradle = gradle.slice(0, blockStart) + releaseBlock + gradle.slice(blockEnd);
writeFileSync(gradlePath, gradle);
console.log('Android Release optimization enabled: R8 minification, resource shrinking, and optimized ProGuard defaults.');
console.log(gradle.slice(releaseMatch.index, Math.min(gradle.length, releaseMatch.index + releaseBlock.length + 2)));
