"use client";

import { DeviceLayout } from "@/components/device-layout/DeviceLayout";
import { useW1FullscreenElement } from "@/hooks";
import { useBoundStore } from "@/stores/boundStore";
import styles from "@/styles/modules/landingpage/landingpage.module.css";
import { DeviceInfoTracker } from "@werk1/w1-system-device-info";
import {
  ScrollTriggerManager,
  useRegisterW1GSAPScrollTriggerPlugin,
  useScrollTriggerDeviceInfoSync,
} from "@werk1/w1-system-gsap-scroll";
import { useRegisterW1GSAPDraggablePlugin } from "@werk1/w1-system-gsap-gesture";
import { setupMediaManager } from "@werk1/w1-system-media-manager";
import { Children, useEffect, useMemo, useState } from "react";
import { GSAPRuntimeProvider } from "./GSAPRuntimeContext";
import { GlobalOverlays } from "../overlays";

// SCROLLTRIGGER PLUGIN REGISTRATION NOW CENTRALIZED VIA useRegisterScrollTriggerPlugin HOOK
// VIDEO COORDINATION NOW INTEGRATED INTO BOUND STORE

interface ClientLayoutProps {
  children?: React.ReactNode
  /**
   * Render and show the children on the server and on the first client
   * render instead of waiting for device detection. For routes whose content
   * is device-independent at first paint and SSR-safe (the flipbook reader
   * and listing). Default false keeps the device-gated behaviour.
   */
  renderBeforeDeviceReady?: boolean
}

const ClientLayout = ({
  children,
  renderBeforeDeviceReady = false,
}: ClientLayoutProps) => {
  // Local loading state for smooth overlay transitions
  const [isInitializing, setIsInitializing] = useState(true);
  const { initializeConstants, updateDeviceInfo } = useBoundStore();

  // Get device info from bound store
  const deviceInfo = useBoundStore((state) => state.device);
  const {
    is_devicePP,
    is_devicePL,
    is_deviceD,
    isReady,
  } = deviceInfo;

  // Get overlay state for global overlay control (BACKUP - now managed by store)
  const { isFullscreen } = useW1FullscreenElement();

  const isScrollTriggerReady = useRegisterW1GSAPScrollTriggerPlugin();
  const isGestureReady = useRegisterW1GSAPDraggablePlugin();

  // Enable device-info driven ScrollTrigger refresh
  const scrollSyncDeviceInfo = deviceInfo as unknown as Parameters<
    typeof useScrollTriggerDeviceInfoSync
  >[0];
  useScrollTriggerDeviceInfoSync(scrollSyncDeviceInfo, {
    significantChangesOnly: true,
    debounceMs: 300,
  });


  useEffect(() => {
    useBoundStore.persist.rehydrate();
    initializeConstants();
    updateDeviceInfo();
    // GSAP plugins now registered via hooks (useRegisterScrollTriggerPlugin, useRegisterDraggablePlugin)
    // Initialize MediaManager
    try {
      setupMediaManager(useBoundStore, {
        apiConfig: { baseUrl: "/api" },
      });
      (
        window as typeof window & { __W1_BOUND_STORE__: typeof useBoundStore }
      ).__W1_BOUND_STORE__ = useBoundStore;
      // MediaManager and bound store initialized successfully
    } catch (error) {
      console.error("Failed to initialize MediaManager:", error);
    }
  }, []); // ← LEERES ARRAY! Läuft nur einmal beim Mount
  // --------------------------------

  // Update loading state when device info is ready
  useEffect(() => {
    if (isReady) {
      setIsInitializing(false);
    }
  }, [isReady]);

  // Show main content when device is ready OR when we're fading out the overlay
  const showMainContent = renderBeforeDeviceReady || isReady || !isInitializing;
  const hasChildren = Children.count(children) > 0;
  const showSetupHint = process.env.NODE_ENV === "development" && !hasChildren;
  const gsapRuntimeValue = useMemo(
    () => ({
      isGestureReady,
      isScrollTriggerReady,
    }),
    [isGestureReady, isScrollTriggerReady],
  );

  return (
    <GSAPRuntimeProvider value={gsapRuntimeValue}>
      {/* Global ScrollTrigger Manager from @werk1/w1-system-gsap-scroll */}
      <ScrollTriggerManager
        config={{
          // enableDebugLogging: process.env.NODE_ENV === 'development',
          enableDebugLogging: false,
          initialRefreshDelay: 100,
          refreshDebounce: 200,
          productionInterval: 1000,
          productionDuration: 5000,
        }}
      />

      <GlobalOverlays />

      {showSetupHint && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            paddingLeft: "1.5rem",
            paddingRight: "1.5rem",
            textAlign: "center",
            color: "#1f1f1f",
            fontSize: "0.95rem",
            letterSpacing: "0.01em",
            zIndex: 20,
            pointerEvents: "none",
          }}
        >
          Keine Seiten-Komponente eingebunden - bitte Inhalt als `children` an `ClientLayout` uebergeben.
        </div>
      )}

      {/* Conditional rendering - only when ready */}
      {showMainContent && (
        <DeviceLayout>
          {/* Device info tracker for automatic responsive updates - v1.3.0 Performance Optimized */}
          <DeviceInfoTracker boundStore={useBoundStore} />
          {/* Main content */}
          <div
            className={`${styles.mainContent} ${
              renderBeforeDeviceReady || is_devicePP || is_devicePL || is_deviceD || isFullscreen || showSetupHint
                ? styles.mainContentVisible
                : styles.mainContentHidden
            }`}
          >
            {children}
          </div>
        </DeviceLayout>
      )}
    </GSAPRuntimeProvider>
  );
};

export default ClientLayout;
