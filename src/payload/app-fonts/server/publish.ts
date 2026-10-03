import { publishAppFontSnapshot } from '@werk1/w1-system-font-manager/publisher'
import {
  commitTransaction,
  createLocalReq,
  initTransaction,
  killTransaction,
  type Payload,
  type TypedUser,
} from 'payload'

import { APP_FONT_ENGINE_VERSION, APP_FONT_PROJECT_ID, APP_FONT_PUBLISH_CONTEXT_KEY } from '../constants'
import { readAppFontDraft } from './draft'
import { verifyAppFontDraftGraph, verifyPublishedAppFontStorage } from './storage'

export async function publishCurrentAppFonts(payload: Payload, user: TypedUser) {
  const req = await createLocalReq({
    user,
    context: { [APP_FONT_PUBLISH_CONTEXT_KEY]: true },
  }, payload)
  const ownsTransaction = await initTransaction(req)

  if (!ownsTransaction) {
    throw new Error('App Font publication requires a transactional database connection.')
  }

  try {
    const latest = await payload.find({
      collection: 'app-font-snapshots',
      depth: 0,
      limit: 1,
      pagination: false,
      sort: '-revision',
      overrideAccess: true,
      req,
    })
    const previousRevision = Number((latest.docs[0] as { revision?: unknown } | undefined)?.revision ?? 0)
    const revision = previousRevision + 1
    const graph = await verifyAppFontDraftGraph(await readAppFontDraft(payload, req))
    const now = new Date().toISOString()
    const { snapshot, css } = publishAppFontSnapshot({
      projectId: APP_FONT_PROJECT_ID,
      revision,
      createdAt: now,
      publishedAt: now,
      engineVersion: APP_FONT_ENGINE_VERSION,
      ...graph,
    })
    await verifyPublishedAppFontStorage(payload, snapshot)

    const snapshotDocument = await payload.create({
      collection: 'app-font-snapshots',
      data: {
        snapshotId: snapshot.snapshotId,
        revision: snapshot.revision,
        integritySha256: snapshot.integritySha256,
        publishedAt: snapshot.publishedAt,
        publishedBy: user.id,
        css,
        manifest: snapshot as unknown as Record<string, unknown>,
        assetHashes: snapshot.bundles.webAssetHashes.map((hash) => ({ hash })),
        serverAssetHashes: snapshot.bundles.serverAssetHashes.map((hash) => ({ hash })),
      },
      context: { [APP_FONT_PUBLISH_CONTEXT_KEY]: true },
      overrideAccess: true,
      req,
    })

    await payload.updateGlobal({
      slug: 'app-font-settings',
      data: { currentSnapshot: snapshotDocument.id },
      context: { [APP_FONT_PUBLISH_CONTEXT_KEY]: true },
      overrideAccess: true,
      req,
    })

    await commitTransaction(req)
    return { snapshot, css, documentId: snapshotDocument.id }
  } catch (error) {
    await killTransaction(req)
    throw error
  }
}

