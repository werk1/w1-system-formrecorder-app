'use client'

import { W1Button } from '@werk1/w1-system-ui'
import type { W1FlipbookToolbarControls } from '@werk1/w1-system-flipbook'
import { DevToolsButton } from './dev/DevToolsButton'
import { IS_DEV } from './dev/devCurlTuning'
import styles from './FlipbookToolbar.module.css'

function ToolButton({
  icon,
  label,
  onClick,
  pressed,
  disabled,
}: {
  icon: string
  label: string
  onClick: () => void
  pressed?: boolean
  disabled?: boolean
}) {
  return (
    <W1Button
      type="button"
      icon={icon}
      aria-label={label}
      title={label}
      onClick={onClick}
      pressed={pressed}
      disabled={disabled}
      appearance="ghost"
      tone="neutral"
      padding="xs"
      lineWidth="none"
      size="m"
      className={styles.tool}
    />
  )
}

/**
 * Viewer controls as W1 UI icon buttons (w1-system-ui `W1Button` + Lucide
 * icons): PDF, thumbnails, single/double page, zoom out/in, fullscreen.
 */
export function FlipbookToolbar({
  controls,
  orientation = 'horizontal',
  showThumbnails = true,
  showPdf = false,
}: {
  controls: W1FlipbookToolbarControls
  /** `vertical` stacks the buttons (icon column of the side arrangement). */
  orientation?: 'horizontal' | 'vertical'
  /** Thumbnail toggle; off where the navigation widget carries it. */
  showThumbnails?: boolean
  /** PDF link as an icon button (top bar). */
  showPdf?: boolean
}) {
  const { zoom, fullscreen, thumbnails, spread, labels, pdf } = controls
  return (
    <div className={orientation === 'vertical' ? `${styles.tools} ${styles.toolsVertical}` : styles.tools}>
      {showPdf && (
        <W1Button
          as="a"
          href={pdf.url}
          target="_blank"
          rel="noopener noreferrer"
          icon="file_pdf"
          aria-label={pdf.label}
          title={pdf.label}
          appearance="ghost"
          tone="neutral"
          padding="xs"
          lineWidth="none"
          size="m"
          className={styles.tool}
        />
      )}
      {showThumbnails && thumbnails.enabled && (
        <ToolButton icon="gallery_strip" label={labels.thumbnails} onClick={thumbnails.toggle} pressed={thumbnails.open} />
      )}
      {spread.enabled && (
        <ToolButton
          icon={spread.mode === 'double' ? 'page_single' : 'page_double'}
          label={spread.mode === 'double' ? (labels.spreadSingle ?? 'Single page view') : (labels.spreadDouble ?? 'Two page view')}
          onClick={spread.toggle}
        />
      )}
      {zoom.enabled && (
        // One zoom step: the magnifier zooms in, and out again while zoomed.
        <ToolButton
          icon={zoom.active ? 'zoom_out' : 'zoom_in'}
          label={zoom.active ? labels.zoomOut : labels.zoomIn}
          onClick={zoom.active ? zoom.zoomOut : zoom.zoomIn}
          pressed={zoom.active}
        />
      )}
      {fullscreen.enabled && (
        <ToolButton
          icon={fullscreen.active ? 'shrink' : 'expand'}
          label={fullscreen.active ? labels.exitFullscreen : labels.fullscreen}
          onClick={fullscreen.toggle}
          pressed={fullscreen.active}
        />
      )}
      {/* Dev only (next dev): shader tuning and colour scheme editor. */}
      {IS_DEV && <DevToolsButton className={styles.tool} />}
    </div>
  )
}

/** Slim top bar with only the viewer controls (deep link, page sections). */
export function FlipbookToolbarBar({ controls }: { controls: W1FlipbookToolbarControls }) {
  return (
    <div className={styles.bar}>
      {/* The thumbnail toggle sits in the navigation widget below. */}
      <FlipbookToolbar controls={controls} showThumbnails={false} showPdf />
    </div>
  )
}

/** Stable `renderToolbar` callback for embeds without the flipbook menu. */
export const renderFlipbookToolbarBar = (controls: W1FlipbookToolbarControls) => <FlipbookToolbarBar controls={controls} />
