import type { CollectionConfig, TextFieldSingleValidation } from 'payload'
import { text } from 'payload/shared'
import {
	ContentSectionBlock,
	ImageSectionBlock,
	CarouselSectionBlock,
	FlipbookSectionBlock,
} from '@/payload/blocks'
import { generateRandomEditableKey, normalizeLowercaseText } from '@/payload/utils/slug'

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

function normalizeSectionArray(rawSections: unknown[]): unknown[] {
	return rawSections
		.map((rawSection) => {
			if (!isRecord(rawSection)) return null
			const section = { ...rawSection }
			const blockType = normalizeLowercaseText(section.blockType)
			const key = normalizeLowercaseText(section.key)
			if (!blockType) return null
			section.blockType = blockType
			if (typeof section.sectionSlug === 'string') section.sectionSlug = section.sectionSlug.trim().toLowerCase()
			if (typeof section.mediaSlug === 'string') section.mediaSlug = section.mediaSlug.trim().toLowerCase()
			if (typeof section.carouselSlug === 'string') section.carouselSlug = section.carouselSlug.trim().toLowerCase()
			if (typeof section.flipbookSlug === 'string') section.flipbookSlug = section.flipbookSlug.trim().toLowerCase()
			if (typeof section.shaderType === 'string') section.shaderType = section.shaderType.trim()
			section.key = key ?? generateRandomEditableKey('section')
			return section
		})
		.filter((section): section is Record<string, unknown> => section !== null)
}

export function normalizeLocalizedSections(rawSections: unknown): unknown {
	if (Array.isArray(rawSections)) return normalizeSectionArray(rawSections)
	if (!isRecord(rawSections)) return rawSections
	const normalizedEntries = Object.entries(rawSections).map(([locale, value]) => [
		locale,
		Array.isArray(value) ? normalizeSectionArray(value) : value,
	])
	return Object.fromEntries(normalizedEntries)
}


const validateRoute: TextFieldSingleValidation = (value, options) =>
	typeof value === 'string' && /^\/flipbooks(\/|$)/i.test(value.trim())
		? 'Routes below "/flipbooks" are reserved for the PDF reader.'
		: text(value, options)

export const Pages: CollectionConfig = {
	slug: 'pages',
	admin: {
		useAsTitle: 'title',
		defaultColumns: ['title', 'route', 'isPublished', 'updatedAt'],
	},
	hooks: {
		beforeChange: [
			({ data }) => {
				if (!data || !isRecord(data)) return data
				if (!('sections' in data)) return data
				return { ...data, sections: normalizeLocalizedSections(data.sections) }
			},
		],
	},
	fields: [
		{
			name: 'route',
			type: 'text',
			required: true,
			unique: true,
			index: true,
			defaultValue: '/',
			validate: validateRoute,
			admin: {
				description: 'Frontend route including leading slash. Examples: "/", "/about", "/company/team".',
			},
		},
		{
			name: 'title',
			type: 'text',
			required: true,
			localized: true,
		},
		{
			name: 'sections',
			type: 'blocks',
			localized: true,
			blocks: [
			ContentSectionBlock,
			ImageSectionBlock,
			CarouselSectionBlock,
			FlipbookSectionBlock,
			],
			admin: {
				description: 'Primary frontend composition model. Sections render in order via the composer path.',
			},
		},
		{
			name: 'seo',
			type: 'group',
			fields: [
				{ name: 'metaTitle', type: 'text', localized: true },
				{ name: 'metaDescription', type: 'textarea', localized: true },
			],
		},
		{
			name: 'isPublished',
			type: 'checkbox',
			defaultValue: true,
			index: true,
		},
	],
}
