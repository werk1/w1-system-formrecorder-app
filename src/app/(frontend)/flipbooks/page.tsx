import ClientLayout from '@/components/client-layout/ClientLayout'
import configPromise from '@payload-config'
import type { Metadata } from 'next'
import { getPayload } from 'payload'
import { flipbookLocaleQuery, resolveFlipbookLocale } from '@/lib/blocks/flipbook/locale'
import styles from './flipbooks.module.css'

type FlipbooksPageProps = {
  searchParams: Promise<{ locale?: string; page?: string }>
}

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 24

const COPY: Record<string, { title: string; empty: string; pages: string; prev: string; next: string }> = {
  de: { title: 'Pdfedit', empty: 'Noch keine PDF-Dokumente veröffentlicht.', pages: 'Seiten', prev: 'Zurück', next: 'Weiter' },
  en: { title: 'Pdfedit', empty: 'No PDF documents published yet.', pages: 'pages', prev: 'Previous', next: 'Next' },
}

export const metadata: Metadata = { title: 'Pdfedit' }

type ListedFlipbook = {
  id: string | number
  slug: string
  title?: string
  pageCount?: number
  coverImage?: { url?: string; alt?: string; sizes?: { thumb?: { url?: string }; sm?: { url?: string } } } | null
}

export default async function FlipbooksPage({ searchParams }: FlipbooksPageProps) {
  const query = await searchParams
  const locale = resolveFlipbookLocale(query.locale)
  const copy = COPY[locale] ?? COPY.en
  const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1)
  const localeParam = flipbookLocaleQuery(locale, '&')
  const localeQuery = flipbookLocaleQuery(locale)

  const payload = await getPayload({ config: configPromise })
  const result = await payload.find({
    collection: 'flipbooks',
    where: { and: [{ isPublished: { equals: true } }, { publishedRevision: { exists: true } }] },
    sort: ['sortOrder', '-updatedAt'],
    page,
    limit: PAGE_SIZE,
    depth: 1,
    locale,
    overrideAccess: false,
    select: { title: true, slug: true, pageCount: true, coverImage: true },
    populate: { media: { url: true, alt: true, sizes: true } },
  })
  const docs = result.docs as unknown as ListedFlipbook[]

  return (
    <ClientLayout renderBeforeDeviceReady>
      <main className={styles.main}>
        <h1>{copy.title}</h1>
        {docs.length === 0 ? (
          <p>{copy.empty}</p>
        ) : (
          <ul className={styles.grid}>
            {docs.map((doc) => {
              const cover = doc.coverImage?.sizes?.sm?.url ?? doc.coverImage?.sizes?.thumb?.url ?? doc.coverImage?.url
              return (
                <li key={doc.id}>
                  <a className={styles.card} href={`/flipbooks/${doc.slug}${localeQuery}`}>
                    {cover ? <img className={styles.cover} src={cover} alt={doc.coverImage?.alt ?? ''} loading="lazy" /> : <span className={styles.cover} />}
                    <span className={styles.title}>{doc.title ?? doc.slug}</span>
                    {doc.pageCount ? <span className={styles.meta}>{doc.pageCount} {copy.pages}</span> : null}
                  </a>
                </li>
              )
            })}
          </ul>
        )}
        {(result.hasPrevPage || result.hasNextPage) && (
          <nav className={styles.pager}>
            {result.hasPrevPage ? <a href={`/flipbooks?page=${page - 1}${localeParam}`}>{copy.prev}</a> : <span />}
            {result.hasNextPage ? <a href={`/flipbooks?page=${page + 1}${localeParam}`}>{copy.next}</a> : null}
          </nav>
        )}
      </main>
    </ClientLayout>
  )
}
