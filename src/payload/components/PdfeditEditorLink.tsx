'use client'

import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { useDocumentInfo } from '@payloadcms/ui'

/**
 * Link to the overlay editor view (the start page `/?book=<slug>&edit=1`, the only editor page) plus the
 * export endpoints, shown on the pdfedit edit screen.
 */
export function PdfeditEditorLink() {
  const { id } = useDocumentInfo()
  const [origin, setOrigin] = useState(process.env.NEXT_PUBLIC_SERVER_URL ?? '')
  const [bookSlug, setBookSlug] = useState('')

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  // The start page picks the document by the slug of its PDF document (flipbook).
  useEffect(() => {
    if (!id) return
    void fetch(`/api/pdfedits/${id}?depth=1`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((doc: { flipbook?: { slug?: string } | string | number } | null) => {
        const flipbook = doc?.flipbook
        if (flipbook && typeof flipbook === 'object' && flipbook.slug) setBookSlug(flipbook.slug)
      })
      .catch(() => undefined)
  }, [id])

  if (!id) {
    return <div style={styles.container}>Speichern Sie den Pdfedit, um den Editor zu öffnen.</div>
  }

  return (
    <div style={styles.container}>
      {bookSlug ? (
        <a style={styles.link} href={`${origin}/?book=${encodeURIComponent(bookSlug)}&edit=1`}>
          Editor öffnen
        </a>
      ) : null}
      <a style={styles.link} href={`${origin}/api/pdfedit-export?id=${id}&format=csv`}>
        CSV exportieren
      </a>
      <a style={styles.link} href={`${origin}/api/pdfedit-export?id=${id}&format=json`}>
        JSON exportieren
      </a>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  container: { margin: '12px 0', display: 'flex', gap: 12, flexWrap: 'wrap' },
  link: {
    padding: '6px 14px',
    borderRadius: 4,
    border: '1px solid var(--theme-elevation-200, #bbb)',
    background: 'var(--theme-elevation-50, #fafafa)',
    color: 'var(--theme-text, #333)',
    fontSize: 13,
    textDecoration: 'none',
  },
}
