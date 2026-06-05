'use client';

import { useEffect } from 'react';

export function ServiceWorkerInit() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .catch(err => console.warn('Service Worker failed:', err));
    }
  }, []);

  return null;
}