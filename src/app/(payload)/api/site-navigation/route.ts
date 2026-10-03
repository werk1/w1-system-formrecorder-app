import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { DEFAULT_NAV_ITEMS } from '@/components/navigation/constants/NavItems'

type SiteNavigationItem = {
	label: string
	href: string
	order: number
	openInNewTab: boolean
}

type SiteSettingsDocument = {
	navigation?: Array<{
		label?: unknown
		href?: unknown
		order?: unknown
		openInNewTab?: unknown
	}>
}

type PayloadLike = {
	findGlobal: (args: unknown) => Promise<SiteSettingsDocument>
}

function resolveLocale(raw: string | null): 'de' | 'en' {
	return raw === 'en' ? 'en' : 'de'
}

function normalizeHref(value: unknown): string | null {
	if (typeof value !== 'string') return null
	const trimmed = value.trim()
	if (!trimmed) return null

	if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('mailto:')) {
		return trimmed
	}

	return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function normalizeNavigationItems(navigation: SiteSettingsDocument['navigation']): SiteNavigationItem[] {
	if (!Array.isArray(navigation)) return []

	return navigation
		.map((item) => {
			const href = normalizeHref(item?.href)
			if (!href) return null
			const label = typeof item?.label === 'string' && item.label.trim().length > 0 ? item.label.trim() : href
			const order = typeof item?.order === 'number' ? item.order : Number.MAX_SAFE_INTEGER
			const openInNewTab = item?.openInNewTab === true
			return { label, href, order, openInNewTab }
		})
		.filter((item): item is SiteNavigationItem => item !== null)
		.sort((left, right) => left.order - right.order || left.label.localeCompare(right.label))
}

function fallbackItems(): SiteNavigationItem[] {
	return DEFAULT_NAV_ITEMS.map((item, index) => ({
		label: item.label,
		href: item.to,
		order: index,
		openInNewTab: item.openInNewTab === true,
	}))
}

export async function GET(request: Request) {
	try {
		const locale = resolveLocale(new URL(request.url).searchParams.get('locale'))
		const payload = (await getPayload({ config: configPromise })) as unknown as PayloadLike
		const settings = await payload.findGlobal({
			slug: 'site-settings',
			locale,
			fallbackLocale: locale,
		})

		const items = normalizeNavigationItems(settings.navigation)

		return Response.json(
			{ items: items.length > 0 ? items : fallbackItems(), locale },
			{ headers: { 'Cache-Control': 'no-store' } },
		)
	} catch {
		return Response.json(
			{ items: fallbackItems(), locale: 'de' },
			{ headers: { 'Cache-Control': 'no-store' } },
		)
	}
}
