import type { Payload } from 'payload'
import {
  isVideoOptimizerAvailable,
  optimizeVideo,
  removeVideoVariants,
  resolveVideoMaxBitrateMbit,
  type VideoMaxBitrateMbit,
} from './videoOptimizer'

/**
 * Payload orchestration for the video optimization pipeline.
 *
 * Unit documentation: src/lib/video-optimization/README.md
 *
 * Follows the house pattern established by IdmlImportJobs: long-running work
 * is kicked off fire-and-forget from an afterChange hook, progress/state is
 * written back via payload.update, and self-updates carry a context flag so
 * the hook does not re-trigger itself (same idea as the IDML `fromImport`
 * flag).
 *
 * Jobs run through a serial in-process queue: a bulk import that creates
 * several video documents at once must not spawn parallel ffmpeg processes.
 */

export const W1_SKIP_VIDEO_OPTIMIZATION = 'w1SkipVideoOptimization'

type MediaDocLike = {
  id?: unknown
  filename?: unknown
  mediaType?: unknown
  videoMaxBitrateMbit?: unknown
  videoOptimization?: {
    status?: unknown
    sourceFilename?: unknown
    maxBitrateMbit?: unknown
  } | null
}

const queuedDocIds = new Set<string>()
let queueTail: Promise<void> = Promise.resolve()

const readDocId = (doc: MediaDocLike): string | null => {
  const id = doc.id
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null
}

const shouldOptimize = (doc: MediaDocLike): boolean => {
  if (doc.mediaType !== 'video') return false
  if (typeof doc.filename !== 'string' || doc.filename.length === 0) return false

  const optimization = doc.videoOptimization
  if (!optimization) return true

  // Already handled for exactly this file at the currently selected bitrate.
  // Re-uploads get a new filename, a changed bitrate selection changes the
  // comparison — both re-trigger; manual retries work by clearing the status.
  const handledStates = ['ready', 'processing']
  if (
    typeof optimization.status === 'string' &&
    handledStates.includes(optimization.status) &&
    optimization.sourceFilename === doc.filename &&
    resolveVideoMaxBitrateMbit(optimization.maxBitrateMbit) ===
      resolveVideoMaxBitrateMbit(doc.videoMaxBitrateMbit)
  ) {
    return false
  }

  return true
}

const updateOptimizationState = async (
  payload: Payload,
  docId: string,
  data: Record<string, unknown>,
): Promise<void> => {
  await payload.update({
    collection: 'media',
    id: docId,
    data: { videoOptimization: data },
    overrideAccess: true,
    context: { [W1_SKIP_VIDEO_OPTIMIZATION]: true },
  })
}

type VideoOptimizationOutcome = 'ready' | 'failed' | 'skipped'

async function runVideoOptimization(
  payload: Payload,
  docId: string,
  sourceFilename: string,
  maxBitrateMbit: VideoMaxBitrateMbit,
): Promise<VideoOptimizationOutcome> {
  if (!(await isVideoOptimizerAvailable())) {
    payload.logger.warn(
      `videoOptimization: ffmpeg/ffprobe not available, skipping ${sourceFilename}`,
    )
    await updateOptimizationState(payload, docId, {
      status: 'skipped',
      sourceFilename,
      error: 'ffmpeg/ffprobe not available in this runtime',
    })
    return 'skipped'
  }

  await updateOptimizationState(payload, docId, {
    status: 'processing',
    sourceFilename,
    maxBitrateMbit,
    error: null,
  })

  const startedAtMs = Date.now()

  try {
    const result = await optimizeVideo(sourceFilename, { maxBitrateMbit })

    await updateOptimizationState(payload, docId, {
      status: 'ready',
      sourceFilename,
      maxBitrateMbit,
      variant1080: result.variant1080,
      variant720: result.variant720,
      poster: result.poster,
      width: result.width,
      height: result.height,
      durationMs: result.durationMs,
      error: null,
    })

    payload.logger.info(
      `videoOptimization: variants ready for ${sourceFilename} (${maxBitrateMbit} Mbit/s, ${Date.now() - startedAtMs}ms)`,
    )
    return 'ready'
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    payload.logger.error(
      `videoOptimization: failed for ${sourceFilename}: ${message}`,
    )
    await updateOptimizationState(payload, docId, {
      status: 'failed',
      sourceFilename,
      error: message.slice(0, 500),
    })
    return 'failed'
  }
}

export function maybeScheduleVideoOptimization(
  doc: MediaDocLike,
  payload: Payload,
): void {
  if (!shouldOptimize(doc)) return

  const docId = readDocId(doc)
  if (!docId) return

  void enqueueVideoOptimization(
    payload,
    docId,
    doc.filename as string,
    resolveVideoMaxBitrateMbit(doc.videoMaxBitrateMbit),
  )
}

/**
 * Single global queue shared by the upload hook and the backfill: every
 * optimization — regardless of trigger — runs strictly one after another, so
 * a backfill and concurrent uploads can never spawn parallel ffmpeg
 * processes or double-encode the same document.
 */
function enqueueVideoOptimization(
  payload: Payload,
  docId: string,
  sourceFilename: string,
  maxBitrateMbit: VideoMaxBitrateMbit,
): Promise<VideoOptimizationOutcome | 'queued-elsewhere'> {
  if (queuedDocIds.has(docId)) {
    return Promise.resolve('queued-elsewhere')
  }
  queuedDocIds.add(docId)

  const job = queueTail.then(async () => {
    try {
      return await runVideoOptimization(payload, docId, sourceFilename, maxBitrateMbit)
    } catch (error) {
      payload.logger.error(
        `videoOptimization: unexpected error for ${sourceFilename}: ${String(error)}`,
      )
      return 'failed' as const
    } finally {
      queuedDocIds.delete(docId)
    }
  })

  // The tail must never reject, otherwise the chain would stall.
  queueTail = job.then(() => undefined)

  return job
}

export type VideoOptimizationBackfillResult = {
  total: number
  ready: number
  failed: number
  skipped: number
  alreadyDone: number
}

let backfillRunning = false

export const isVideoOptimizationBackfillRunning = () => backfillRunning

/**
 * Processes all existing video documents that have no (or stale/failed)
 * delivery variants. Each document goes through the same global queue as
 * the upload hook, so concurrent uploads and the backfill serialize into a
 * single ffmpeg at a time. With force=true even 'ready' documents are
 * re-encoded. Only one backfill runs at a time (re-entry throws).
 */
export async function backfillVideoOptimization(
  payload: Payload,
  options: { force?: boolean } = {},
): Promise<VideoOptimizationBackfillResult> {
  if (backfillRunning) {
    throw new Error('video optimization backfill is already running')
  }
  backfillRunning = true

  try {
    return await runBackfill(payload, options)
  } finally {
    backfillRunning = false
  }
}

async function runBackfill(
  payload: Payload,
  options: { force?: boolean },
): Promise<VideoOptimizationBackfillResult> {
  const { docs } = await payload.find({
    collection: 'media',
    where: { mediaType: { equals: 'video' } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })

  const result: VideoOptimizationBackfillResult = {
    total: docs.length,
    ready: 0,
    failed: 0,
    skipped: 0,
    alreadyDone: 0,
  }

  for (const doc of docs as MediaDocLike[]) {
    const docId = readDocId(doc)
    if (!docId || typeof doc.filename !== 'string' || doc.filename.length === 0) {
      result.skipped += 1
      continue
    }

    if (!options.force && !shouldOptimize(doc)) {
      result.alreadyDone += 1
      continue
    }

    payload.logger.info(
      `videoOptimization: backfill processing ${doc.filename} (${result.ready + result.failed + result.skipped + result.alreadyDone + 1}/${result.total})`,
    )
    const outcome = await enqueueVideoOptimization(
      payload,
      docId,
      doc.filename,
      resolveVideoMaxBitrateMbit(doc.videoMaxBitrateMbit),
    )
    if (outcome === 'queued-elsewhere') {
      // The upload hook already queued this document; it is being handled.
      result.alreadyDone += 1
    } else {
      result[outcome] += 1
    }
  }

  return result
}

export function cleanupVideoVariants(doc: MediaDocLike): void {
  if (doc.mediaType !== 'video') return
  if (typeof doc.filename !== 'string' || doc.filename.length === 0) return

  void removeVideoVariants(doc.filename).catch(() => {
    // Best effort: orphaned variant files are harmless.
  })
}
