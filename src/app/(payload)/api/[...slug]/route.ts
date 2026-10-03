/* THIS FILE WAS GENERATED AUTOMATICALLY BY PAYLOAD. */
/* DO NOT MODIFY IT BECAUSE IT COULD BE REWRITTEN AT ANY TIME. */
import config from '@payload-config'
import '@payloadcms/next/css'
import {
  REST_DELETE,
  REST_GET,
  REST_OPTIONS,
  REST_PATCH,
  REST_POST,
  REST_PUT,
} from '@payloadcms/next/routes'

type NextCtx = { params: Promise<{ slug?: string[] }> }
type PayloadCtx = { params: Promise<{ slug: string[] }> }

const coerceCtx = (ctx: NextCtx): PayloadCtx => ({
  params: ctx.params.then((p) => ({ slug: p?.slug ?? [] })),
})

export function GET(req: Request, ctx: NextCtx) { return REST_GET(config)(req, coerceCtx(ctx)) }
export function POST(req: Request, ctx: NextCtx) { return REST_POST(config)(req, coerceCtx(ctx)) }
export function DELETE(req: Request, ctx: NextCtx) { return REST_DELETE(config)(req, coerceCtx(ctx)) }
export function PATCH(req: Request, ctx: NextCtx) { return REST_PATCH(config)(req, coerceCtx(ctx)) }
export function PUT(req: Request, ctx: NextCtx) { return REST_PUT(config)(req, coerceCtx(ctx)) }
export function OPTIONS(req: Request, ctx: NextCtx) { return REST_OPTIONS(config)(req, coerceCtx(ctx)) }
