'use client';
import { type DeviceInfo } from '@werk1/w1-system-device-info';
import { W1GSAPScrollTriggerState } from '@werk1/w1-system-gsap-scroll';
import { gsap } from 'gsap';
import { ReactNode, useEffect, useRef, useState } from 'react';
import defaultStyles from './AdvancedOverlay.module.css';

// Track active overlays so body locking is released only when all are done.
let bodyLockCount = 0;

const lockBodyInteraction = () => {
  if (typeof document === 'undefined') return;

  document.body.style.overflow = 'hidden';
  document.body.style.touchAction = 'none';
  document.body.style.userSelect = 'none';
  document.body.style.setProperty('-webkit-user-select', 'none');
  document.body.style.setProperty('-ms-user-select', 'none');
  document.body.style.setProperty('-webkit-touch-callout', 'none');

  document.documentElement.style.overflow = 'hidden';
  document.documentElement.style.touchAction = 'none';
};

const unlockBodyInteraction = () => {
  if (typeof document === 'undefined') return;

  document.body.style.overflow = '';
  document.body.style.touchAction = '';
  document.body.style.userSelect = '';
  document.body.style.removeProperty('-webkit-user-select');
  document.body.style.removeProperty('-ms-user-select');
  document.body.style.removeProperty('-webkit-touch-callout');

  document.documentElement.style.overflow = '';
  document.documentElement.style.touchAction = '';
};

interface AdvancedOverlayProps {
  scrollTriggerState?: W1GSAPScrollTriggerState;
  deviceInfo?: DeviceInfo;
  singleCSSCustomClass?: string;               // Single CSS class for custom styling
  externalCSSModule?: typeof defaultStyles;    // Complete CSS module replacement
  children?: ReactNode;
  // Loading props
  isLoading: boolean;
  variant?: 'fullscreen' | 'content' | 'minimal';
  backgroundColor?: string;
  opacity?: number;
  unmountOnExit?: boolean;
  // Animation props
  fadeInDuration?: number;
  fadeOutDuration?: number;
  fadeInDelay?: number;
  fadeOutDelay?: number;
  animationEase?: string;
}

export const AdvancedOverlay = ({
  singleCSSCustomClass = '',
  externalCSSModule,
  children,
  scrollTriggerState,
  isLoading,
  variant = 'content',
  backgroundColor,
  opacity = 0.95,
  fadeInDuration = 0.3,
  fadeOutDuration = 0.4,
  fadeInDelay = 0.15,
  fadeOutDelay = 0.1,
  animationEase = 'power2.out',
  unmountOnExit = true
}: AdvancedOverlayProps) => {
  // Use external CSS module if provided, otherwise default
  const activeStyles = externalCSSModule || defaultStyles;

  const overlayRef = useRef<HTMLDivElement>(null);
  const previousLoadingState = useRef<boolean>(isLoading);
  const isLoadingRef = useRef<boolean>(isLoading);
  const [shouldRender, setShouldRender] = useState(isLoading || !unmountOnExit);

  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  useEffect(() => {
    if (isLoading || !unmountOnExit) {
      setShouldRender(true);
    }
  }, [isLoading, unmountOnExit]);

  // Block all body interactions when overlay is active
  useEffect(() => {
    if (!isLoading) return;

    bodyLockCount += 1;
    if (bodyLockCount === 1) {
      lockBodyInteraction();
    }

    return () => {
      bodyLockCount = Math.max(0, bodyLockCount - 1);
      if (bodyLockCount === 0) {
        unlockBodyInteraction();
      }
    };
  }, [isLoading]);

  // GSAP animation for smooth fade in/out (iOS-optimized)
  useEffect(() => {
    if (!overlayRef.current || !shouldRender) return;

    const overlay = overlayRef.current;

    // Loading state changed
    if (isLoading !== previousLoadingState.current) {
      gsap.killTweensOf(overlay);
      if (isLoading) {
        // Fade in overlay (iOS-safe)
        gsap.set(overlay, {
          display: 'flex',
          opacity: 0,
          pointerEvents: 'auto',
          // iOS hardware acceleration
          force3D: true,
          z: 0.01
        });
        gsap.to(overlay, {
          opacity: opacity,
          duration: fadeInDuration,
          delay: fadeInDelay,
          ease: animationEase,
          force3D: true,
          // iOS-specific callbacks
          onStart: () => {
            if (typeof window !== 'undefined' && window.navigator.userAgent.includes('iPhone')) {
              overlay.style.transform = 'translate3d(0,0,0)';
            }
          }
        });
      } else {
        // Fade out overlay (iOS-safe)
        gsap.to(overlay, {
          opacity: 0,
          duration: fadeOutDuration,
          delay: fadeOutDelay,
          ease: animationEase,
          force3D: true,
          onComplete: () => {
            gsap.set(overlay, {
              display: 'none',
              pointerEvents: 'none',
              clearProps: 'transform'
            });
            if (unmountOnExit && !isLoadingRef.current) {
              setShouldRender(false);
            }
          }
        });
      }
      previousLoadingState.current = isLoading;
    } else if (isLoading) {
      gsap.set(overlay, {
        display: 'flex',
        opacity: opacity,
        pointerEvents: 'auto'
      });
    } else if (!isLoading) {
      gsap.set(overlay, {
        display: 'none',
        opacity: 0,
        pointerEvents: 'none'
      });
    }
  }, [isLoading, opacity, fadeInDuration, fadeOutDuration, fadeInDelay, fadeOutDelay, animationEase, shouldRender, unmountOnExit]);

  // Combine CSS classes
  const overlayClasses = [
    activeStyles.outerAdvancedOverlayContainer,
    activeStyles[variant],
    singleCSSCustomClass
  ].filter(Boolean).join(' ');

  if (!shouldRender) {
    return null;
  }

  return (
    <div
      className={overlayClasses}
      ref={scrollTriggerState?.ref}
    >
      <div className={activeStyles.innerAdvancedOverlayContainer}>
        <div
          ref={overlayRef}
          className={`${activeStyles.advancedOverlay} ${isLoading ? activeStyles.loading : ''}`}
          style={{
            backgroundColor: backgroundColor || undefined
          }}
        >
          <div className={activeStyles.advancedOverlayInnerContainer}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
