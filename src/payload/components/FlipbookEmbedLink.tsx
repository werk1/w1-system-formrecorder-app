'use client'

import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { useDocumentInfo, useFormFields } from '@payloadcms/ui'
import { defaultLanguage, languageLabels, supportedLanguages } from '@/config/languages'

/**
 * Copyable public reader links ("/flipbooks/[slug]") for embedding a
 * published flipbook on external websites, one per supported language;
 * non-default languages carry ?locale=<code>. That route shows the bar with
 * the name or client logo but never the cross-flipbook menu
 * (FlipbookReader.tsx), so every link is menu-free on its own.
 */
export function FlipbookEmbedLink() {
  const { id } = useDocumentInfo()
  const slug = useFormFields(([fields]) => fields.slug?.value as string | undefined)
  const [copied, setCopied] = useState<string | null>(null)
  // The admin field is also rendered on the server; read the browser origin
  // after mount instead of touching `window` during render.
  const [origin, setOrigin] = useState(process.env.NEXT_PUBLIC_SERVER_URL ?? '')

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const copy = useCallback((link: string, code: string) => {
    void navigator.clipboard.writeText(link).then(() => {
      setCopied(code)
      setTimeout(() => setCopied((current) => (current === code ? null : current)), 2000)
    })
  }, [])

  if (!id || !slug) {
    return (
      <div style={styles.container}>
        Speichern Sie das Flipbook, um den Einbettungslink zu erhalten.
      </div>
    )
  }

  const linkFor = (code: string) =>
    `${origin}/flipbooks/${encodeURIComponent(slug)}${code === defaultLanguage ? '' : `?locale=${code}`}`

  return (
    <div style={styles.container}>
      <div style={styles.header}>Einbettungslink</div>
      <div style={styles.rows}>
        {supportedLanguages.map((code) => {
          const link = linkFor(code)
          return (
            <div key={code} style={styles.row}>
              <span style={styles.language}>{languageLabels[code] ?? code}</span>
              <input readOnly value={link} onFocus={(event) => event.target.select()} style={styles.input} />
              <button type="button" onClick={() => copy(link, code)} style={styles.button}>
                {copied === code ? 'Kopiert!' : 'Kopieren'}
              </button>
            </div>
          )
        })}
      </div>
      <div style={styles.hint}>
        Zeigt beim Aufruf nur das Flipbook, ohne Header und ohne Menü — zum Einbetten (z. B. per iframe) in anderen Webseiten.
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  container: {
    margin: '12px 0',
    padding: 12,
    border: '1px solid var(--theme-elevation-150, #ddd)',
    borderRadius: 4,
    background: 'var(--theme-elevation-50, #fafafa)',
    fontSize: 13,
  },
  header: { fontWeight: 600, marginBottom: 8 },
  rows: { display: 'flex', flexDirection: 'column', gap: 8 },
  row: { display: 'flex', gap: 12, alignItems: 'center' },
  language: { width: 72, flexShrink: 0, color: 'var(--theme-elevation-500, #777)' },
  input: {
    flex: 1,
    padding: '6px 10px',
    borderRadius: 4,
    border: '1px solid var(--theme-elevation-200, #bbb)',
    background: 'var(--theme-elevation-0, #fff)',
    color: 'var(--theme-text, #333)',
    fontSize: 13,
  },
  button: {
    padding: '6px 14px',
    borderRadius: 4,
    border: '1px solid var(--theme-elevation-200, #bbb)',
    background: 'var(--theme-elevation-0, #fff)',
    color: 'var(--theme-text, #333)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  hint: { marginTop: 8, color: 'var(--theme-elevation-500, #777)' },
}
