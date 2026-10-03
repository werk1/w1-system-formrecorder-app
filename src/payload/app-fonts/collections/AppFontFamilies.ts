import {
  APIError,
  type CollectionBeforeDeleteHook,
  type CollectionBeforeValidateHook,
  type CollectionConfig,
} from 'payload'

import { appFontAdminAccess, appFontAdminPanelAccess } from '../access'

function relationId(value: unknown): string | undefined {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (value && typeof value === 'object' && 'id' in value) return String((value as { id: unknown }).id)
  return undefined
}

const normalizeFamily: CollectionBeforeValidateHook = ({ data }) => {
  if (!data) return data
  const nextData = { ...data }
  const displayName = typeof nextData.displayName === 'string' ? nextData.displayName.trim() : ''
  const slugSource = typeof nextData.slug === 'string' && nextData.slug.trim() ? nextData.slug : displayName
  nextData.slug = slugSource
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  const faceIds = Array.isArray(nextData.faces) ? nextData.faces.map(relationId).filter(Boolean) : []
  const defaultFaceId = relationId(nextData.defaultFace)
  const deliveryMode = nextData.deliveryMode === 'adobe-fonts' ? 'adobe-fonts' : 'managed-binary'
  nextData.deliveryMode = deliveryMode

  if (deliveryMode === 'managed-binary') {
    if (faceIds.length === 0 || !defaultFaceId) {
      throw new APIError('Managed App Font families require at least one uploaded face and a default face.', 400)
    }
    if (!faceIds.includes(defaultFaceId)) {
      throw new APIError('The default face must be included in this family.', 400)
    }
    // Keep the inactive optional group absent. Payload traverses named groups
    // during validation and cannot safely traverse an explicit `null` value.
    delete nextData.adobeFonts
  } else {
    const adobeFonts = asRecord(nextData.adobeFonts)
    const projectId = typeof adobeFonts.projectId === 'string' ? adobeFonts.projectId.trim().toLowerCase() : ''
    const providerFamily = typeof adobeFonts.providerFamily === 'string' ? adobeFonts.providerFamily.trim() : ''
    const licenseReference = typeof adobeFonts.licenseReference === 'string' ? adobeFonts.licenseReference.trim() : ''
    const providerFaces = Array.isArray(adobeFonts.faces) ? adobeFonts.faces : []
    if (!/^[a-z0-9]{4,32}$/.test(projectId)) {
      throw new APIError('Adobe Fonts Web Project ID must contain 4-32 lowercase letters or digits.', 400)
    }
    if (!providerFamily || !licenseReference || providerFaces.length === 0) {
      throw new APIError('Adobe Fonts families require a CSS family, license reference and at least one declared face.', 400)
    }
    nextData.adobeFonts = {
      ...adobeFonts,
      projectId,
      providerFamily,
      licenseReference,
      faces: normalizeAdobeFaces(providerFaces),
    }
    nextData.faces = []
    nextData.defaultFace = null
  }

  return nextData
}

const preventDeletingReferencedFamily: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const settings = await req.payload.findGlobal({
    slug: 'app-font-settings',
    depth: 0,
    overrideAccess: true,
    req,
  }) as unknown as Record<string, unknown>
  const familyId = String(id)
  const role = asRecords(settings.roles).find((candidate) => {
    return relationId(candidate.family) === familyId
      || asArray(candidate.fallbackFamilies).some((fallback) => relationId(fallback) === familyId)
  })
  if (role) {
    throw new APIError(
      'Diese App-Font-Familie ist noch in den App-Font-Einstellungen referenziert. Entferne sie zuerst aus Rollen und Fallbacks.',
      400,
    )
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : []
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function normalizeAdobeFaces(value: unknown[]): Array<{ label: string; weight: number; style: string; stretch: number }> {
  return value.map((face) => {
    const record = asRecord(face)
    const weight = clampInteger(record.weight, 400, 1, 1000)
    const style = record.style === 'italic' || record.style === 'oblique' ? record.style : 'normal'
    const stretch = clampInteger(record.stretch, 100, 1, 1000)
    const label = typeof record.label === 'string' && record.label.trim()
      ? record.label.trim()
      : adobeFaceLabel(weight, style)
    return { ...record, label, weight, style, stretch }
  })
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isInteger(value)
    ? Math.min(max, Math.max(min, value))
    : fallback
}

function adobeFaceLabel(weight: number, style: string): string {
  const weightName = new Map([
    [100, 'Thin'],
    [200, 'Extra Light'],
    [300, 'Light'],
    [400, 'Regular'],
    [500, 'Medium'],
    [600, 'Semi Bold'],
    [700, 'Bold'],
    [800, 'Extra Bold'],
    [900, 'Black'],
  ]).get(weight) ?? String(weight)
  return style === 'normal' ? weightName : `${weightName} ${style === 'italic' ? 'Italic' : 'Oblique'}`
}

export const AppFontFamilies: CollectionConfig = {
  slug: 'app-font-families',
  labels: {
    singular: 'App-Font-Familie',
    plural: 'App-Font-Familien',
  },
  admin: {
    group: 'App Fonts',
    useAsTitle: 'displayName',
    defaultColumns: ['displayName', 'slug', 'status', 'updatedAt'],
    components: {
      Description: './payload/app-fonts/components/AppFontPageDescriptions#AppFontFamiliesDescription',
    },
  },
  access: {
    admin: appFontAdminPanelAccess,
    create: appFontAdminAccess,
    read: appFontAdminAccess,
    update: appFontAdminAccess,
    delete: appFontAdminAccess,
  },
  hooks: {
    beforeValidate: [normalizeFamily],
    beforeDelete: [preventDeletingReferencedFamily],
  },
  fields: [
    { name: 'displayName', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: ['draft', 'ready', 'retired'],
    },
    {
      name: 'deliveryMode',
      type: 'select',
      required: true,
      defaultValue: 'managed-binary',
      options: [
        { label: 'Verwalteter Upload (TTF/OTF + automatisches WOFF2)', value: 'managed-binary' },
        { label: 'Adobe Fonts Web Project', value: 'adobe-fonts' },
      ],
    },
    {
      name: 'genericFallback',
      type: 'select',
      required: true,
      defaultValue: 'sans-serif',
      options: ['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui'],
    },
    {
      name: 'faces',
      type: 'relationship',
      relationTo: 'app-font-assets',
      hasMany: true,
      filterOptions: { status: { equals: 'ready' } },
      admin: { condition: (_, siblingData) => siblingData?.deliveryMode !== 'adobe-fonts' },
    },
    {
      name: 'defaultFace',
      type: 'relationship',
      relationTo: 'app-font-assets',
      filterOptions: { status: { equals: 'ready' } },
      admin: { condition: (_, siblingData) => siblingData?.deliveryMode !== 'adobe-fonts' },
    },
    {
      name: 'adobeFonts',
      type: 'group',
      label: 'Adobe Fonts Web Project',
      admin: { condition: (_, siblingData) => siblingData?.deliveryMode === 'adobe-fonts' },
      fields: [
        {
          name: 'adobeFontsAssistant',
          type: 'ui',
          admin: {
            components: {
              Field: './payload/app-fonts/components/AdobeFontsProjectAssistant#AdobeFontsProjectAssistant',
            },
          },
        },
        {
          name: 'projectId',
          type: 'text',
          label: 'Web Project ID',
          admin: { description: 'Die ID aus der offiziellen Adobe-Fonts-URL: https://use.typekit.net/<projectId>.css' },
        },
        {
          name: 'providerFamily',
          type: 'text',
          label: 'Adobe CSS font-family',
          admin: { description: 'Exakte CSS-Familie des Adobe Web Projects, zum Beispiel proxima-nova.' },
        },
        {
          name: 'licenseReference',
          type: 'text',
          admin: { description: 'Vertragsreferenz des Adobe-Kontos oder Web Projects. Fontdateien werden nicht kopiert.' },
        },
        {
          name: 'faces',
          type: 'array',
          labels: { singular: 'Deklarierter Adobe-Schnitt', plural: 'Deklarierte Adobe-Schnitte' },
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'label', type: 'text', required: true, admin: { width: '30%' } },
                { name: 'weight', type: 'number', required: true, defaultValue: 400, min: 1, max: 1000, admin: { width: '25%' } },
                { name: 'style', type: 'select', required: true, defaultValue: 'normal', options: ['normal', 'italic', 'oblique'], admin: { width: '25%' } },
                { name: 'stretch', type: 'number', required: true, defaultValue: 100, min: 1, max: 1000, admin: { width: '20%' } },
              ],
            },
          ],
        },
      ],
    },
    {
      name: 'aliases',
      type: 'array',
      fields: [{ name: 'value', type: 'text', required: true }],
    },
  ],
}
