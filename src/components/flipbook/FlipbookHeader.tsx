'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { FlipbookMenuItem } from '@/lib/blocks/flipbook/resolveFlipbookBlockInput'
import { flipbookLocaleQuery } from '@/lib/blocks/flipbook/locale'
import { pickLogoVariants, type ClientLogo } from '@/lib/theme/clientLogoVariants'
import styles from './FlipbookHeader.module.css'

const MENU_LABEL = 'Pdfedit'

export function FlipbookHeader({
  items,
  activeSlug,
  locale,
  title,
  logo,
  tools,
  showMenu = false,
}: {
  items: FlipbookMenuItem[]
  activeSlug?: string
  locale: string
  title: string
  /** Client logo; replaces the title text (which stays as its alt text). */
  logo?: ClientLogo
  /** Viewer controls shown at the right end of the bar. */
  tools?: ReactNode
  /** "Flipbooks" menu of all published books; hidden until the archive feature. */
  showMenu?: boolean
}) {
  const { main: mainLogo, dark: darkLogo } = pickLogoVariants(logo?.positive, logo?.negative)
  const [open, setOpen] = useState(false)
  const navRef = useRef<HTMLElement>(null)
  const localeQuery = flipbookLocaleQuery(locale)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <header className={styles.header}>
      <a className={styles.brand} href={`/${localeQuery}`}>
        {mainLogo ? (
          <picture>
            {darkLogo && <source srcSet={darkLogo.url} media="(prefers-color-scheme: dark)" />}
            <img
              className={styles.logo}
              src={mainLogo.url}
              width={mainLogo.width}
              height={mainLogo.height}
              alt={title}
              // Size from Site Settings ("Logo-Größe"), already inside its limits.
              style={{ '--flipbook-logo-scale': logo?.logoScale ?? 1 } as CSSProperties}
            />
          </picture>
        ) : (
          title
        )}
      </a>
      <div className={styles.end}>
      {showMenu && (
      <nav className={styles.nav} ref={navRef}>
        <button
          type="button"
          className={styles.menuButton}
          aria-expanded={open}
          aria-haspopup="true"
          onClick={() => setOpen((v) => !v)}
        >
          {MENU_LABEL}
        </button>
        {open && (
          <ul className={styles.menu}>
            {items.map((item) => (
              <li key={item.slug}>
                <a
                  className={styles.menuItem}
                  href={`/?book=${encodeURIComponent(item.slug)}${flipbookLocaleQuery(locale, '&')}`}
                  aria-current={item.slug === activeSlug ? 'page' : undefined}
                >
                  {item.title}
                </a>
              </li>
            ))}
          </ul>
        )}
      </nav>
      )}
      {tools}
      </div>
    </header>
  )
}
