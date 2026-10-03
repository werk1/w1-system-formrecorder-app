'use client';

import { SpinnerProgressIndicator } from '@/components/progress-indicators';
import { useBoundStore } from '@/stores/boundStore';
import W1DesignLogo from '@/w1-system-ui/w1-logos/W1DesignLogo';
import { ReactNode } from 'react';
import { AdvancedOverlay } from './AdvancedOverlay';
import { SimpleOverlay } from './SimpleOverlay';

// Central overlay host driven by store flags.
// Loading takes priority over the generic overlay when both are active.
/**
 * Configuration for AdvancedOverlay instances rendered by GlobalOverlays.
 * `children: null` suppresses the default spinner content.
 */
type AdvancedOverlayConfig = {
  variant?: 'fullscreen' | 'content' | 'minimal';
  backgroundColor?: string;
  opacity?: number;
  fadeInDuration?: number;
  fadeOutDuration?: number;
  fadeInDelay?: number;
  fadeOutDelay?: number;
  animationEase?: string;
  singleCSSCustomClass?: string;
  externalCSSModule?: Record<string, string>;
  unmountOnExit?: boolean;
  children?: ReactNode;
  spinnerSize?: number;
};

/**
 * Configuration for SimpleOverlay instance rendered by GlobalOverlays.
 * `children: null` suppresses the default landscape logo.
 */
type SimpleOverlayConfig = {
  className?: string;
  preventScrolling?: boolean;
  backdropBlur?: boolean;
  animation?: 'fade' | 'slide' | 'none';
  children?: ReactNode;
};

/**
 * Global overlay host configuration.
 * Loading overlay takes priority over the generic overlay when both are active.
 */
type GlobalOverlaysProps = {
  loading?: AdvancedOverlayConfig;
  overlay?: AdvancedOverlayConfig;
  landscape?: SimpleOverlayConfig;
};

const defaultLoadingConfig: AdvancedOverlayConfig = {
  variant: 'fullscreen',
  backgroundColor: 'rgba(255, 255, 255, 0.95)',
  opacity: 1,
  spinnerSize: 60,
};

const defaultOverlayConfig: AdvancedOverlayConfig = {
  variant: 'fullscreen',
  backgroundColor: 'rgba(255, 255, 255, 0.95)',
  opacity: 1,
  spinnerSize: 40,
};

const defaultLandscapeConfig: SimpleOverlayConfig = {
  animation: 'fade',
  backdropBlur: false,
  preventScrolling: true,
};

export const GlobalOverlays = ({
  loading,
  overlay,
  landscape,
}: GlobalOverlaysProps) => {
  const deviceInfo = useBoundStore((state) => state.device);
  const showOverlay = useBoundStore((state) => state.ui.showOverlay);
  const showLoadingOverlay = useBoundStore((state) => state.ui.showLoadingOverlay);
  const showLandscapeOverlay = useBoundStore((state) => state.ui.showLandscapeOverlay);

  const activeOverlayKey = showLoadingOverlay ? 'loading' : showOverlay ? 'overlay' : null;
  const isAdvancedVisible = activeOverlayKey !== null;

  const mergedLoadingConfig = { ...defaultLoadingConfig, ...loading };
  const mergedOverlayConfig = { ...defaultOverlayConfig, ...overlay };
  const activeAdvancedConfig =
    activeOverlayKey === 'loading' ? mergedLoadingConfig : mergedOverlayConfig;

  const {
    children: activeChildren,
    spinnerSize: activeSpinnerSize,
    ...activeAdvancedProps
  } = activeAdvancedConfig;

  const mergedLandscapeConfig = { ...defaultLandscapeConfig, ...landscape };
  const {
    children: landscapeChildren,
    ...landscapeProps
  } = mergedLandscapeConfig;

  // Allow children: null to explicitly suppress the default spinner.
  const hasCustomChildren = Object.prototype.hasOwnProperty.call(
    activeAdvancedConfig,
    'children',
  );
  const hasLandscapeChildren = Object.prototype.hasOwnProperty.call(
    mergedLandscapeConfig,
    'children',
  );
  const fallbackChildren = (
    <SpinnerProgressIndicator size={activeSpinnerSize || 40} />
  );

  return (
    <>
      {showLandscapeOverlay && (
        <SimpleOverlay isVisible={showLandscapeOverlay} {...landscapeProps}>
          {hasLandscapeChildren ? landscapeChildren : <W1DesignLogo width={120} />}
        </SimpleOverlay>
      )}
      <AdvancedOverlay
        deviceInfo={deviceInfo}
        isLoading={isAdvancedVisible}
        {...activeAdvancedProps}
      >
        {hasCustomChildren ? activeChildren : fallbackChildren}
      </AdvancedOverlay>
    </>
  );
};
