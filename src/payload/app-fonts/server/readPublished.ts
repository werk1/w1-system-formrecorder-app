import type { PublishedAppFontSnapshot } from '@werk1/w1-system-font-manager'
import { verifyPublishedAppFontSnapshot } from '@werk1/w1-system-font-manager/publisher'
import type { Payload } from 'payload'

type SnapshotDocument = {
  id: number | string
  snapshotId?: unknown
  css?: unknown
  manifest?: unknown
  assetHashes?: Array<{ hash?: unknown }> | null
}

export async function readCurrentAppFontSnapshot(payload: Payload): Promise<SnapshotDocument | null> {
  const settings = await payload.findGlobal({
    slug: 'app-font-settings',
    depth: 0,
    overrideAccess: true,
  }) as unknown as { currentSnapshot?: unknown }
  const id = relationId(settings.currentSnapshot)
  if (!id) return null

  try {
    const document = await payload.findByID({
      collection: 'app-font-snapshots',
      id,
      depth: 0,
      overrideAccess: true,
    }) as unknown as SnapshotDocument
    return verifiedDocument(document)
  } catch {
    return null
  }
}

export async function readAppFontSnapshotByPublicId(payload: Payload, snapshotId: string): Promise<SnapshotDocument | null> {
  const result = await payload.find({
    collection: 'app-font-snapshots',
    depth: 0,
    limit: 1,
    pagination: false,
    overrideAccess: true,
    where: { snapshotId: { equals: snapshotId } },
  })
  const document = result.docs[0] as unknown as SnapshotDocument | undefined
  if (!document) return null
  try {
    return verifiedDocument(document)
  } catch {
    return null
  }
}

export function publishedManifest(document: SnapshotDocument): PublishedAppFontSnapshot | null {
  if (!document.manifest || typeof document.manifest !== 'object') return null
  try {
    return verifyPublishedAppFontSnapshot(document.manifest, typeof document.css === 'string' ? document.css : undefined)
  } catch {
    return null
  }
}

function verifiedDocument(document: SnapshotDocument): SnapshotDocument {
  if (typeof document.css !== 'string') throw new Error('Published App Font snapshot CSS is missing.')
  verifyPublishedAppFontSnapshot(document.manifest, document.css)
  return document
}

function relationId(value: unknown): string | number | undefined {
  if (typeof value === 'string' || typeof value === 'number') return value
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id: unknown }).id
    if (typeof id === 'string' || typeof id === 'number') return id
  }
  return undefined
}

