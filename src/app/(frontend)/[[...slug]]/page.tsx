import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPayloadClient } from '@/lib/payload/getPayloadClient'
import Navigation from '@/components/navigation/Navigation'
import ClientLayout from '@/components/client-layout/ClientLayout'
import { ProjectPage } from '@/components/page/ProjectPage'
import { buildPageModel } from '@/lib/pages/buildPageModel'
import { resolvePageSections } from '@/lib/pages/resolvePageSections'
import {
  type FrontendLocale,
  resolveFrontendPageByRoute,
  segmentsToRoute,
} from '@/lib/pages/resolveFrontendPage'
import { FlipbookHome } from '@/components/flipbook/FlipbookHome'

type FrontendPageProps = {
  params: Promise<{ slug?: string[] }>
  searchParams: Promise<{ locale?: string; book?: string; page?: string }>
}

export const dynamic = 'force-dynamic'

function resolveLocale(rawLocale: string | undefined): FrontendLocale {
  return rawLocale === 'en' ? 'en' : 'de'
}

export async function generateMetadata(props: FrontendPageProps): Promise<Metadata> {
  const fallbackMetadata: Metadata = {
    title: 'w1-system-formrecorder-app',
    description: 'w1-system-formrecorder-app',
  }

  try {
    const { slug } = await props.params
    const searchParams = await props.searchParams
    const locale = resolveLocale(searchParams.locale)
    const route = segmentsToRoute(slug)
    if (route === '/') return { title: 'Formrecorder' }
    const page = await resolveFrontendPageByRoute({ route, locale })

    if (!page) return fallbackMetadata

    const fallbackTitle = page.title || 'w1-system-formrecorder-app'
    const fallbackDescription = 'w1-system-formrecorder-app'

    return {
      title: page.seo?.metaTitle || fallbackTitle,
      description: page.seo?.metaDescription || fallbackDescription,
    }
  } catch (error) {
    console.error('Failed to resolve metadata for frontend page', error)
    return fallbackMetadata
  }
}

export default async function FrontendPage(props: FrontendPageProps) {
  const { slug } = await props.params
  const searchParams = await props.searchParams
  const locale = resolveLocale(searchParams.locale)
  const route = segmentsToRoute(slug)
  if (route === '/') {
    return <FlipbookHome locale={searchParams.locale} book={searchParams.book} page={searchParams.page} />
  }

  const page = await resolveFrontendPageByRoute({ route, locale })

  if (!page) notFound()

  const payload = await getPayloadClient()
  let sections: Awaited<ReturnType<typeof resolvePageSections>> = []

  try {
    const pageModel = await buildPageModel(page, locale)
    if (!pageModel) notFound()
    const context = { payload, locale, route }
    sections = await resolvePageSections(pageModel, context)
  } catch (error) {
    console.error(`Failed to resolve frontend page for route "${route}"`, error)
    notFound()
  }

  return (
    <ClientLayout>
      <ProjectPage navigation={<Navigation />} sections={sections} />
    </ClientLayout>
  )
}
