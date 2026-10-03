'use client'

import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { useDocumentInfo } from '@payloadcms/ui'

/**
 * Link to the overlay editor view (`/admin/formrecorder?doc=<id>`) plus the
 * export endpoints, shown on the formrecorder edit screen.
 */
export function FormrecorderEditorLink() {
  const { id } = useDocumentInfo()
  const [origin, setOrigin] = useState(process.env.NEXT_PUBLIC_SERVER_URL ?? '')

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  if (!id) {
    return <div style={styles.container}>Speichern Sie den Formrecorder, um den Editor zu öffnen.</div>
  }

  return (
    <div style={styles.container}>
      <a style={styles.link} href={`${origin}/admin/formrecorder?doc=${id}`}>
        Editor öffnen
      </a>
      <a style={styles.link} href={`${origin}/api/formrecorder-export?id=${id}&format=csv`}>
        CSV exportieren
      </a>
      <a style={styles.link} href={`${origin}/api/formrecorder-export?id=${id}&format=json`}>
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
