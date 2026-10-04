import { NextRequest, NextResponse } from 'next/server'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import type { Payload } from 'payload'
import { envFontProvider, PdfUpdateError, updatePdfedit } from '@/lib/pdfedit/pdfUpdate'

export const runtime = 'nodejs'
// Rendering the changed pages can take a while on large documents.
export const maxDuration = 300

/**
 * Admin-only PDF update of a pdfedit document.
 *
 * POST { pdfeditId, action: 'apply' }
 *   Writes all edited record texts into the PDF (starting from the backed-up
 *   original) and recomputes the previews of the changed pages.
 * POST { pdfeditId, action: 'restore', pageIndex }
 *   Resets the texts of one page to the original and updates the PDF — that
 *   page is the original again.
 *
 * Responds with `{ applied, skipped, warnings, editedPageIndexes, resetRecordIds }`.
 */

const unauthorized = () =>
  NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Admin login required.' } }, { status: 401 })

async function authenticateAdmin(payload: Payload, request: NextRequest): Promise<boolean> {
  try {
    const { user } = await payload.auth({ headers: request.headers })
    return Boolean(user) && Boolean((user as { roles?: string[] } | null)?.roles?.includes('admin'))
  } catch {
    return false
  }
}

type Body = { pdfeditId?: string | number; action?: string; pageIndex?: number }

const STATUS: Record<PdfUpdateError['code'], number> = { NOT_FOUND: 404, NOT_READY: 422, NO_TEXT_MODEL: 422, BUSY: 409, FAILED: 500 }

export async function POST(request: NextRequest) {
  const payload = await getPayload({ config: configPromise })
  if (!(await authenticateAdmin(payload, request))) return unauthorized()

  const body = (await request.json().catch(() => null)) as Body | null
  const invalid = (message: string) =>
    NextResponse.json({ error: { code: 'INVALID_REQUEST', message } }, { status: 400 })
  if (body?.pdfeditId === undefined || body.pdfeditId === null || body.pdfeditId === '') return invalid('pdfeditId is required.')
  if (body.action !== 'apply' && body.action !== 'restore') return invalid("action must be 'apply' or 'restore'.")
  if (body.action === 'restore' && !(Number.isInteger(body.pageIndex) && (body.pageIndex as number) >= 0)) {
    return invalid('pageIndex (0-based) is required for restore.')
  }

  try {
    const result = await updatePdfedit(
      payload,
      body.pdfeditId,
      body.action === 'apply' ? { type: 'apply' } : { type: 'restore', pageIndex: body.pageIndex as number },
      { fontProvider: envFontProvider() },
    )
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof PdfUpdateError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: STATUS[error.code] })
    }
    return NextResponse.json(
      { error: { code: 'FAILED', message: error instanceof Error ? error.message : String(error) } },
      { status: 500 },
    )
  }
}
