import configPromise from '@payload-config'
import { getPayload } from 'payload'

export type FrontendLocale = 'de' | 'en'

export type FrontendPageDocument = {
	route?: string | null
	title?: string | null
	sections?: unknown[] | null
	seo?: {
		metaTitle?: string | null
		metaDescription?: string | null
	} | null
}

type PayloadFindResult<T> = {
	docs?: T[]
}

type PayloadLike = {
	find: (args: unknown) => Promise<PayloadFindResult<FrontendPageDocument>>
}

export function normalizeRoute(route: string): string {
	const trimmed = route.trim()
	if (!trimmed) return '/'

	const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
	if (withLeadingSlash === '/') return '/'

	return withLeadingSlash.endsWith('/') ? withLeadingSlash.slice(0, -1) : withLeadingSlash
}

export function segmentsToRoute(segments: string[] | undefined): string {
	if (!segments || segments.length === 0) return '/'
	return normalizeRoute(segments.join('/'))
}

export async function resolveFrontendPageByRoute(args: {
	route: string
	locale: FrontendLocale
}): Promise<FrontendPageDocument | null> {
	const payload = await getPayload({ config: configPromise }) as unknown as PayloadLike
	const route = normalizeRoute(args.route)

	const result = await payload.find({
		collection: 'pages',
		locale: args.locale,
		fallbackLocale: args.locale,
		limit: 1,
		depth: 3,
		where: {
			and: [
				{ route: { equals: route } },
				{ isPublished: { equals: true } },
			],
		},
	})

	return (result?.docs?.[0] as FrontendPageDocument | undefined) ?? null
}
