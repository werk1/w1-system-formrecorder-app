import path from 'node:path'

import type {
  AppFontFamilyImportCandidate,
  AppFontImportFaceCandidate,
  AppFontLicenseKind,
} from '@werk1/w1-system-font-manager/imports'
import type {
  AppFontSource,
  AppFontSourceType,
} from '@werk1/w1-system-font-manager'
import type { Document, Payload, RequiredDataFromCollectionSlug } from 'payload'

import { APP_FONT_IMPORT_CONTEXT_KEY } from '../constants'

type ImportSource = Pick<AppFontSource,
  'type' | 'provider' | 'externalId' | 'externalVersion' | 'sourceUrl' | 'licenseReference' | 'attribution'
>

export interface ImportAppFontFamiliesInput {
  payload: Payload
  actor: Document
  families: AppFontFamilyImportCandidate[]
  source: ImportSource
  genericFallback?: 'serif' | 'sans-serif' | 'monospace' | 'cursive' | 'fantasy' | 'system-ui'
  licenseReference?: string
}

export interface ImportedAppFontFamilyResult {
  familyId: string
  displayName: string
  status: 'draft' | 'ready'
  assetIds: string[]
  reusedAssetIds: string[]
  licenseReference: string
  defaultFaceLabel: string
  faces: Array<{
    label: string
    weight: number
    style: string
    stretch: number
    variable: boolean
    relativePath: string
  }>
  warnings: string[]
}

export async function importAppFontFamilies(
  input: ImportAppFontFamiliesInput,
): Promise<ImportedAppFontFamilyResult[]> {
  const actorId = String(input.actor.id)
  const results: ImportedAppFontFamilyResult[] = []

  for (const candidate of input.families) {
    const license = chooseLicense(candidate.licenses.map((item) => ({
      kind: item.kind,
      relativePath: item.relativePath,
      sha256: item.sha256,
    })))
    const recognizedLicense = license?.kind !== undefined && license.kind !== 'unknown'
    const licenseReference = input.licenseReference
      ?? (license ? `${license.relativePath}#sha256=${license.sha256}` : 'No license supplied; manual review required')
    const assetIds: string[] = []
    const reusedAssetIds: string[] = []
    const createdAssets: Array<{ id: string; face: AppFontImportFaceCandidate }> = []

    for (const face of candidate.faces) {
      const existing = await input.payload.find({
        collection: 'app-font-assets',
        depth: 0,
        limit: 1,
        pagination: false,
        overrideAccess: true,
        where: { sha256: { equals: face.analysis.sha256 } },
      })
      const existingDocument = existing.docs[0]
      if (existingDocument) {
        const id = String(existingDocument.id)
        if (existingDocument.status !== 'ready') {
          throw new Error(`Existing App Font asset ${id} is not ready and cannot be reused.`)
        }
        assetIds.push(id)
        reusedAssetIds.push(id)
        createdAssets.push({ id, face })
        continue
      }

      const source: ImportSource & { importedBy: string } = {
        ...input.source,
        type: normalizeSourceType(input.source.type),
        licenseReference,
        importedBy: actorId,
      }
      const filename = importFilename(face)
      const created = await input.payload.create({
        collection: 'app-font-assets',
        data: {
          license: {
            licenseReference,
            webUseAllowed: recognizedLicense,
            serverUseAllowed: recognizedLicense,
            pdfEmbeddingAllowed: recognizedLicense,
            redistributionAllowed: recognizedLicense,
          },
        } as unknown as RequiredDataFromCollectionSlug<'app-font-assets'>,
        file: {
          data: Buffer.from(face.bytes),
          mimetype: face.analysis.mediaType,
          name: filename,
          size: face.bytes.byteLength,
        },
        context: {
          [APP_FONT_IMPORT_CONTEXT_KEY]: {
            source,
            licenseDecisionSource: recognizedLicense ? 'license-record' : 'manual-review',
          },
        },
        overrideAccess: true,
        user: input.actor,
      })
      if (created.status !== 'ready') {
        throw new Error(`App Font asset ${created.id} failed derivative generation.`)
      }
      const id = String(created.id)
      assetIds.push(id)
      createdAssets.push({ id, face })
    }

    const defaultFaceId = chooseDefaultFaceId(createdAssets)
    const status: 'draft' | 'ready' = recognizedLicense && candidate.warnings.length === 0 ? 'ready' : 'draft'
    const familyData = {
      displayName: candidate.displayName,
      slug: candidate.familyKey,
      status,
      deliveryMode: 'managed-binary' as const,
      genericFallback: input.genericFallback ?? 'sans-serif',
      faces: assetIds,
      defaultFace: defaultFaceId,
      aliases: [],
    } as unknown as RequiredDataFromCollectionSlug<'app-font-families'>
    const existingFamily = await input.payload.find({
      collection: 'app-font-families',
      depth: 0,
      limit: 1,
      pagination: false,
      overrideAccess: true,
      where: { slug: { equals: candidate.familyKey } },
    })
    const family = existingFamily.docs[0]
      ? await updateManagedFamily(input.payload, input.actor, existingFamily.docs[0], familyData)
      : await input.payload.create({
          collection: 'app-font-families',
          data: familyData,
          overrideAccess: true,
          user: input.actor,
        })

    results.push({
      familyId: String(family.id),
      displayName: candidate.displayName,
      status,
      assetIds,
      reusedAssetIds,
      licenseReference,
      defaultFaceLabel: faceLabel(createdAssets.find((face) => face.id === defaultFaceId)?.face ?? createdAssets[0]!.face),
      faces: createdAssets.map(({ face }) => faceSummary(face)),
      warnings: candidate.warnings,
    })
  }

  return results
}

async function updateManagedFamily(
  payload: Payload,
  actor: Document,
  existing: { id: string | number; deliveryMode?: string | null; slug?: string | null },
  data: RequiredDataFromCollectionSlug<'app-font-families'>,
) {
  if (existing.deliveryMode === 'adobe-fonts') {
    throw new Error(`App Font family slug ${String(existing.slug)} already belongs to an Adobe Fonts family.`)
  }
  return payload.update({
    collection: 'app-font-families',
    id: String(existing.id),
    data,
    overrideAccess: true,
    user: actor,
  })
}

function chooseDefaultFaceId(faces: Array<{ id: string; face: AppFontImportFaceCandidate }>): string {
  const ranked = [...faces].sort((left, right) => scoreDefaultFace(left.face) - scoreDefaultFace(right.face))
  const id = ranked[0]?.id
  if (!id) throw new Error('Imported App Font family has no face to use as default.')
  return id
}

function scoreDefaultFace(face: AppFontImportFaceCandidate): number {
  const stylePenalty = face.analysis.css.style === 'normal' ? 0 : 10_000
  const weight = face.analysis.css.weight
  const weightPenalty = weight.min <= 400 && weight.max >= 400 ? 0 : Math.abs(weight.default - 400)
  const stretch = face.analysis.css.stretch
  const stretchPenalty = stretch.min <= 100 && stretch.max >= 100 ? 0 : Math.abs(stretch.default - 100)
  return stylePenalty + weightPenalty + stretchPenalty
}

function faceSummary(face: AppFontImportFaceCandidate): ImportedAppFontFamilyResult['faces'][number] {
  return {
    label: faceLabel(face),
    weight: face.analysis.css.weight.default,
    style: face.analysis.css.style,
    stretch: face.analysis.css.stretch.default,
    variable: face.variable,
    relativePath: face.relativePath,
  }
}

function faceLabel(face: AppFontImportFaceCandidate): string {
  return face.analysis.names.fullName
    ?? face.analysis.names.typographicSubfamily
    ?? face.analysis.names.subfamily
    ?? `${face.analysis.css.weight.default} ${face.analysis.css.style}`
}

function importFilename(face: AppFontImportFaceCandidate): string {
  const original = path.basename(face.relativePath).replace(/[^a-zA-Z0-9._-]+/g, '-')
  return `${face.analysis.sha256.slice(0, 12)}-${original}`
}

function chooseLicense(licenses: Array<{ kind: AppFontLicenseKind; relativePath: string; sha256: string }>) {
  return licenses.find((license) => license.kind !== 'unknown') ?? licenses[0]
}

function normalizeSourceType(type: AppFontSourceType): AppFontSourceType {
  if (type === 'payload-upload' || type === 'google-fonts') return type
  throw new Error(`App Font import source ${type} is not accepted by this importer.`)
}
