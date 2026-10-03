'use client';

import { useEffect } from 'react';

declare global {
  interface Window {
    umami?: {
      track: (eventName: string) => void;
    };
  }
}

export function UmamiTracker() {
  useEffect(() => {
    // Wait for Umami to load
    const interval = setInterval(() => {
      if (window.umami) {
        window.umami.track(window.location.href.replace(/^https?:\/\//, ''));
        clearInterval(interval);
      }
    }, 100);

    // Cleanup
    return () => clearInterval(interval);
  }, []);

  return null;
}
