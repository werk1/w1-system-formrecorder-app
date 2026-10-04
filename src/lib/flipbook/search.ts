import type { Payload } from 'payload'
import { buildSearchIndex, searchIndex } from '@werk1/w1-system-pdfedit/export'
import type { W1FormSearchIndex, W1FormTextModel, W1PdfEditRecord } from '@werk1/w1-system-pdfedit/types'

export type FlipbookSearchHit = {
  pageIndex: number
  snippet: string
  rect?: { x: number; y: number; w: number; h: number }
  /** Full text of the block, for selecting and copying it in the reader. */
  text?: string
  /** Line count of the block (sizes the selectable text layer). */
  lines?: number
}

type Rec = Record<string, unknown>
type Prepared = { index: W1FormSearchIndex; blocks: Map<string, Pick<FlipbookSearchHit, 'rect' | 'text' | 'lines'>> }

const MAX_QUERY = 100
const MAX_HITS = 50
const CACHE_SIZE = 24
const cache = new Map<string, Prepared>()

const asRec = (value: unknown): Rec | null => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Rec) : null)

/**
 * Text of the document as the reader shows it: the converted text model, with
 * the texts of edited record blocks swapped in for pages whose PDF was
 * updated (an edit that is not in the PDF yet must not be findable).
 */
function modelForReader(model: W1FormTextModel, records: readonly W1PdfEditRecord[], editedPages: ReadonlySet<number>): W1FormTextModel {
  const edits = new Map<string, string>()
  for (const record of records) {
    for (const block of record.blocks) if (block.edited && block.text.trim()) edits.set(block.blockId, block.text)
  }
  if (edits.size === 0 || editedPages.size === 0) return model
  return {
    ...model,
    pages: model.pages.map((page) =>
      editedPages.has(page.pageIndex)
        ? { ...page, blocks: page.blocks.map((b) => (edits.has(b.id) ? { ...b, text: edits.get(b.id) as string } : b)) }
        : page,
    ),
  }
}

async function prepare(payload: Payload, flipbook: Rec): Promise<Prepared | null> {
  const model = flipbook.textModel as W1FormTextModel | null
  if (!model || !Array.isArray(model.pages)) return null
  const overridesActive = typeof flipbook.overrideRevision === 'string' && flipbook.overrideRevision === flipbook.publishedRevision
  const key = `${String(flipbook.id)}|${String(flipbook.publishedRevision)}|${overridesActive ? String(flipbook.updatedAt) : '-'}`
  const hit = cache.get(key)
  if (hit) {
    cache.delete(key)
    cache.set(key, hit)
    return hit
  }

  let source = model
  if (overridesActive) {
    const editedPages = new Set<number>(
      (Array.isArray(flipbook.pageOverrides) ? flipbook.pageOverrides : []).flatMap((row) => {
        const index = asRec(row)?.pageIndex
        return typeof index === 'number' ? [index] : []
      }),
    )
    // Hosts without the pdfedit module have no `pdfedits` collection: no edits then.
    try {
      const pdfedits = await payload.find({
        collection: 'pdfedits' as never,
        where: { flipbook: { equals: flipbook.id } } as never,
        depth: 0,
        limit: 20,
        pagination: false,
        overrideAccess: true,
      })
      const ids = (pdfedits.docs as unknown as Rec[]).map((d) => d.id)
      if (ids.length > 0 && editedPages.size > 0) {
        const { docs } = await payload.find({
          collection: 'pdfeditrecords' as never,
          where: { pdfedit: { in: ids } } as never,
          depth: 0,
          pagination: false,
          overrideAccess: true,
        })
        const records = (docs as unknown as Rec[]).map((r) => ({
          id: String(r.id),
          order: 0,
          blocks: Array.isArray(r.blocks) ? (r.blocks as W1PdfEditRecord['blocks']) : [],
        }))
        source = modelForReader(model, records, editedPages)
      }
    } catch {
      source = model
    }
  }

  const blocks: Prepared['blocks'] = new Map()
  for (const page of source.pages) {
    for (const block of page.blocks) blocks.set(block.id, { rect: block.rect, text: block.text, lines: Math.max(1, block.childIds?.length ?? 1) })
  }
  const prepared = { index: buildSearchIndex(source), blocks }
  cache.set(key, prepared)
  while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string)
  return prepared
}

/**
 * Full-text search in a published flipbook. Only published flipbooks are
 * searchable; the text model itself never leaves the server.
 * Returns `null` when the flipbook is not found or has no text. An empty
 * query returns `[]` for a searchable flipbook (the reader probes with it).
 */
export async function searchPublishedFlipbook(payload: Payload, slug: string, query: string): Promise<FlipbookSearchHit[] | null> {
  const found = await payload.find({
    collection: 'flipbooks' as never,
    where: { and: [{ slug: { equals: slug.toLowerCase() } }, { isPublished: { equals: true } }, { publishedRevision: { exists: true } }] } as never,
    depth: 0,
    limit: 1,
    overrideAccess: true,
  })
  const flipbook = asRec(found.docs[0])
  if (!flipbook) return null
  const prepared = await prepare(payload, flipbook)
  if (!prepared) return null
  if (!query.trim()) return []
  return searchIndex(prepared.index, query.slice(0, MAX_QUERY))
    .slice(0, MAX_HITS)
    .map((hit) => {
      const block = prepared.blocks.get(hit.blockId)
      return { pageIndex: hit.pageIndex, snippet: hit.snippet, ...(block ?? {}) }
    })
}
