'use client'

import { useEffect, useMemo, useState } from 'react'
import { useBoundStore } from '@/stores/boundStore'
import { DEFAULT_NAV_ITEMS, type NavItem } from '@/components/navigation/constants/NavItems'

type NavigationApiItem = {
	label?: unknown
	href?: unknown
	openInNewTab?: unknown
}

type NavigationApiResponse = {
	items?: NavigationApiItem[]
}

function normalizeLocale(locale: string): 'de' | 'en' {
	return locale === 'en' ? 'en' : 'de'
}

function normalizeItem(item: NavigationApiItem): NavItem | null {
	if (typeof item.href !== 'string' || item.href.trim() === '') return null

	return {
		to: item.href,
		label:
			typeof item.label === 'string' && item.label.trim().length > 0
				? item.label
				: item.href,
		openInNewTab: item.openInNewTab === true,
	}
}

export function useSiteNavigation(): NavItem[] {
	const localeFromStore = useBoundStore((state) => state.ui.currentLocale)
	const locale = normalizeLocale(localeFromStore)
	const [items, setItems] = useState<NavItem[]>(DEFAULT_NAV_ITEMS)

	useEffect(() => {
		const controller = new AbortController()

		;(async () => {
			try {
				const response = await fetch(`/api/site-navigation?locale=${locale}`, {
					method: 'GET',
					cache: 'no-store',
					signal: controller.signal,
				})

				if (!response.ok) {
					setItems(DEFAULT_NAV_ITEMS)
					return
				}

				const payload = (await response.json()) as NavigationApiResponse
				const normalized = Array.isArray(payload.items)
					? payload.items.map(normalizeItem).filter((item): item is NavItem => item !== null)
					: []

				setItems(normalized.length > 0 ? normalized : DEFAULT_NAV_ITEMS)
			} catch {
				if (!controller.signal.aborted) {
					setItems(DEFAULT_NAV_ITEMS)
				}
			}
		})()

		return () => controller.abort()
	}, [locale])

	return useMemo(() => items, [items])
}
