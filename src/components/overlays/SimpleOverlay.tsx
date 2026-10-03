// components/landscape-overlay/SimpleOverlay.tsx
'use client';

import { ReactNode, useRef } from 'react';
import styles from './SimpleOverlay.module.css';

interface SimpleOverlayProps {
  isVisible: boolean;
  children: ReactNode;
  className?: string;
  preventScrolling?: boolean;
  backdropBlur?: boolean;
  animation?: 'fade' | 'slide' | 'none';
}

export const SimpleOverlay = ({
  isVisible,
  children,
  className = '',
  preventScrolling = true,
  backdropBlur = false,
  animation = 'fade'
}: SimpleOverlayProps) => {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Kein useEffect mehr nötig!

  if (!isVisible) return null;

  return (
    <div
      ref={overlayRef}
      className={`
        ${styles.simpleOverlayOuterContainer}
        ${animation !== 'none' ? styles[`animation-${animation}`] : ''}
        ${backdropBlur ? styles.backdropBlur : ''}
        ${className}
      `}
      role="dialog"
      aria-modal="true"
      aria-label="Landscape orientation overlay"
      onTouchMove={(e) => preventScrolling && e.preventDefault()}
      onWheel={(e) => preventScrolling && e.preventDefault()}
    >
      <div className={styles.simpleOverlayInnerContainer}>
        {children}
      </div>
    </div>
  );
};
