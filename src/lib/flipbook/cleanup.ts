import type { Payload } from 'payload'

/**
 * Retention cleanup for generated flipbook page images.
 *
 * Superseded revisions stay available for the retention period so cached page
 * images and open readers keep working. The timer is in-process and lost on
 * restart, therefore every job start and `onInit` also run a sweep.
 */

export const FLIPBOOK_GENERATOR = 'flipbook'

export const resolveFlipbookRetentionMs = (): number => {
  const hours = Number(process.env.W1_FLIPBOOK_RETENTION_HOURS)
  return (Number.isFinite(hours) && hours >= 0 ? hours : 24) * 60 * 60 * 1000
}

type IdLike = string | number

async function deleteMediaWhere(payload: Payload, where: Record<string, unknown>): Promise<number> {
  let deleted = 0
  for (;;) {
    const { docs } = await payload.find({
      collection: 'media',
      where: where as never,
      depth: 0,
      limit: 100,
      pagination: false,
      overrideAccess: true,
    })
    if (docs.length === 0) return deleted

    let progressed = 0
    for (const doc of docs as Array<{ id: IdLike }>) {
      try {
        await payload.delete({ collection: 'media', id: doc.id, overrideAccess: true })
        progressed += 1
      } catch {
        // Referenced by a published revision (delete guard) or already gone: keep it.
      }
    }
    deleted += progressed
    if (progressed === 0) return deleted
  }
}

export async function deleteGeneratedPages(
  payload: Payload,
  flipbookId: IdLike,
  revision?: string,
): Promise<number> {
  const and: Array<Record<string, unknown>> = [
    { generatedBy: { equals: FLIPBOOK_GENERATOR } },
    { generatedFor: { equals: String(flipbookId) } },
  ]
  if (revision) and.push({ generatedRevision: { equals: revision } })
  return deleteMediaWhere(payload, { and })
}

export async function deleteMediaByIds(payload: Payload, ids: IdLike[]): Promise<void> {
  for (const id of ids) {
    await payload.delete({ collection: 'media', id, overrideAccess: true }).catch(() => undefined)
  }
}

/**
 * Marks the pages of a superseded revision as released. The retention period
 * of those pages counts from this moment, not from their creation, so readers
 * that are still open keep their images for the full period.
 */
export async function markRevisionReleased(
  payload: Payload,
  flipbookId: IdLike,
  revision: string,
  at: Date = new Date(),
): Promise<number> {
  const { docs } = await payload.find({
    collection: 'media',
    where: {
      and: [
        { generatedBy: { equals: FLIPBOOK_GENERATOR } },
        { generatedFor: { equals: String(flipbookId) } },
        { generatedRevision: { equals: revision } },
        { generatedReleasedAt: { exists: false } },
      ],
    } as never,
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  for (const doc of docs as Array<{ id: IdLike }>) {
    await payload.update({
      collection: 'media',
      id: doc.id,
      data: { generatedReleasedAt: at.toISOString() } as never,
      overrideAccess: true,
    })
  }
  return docs.length
}

/**
 * Deletes generated page images whose retention period has expired:
 * - pages of a superseded revision: `generatedReleasedAt` older than retention;
 * - never published pages (failed or interrupted jobs): created before retention.
 * Pages of published revisions and of jobs currently converting are never
 * candidates; the media delete guard is a second safety net.
 */
export async function sweepGeneratedMedia(payload: Payload, retentionMs = resolveFlipbookRetentionMs()): Promise<number> {
  const { docs } = await payload.find({
    collection: 'flipbooks' as never,
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { status: true, sourceRevision: true, publishedRevision: true } as never,
  })
  const keepRevisions = new Set<string>()
  for (const doc of docs as Array<{ status?: unknown; sourceRevision?: unknown; publishedRevision?: unknown }>) {
    if (typeof doc.publishedRevision === 'string') keepRevisions.add(doc.publishedRevision)
    if (doc.status === 'converting' && typeof doc.sourceRevision === 'string') keepRevisions.add(doc.sourceRevision)
  }

  const cutoff = new Date(Date.now() - retentionMs).toISOString()
  const and: Array<Record<string, unknown>> = [
    { generatedBy: { equals: FLIPBOOK_GENERATOR } },
    {
      or: [
        { generatedReleasedAt: { less_than: cutoff } },
        { and: [{ generatedReleasedAt: { exists: false } }, { createdAt: { less_than: cutoff } }] },
      ],
    },
  ]
  if (keepRevisions.size > 0) and.push({ generatedRevision: { not_in: [...keepRevisions] } })
  return deleteMediaWhere(payload, { and })
}

const timers = new Set<ReturnType<typeof setTimeout>>()

export function scheduleSupersededCleanup(
  payload: Payload,
  flipbookId: IdLike,
  supersededRevision: string,
  delayMs = resolveFlipbookRetentionMs(),
): void {
  const timer = setTimeout(() => {
    timers.delete(timer)
    void deleteGeneratedPages(payload, flipbookId, supersededRevision).catch((error) => {
      payload.logger.error(`flipbook: cleanup of revision ${supersededRevision} failed: ${String(error)}`)
    })
  }, delayMs)
  timer.unref?.()
  timers.add(timer)
}

export function cancelScheduledCleanups(): void {
  timers.forEach((timer) => clearTimeout(timer))
  timers.clear()
}
