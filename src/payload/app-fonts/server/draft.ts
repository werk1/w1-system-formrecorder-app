import type {
  AppFontAsset,
  AppFontBinaryAnalysis,
  AppFontFace,
  AppFontFamily,
  AppFontProviderFace,
  AppFontRole,
  AppFontSource,
  AppFontStyle,
  AppFontTarget,
  AppFontWebDerivative,
} from '@werk1/w1-system-font-manager'
import { createDefaultAppFontWeightSubstitutions, isAppFontRoleKey } from '@werk1/w1-system-font-manager'
import type { Payload, PayloadRequest } from 'payload'

type UnknownDocument = Record<string, unknown> & { id: number | string }

export interface AppFontDraftGraph {
  assets: AppFontAsset[]
  faces: AppFontFace[]
  families: AppFontFamily[]
  roles: AppFontRole[]
}

export interface AppFontFamilyDraftGraph {
  assets: AppFontAsset[]
  faces: AppFontFace[]
  family: AppFontFamily
}

export async function readAppFontDraft(payload: Payload, req?: PayloadRequest): Promise<AppFontDraftGraph> {
  const settings = await payload.findGlobal({
    slug: 'app-font-settings',
    depth: 0,
    overrideAccess: true,
    ...(req ? { req } : {}),
  }) as unknown as Record<string, unknown>
  const roleDocuments = asRecords(settings.roles)
  const familyIds = uniqueStrings(roleDocuments.flatMap((role) => [
    relationId(role.family),
    ...asArray(role.fallbackFamilies).map(relationId),
  ]))

  if (familyIds.length === 0) return { assets: [], faces: [], families: [], roles: [] }

  const familyResult = await payload.find({
    collection: 'app-font-families',
    depth: 0,
    limit: 200,
    pagination: false,
    overrideAccess: true,
    where: { id: { in: familyIds } },
    ...(req ? { req } : {}),
  })
  const familyDocuments = familyResult.docs as unknown as UnknownDocument[]
  const assetIds = uniqueStrings(familyDocuments.flatMap((family) => [
    ...asArray(family.faces).map(relationId),
    relationId(family.defaultFace),
  ]))

  const assetResult = assetIds.length === 0
    ? { docs: [] as UnknownDocument[] }
    : await payload.find({
        collection: 'app-font-assets',
        depth: 0,
        limit: 500,
        pagination: false,
        overrideAccess: true,
        where: { id: { in: assetIds } },
        ...(req ? { req } : {}),
      })
  const assetDocuments = assetResult.docs as unknown as UnknownDocument[]

  const assets = assetDocuments.map(toAsset)
  const faces = [
    ...assetDocuments.map(toFace),
    ...familyDocuments.flatMap(toProviderFaces),
  ]
  const families = familyDocuments.map(toFamily)
  const roles = roleDocuments.map((role) => toRole(role, families, faces))

  return { assets, faces, families, roles }
}

export async function readAppFontFamilyDraft(
  payload: Payload,
  familyId: string,
  req?: PayloadRequest,
): Promise<AppFontFamilyDraftGraph> {
  const familyDocument = await payload.findByID({
    collection: 'app-font-families',
    id: familyId,
    depth: 0,
    overrideAccess: true,
    ...(req ? { req } : {}),
  }) as unknown as UnknownDocument
  const assetIds = uniqueStrings([
    ...asArray(familyDocument.faces).map(relationId),
    relationId(familyDocument.defaultFace),
  ])
  const assetResult = assetIds.length === 0
    ? { docs: [] as UnknownDocument[] }
    : await payload.find({
        collection: 'app-font-assets',
        depth: 0,
        limit: 500,
        pagination: false,
        overrideAccess: true,
        where: { id: { in: assetIds } },
        ...(req ? { req } : {}),
      })
  const assetDocuments = assetResult.docs as unknown as UnknownDocument[]
  return {
    assets: assetDocuments.map(toAsset),
    faces: [
      ...assetDocuments.map(toFace),
      ...toProviderFaces(familyDocument),
    ],
    family: toFamily(familyDocument),
  }
}

function toAsset(document: UnknownDocument): AppFontAsset {
  const analysis = requireAnalysis(document)
  const license = requireRecord(document.license, 'license')
  const sourceDocument = requireRecord(document.source, 'source')
  const importedAt = requireString(sourceDocument.importedAt, 'source.importedAt')
  const source: AppFontSource = {
    type: requireString(sourceDocument.type, 'source.type') as AppFontSource['type'],
    importedAt,
    ...(optionalString(sourceDocument.provider) ? { provider: optionalString(sourceDocument.provider) } : {}),
    ...(optionalString(sourceDocument.externalId) ? { externalId: optionalString(sourceDocument.externalId) } : {}),
    ...(optionalString(sourceDocument.externalVersion) ? { externalVersion: optionalString(sourceDocument.externalVersion) } : {}),
    ...(optionalString(sourceDocument.importedBy) ? { importedBy: optionalString(sourceDocument.importedBy) } : {}),
    licenseReference: requireString(license.licenseReference, 'license.licenseReference'),
  }

  return {
    assetId: String(document.id),
    source,
    originalFilename: requireString(document.filename, 'filename'),
    format: analysis.format,
    mediaType: analysis.mediaType,
    byteLength: analysis.byteLength,
    sha256: analysis.sha256,
    storageKey: requireString(document.filename, 'filename'),
    status: requireString(document.status, 'status') as AppFontAsset['status'],
    analysisVersion: analysis.analysisVersion,
    embedding: analysis.embedding,
    ...readWebDerivative(document),
    license: {
      licenseReference: requireString(license.licenseReference, 'license.licenseReference'),
      decisionSource: requireString(license.decisionSource, 'license.decisionSource') as 'manual-review',
      reviewedAt: requireString(license.reviewedAt, 'license.reviewedAt'),
      ...(optionalString(license.reviewedBy) ? { reviewedBy: optionalString(license.reviewedBy) } : {}),
      webUseAllowed: license.webUseAllowed === true,
      serverUseAllowed: license.serverUseAllowed === true,
      pdfEmbeddingAllowed: license.pdfEmbeddingAllowed === true,
      redistributionAllowed: license.redistributionAllowed === true,
    },
    createdAt: requireString(document.createdAt, 'createdAt'),
  }
}

function readWebDerivative(document: UnknownDocument): { webDerivative?: AppFontWebDerivative } {
  if (!document.webDerivative || typeof document.webDerivative !== 'object') return {}
  const derivative = requireRecord(document.webDerivative, 'webDerivative')
  const converter = requireRecord(derivative.converter, 'webDerivative.converter')
  return {
    webDerivative: {
      format: requireString(derivative.format, 'webDerivative.format') as 'woff2',
      mediaType: requireString(derivative.mediaType, 'webDerivative.mediaType') as 'font/woff2',
      byteLength: requireNumber(derivative.byteLength, 'webDerivative.byteLength'),
      sha256: requireString(derivative.sha256, 'webDerivative.sha256'),
      storageKey: requireString(derivative.storageKey, 'webDerivative.storageKey'),
      sourceSha256: requireString(derivative.sourceSha256, 'webDerivative.sourceSha256'),
      analysisVersion: requireString(derivative.analysisVersion, 'webDerivative.analysisVersion'),
      converter: {
        name: requireString(converter.name, 'webDerivative.converter.name'),
        version: requireString(converter.version, 'webDerivative.converter.version'),
      },
      createdAt: requireString(derivative.createdAt, 'webDerivative.createdAt'),
    },
  }
}

function toFace(document: UnknownDocument): AppFontFace {
  const analysis = requireAnalysis(document)
  return {
    faceId: faceId(document.id),
    outlineFingerprint: analysis.outlineFingerprint,
    delivery: { kind: 'managed-binary', assetId: String(document.id), faceIndex: analysis.faceIndex },
    metadataTrust: 'font-table',
    names: analysis.names,
    css: analysis.css,
    metrics: analysis.metrics,
    coverage: analysis.coverage,
    openType: analysis.openType,
    embedding: analysis.embedding,
  }
}

function toFamily(document: UnknownDocument): AppFontFamily {
  if (document.deliveryMode === 'adobe-fonts') {
    const adobeFonts = requireRecord(document.adobeFonts, 'family.adobeFonts')
    const declaredFaces = asRecords(adobeFonts.faces)
    if (declaredFaces.length === 0) throw new Error(`Adobe App Font family ${document.id} has no declared faces.`)
    const faceIds = declaredFaces.map((face, index) => providerFaceId(document.id, face, index))
    return {
      familyId: String(document.id),
      slug: requireString(document.slug, 'family.slug'),
      displayName: requireString(document.displayName, 'family.displayName'),
      cssInternalFamily: `W1AppFont_${cssIdentifier(document.id)}`,
      aliases: asRecords(document.aliases).map((alias) => requireString(alias.value, 'family.aliases.value')),
      genericFallback: requireString(document.genericFallback, 'family.genericFallback') as AppFontFamily['genericFallback'],
      faceIds,
      defaultFaceId: faceIds[0]!,
      status: requireString(document.status, 'family.status') as AppFontFamily['status'],
    }
  }

  const faceIds = uniqueStrings(asArray(document.faces).map((value) => relationId(value))).map(faceId)
  const defaultAssetId = relationId(document.defaultFace)
  if (!defaultAssetId) throw new Error(`App Font family ${document.id} has no default face.`)

  return {
    familyId: String(document.id),
    slug: requireString(document.slug, 'family.slug'),
    displayName: requireString(document.displayName, 'family.displayName'),
    cssInternalFamily: `W1AppFont_${cssIdentifier(document.id)}`,
    aliases: asRecords(document.aliases).map((alias) => requireString(alias.value, 'family.aliases.value')),
    genericFallback: requireString(document.genericFallback, 'family.genericFallback') as AppFontFamily['genericFallback'],
    faceIds,
    defaultFaceId: faceId(defaultAssetId),
    status: requireString(document.status, 'family.status') as AppFontFamily['status'],
  }
}

function toProviderFaces(document: UnknownDocument): AppFontProviderFace[] {
  if (document.deliveryMode !== 'adobe-fonts') return []
  const adobeFonts = requireRecord(document.adobeFonts, 'family.adobeFonts')
  const projectId = requireString(adobeFonts.projectId, 'family.adobeFonts.projectId')
  const providerFamily = requireString(adobeFonts.providerFamily, 'family.adobeFonts.providerFamily')
  const licenseReference = requireString(adobeFonts.licenseReference, 'family.adobeFonts.licenseReference')
  return asRecords(adobeFonts.faces).map((face, index) => {
    const weight = requireNumber(face.weight, 'family.adobeFonts.faces.weight')
    const stretch = requireNumber(face.stretch, 'family.adobeFonts.faces.stretch')
    return {
      faceId: providerFaceId(document.id, face, index),
      delivery: {
        kind: 'provider-css',
        provider: 'adobe-fonts',
        stylesheetUrl: `https://use.typekit.net/${projectId}.css`,
        providerFamily,
        licenseReference,
      },
      metadataTrust: 'provider-declared',
      names: {
        family: providerFamily,
        subfamily: requireString(face.label, 'family.adobeFonts.faces.label'),
      },
      css: {
        weight: { min: weight, default: weight, max: weight },
        style: requireString(face.style, 'family.adobeFonts.faces.style') as AppFontStyle,
        stretch: { min: stretch, default: stretch, max: stretch },
        display: 'swap',
      },
    }
  })
}

function toRole(
  document: Record<string, unknown>,
  families: AppFontFamily[],
  faces: AppFontFace[],
): AppFontRole {
  const roleSelection = requireString(document.roleSelection, 'role.roleSelection')
  const roleKey = resolveRoleKey(roleSelection, document.customRoleKey)
  const familyId = relationId(document.family)
  if (!familyId) throw new Error(`App Font role ${roleKey} has no family.`)
  const family = families.find((candidate) => candidate.familyId === familyId)
  if (!family) throw new Error(`App Font role ${roleKey} references unknown family ${familyId}.`)
  const selection = optionalRecord(document.faceSelection)
  const publishAllFaces = selection.all !== false
  const chosenFaceIds = publishAllFaces
    ? []
    : uniqueStrings(asArray(selection.faceIds).map((value) => optionalString(value)))
  const publishedFaceIds = publishAllFaces ? family.faceIds : chosenFaceIds
  const publishedFaces = faces.filter((face) => publishedFaceIds.includes(face.faceId))
  const savedWeightSubstitutions = new Map(asRecords(document.weightSubstitutions).map((substitution) => [
    requireNumber(substitution.requestedWeight, `role.${roleKey}.weightSubstitutions.requestedWeight`),
    requireNumber(substitution.replacementWeight, `role.${roleKey}.weightSubstitutions.replacementWeight`),
  ]))
  const weightSubstitutions = createDefaultAppFontWeightSubstitutions(publishedFaces)
    .map((substitution) => ({
      ...substitution,
      replacementWeight: savedWeightSubstitutions.get(substitution.requestedWeight)
        ?? substitution.replacementWeight,
    }))

  return {
    roleKey,
    label: roleLabel(roleSelection, roleKey),
    cssCustomProperty: `--fontfamily_${roleKey}`,
    familyId,
    fallbackFamilyIds: uniqueStringsInOrder(asArray(document.fallbackFamilies).map(relationId)),
    genericFallback: asArray(document.genericFallback).map((value) => requireString(value, `role.${roleKey}.genericFallback`)),
    defaultRequest: {
      weight: requireNumber(document.defaultWeight, `role.${roleKey}.defaultWeight`),
      style: requireString(document.defaultStyle, `role.${roleKey}.defaultStyle`) as AppFontStyle,
      stretch: requireNumber(document.defaultStretch, `role.${roleKey}.defaultStretch`),
    },
    publishedFaces: {
      mode: publishAllFaces ? 'all-family-faces' : 'selected-family-faces',
      faceIds: chosenFaceIds,
    },
    weightSubstitutions,
    targets: asArray(document.targets).map((value) => requireString(value, `role.${roleKey}.targets`) as AppFontTarget),
    fontSynthesis: requireString(document.fontSynthesis, `role.${roleKey}.fontSynthesis`) as AppFontRole['fontSynthesis'],
  }
}

function resolveRoleKey(selection: string, customRoleKey: unknown): string {
  if (selection === 'primary' || selection === 'secondary' || selection === 'display' || selection === 'mono') {
    return selection
  }
  if (selection !== 'custom') throw new Error(`Unknown App Font role selection ${selection}.`)
  const roleKey = requireString(customRoleKey, 'role.customRoleKey')
  if (!isAppFontRoleKey(roleKey)) throw new Error(`Invalid custom App Font role key ${roleKey}.`)
  return roleKey
}

function roleLabel(selection: string, roleKey: string): string {
  if (selection === 'primary') return 'Primary'
  if (selection === 'secondary') return 'Secondary'
  if (selection === 'display') return 'Display'
  if (selection === 'mono') return 'Mono'
  return roleKey
}

function requireAnalysis(document: UnknownDocument): AppFontBinaryAnalysis {
  return requireRecord(document.analysis, 'analysis') as unknown as AppFontBinaryAnalysis
}

function faceId(assetId: unknown): string {
  return `face_${String(assetId)}`
}

function providerFaceId(familyId: unknown, face: Record<string, unknown>, index: number): string {
  const rowId = typeof face.id === 'string' || typeof face.id === 'number' ? face.id : index
  return `face_adobe_${cssIdentifier(familyId)}_${cssIdentifier(rowId)}`
}

function cssIdentifier(value: unknown): string {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '_')
}

function relationId(value: unknown): string | undefined {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (value && typeof value === 'object' && 'id' in value) return String((value as { id: unknown }).id)
  return undefined
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asRecords(value: unknown): Array<Record<string, unknown>> {
  return asArray(value).filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort()
}

function uniqueStringsInOrder(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Missing ${path}.`)
  return value as Record<string, unknown>
}

function optionalRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing ${path}.`)
  return value
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function requireNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Missing ${path}.`)
  return value
}

