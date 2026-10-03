import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import type {
  AppFontAsset,
  AppFontBinaryAnalysis,
  AppFontBinaryFormat,
  AppFontBinaryResolutionRequest,
  AppFontManagedFace,
  PublishedAppFontAsset,
  PublishedAppFontSnapshot,
} from '@werk1/w1-system-font-manager'
import { analyzeAppFontBinary, detectAppFontBinaryFormat } from '@werk1/w1-system-font-manager/analysis'
import { getInterBuiltinOriginalAssets, getInterBuiltinSnapshotEntry } from '@werk1/w1-system-font-manager/builtins/inter'
import { readInterBuiltinAsset } from '@werk1/w1-system-font-manager/builtins/inter/server'
import type { Payload } from 'payload'

import type { AppFontDraftGraph } from './draft'

const APP_FONT_STORAGE_ROOT = path.resolve(process.cwd(), 'app-font-assets')

type StoredAssetDocument = {
  filename?: unknown
  sha256?: unknown
  format?: unknown
  verifiedMediaType?: unknown
  byteLength?: unknown
  webDerivative?: {
    storageKey?: unknown
    sha256?: unknown
    format?: unknown
    mediaType?: unknown
    byteLength?: unknown
  } | null
}

export async function verifyAppFontDraftStorage(
  assets: AppFontAsset[],
): Promise<Map<string, { source: AppFontBinaryAnalysis; webDerivative?: AppFontBinaryAnalysis }>> {
  const analyses = new Map<string, { source: AppFontBinaryAnalysis; webDerivative?: AppFontBinaryAnalysis }>()
  for (const asset of assets) {
    const sourceBytes = await readVerifiedStoredAppFont({
      storageKey: asset.storageKey,
      sha256: asset.sha256,
      byteLength: asset.byteLength,
      format: asset.format,
    })
    const source = analyzeAppFontBinary({ bytes: sourceBytes })
    if (source.mediaType !== asset.mediaType) throw new Error(`Stored App Font ${asset.assetId} media type is invalid.`)
    if (asset.webDerivative) {
      const derivativeBytes = await readVerifiedStoredAppFont({
        storageKey: asset.webDerivative.storageKey,
        sha256: asset.webDerivative.sha256,
        byteLength: asset.webDerivative.byteLength,
        format: asset.webDerivative.format,
      })
      const webDerivative = analyzeAppFontBinary({ bytes: derivativeBytes })
      if (
        webDerivative.mediaType !== asset.webDerivative.mediaType
        || webDerivative.outlineFingerprint !== source.outlineFingerprint
      ) {
        throw new Error(`Stored App Font ${asset.assetId} derivative identity is invalid.`)
      }
      analyses.set(asset.assetId, { source, webDerivative })
    } else {
      analyses.set(asset.assetId, { source })
    }
  }
  return analyses
}

export async function verifyAppFontDraftGraph(graph: AppFontDraftGraph): Promise<AppFontDraftGraph> {
  const analyses = await verifyAppFontDraftStorage(graph.assets)
  return {
    ...graph,
    assets: graph.assets.map((asset) => {
      const analysis = analyses.get(asset.assetId)
      if (!analysis) throw new Error(`Verified analysis is missing for App Font asset ${asset.assetId}.`)
      return {
        ...asset,
        analysisVersion: analysis.source.analysisVersion,
        embedding: analysis.source.embedding,
        ...(asset.webDerivative && analysis.webDerivative
          ? {
              webDerivative: {
                ...asset.webDerivative,
                analysisVersion: analysis.webDerivative.analysisVersion,
              },
            }
          : {}),
      }
    }),
    faces: graph.faces.map((face) => {
      if (face.delivery.kind !== 'managed-binary') return face
      const analysis = analyses.get(face.delivery.assetId)?.source
      if (!analysis) throw new Error(`Verified analysis is missing for App Font face ${face.faceId}.`)
      const verifiedFace: AppFontManagedFace = {
        ...face,
        outlineFingerprint: analysis.outlineFingerprint,
        delivery: { ...face.delivery, faceIndex: analysis.faceIndex },
        metadataTrust: 'font-table',
        names: analysis.names,
        css: analysis.css,
        metrics: analysis.metrics,
        coverage: analysis.coverage,
        openType: analysis.openType,
        embedding: analysis.embedding,
      }
      return verifiedFace
    }),
  }
}

export async function verifyPublishedAppFontStorage(
  payload: Payload,
  snapshot: PublishedAppFontSnapshot,
): Promise<void> {
  for (const asset of snapshot.assets) {
    const document = await findStoredAssetByOriginalHash(payload, asset.sha256)
    await verifyPublishedAssetDocument(document, asset)
  }
  await verifyPublishedInterBuiltIn(snapshot)
}

export async function resolvePublishedAppFontBinary(
  payload: Payload,
  request: AppFontBinaryResolutionRequest,
): Promise<Uint8Array> {
  if (!/^[a-f0-9]{64}$/.test(request.sha256)) throw new Error('App Font binary hash is invalid.')
  const admitted = await payload.find({
    collection: 'app-font-snapshots',
    depth: 0,
    limit: 1,
    pagination: false,
    overrideAccess: true,
    where: { 'serverAssetHashes.hash': { equals: request.sha256 } },
  })
  if (admitted.docs.length !== 1) throw new Error('App Font binary is not admitted by a published server bundle.')

  const interAsset = getInterBuiltinOriginalAssets().find((asset) => asset.sha256 === request.sha256)
  if (interAsset) {
    if (
      request.assetId !== interAsset.assetId
      || request.format !== interAsset.format
      || request.mediaType !== interAsset.mediaType
      || request.byteLength !== interAsset.byteLength
    ) {
      throw new Error('Built-in Inter request does not match the published asset contract.')
    }
    return (await readInterBuiltinAsset(interAsset.assetId)).bytes
  }

  const document = await findStoredAssetByOriginalHash(payload, request.sha256)
  const filename = requireString(document.filename, 'stored source filename')
  const bytes = await readVerifiedStoredAppFont({
    storageKey: filename,
    sha256: request.sha256,
    byteLength: request.byteLength,
    format: request.format,
  })
  if (document.verifiedMediaType !== request.mediaType) throw new Error('Stored App Font media type does not match the bundle.')
  return bytes
}

async function verifyPublishedInterBuiltIn(snapshot: PublishedAppFontSnapshot): Promise<void> {
  const published = snapshot.builtIns.find((builtIn) => builtIn.id === 'inter')
  const installed = getInterBuiltinSnapshotEntry()
  if (!published || published.integritySha256 !== installed.integritySha256) {
    throw new Error('Published built-in Inter manifest does not match the installed package.')
  }
  for (const asset of published.assets.filter((candidate) => candidate.delivery === 'original')) {
    if (!snapshot.bundles.serverAssetHashes.includes(asset.sha256)) {
      throw new Error(`Published built-in Inter asset ${asset.assetId} is missing from the server bundle.`)
    }
    const installedAsset = installed.assets.find((candidate) => candidate.assetId === asset.assetId)
    if (
      !installedAsset
      || installedAsset.sha256 !== asset.sha256
      || installedAsset.byteLength !== asset.byteLength
      || installedAsset.format !== asset.format
    ) {
      throw new Error(`Published built-in Inter asset ${asset.assetId} does not match the installed package.`)
    }
    await readInterBuiltinAsset(asset.assetId)
  }
}

export async function readVerifiedStoredAppFont(input: {
  storageKey: string
  sha256: string
  byteLength: number
  format: AppFontBinaryFormat
}): Promise<Uint8Array> {
  const root = APP_FONT_STORAGE_ROOT
  const storageKey = path.basename(input.storageKey)
  if (storageKey !== input.storageKey) throw new Error('Stored App Font key is invalid.')
  const filePath = path.resolve(root, storageKey)
  if (!filePath.startsWith(`${root}${path.sep}`)) throw new Error('Stored App Font path escapes its storage root.')

  const bytes = await readFile(filePath)
  if (bytes.byteLength !== input.byteLength) throw new Error(`Stored App Font ${storageKey} has an unexpected byte length.`)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  if (sha256 !== input.sha256) throw new Error(`Stored App Font ${storageKey} failed SHA-256 verification.`)
  if (detectAppFontBinaryFormat(bytes) !== input.format) throw new Error(`Stored App Font ${storageKey} has an unexpected binary format.`)
  return bytes
}

async function findStoredAssetByOriginalHash(payload: Payload, sha256: string): Promise<StoredAssetDocument> {
  const result = await payload.find({
    collection: 'app-font-assets',
    depth: 0,
    limit: 1,
    pagination: false,
    overrideAccess: true,
    where: { sha256: { equals: sha256 } },
  })
  const document = result.docs[0] as unknown as StoredAssetDocument | undefined
  if (!document) throw new Error(`Published App Font asset ${sha256} is missing from storage metadata.`)
  return document
}

async function verifyPublishedAssetDocument(
  document: StoredAssetDocument,
  asset: PublishedAppFontAsset,
): Promise<void> {
  if (document.sha256 !== asset.sha256 || document.format !== asset.format || document.byteLength !== asset.byteLength) {
    throw new Error(`Published App Font asset ${asset.assetId} metadata no longer matches its snapshot.`)
  }
  await readVerifiedStoredAppFont({
    storageKey: requireString(document.filename, 'stored source filename'),
    sha256: asset.sha256,
    byteLength: asset.byteLength,
    format: asset.format,
  })
  if (!asset.webDerivative) return
  const derivative = document.webDerivative
  if (
    !derivative
    || derivative.sha256 !== asset.webDerivative.sha256
    || derivative.format !== asset.webDerivative.format
    || derivative.byteLength !== asset.webDerivative.byteLength
  ) {
    throw new Error(`Published App Font asset ${asset.assetId} derivative no longer matches its snapshot.`)
  }
  await readVerifiedStoredAppFont({
    storageKey: requireString(derivative.storageKey, 'stored derivative key'),
    sha256: asset.webDerivative.sha256,
    byteLength: asset.webDerivative.byteLength,
    format: asset.webDerivative.format,
  })
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`Missing ${label}.`)
  return value
}

