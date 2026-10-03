'use client'

import type { ReactNode } from 'react'
import type { W1FlipbookToolbarControls } from '@werk1/w1-system-flipbook'
import { pickLogoVariants, type ClientLogo } from '@/lib/theme/clientLogoVariants'
import { FlipbookToolbar } from './FlipbookToolbar'
import styles from './FlipbookSideChrome.module.css'

/**
 * Start column of the phone-landscape reader (`chromeLayout="side"`). One
 * slim bar so the double spread keeps its width: pictogram of the client on
 * top, the viewer controls as icon buttons at the bottom and below them the
 * page counter as a fraction (pages over page count).
 */
export function FlipbookSideChrome({
  controls,
  title,
  logo,
  status,
}: {
  controls: W1FlipbookToolbarControls
  /** Client name; its initial stands in until a pictogram is set. */
  title?: string
  /** Client marks from Site Settings; the pictogram fills the top slot. */
  logo?: ClientLogo
  status?: ReactNode
}) {
  const { navigation } = controls
  const { main: picto, dark: pictoDark } = pickLogoVariants(logo?.pictogramPositive, logo?.pictogramNegative)
  const initial = title?.trim().charAt(0).toUpperCase()
  return (
    <div className={styles.sideChrome}>
      {/* Decorative; the viewer announces pages through its own status region. */}
      <div className={styles.pictogram} title={title} aria-hidden="true">
        {picto ? (
          <picture>
            {pictoDark && <source srcSet={pictoDark.url} media="(prefers-color-scheme: dark)" />}
            <img src={picto.url} alt="" />
          </picture>
        ) : (
          // No pictogram yet: the initial as a round badge in the primary colour.
          initial && <span className={styles.initial}>{initial}</span>
        )}
      </div>
      <div className={styles.status} aria-live="polite">
        {status}
      </div>
      <div className={styles.tools}>
        <FlipbookToolbar controls={controls} orientation="vertical" />
      </div>
      {/* Counter as a fraction below the icons: pages over the page count. */}
      <p className={styles.counter} title={navigation.counter} aria-hidden="true" data-testid="flipbook-side-counter">
        <span>{navigation.range}</span>
        <span className={styles.counterRule} />
        <span>{navigation.count}</span>
      </p>
    </div>
  )
}
