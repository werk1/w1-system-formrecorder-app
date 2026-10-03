import type { Access, CollectionConfig } from 'payload'
import { slugFromTitle } from '@/payload/utils/slug'

const adminOnly: Access = ({ req: { user } }) =>
	Boolean((user as { roles?: string[] } | null)?.roles?.includes('admin'))

export const Carousels: CollectionConfig = {
	slug: 'carousels',
	labels: {
		singular: 'Carousel',
		plural: 'Carousels',
	},
	admin: {
		useAsTitle: 'title',
		defaultColumns: ['title', 'slug', 'carouselType', 'updatedAt'],
	},
	access: {
		read: () => true,
		create: adminOnly,
		update: adminOnly,
		delete: adminOnly,
	},
	hooks: {
		beforeValidate: [
			({ data }) => {
				if (!data) return data
				const incomingSlug = data.slug
				const incomingTitle = data.title
				if (!incomingSlug || (typeof incomingSlug === 'string' && incomingSlug.trim().length === 0)) {
					const generatedSlug = slugFromTitle(incomingTitle)
					if (generatedSlug) data.slug = generatedSlug
				} else if (typeof incomingSlug === 'string') {
					data.slug = incomingSlug.trim().toLowerCase()
				}
				return data
			},
		],
	},
	fields: [
		{
			name: 'slug',
			type: 'text',
			required: true,
			unique: true,
			admin: {
				description: 'Eindeutiger Slug für dieses Carousel (wird in Page-Sections referenziert)',
			},
		},
		{
			name: 'title',
			type: 'text',
			required: true,
			admin: {
				description: 'Interner Titel für die Verwaltung',
			},
		},
		{
			name: 'carouselType',
			type: 'select',
			required: true,
			defaultValue: 'image',
			options: [
				{ label: 'Image Carousel', value: 'image' },
				{ label: 'Video Carousel', value: 'video' },
			],
			admin: {
				description: 'Legt fest, ob dieses Carousel in einer Image- oder Video-Carousel-Section verwendet werden soll.',
			},
		},
		{
			name: 'media',
			type: 'relationship',
			relationTo: 'media',
			hasMany: true,
			admin: {
				description: 'Manuelle Bilder/Videos für dieses Carousel.',
			},
		},
		{
			name: 'importMeta',
			type: 'group',
			fields: [
				{
					name: 'importSlug',
					type: 'text',
					admin: {
						description: 'Import-Slug für IDML-Import-Tracking',
					},
				},
			],
		},
	],
	indexes: [
		{
			fields: ['importMeta.importSlug'],
		},
	],
}
