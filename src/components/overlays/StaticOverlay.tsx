import { ReactNode } from 'react';
import styles from './AdvancedOverlay.module.css';

type StaticOverlayProps = {
  children?: ReactNode;
  variant?: 'fullscreen' | 'content' | 'minimal';
  backgroundColor?: string;
  className?: string;
  isVisible?: boolean;
};

export const StaticOverlay = ({
  children,
  variant = 'fullscreen',
  backgroundColor,
  className = '',
  isVisible = true,
}: StaticOverlayProps) => {
  if (!isVisible) return null;

  return (
    <div className={`${styles.outerAdvancedOverlayContainer} ${styles[variant]} ${className}`}>
      <div className={styles.innerAdvancedOverlayContainer}>
        <div
          className={`${styles.advancedOverlay} ${styles.loading}`}
          style={backgroundColor ? { backgroundColor } : undefined}
        >
          <div className={styles.advancedOverlayInnerContainer}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};
