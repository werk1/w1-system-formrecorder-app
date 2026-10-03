'use client'

import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { useDocumentInfo } from '@payloadcms/ui'

type ConversionInfo = {
  status: 'idle' | 'converting' | 'ready' | 'error'
  progress: string | null
  errorMessage: string | null
  pageCount: number | null
  hasPublishedRevision: boolean
  jobActive: boolean
  sourceChanged: boolean
}

const POLL_MS = 3000

export function FlipbookConvertButton() {
  const { id } = useDocumentInfo()
  const [info, setInfo] = useState<ConversionInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (!id) return
    try {
      const response = await fetch(`/api/flipbook-convert?flipbookId=${encodeURIComponent(String(id))}`, { credentials: 'include' })
      if (response.ok) setInfo((await response.json()) as ConversionInfo)
    } catch {
      // Polling is best effort.
    }
  }, [id])

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => void refresh(), POLL_MS)
    return () => clearInterval(timer)
  }, [refresh])

  const restart = useCallback(async () => {
    if (!id) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/flipbook-convert', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flipbookId: id }),
      })
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
        throw new Error(data?.error?.message ?? `HTTP ${response.status}`)
      }
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unbekannter Fehler')
    } finally {
      setBusy(false)
    }
  }, [id, refresh])

  if (!id) {
    return <div style={styles.container}>Speichern Sie das PDF-Dokument, um die Konvertierung zu starten.</div>
  }

  const converting = info?.status === 'converting' && info.jobActive
  return (
    <div style={styles.container}>
      <div style={styles.header}>PDF-Konvertierung</div>
      <div style={styles.row}>
        <span>
          Status: <strong>{info?.status ?? '…'}</strong>
          {info?.progress ? ` (${info.progress})` : ''}
          {info?.pageCount ? ` · ${info.pageCount} Seiten veröffentlicht` : ''}
        </span>
        <button type="button" onClick={() => void restart()} disabled={busy || converting} style={styles.button}>
          {converting ? 'Läuft …' : 'Neu konvertieren'}
        </button>
      </div>
      {info?.sourceChanged ? <div style={styles.warning}>Quelle geändert – neu konvertieren.</div> : null}
      {info?.status === 'error' && info.errorMessage ? <div style={styles.error}>{info.errorMessage}</div> : null}
      {error ? <div style={styles.error}>{error}</div> : null}
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
  row: { display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' },
  button: {
    padding: '6px 14px',
    borderRadius: 4,
    border: '1px solid var(--theme-elevation-200, #bbb)',
    background: 'var(--theme-elevation-0, #fff)',
    color: 'var(--theme-text, #333)',
    cursor: 'pointer',
  },
  warning: { marginTop: 8, color: 'var(--theme-warning-700, #8a5a00)' },
  error: { marginTop: 8, color: 'var(--theme-error-500, #c62828)' },
}
