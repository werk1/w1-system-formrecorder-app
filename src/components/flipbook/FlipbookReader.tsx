'use client'

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { createFlipbookLabels } from '@/lib/blocks/flipbook/labels'
import type { FlipbookMenuItem } from '@/lib/blocks/flipbook/resolveFlipbookBlockInput'
import type { ClientLogo } from '@/lib/theme/clientLogoVariants'
import { useBoundStore } from '@/stores/boundStore'
import { W1FlipbookBlock, type W1FlipbookInput, type W1FlipbookToolbarControls } from '@werk1/w1-system-flipbook'
import { devCurlTuning, IS_DEV } from './dev/devCurlTuning'
import { FlipbookHeader } from './FlipbookHeader'
import { renderFlipbookNavigationColumn, renderFlipbookNavigationWidget } from './FlipbookNavigationWidget'
import styles from './FlipbookReader.module.css'
import { FlipbookSideChrome } from './FlipbookSideChrome'
import { renderFlipbookThumbnailRail } from './FlipbookThumbnailRail'
import { FlipbookToolbar, renderFlipbookToolbarBar } from './FlipbookToolbar'
import { readerDeviceClassNames, resolveReaderLayout } from './readerDevice'
import { W1SystemMark } from './W1SystemMark'

type FlipbookReaderProps = {
  input: W1FlipbookInput
  locale: string
  /** Header bar with the name or client logo and the viewer controls: the
   * Flipbook-Host homepage and the canonical deep link (`/flipbooks/[slug]`,
   * also used as the embed link) show it. The cross-flipbook menu needs
   * `items`, which only the homepage passes. Without the header a slim bar
   * holds the controls. */
  showHeader?: boolean
  items?: FlipbookMenuItem[]
  activeSlug?: string
  /** Name shown on top while Site Settings carry no client name (the flipbook title). */
  siteTitle?: string
  /** Issue label for the status bar (`issueOf`), e.g. "Nr. 7/27"; omitted when empty. */
  issue?: string
  /** Client name and marks from Site Settings: name or logo for the header, pictogram for the phone-landscape bar. */
  clientLogo?: ClientLogo
}

const subscribeNever = () => () => {}

// Fixed at the end of the status bar.
const W1_SYSTEM_MARK = <W1SystemMark />

/** False on the server and during hydration, true afterwards. */
function useHydrated() {
  return useSyncExternalStore(subscribeNever, () => true, () => false)
}

export function FlipbookReader({ input, locale, showHeader = false, items = [], activeSlug, siteTitle, issue, clientLogo }: FlipbookReaderProps) {
  const deviceInfo = useBoundStore((state) => state.device)
  const hydrated = useHydrated()

  // The structure is chosen once, here. Server render and hydration always
  // use the default structure; phone layouts follow once device-info is
  // ready. The viewer keeps its tree position in every layout, so switching
  // (device ready, rotation) changes the chrome without remounting it.
  const device = hydrated ? deviceInfo : undefined
  const layout = resolveReaderLayout(device)
  const deviceClasses = readerDeviceClassNames(device, layout)
  // Phone portrait: compact counter ("58–59 | 78") in the status bar.
  const compactCounter = layout === 'phonePortrait'
  const pageWord = clientLogo?.pageWord
  const labels = useMemo(
    () => createFlipbookLabels(locale, { compactCounter, pageWord }),
    [locale, compactCounter, pageWord],
  )

  // The client stands on top (name or logo). The status bar is fed from
  // Payload: the name as text (never a logo, bold), then the issue ("Nr.
  // 7/27", when set; bold, a little smaller), then the page counter (light).
  const brand = clientLogo?.name ?? siteTitle ?? ''
  const statusStart = useMemo(() => {
    const parts = [
      { key: 'name', text: brand, className: styles.statusName },
      { key: 'issue', text: issue ?? '', className: styles.statusIssue },
    ].filter((part) => part.text)
    if (parts.length === 0) return undefined
    return parts.map((part) => (
      <span key={part.key} className={part.className}>
        {part.text}
      </span>
    ))
  }, [brand, issue])

  // The reader owns the current page, so a layout switch keeps the position.
  const [page, setPage] = useState(input.config?.startPage ?? 0)

  // The generic phone-landscape "please rotate" overlay would otherwise hide
  // the reader; the flipbook viewer supports landscape (two-page spread).
  useEffect(() => {
    useBoundStore.getState().setSuppressLandscapeOverlay(true)
    return () => useBoundStore.getState().setSuppressLandscapeOverlay(false)
  }, [])

  const handlePageChange = useCallback((next: number) => {
    setPage(next)
    const url = new URL(window.location.href)
    url.searchParams.set('page', String(next + 1))
    window.history.replaceState(window.history.state, '', url)
  }, [])

  // The menu bar carries the viewer controls; it sits inside the viewer so
  // it stays visible in fullscreen. Without the menu a slim bar holds them.
  const renderHeaderToolbar = useCallback(
    (controls: W1FlipbookToolbarControls) => (
      <FlipbookHeader
        items={items}
        activeSlug={activeSlug}
        locale={locale}
        title={brand}
        logo={clientLogo}
        tools={<FlipbookToolbar controls={controls} showThumbnails={false} showPdf />}
      />
    ),
    [items, activeSlug, locale, brand, clientLogo],
  )

  // Phone landscape: one slim bar (pictogram, counter, icons) beside the
  // pages so the double spread keeps its width, vertical rail at the end.
  const renderSideChrome = useCallback(
    (controls: W1FlipbookToolbarControls) => (
      <FlipbookSideChrome controls={controls} title={brand} logo={clientLogo} />
    ),
    [brand, clientLogo],
  )
  const side = layout === 'phoneLandscape'
  const renderToolbar = side ? renderSideChrome : showHeader ? renderHeaderToolbar : renderFlipbookToolbarBar

  return (
    <main
      className={[styles.reader, ...deviceClasses].join(' ')}
      data-reader-layout={layout}
      data-reader-chrome={showHeader ? 'header' : 'bar'}
    >
      <div className={styles.viewer}>
        <W1FlipbookBlock
          input={input}
          labels={labels}
          page={page}
          onPageChange={handlePageChange}
          deviceInfo={deviceInfo}
          renderThumbnails={renderFlipbookThumbnailRail}
          renderToolbar={renderToolbar}
          renderNavigation={side ? renderFlipbookNavigationColumn : renderFlipbookNavigationWidget}
          status={W1_SYSTEM_MARK}
          statusStart={statusStart}
          curlTuning={IS_DEV ? devCurlTuning : undefined}
          chromeLayout={side ? 'side' : 'stacked'}
          fill
        />
      </div>
    </main>
  )
}
