import { AppFontContractError } from '@werk1/w1-system-font-manager'
import { verifyPublishedAppFontSnapshot } from '@werk1/w1-system-font-manager/publisher'
import {
  commitTransaction,
  createLocalReq,
  initTransaction,
  killTransaction,
  type Payload,
  type TypedUser,
} from 'payload'

import { APP_FONT_PUBLISH_CONTEXT_KEY } from '../constants'
import { verifyPublishedAppFontStorage } from './storage'

export async function rollbackCurrentAppFonts(payload: Payload, user: TypedUser, snapshotId: string) {
  if (!/^appfont_[a-f0-9]{24}$/.test(snapshotId)) {
    throw new AppFontContractError('invalid_snapshot_id', 'App Font snapshot ID is invalid.')
  }
  const req = await createLocalReq({
    user,
    context: { [APP_FONT_PUBLISH_CONTEXT_KEY]: true },
  }, payload)
  const ownsTransaction = await initTransaction(req)
  if (!ownsTransaction) throw new Error('App Font rollback requires a transactional database connection.')

  try {
    const result = await payload.find({
      collection: 'app-font-snapshots',
      depth: 0,
      limit: 1,
      pagination: false,
      overrideAccess: true,
      req,
      where: { snapshotId: { equals: snapshotId } },
    })
    const document = result.docs[0] as unknown as {
      id: string | number
      css?: unknown
      manifest?: unknown
      revision?: unknown
    } | undefined
    if (!document || typeof document.css !== 'string') {
      throw new AppFontContractError('snapshot_not_found', 'App Font snapshot does not exist.')
    }
    const snapshot = verifyPublishedAppFontSnapshot(document.manifest, document.css)
    await verifyPublishedAppFontStorage(payload, snapshot)

    await payload.updateGlobal({
      slug: 'app-font-settings',
      data: { currentSnapshot: String(document.id) },
      context: { [APP_FONT_PUBLISH_CONTEXT_KEY]: true },
      overrideAccess: true,
      req,
    })
    await commitTransaction(req)
    payload.logger.info({
      appFontSnapshotId: snapshot.snapshotId,
      appFontRevision: snapshot.revision,
      appFontRollbackBy: user.id,
    }, 'App Font snapshot activated by rollback')
    return snapshot
  } catch (error) {
    await killTransaction(req)
    throw error
  }
}

