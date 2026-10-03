import ClientLayout from '@/components/client-layout/ClientLayout'
import { FlipbookHeader } from '@/components/flipbook/FlipbookHeader'
import { FlipbookReader } from '@/components/flipbook/FlipbookReader'
import { resolveFlipbookLocale } from '@/lib/blocks/flipbook/locale'
import { issueOf, listPublishedFlipbooks, loadPublishedFlipbook, mapFlipbookToInput } from '@/lib/blocks/flipbook/resolveFlipbookBlockInput'
import { getPayloadClient } from '@/lib/payload/getPayloadClient'
import { getClientLogo } from '@/lib/theme/clientLogo'

const COPY: Record<string, { title: string; empty: string }> = {
  de: { title: 'Formrecorder', empty: 'Noch keine PDF-Dokumente veröffentlicht.' },
  en: { title: 'Formrecorder', empty: 'No PDF documents published yet.' },
}

/**
 * Startseite = Flipbook-Host: Header mit Menü aller veröffentlichten
 * Flipbooks, erster Eintrag standardmäßig offen. `?book=<slug>` wählt ein
 * anderes Buch; `/flipbooks/<slug>` bleibt der kanonische Deep-Link.
 */
export async function FlipbookHome({
  locale: rawLocale,
  book,
  page,
}: {
  locale?: string
  book?: string
  page?: string
}) {
  const locale = resolveFlipbookLocale(rawLocale)
  const copy = COPY[locale] ?? COPY.en

  const payload = await getPayloadClient()
  const items = await listPublishedFlipbooks(payload, locale)

  const slug = book && items.some((i) => i.slug === book) ? book : items[0]?.slug
  const doc = slug ? await loadPublishedFlipbook(payload, slug, locale) : null
  const input = mapFlipbookToInput(doc)
  const clientLogo = await getClientLogo()

  if (!input || !slug) {
    return (
      <ClientLayout renderBeforeDeviceReady>
        <main style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
          <FlipbookHeader items={items} locale={locale} title={clientLogo?.name ?? copy.title} logo={clientLogo} />
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
      />
    </ClientLayout>
  )
}
