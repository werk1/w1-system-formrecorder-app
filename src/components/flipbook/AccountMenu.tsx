'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import styles from './FlipbookHeader.module.css'

export type AccountUser = { name: string; isAdmin: boolean }

/**
 * Header menu of the start page: "Anmelden" (Payload login of the `users`
 * collection) while logged out; name, mode switch and "Abmelden" afterwards.
 * Login and logout run through Payload's REST routes with the session
 * cookie. A successful admin login opens the edit view (`editHref`), other
 * users stay in the reader.
 */
export function AccountMenu({
  user,
  editMode,
  viewHref,
  editHref,
}: {
  user: AccountUser | null
  editMode: boolean
  /** Reader link (without edit flag). */
  viewHref: string
  /** Edit view link; only offered to admins and when a PDF document belongs to the book. */
  editHref?: string
}) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const rootRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
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

  async function login(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/users/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email, password }),
      })
      const data = (await res.json().catch(() => null)) as { user?: { roles?: string[] }; errors?: Array<{ message?: string }> } | null
      if (!res.ok || !data?.user) throw new Error(data?.errors?.[0]?.message ?? 'Anmeldung fehlgeschlagen')
      // Full navigation: the server renders the page for the new session.
      window.location.href = data.user.roles?.includes('admin') && editHref ? editHref : viewHref
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  async function logout() {
    setBusy(true)
    await fetch('/api/users/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => undefined)
    window.location.href = viewHref
  }

  return (
    <nav className={styles.nav} ref={rootRef}>
      <button
        type="button"
        className={styles.menuButton}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
      >
        {user ? user.name : 'Anmelden'}
      </button>
      {open && (
        <div className={styles.menu} style={{ padding: 10 }}>
          {user ? (
            <>
              <div style={{ padding: '4px 4px 8px', fontWeight: 600 }}>{user.name}</div>
              {user.isAdmin && editHref ? (
                <a className={styles.menuItem} href={editMode ? viewHref : editHref}>
                  {editMode ? 'Zur Ansicht' : 'Bearbeiten'}
                </a>
              ) : null}
              {!user.isAdmin ? (
                <div style={{ padding: '4px', fontSize: 13, opacity: 0.8 }}>Keine Bearbeitungsrechte.</div>
              ) : null}
              <button type="button" className={styles.menuItem} style={{ width: '100%', textAlign: 'left', background: 'none', border: 0, font: 'inherit', cursor: 'pointer' }} disabled={busy} onClick={() => void logout()}>
                Abmelden
              </button>
            </>
          ) : (
            <form onSubmit={(e) => void login(e)} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input type="email" required autoComplete="username" placeholder="E-Mail" value={email} onChange={(e) => setEmail(e.target.value)} />
              <input type="password" required autoComplete="current-password" placeholder="Passwort" value={password} onChange={(e) => setPassword(e.target.value)} />
              {error ? <div role="alert" style={{ fontSize: 13 }}>{error}</div> : null}
              <button type="submit" className={styles.menuButton} disabled={busy}>
                Anmelden
              </button>
            </form>
          )}
        </div>
      )}
    </nav>
  )
}
