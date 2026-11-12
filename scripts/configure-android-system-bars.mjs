import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const javaPath = join(
  process.cwd(),
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'happyiyate',
  'nodex',
  'MainActivity.java',
);

let source = readFileSync(javaPath, 'utf8');

if (!source.includes('configureNodeXSystemBars')) {
  const classOpen = source.indexOf('{', source.indexOf('class MainActivity'));
  if (classOpen < 0) throw new Error('Could not locate MainActivity class body.');

  const method = `
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        configureNodeXSystemBars();
    }

    private void configureNodeXSystemBars() {
        getWindow().setStatusBarColor(android.graphics.Color.BLACK);
        getWindow().setNavigationBarColor(android.graphics.Color.BLACK);
        getWindow().getDecorView().setSystemUiVisibility(0);
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
            getWindow().setStatusBarContrastEnforced(false);
            getWindow().setNavigationBarContrastEnforced(false);
        }
    }
`;

  source = source.slice(0, classOpen + 1) + method + source.slice(classOpen + 1);
  writeFileSync(javaPath, source);
  console.log('Configured NodeX status and navigation bars to use black with contrast scrims disabled.');
} else {
  console.log('NodeX system bar configuration already present.');
}
