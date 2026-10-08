'use client'

import { W1Button, W1Select } from '@werk1/w1-system-ui'
import { WidgetArea, WidgetIcon, WidgetShell } from '@werk1/w1-system-widgets'
import type { W1FlipbookToolbarControls } from '@werk1/w1-system-flipbook'
import styles from './FlipbookNavigationWidget.module.css'
import themeStyles from './FlipbookWidgetTheme.module.css'

function PageRange({ range }: { range: string }) {
  const pages = range.split(/\s*[–-]\s*/)
  if (pages.length !== 2) return <>{range}</>
  return (
    <span className={styles.pageRange}>
      <span>{pages[0]}</span>
      <span className={styles.rangeSeparator}>–</span>
      <span>{pages[1]}</span>
    </span>
  )
}

function RoundArrow({ icon, label, onClick, disabled }: { icon: 'chevron-left' | 'chevron-right'; label: string; onClick: () => void; disabled: boolean }) {
  // The round submit button of the widget search field.
  return (
    <button
      type="button"
      className={`w1-widget-search__submit ${styles.round}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      <WidgetIcon name={icon} decorative />
    </button>
  )
}

/**
 * Bottom-bar navigation (passed as `renderNavigation`), built from the
 * w1-system-widgets layouts: a pill-shaped widget panel in the search tone
 * with the round previous button, the page field in its own search-field
 * pill (W1Select with the ticketing select popup), the round next button
 * and the quiet zoom and thumbnail toggles at the left. The PDF link sits in the top bar.
 */
export function FlipbookNavigationWidget({
  controls,
  orientation = 'horizontal',
}: {
  controls: W1FlipbookToolbarControls
  /**
   * `vertical`: the column beside the pages in the side arrangement (phone
   * and tablet landscape, shown while the thumbnail rail is closed). Arrows
   * and page field are stacked in one width (`--flipbook-nav-column-width`),
   * the field carries its chevron below the number and opens its list
   * towards the pages. The rail toggle stays in the icon bar.
   */
  orientation?: 'horizontal' | 'vertical'
}) {
  const { navigation: nav, zoom, thumbnails, spread, labels } = controls
  const rtl = nav.direction === 'rtl'
  const vertical = orientation === 'vertical'
  // Fixed page field: sized for three-digit pages ("XXX", or "XXX–XXX" in
  // the double layout), never to the number shown, so it does not jump.
  const trigger = vertical ? styles.triggerVertical : spread.mode === 'double' ? styles.triggerDouble : styles.triggerSingle
  const back = { label: labels.previous, onClick: nav.prev, disabled: !nav.canPrev }
  const forward = { label: labels.next, onClick: nav.next, disabled: !nav.canNext }
  const cls = (base: string, verticalClass: string) => (vertical ? `${base} ${verticalClass}` : base)

  return (
    // theme="light": light and dark come from the app palette (palettes.css).
    <WidgetArea label={labels.jumpTo} theme="light" className={`${themeStyles.theme} ${cls(styles.area, styles.areaVertical)}`}>
      <WidgetShell as="div" tone="search" className={cls(styles.panel, styles.panelVertical)}>
        <div className={cls(styles.row, styles.rowVertical)}>
          {zoom.enabled && !vertical && (
            <W1Button
              type="button"
              icon={zoom.active ? 'zoom_out' : 'zoom_in'}
              aria-label={zoom.active ? labels.zoomOut : labels.zoomIn}
              title={zoom.active ? labels.zoomOut : labels.zoomIn}
              onClick={zoom.active ? zoom.zoomOut : zoom.zoomIn}
              pressed={zoom.active}
              appearance="ghost"
              tone="neutral"
              padding="xs"
              lineWidth="none"
              size="m"
              className={styles.toolToggle}
            />
          )}
          {thumbnails.enabled && !vertical && (
            <W1Button
              type="button"
              icon="gallery_strip"
              aria-label={labels.thumbnails}
              title={labels.thumbnails}
              onClick={thumbnails.toggle}
              pressed={thumbnails.open}
              appearance="ghost"
              tone="neutral"
              padding="xs"
              lineWidth="none"
              size="m"
              className={`${styles.toolToggle} ${styles.stripToggle}`}
            />
          )}
          <RoundArrow icon="chevron-left" {...(rtl ? forward : back)} />
          <div className={cls(`w1-widget-search ${styles.pagePill}`, styles.pagePillVertical)}>
            <W1Select
              value={String(nav.targetIndex)}
              onValueChange={(value) => {
                const target = nav.targets[Number(value)]
                if (target) nav.goTo(target.page)
              }}
              label={labels.jumpTo}
              labelHidden
              popupMode="custom"
              popoverSurface="liquid"
              tone="glass"
              rootClassName={styles.selectFieldWrap}
              fieldClassName={vertical ? styles.pageFieldVertical : styles.pageField}
              triggerClassName={trigger}
              popoverClassName={cls(styles.selectPopover, styles.selectPopoverSide)}
              suppressHydrationWarning
              options={nav.targets.map((target, index) => ({ value: String(index), label: vertical ? <PageRange range={target.range} /> : target.range }))}
            />
          </div>
          <RoundArrow icon="chevron-right" {...(rtl ? back : forward)} />
        </div>
      </WidgetShell>
    </WidgetArea>
  )
}

/** Stable `renderNavigation` callback for `W1FlipbookBlock`. */
export const renderFlipbookNavigationWidget = (controls: W1FlipbookToolbarControls) => (
  <FlipbookNavigationWidget controls={controls} />
)

/** Stable `renderNavigation` callback for the side arrangement (phone and tablet landscape). */
export const renderFlipbookNavigationColumn = (controls: W1FlipbookToolbarControls) => (
  <FlipbookNavigationWidget controls={controls} orientation="vertical" />
)
