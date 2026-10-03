'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { W1Button } from '@werk1/w1-system-ui'
import { ColorSchemeEditor } from './ColorSchemeEditor'
import { CurlTuningPanel } from './CurlTuningPanel'
import styles from './DevTools.module.css'

type Tab = 'shader' | 'colors'

// Last tab of this browser session; survives a toolbar remount (rotation).
const session: { tab: Tab } = { tab: 'shader' }

/**
 * Dev-only toolbar button (`next dev`, see devCurlTuning IS_DEV) with the
 * dev tools: live WebGL page-turn tuning and the colour scheme editor. The
 * panel stays mounted once opened and is only hidden while closed, so the
 * chosen scheme, drafts and the colour preview survive closing, reopening
 * and tab switches.
 */
export function DevToolsButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)
  const [opened, setOpened] = useState(false)
  const [tab, setTab] = useState<Tab>(session.tab)
  const [colorsMounted, setColorsMounted] = useState(session.tab === 'colors')

  const show = (next: Tab) => {
    session.tab = next
    setTab(next)
    if (next === 'colors') setColorsMounted(true)
  }
  const toggle = () => {
    setOpened(true)
    setOpen((v) => !v)
  }

  return (
    <>
      <W1Button
        type="button"
        icon="settings"
        aria-label="Dev-Werkzeuge"
        title="Dev-Werkzeuge"
        aria-expanded={open}
        onClick={toggle}
        pressed={open}
        appearance="ghost"
        tone="neutral"
        padding="xs"
        lineWidth="none"
        size="m"
        className={className}
      />
      {opened &&
        createPortal(
          <div className={styles.panel} role="dialog" aria-label="Dev-Werkzeuge" hidden={!open}>
            <div className={styles.head}>
              <div className={styles.tabs} role="tablist">
                <button type="button" role="tab" aria-selected={tab === 'shader'} onClick={() => show('shader')}>
                  Shader
                </button>
                <button type="button" role="tab" aria-selected={tab === 'colors'} onClick={() => show('colors')}>
                  Farben
                </button>
              </div>
              <span className={styles.badge}>DEV</span>
            </div>
            <div hidden={tab !== 'shader'} className={styles.body}>
              <CurlTuningPanel />
            </div>
            {colorsMounted && (
              <div hidden={tab !== 'colors'} className={styles.body}>
                <ColorSchemeEditor />
              </div>
            )}
            <div className={styles.actions}>
              <button type="button" onClick={() => setOpen(false)}>
                Schließen
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
