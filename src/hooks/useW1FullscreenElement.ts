'use client'

import { RefObject, useEffect, useState } from 'react'

/**
 * useVideoFullscreen Hook
 *
 * Tracks global fullscreen state and provides fullscreen control functionality.
 *
 * ## Primary Use Cases:
 *
 * ### 1. UI Layout Adjustments (Most Common)
 * Used in ClientLayout to hide overlays when any video goes fullscreen:
 * ```typescript
 * const { isFullscreen } = useVideoFullscreen(); // No ref needed
 * const showLandscapeOverlay = is_devicePL && !isFullscreen;
 *
 * // Hides WERK1Logo overlay during fullscreen video
 * {showLandscapeOverlay && (
 *   <div className={styles.landscapeContainer}>
 *     <WERK1Logo className={styles.eggImage} />
 *   </div>
 * )}
 * ```
 *
 * ### 2. Direct Video Control (Advanced)
 * Can control specific video elements when ref is provided:
 * ```typescript
 * const videoRef = useRef<HTMLVideoElement>(null);
 * const { isFullscreen, toggleFullscreen } = useVideoFullscreen(videoRef);
 *
 * <video ref={videoRef} />
 * <button onClick={toggleFullscreen}>Toggle Fullscreen</button>
 * ```
 *
 * ## Integration with W1VideoBlock:
 *
 * - W1VideoBlock handles its own fullscreen controls internally
 * - This hook tracks when W1VideoBlock (or any element) goes fullscreen
 * - No direct integration needed - they work together via browser fullscreen events
 * - Used for UI state management, not video control
 *
 * ## Browser Compatibility:
 *
 * Supports all major browsers with fallbacks:
 * - Standard: `requestFullscreen()`, `exitFullscreen()`
 * - Webkit (Safari): `webkitRequestFullscreen()`, `webkitExitFullscreen()`
 * - Mozilla (Firefox): `mozRequestFullScreen()`, `mozCancelFullScreen()`
 * - Microsoft (Edge): `msRequestFullscreen()`, `msExitFullscreen()`
 *
 * ## Features:
 *
 * - Cross-browser fullscreen detection
 * - SessionStorage persistence across page reloads
 * - Custom events for real-time component communication
 * - Generic typing for any HTML element
 * - Automatic cleanup of event listeners
 *
 * @param videoRef Optional ref to HTML element for direct fullscreen control
 * @returns Object with fullscreen state and control functions
 */

// Define proper interfaces for browser-specific fullscreen properties
interface W1FullscreenDocument extends Document {
  webkitFullscreenElement?: Element | null
  mozFullScreenElement?: Element | null
  msFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void>
  mozCancelFullScreen?: () => Promise<void>
  msExitFullscreen?: () => Promise<void>
}

interface W1FullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void>
  mozRequestFullScreen?: () => Promise<void>
  msRequestFullscreen?: () => Promise<void>
}

// Make the ref parameter more generic to accept any HTML element
export function useW1FullscreenElement<T extends HTMLElement = HTMLElement>(
  videoRef?: RefObject<T>,
) {
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    // Handle fullscreen change events
    const handleFullscreenChange = () => {
      const doc = document as W1FullscreenDocument
      const isDocFullscreen =
        doc.fullscreenElement ||
        doc.webkitFullscreenElement ||
        doc.mozFullScreenElement ||
        doc.msFullscreenElement

      setIsFullscreen(!!isDocFullscreen)

      // Update store with fullscreen state
      if (typeof window !== 'undefined') {
        // Update bound store if available
        const boundStore = (window as any).__W1_BOUND_STORE__
        if (boundStore?.getState?.()?.setIsFullscreen) {
          boundStore.getState().setIsFullscreen(!!isDocFullscreen)
        }

        // Signal to other components that video is in fullscreen
        window.sessionStorage.setItem(
          'videoFullscreen',
          isDocFullscreen ? 'true' : 'false',
        )

        // Also dispatch a custom event for components that may need real-time notification
        window.dispatchEvent(
          new CustomEvent('video-fullscreen-change', {
            detail: { isFullscreen: !!isDocFullscreen },
          }),
        )
      }
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
    document.addEventListener('mozfullscreenchange', handleFullscreenChange)
    document.addEventListener('MSFullscreenChange', handleFullscreenChange)

    // Check initial state
    if (typeof window !== 'undefined') {
      const fullscreenFlag = window.sessionStorage.getItem('videoFullscreen')
      setIsFullscreen(fullscreenFlag === 'true')
    }

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange)
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange)
    }
  }, [])

  // Function to request fullscreen
  const enterFullscreen = () => {
    if (!videoRef?.current) return

    const element = videoRef.current as W1FullscreenElement

    if (element.requestFullscreen) {
      element
        .requestFullscreen()
        .catch((err) => console.error('Error attempting to enable fullscreen:', err))
    } else if (element.webkitRequestFullscreen) {
      element.webkitRequestFullscreen()
    } else if (element.mozRequestFullScreen) {
      element.mozRequestFullScreen()
    } else if (element.msRequestFullscreen) {
      element.msRequestFullscreen()
    }
  }

  // Function to exit fullscreen
  const exitFullscreen = () => {
    const doc = document as W1FullscreenDocument

    if (doc.exitFullscreen) {
      doc
        .exitFullscreen()
        .catch((err) => console.error('Error attempting to exit fullscreen:', err))
    } else if (doc.webkitExitFullscreen) {
      doc.webkitExitFullscreen()
    } else if (doc.mozCancelFullScreen) {
      doc.mozCancelFullScreen()
    } else if (doc.msExitFullscreen) {
      doc.msExitFullscreen()
    }
  }

  // Function to toggle fullscreen
  const toggleFullscreen = () => {
    if (isFullscreen) {
      exitFullscreen()
    } else {
      enterFullscreen()
    }
  }

  return {
    isFullscreen,
    enterFullscreen,
    exitFullscreen,
    toggleFullscreen,
  }
}
