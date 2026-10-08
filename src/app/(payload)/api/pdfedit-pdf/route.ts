import { NextRequest, NextResponse } from 'next/server'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { envFontProvider, PdfUpdateError, updatePdfedit } from '@/lib/pdfedit/pdfUpdate'
import { authenticateAdmin, unauthorized } from '@/lib/pdfedit/adminAuth'
import { errorJson } from '@/lib/pdfedit/context'

export const runtime = 'nodejs'
// Rendering the changed pages can take a while on large documents.
export const maxDuration = 300

/**
 * Admin-only PDF update of a pdfedit document.
 *
 * POST { pdfeditId, action: 'apply' }
 *   Writes all edited record texts and all image edits into the PDF (starting
 *   from the backed-up original) and recomputes the previews of the changed
 *   pages; the written image edits are marked `applied`.
 * POST { pdfeditId, action: 'restore', pageIndex }
 *   Resets the texts of one page to the original and updates the PDF — that
 *   page is the original again.
 *
 * POST { pdfeditId, action: 'restore-all' }
 *   Resets all texts and image changes of the document: the PDF is the original again.
 *
 * Responds with `{ applied, skipped, warnings, editedPageIndexes, resetRecordIds, appliedImages, skippedImages }`.
 */

type Body = { pdfeditId?: string | number; action?: string; pageIndex?: number }

const STATUS: Record<PdfUpdateError['code'], number> = { NOT_FOUND: 404, NOT_READY: 422, NO_TEXT_MODEL: 422, BUSY: 409, FAILED: 500 }

export async function POST(request: NextRequest) {
  const payload = await getPayload({ config: configPromise })
  if (!(await authenticateAdmin(payload, request))) return unauthorized()

  const body = (await request.json().catch(() => null)) as Body | null
  const invalid = (message: string) => errorJson(400, 'INVALID_REQUEST', message)
  if (body?.pdfeditId === undefined || body.pdfeditId === null || body.pdfeditId === '') return invalid('pdfeditId is required.')
  if (body.action !== 'apply' && body.action !== 'restore' && body.action !== 'restore-all') {
    return invalid("action must be 'apply', 'restore' or 'restore-all'.")
  }
  if (body.action === 'restore' && !(Number.isInteger(body.pageIndex) && (body.pageIndex as number) >= 0)) {
    return invalid('pageIndex (0-based) is required for restore.')
  }

  try {
    const result = await updatePdfedit(
      payload,
      body.pdfeditId,
      body.action === 'apply'
        ? { type: 'apply' }
        : body.action === 'restore-all'
          ? { type: 'restoreAll' }
          : { type: 'restore', pageIndex: body.pageIndex as number },
      { fontProvider: envFontProvider() },
    )
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof PdfUpdateError) return errorJson(STATUS[error.code], error.code, error.message)
    return errorJson(500, 'FAILED', error instanceof Error ? error.message : String(error))
  }
}
