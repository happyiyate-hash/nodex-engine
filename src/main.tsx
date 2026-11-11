import { Capacitor } from '@capacitor/core';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(<App />);

// Register Service Worker for PWA support & offline caching
if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('[NodeX PWA] ServiceWorker active with scope:', registration.scope);
      })
      .catch((error) => {
        console.warn('[NodeX PWA] ServiceWorker registration failed:', error);
      });
  });
}

