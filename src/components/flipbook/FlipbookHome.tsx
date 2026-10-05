import { headers } from 'next/headers'
import ClientLayout from '@/components/client-layout/ClientLayout'
import { AccountMenu, type AccountUser } from '@/components/flipbook/AccountMenu'
import { FlipbookHeader } from '@/components/flipbook/FlipbookHeader'
import { FlipbookReader } from '@/components/flipbook/FlipbookReader'
import { resolveFlipbookLocale } from '@/lib/blocks/flipbook/locale'
import { issueOf, listPublishedFlipbooks, loadPublishedFlipbook, mapFlipbookToInput } from '@/lib/blocks/flipbook/resolveFlipbookBlockInput'
import { PdfeditEditView } from '@/components/pdfedit/PdfeditEditView'
import { flipbookLocaleQuery } from '@/lib/blocks/flipbook/locale'
import { getPayloadClient } from '@/lib/payload/getPayloadClient'
import { getClientLogo } from '@/lib/theme/clientLogo'

const COPY: Record<string, { title: string; empty: string }> = {
  de: { title: 'Pdfedit', empty: 'Noch keine PDF-Dokumente veröffentlicht.' },
  en: { title: 'Pdfedit', empty: 'No PDF documents published yet.' },
}

type SessionUser = { firstName?: string; lastName?: string; email?: string; roles?: string[] }

const EDIT_COPY = {
  de: { noPdf: 'Zu diesem PDF-Dokument gibt es keinen Pdfedit-Eintrag. Bitte im Admin unter „Pdfedits“ anlegen.' },
  en: { noPdf: 'This PDF document has no Pdfedit entry. Create one in the admin under "Pdfedits".' },
} as const

/**
 * Startseite = Flipbook-Host: Header mit Menü aller veröffentlichten
 * Flipbooks, erster Eintrag standardmäßig offen. `?book=<slug>` wählt ein
 * anderes Buch; `/flipbooks/<slug>` bleibt der kanonische Deep-Link.
 */
export async function FlipbookHome({
  locale: rawLocale,
  book,
  page,
  edit,
}: {
  locale?: string
  book?: string
  page?: string
  edit?: string
}) {
  const locale = resolveFlipbookLocale(rawLocale)
  const copy = COPY[locale] ?? COPY.en

  const payload = await getPayloadClient()
  const items = await listPublishedFlipbooks(payload, locale)

  const slug = book && items.some((i) => i.slug === book) ? book : items[0]?.slug
  const doc = slug ? await loadPublishedFlipbook(payload, slug, locale) : null
  const input = mapFlipbookToInput(doc)
  const clientLogo = await getClientLogo()

  // Payload session (cookie): logged-in users get the account menu, admins the editor (`?edit=1`).
  const { user: sessionUser } = await payload.auth({ headers: await headers() })
  const sessionData = sessionUser as SessionUser | null
  const isAdmin = Boolean(sessionData?.roles?.includes('admin'))
  const account: AccountUser | null = sessionData
    ? { name: [sessionData.firstName, sessionData.lastName].filter(Boolean).join(' ') || sessionData.email || '', isAdmin }
    : null
  const localeQuery = flipbookLocaleQuery(locale, '&')
  const bookQuery = slug ? `book=${encodeURIComponent(slug)}` : ''
  const viewHref = `/?${bookQuery}${localeQuery}`
  const flipbookId = (doc as { id?: string | number } | null)?.id
  const editMode = isAdmin && edit === '1'
  const pdfedit =
    editMode && flipbookId !== undefined
      ? (
          await payload.find({
            collection: 'pdfedits' as never,
            where: { flipbook: { equals: flipbookId } } as never,
            sort: 'title',
            limit: 1,
            depth: 0,
            overrideAccess: true,
            select: { id: true } as never,
          })
        ).docs[0]
      : undefined
  // Also offered while logged out: the login of an admin goes straight to the editor; others stay in the reader.
  const editHref = slug ? `/?${bookQuery}&edit=1${localeQuery}` : undefined
  const accountMenu = (
    <AccountMenu user={account} editMode={editMode} viewHref={viewHref} editHref={editHref} />
  )

  if (editMode && slug) {
    return (
      <ClientLayout renderBeforeDeviceReady>
        <main style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
          <FlipbookHeader items={items} locale={locale} title={clientLogo?.name ?? copy.title} logo={clientLogo} activeSlug={slug} account={accountMenu} />
          <div style={{ flex: 1, minHeight: 0 }}>
            {pdfedit ? (
              <PdfeditEditView docId={String((pdfedit as { id: string | number }).id)} />
            ) : (
              <div style={{ padding: 24 }}>{(EDIT_COPY[locale as 'de' | 'en'] ?? EDIT_COPY.en).noPdf}</div>
            )}
          </div>
        </main>
      </ClientLayout>
    )
  }

  if (!input || !slug) {
    return (
      <ClientLayout renderBeforeDeviceReady>
        <main style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
          <FlipbookHeader items={items} locale={locale} title={clientLogo?.name ?? copy.title} logo={clientLogo} account={accountMenu} />
          <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>{copy.empty}</div>
        </main>
      </ClientLayout>
    )
  }

  const requested = Number(page)
  const valid = Number.isInteger(requested) && requested >= 1 && requested <= input.pages.length
  const startPage = valid ? requested - 1 : (input.config?.startPage ?? 0)

  return (
    <ClientLayout renderBeforeDeviceReady>
      <FlipbookReader
        input={{ ...input, config: { ...input.config, startPage } }}
        locale={locale}
        showHeader
        items={items}
        activeSlug={slug}
        siteTitle={input.title ?? copy.title}
        issue={issueOf(doc)}
        clientLogo={clientLogo}
        account={accountMenu}
      />
    </ClientLayout>
  )
}
