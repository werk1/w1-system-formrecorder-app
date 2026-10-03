import { getPayload } from 'payload'
import config from '../src/payload.config'
import { backfillVideoOptimization } from '../src/lib/video-optimization'

/**
 * Backfill: optimizes all existing video documents that have no delivery
 * variants yet (status != ready for the current file). New uploads are
 * handled automatically by the Media afterChange hook.
 *
 * Usage (inside the app container / with MONGODB_URI + PAYLOAD_SECRET set):
 *   npm run backfill:videos
 *   npm run backfill:videos -- --force   # re-encode 'ready' documents too
 */

const force = process.argv.includes('--force')

const payload = await getPayload({ config })

payload.logger.info(
  `videoOptimization: backfill starting${force ? ' (force re-encode)' : ''}`,
)

const result = await backfillVideoOptimization(payload, { force })

payload.logger.info(
  `videoOptimization: backfill done — total ${result.total}, ` +
    `ready ${result.ready}, already done ${result.alreadyDone}, ` +
    `failed ${result.failed}, skipped ${result.skipped}`,
)

process.exit(result.failed > 0 ? 1 : 0)
