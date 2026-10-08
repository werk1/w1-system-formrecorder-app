'use client'

import { useEffect, useId, useRef, type FormEvent } from 'react'
import { W1Button } from '@werk1/w1-system-ui'
import { WidgetArea, WidgetIcon, WidgetResultLink, WidgetResultList, WidgetSearch, WidgetShell } from '@werk1/w1-system-widgets'
import type { W1FlipbookSearchHit, W1FlipbookSearchPanelProps, W1FlipbookToolbarControls } from '@werk1/w1-system-flipbook'
import { createFlipbookSearchPanelLabels } from '@/lib/blocks/flipbook/labels'
import styles from './FlipbookSearchPanel.module.css'
import toolbarStyles from './FlipbookToolbar.module.css'
import themeStyles from './FlipbookWidgetTheme.module.css'

/**
 * Where the reader shows its search:
 * - `sidebar` (desktop): classic sidebar at the start of the viewer
 *   (`searchPlacement="start"`); collapsed it is an icon column.
 * - `top` (phone/tablet portrait): sheet over the pages from the top, clear
 *   of the navigation widget at the bottom.
 * - `column` (phone/tablet landscape): field and hits over the pages,
 *   growing out of the search icon column (`FlipbookSearchIconColumn`) that
 *   stands beside the menu bar; see that component for the split.
 */
export type FlipbookSearchVariant = 'sidebar' | 'top' | 'column'

const cx = (...names: Array<string | false | undefined>) => names.filter(Boolean).join(' ')

/**
 * Search icon column of the landscape reader, beside the menu bar: the
 * magnifier at the top is the head of the search field — it grows out to the
 * right while the hits are shown and shrinks back into this round icon when
 * they are folded away, and it switches the search off. Below it the two hit
 * arrows and the fold toggle, all round icons like the tools next door. The
 * column takes layout width, so the pages give it room; only field and hits
 * lie over them.
 */
export function FlipbookSearchIconColumn({
  controls,
  expanded,
  onExpandedChange,
  locale,
}: {
  controls: W1FlipbookToolbarControls
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  locale: string
}) {
  const { search, labels } = controls
  const text = createFlipbookSearchPanelLabels(locale)
  const label = labels.search ?? 'Suche'
  // Same round buttons as in the portrait sheet (`.toolToggle`).
  const icon = (name: string, title: string, onClick: () => void, disabled?: boolean) => (
    <W1Button
      type="button"
      icon={name}
      aria-label={title}
      title={title}
      onClick={onClick}
      disabled={disabled}
      appearance="ghost"
      tone="neutral"
      padding="xs"
      lineWidth="none"
      size="m"
      className={styles.toolToggle}
    />
  )
  return (
    <div className={styles.iconColumn} aria-label={label}>
      {/* Head of the search field, not a control: the field grows out of it
          to the right and shrinks back into it. Switching the search on and
          off stays with the menu bar next door. */}
      <span className={cx(styles.toolToggle, styles.columnHead)} aria-hidden="true">
        <WidgetIcon name="search" decorative />
      </span>
      {/* The hits are a list: stepping reads up and down. Folding moves the
          list itself, which reads left and right. */}
      {icon('chevron_up', text.previousHit, search.prevHit, !search.canPrevHit)}
      {icon('chevron_down', text.nextHit, search.nextHit, !search.canNextHit)}
      {icon(
        expanded ? 'chevron_left' : 'chevron_right',
        expanded ? text.collapse : text.expand,
        () => onExpandedChange(!expanded),
      )}
    </div>
  )
}

/** Deep link of a hit: the reader URL with its `?page=` (open in a new tab). */
function pageHref(pageIndex: number) {
  const url = new URL(window.location.href)
  url.searchParams.set('page', String(pageIndex + 1))
  return `${url.pathname}${url.search}`
}

/**
 * Search panel of the reader (`renderSearch`), built from the widget search
 * field and result list. The viewer owns the session (query, hits, picked
 * hit); this panel only adds `expanded`: collapsed, the sheets keep just the
 * search field with the query, the sidebar folds into its icon column.
 */
export function FlipbookSearchPanel({
  panel,
  variant,
  expanded,
  onExpandedChange,
  locale,
}: {
  panel: W1FlipbookSearchPanelProps
  variant: FlipbookSearchVariant
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  locale: string
}) {
  const { open, setOpen, query, setQuery, status, hits, selected, select, minChars, labels } = panel
  const text = createFlipbookSearchPanelLabels(locale)
  const inputId = useId()
  const headRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const sheet = variant !== 'sidebar'
  // Landscape splits the panel: the icon column carries the controls, this
  // part only the field and the hits, and it is gone while they are folded.
  const split = variant === 'column'
  const showResults = open && expanded
  const label = labels.search ?? 'Suche'
  const input = () => headRef.current?.querySelector('input') ?? null

  // Opening the search moves the focus into the field — folding the hits in
  // and out does not, so the chevron never activates the field or raises the
  // on-screen keyboard.
  const wasOpen = useRef(open)
  useEffect(() => {
    if (open && !wasOpen.current) input()?.focus({ preventScroll: true })
    wasOpen.current = open
  }, [open])

  // The picked hit stays in view: when the list opens it scrolls to the card
  // the arrows last walked to, instead of starting at the top again.
  useEffect(() => {
    if (!showResults) return
    bodyRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' })
  })

  // Escape folds the hits away; the query and the marked hit are kept. Where
  // the bar is the whole panel it hides with them.
  const hide = () => {
    if (sheet && !split) setOpen(false)
    onExpandedChange(false)
  }
  // On the sheets a picked hit folds the results away, so its marked block
  // on the page is not covered; the sidebar stays open for the next hit.
  const pick = (hit: W1FlipbookSearchHit) => {
    select(hit)
    if (!sheet) return
    onExpandedChange(false)
    input()?.blur()
  }
  // Step through the hits without folding anything: with the results closed
  // the bar alone walks the document, like find-in-page. Hits are compared by
  // value, because reopening the search re-runs the query and hands out new
  // objects for the same hits.
  const sameHit = (a: W1FlipbookSearchHit | null, b: W1FlipbookSearchHit | null) =>
    Boolean(a && b && a.pageIndex === b.pageIndex && a.snippet === b.snippet)
  const position = selected ? hits.findIndex((hit) => sameHit(hit, selected)) : -1
  // No wrap-around: the arrows grey out at the ends of the list. Without a
  // pick yet, "next" starts at the first hit.
  const canPrev = position > 0
  const canNext = hits.length > 0 && position < hits.length - 1
  const step = (delta: 1 | -1) => () => {
    const next = position < 0 ? 0 : position + delta
    if (next < 0 || next >= hits.length) return
    select(hits[next])
  }
  // No submit button: the field searches as you type, Enter only closes the
  // on-screen keyboard.
  const submit = (event: FormEvent) => {
    event.preventDefault()
    input()?.blur()
  }

  if (!open && sheet) return null
  // Split landscape: folded, nothing of this part is left — the field has
  // shrunk back into the magnifier of the icon column.
  if (split && !expanded) return null

  // Sidebar folded: an icon column; the button opens or unfolds the search.
  if (variant === 'sidebar' && !showResults) {
    return (
      <aside className={styles.rail} aria-label={label}>
        <div className={cx(toolbarStyles.tools, toolbarStyles.toolsVertical)}>
          <W1Button
            type="button"
            icon="text_search"
            aria-label={open ? text.expand : text.open}
            title={open ? text.expand : text.open}
            onClick={() => {
              setOpen(true)
              onExpandedChange(true)
            }}
            pressed={open}
            appearance="ghost"
            tone="neutral"
            padding="xs"
            lineWidth="none"
            size="m"
            className={toolbarStyles.tool}
          />
        </div>
      </aside>
    )
  }

  const note =
    status === 'idle'
      ? query.trim()
        ? text.minChars(minChars)
        : undefined
      : status === 'pending'
        ? text.pending
        : status === 'failed'
          ? (labels.searchError ?? 'Search failed.')
          : hits.length === 0
            ? (labels.searchNoResults ?? 'No results.')
            : text.hits(hits.length)

  // Round ghost buttons like the toggles of the navigation widget.
  const tool = (icon: string, title: string, onClick: () => void, pressed?: boolean) => (
    <W1Button
      type="button"
      icon={icon}
      aria-label={title}
      title={title}
      aria-expanded={pressed === undefined ? undefined : pressed}
      onClick={onClick}
      appearance="ghost"
      tone="neutral"
      padding="xs"
      lineWidth="none"
      size="m"
      className={styles.toolToggle}
    />
  )

  // Previous / next hit at the end of the field, in the round style the
  // navigation widget uses for its page arrows.
  const hitArrow = (icon: 'chevron-left' | 'chevron-right', title: string, onClick: () => void, enabled: boolean) => (
    <button
      type="button"
      className={`w1-widget-search__submit ${styles.hitArrow}`}
      onClick={onClick}
      disabled={!enabled}
      aria-label={title}
      title={title}
    >
      <WidgetIcon name={icon} decorative />
    </button>
  )

  const head = (
    <div ref={headRef} className={styles.head}>
      <WidgetSearch
        className={styles.field}
        inputId={inputId}
        label={label}
        clearable
        onSubmit={submit}
        input={{
          value: query,
          placeholder: labels.searchPlaceholder,
          autoComplete: 'off',
          enterKeyHint: 'search',
          onChange: (event) => setQuery(event.target.value),
          // Typing into the folded field brings the results back.
          onFocus: () => {
            if (!expanded) onExpandedChange(true)
          },
          onKeyDown: (event) => {
            if (event.key !== 'Escape') return
            event.stopPropagation()
            hide()
          },
        }}
      />
      {/* Beside the field, like the page arrows of the navigation widget.
          In the split landscape layout they stand in the icon column. */}
      {!split && hitArrow('chevron-left', text.previousHit, step(-1), canPrev)}
      {!split && hitArrow('chevron-right', text.nextHit, step(1), canNext)}
    </div>
  )

  // Outside the widget: it belongs to the sheet, not to the search controls.
  // The viewer's search button hides the whole panel, so there is no close
  // button beside it. The chevron points the way the hits fold: down from
  // the top sheet, sideways from the left sheet and the sidebar.
  const foldIcon =
    variant === 'top' ? (expanded ? 'chevron_up' : 'chevron_down') : expanded ? 'chevron_left' : 'chevron_right'
  const foldToggle = sheet
    ? tool(foldIcon, expanded ? text.collapse : text.expand, () => onExpandedChange(!expanded), expanded)
    : tool(foldIcon, text.collapse, () => onExpandedChange(false))

  const results = showResults && (
    <div ref={bodyRef} className={styles.body}>
      {note && (
        <p className={styles.note} role="status">
          {note}
        </p>
      )}
      {hits.length > 0 && (
        <WidgetResultList className={styles.results}>
          {hits.map((hit, index) => (
            <WidgetResultLink
              key={`${hit.pageIndex}-${index}`}
              href={pageHref(hit.pageIndex)}
              title={hit.snippet}
              accent={labels.searchPage ? labels.searchPage(hit.pageIndex + 1) : `S. ${hit.pageIndex + 1}`}
              aria-current={sameHit(hit, selected) ? 'true' : undefined}
              className={styles.hit}
              onClick={(event) => {
                // Plain click jumps in the reader; modified clicks open the link.
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
                event.preventDefault()
                pick(hit)
              }}
            />
          ))}
        </WidgetResultList>
      )}
    </div>
  )

  if (variant === 'sidebar') {
    return (
      <WidgetArea label={label} theme="light" className={cx(themeStyles.theme, styles.area, styles.sidebar)}>
        <div className={styles.barRow}>
          {head}
          {foldToggle}
        </div>
        {results}
      </WidgetArea>
    )
  }

  // Landscape: the field grows out of the icon column to the right, the hits
  // follow below it. The controls stay in the column, so there is no bar row.
  if (split) {
    return (
      <WidgetArea label={label} theme="light" className={cx(themeStyles.theme, styles.area, styles.sheet, styles.column)}>
        {head}
        {results}
      </WidgetArea>
    )
  }

  // Sheets: the search bar is a pill like the navigation widget, the results
  // slide out below it as a separate surface — full width in portrait.
  return (
    <WidgetArea
      label={label}
      theme="light"
      className={cx(themeStyles.theme, styles.area, styles.sheet, styles.top, !expanded && styles.folded)}
    >
      {/* One sheet in the toolbar colour that grows down from under the
          header: the search bar sits on top, the hits follow as cards. */}
      <div className={styles.barRow}>
        <WidgetShell as="div" tone="search" className={styles.bar}>
          {head}
        </WidgetShell>
        {foldToggle}
      </div>
      {results}
    </WidgetArea>
  )
}
