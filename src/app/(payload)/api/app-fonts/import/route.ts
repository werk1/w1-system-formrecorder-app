import { AppFontContractError } from '@werk1/w1-system-font-manager'
import { downloadGoogleFontFamily } from '@werk1/w1-system-font-manager/google-fonts'
import {
  extractAppFontZip,
  inspectAppFontImport,
  type AppFontFamilyImportCandidate,
  type AppFontImportFile,
  type AppFontImportFaceCandidate,
  type AppFontImportStrategy,
  type AppFontLicenseKind,
} from '@werk1/w1-system-font-manager/imports'
import type { NextRequest } from 'next/server'

import { getPayloadClient } from '@/lib/payload/getPayloadClient'
import type { User } from '@/payload-types'
import { hasAppFontAdminRole } from '@/payload/app-fonts/access'
import { importAppFontFamilies } from '@/payload/app-fonts/server/importFontFamilies'

const MAX_REQUEST_BYTES = 110 * 1024 * 1024
type ImportIntent = 'inspect' | 'import'

interface AppFontImportPreviewFamily {
  familyKey: string
  displayName: string
  status: 'draft' | 'ready'
  licenseReference: string
  licenseKind: AppFontLicenseKind | 'provider'
  genericFallback: string
  defaultFaceLabel: string
  faces: Array<{
    label: string
    weight: number
    style: string
    stretch: number
    variable: boolean
    relativePath: string
  }>
  warnings: string[]
}

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return Response.json({ error: 'Cross-origin App Font import is forbidden.' }, { status: 403 })
  }
  const declaredLength = Number(request.headers.get('content-length') ?? 0)
  if (declaredLength > MAX_REQUEST_BYTES) {
    return Response.json({ error: 'App Font import exceeds the request size limit.' }, { status: 413 })
  }

  const payload = await getPayloadClient()
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user) return Response.json({ error: 'Authentication is required.' }, { status: 401 })
  if (!hasAppFontAdminRole(auth.user)) return Response.json({ error: 'Administrator role is required.' }, { status: 403 })

  try {
    const contentType = request.headers.get('content-type') ?? ''
    const result = contentType.includes('multipart/form-data')
      ? await importLocalFiles(request, payload, auth.user)
      : await importGoogleFamily(request, payload, auth.user)
    return Response.json({ families: result.families }, {
      status: result.intent === 'inspect' ? 200 : 201,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    if (error instanceof AppFontContractError) {
      return Response.json({ error: error.message, code: error.code, issues: error.issues }, { status: 400 })
    }
    const message = error instanceof Error ? error.message : 'App Font import failed.'
    payload.logger.error({ err: error }, 'App Font import failed')
    return Response.json({ error: message }, { status: /duplicate|E11000/i.test(message) ? 409 : 500 })
  }
}

async function importLocalFiles(request: NextRequest, payload: Awaited<ReturnType<typeof getPayloadClient>>, actor: User) {
  const formData = await request.formData()
  const intent = importIntent(formData.get('intent'))
  const uploads = formData.getAll('files').filter((entry): entry is File => entry instanceof File)
  if (uploads.length === 0) throw new AppFontContractError('import_no_files', 'Select TTF/OTF files, a folder or one ZIP package.')
  if (uploads.reduce((sum, file) => sum + file.size, 0) > MAX_REQUEST_BYTES) {
    throw new AppFontContractError('import_request_size', 'App Font files exceed the request size limit.')
  }
  const { files, strategy } = await readLocalImportFiles(formData, uploads)
  const families = inspectAppFontImport({ files, strategy })
  if (intent === 'inspect') {
    return {
      intent,
      families: previewFamilies(families, {
        genericFallback: 'sans-serif',
        licenseReference: undefined,
        licenseKind: undefined,
      }),
    }
  }
  return {
    intent,
    families: await importAppFontFamilies({
      payload,
      actor,
      families,
      source: {
        type: 'payload-upload',
        externalId: uploads.length === 1 ? uploads[0]!.name : `${uploads.length}-file-import`,
      },
    }),
  }
}

async function importGoogleFamily(request: NextRequest, payload: Awaited<ReturnType<typeof getPayloadClient>>, actor: User) {
  const body = await request.json() as { family?: unknown; mode?: unknown; intent?: unknown }
  const intent = importIntent(body.intent)
  const family = typeof body.family === 'string' ? body.family : ''
  const mode = body.mode === 'static' ? 'static' : body.mode === 'variable' ? 'variable' : undefined
  if (!mode) throw new AppFontContractError('google_fonts_mode', 'Choose static or variable Google Fonts import.')
  const downloaded = await downloadGoogleFontFamily({
    apiKey: process.env.APP_FONTS_GOOGLE_API_KEY ?? '',
    family,
    mode,
  })
  const families = inspectAppFontImport({ files: downloaded.files, strategy: mode })
  const genericFallback = googleFallback(downloaded.catalog.category)
  const licenseReference = `${downloaded.license.sourceUrl}#sha256=${downloaded.license.sha256}`
  if (intent === 'inspect') {
    return {
      intent,
      families: previewFamilies(families, {
        genericFallback,
        licenseReference,
        licenseKind: 'provider',
      }),
    }
  }
  return {
    intent,
    families: await importAppFontFamilies({
      payload,
      actor,
      families,
      source: {
        type: 'google-fonts',
        provider: downloaded.source.provider,
        externalId: downloaded.source.externalId,
        externalVersion: downloaded.source.externalVersion,
        sourceUrl: downloaded.source.sourceUrl,
        licenseReference: downloaded.license.sourceUrl,
      },
      genericFallback,
      licenseReference,
    }),
  }
}

async function readLocalImportFiles(
  formData: FormData,
  uploads: File[],
): Promise<{ files: AppFontImportFile[]; strategy: AppFontImportStrategy }> {
  const strategy = importStrategy(formData.get('strategy'))
  const declaredPaths = parsePaths(formData.get('paths'), uploads.length)
  if (uploads.length === 1 && uploads[0]!.name.toLowerCase().endsWith('.zip')) {
    return {
      strategy,
      files: await extractAppFontZip({ bytes: new Uint8Array(await uploads[0]!.arrayBuffer()) }),
    }
  }
  if (uploads.some((file) => file.name.toLowerCase().endsWith('.zip'))) {
    throw new AppFontContractError('import_zip_mixed', 'Import one ZIP by itself, or select unpacked files without a ZIP.')
  }
  return {
    strategy,
    files: await Promise.all(uploads.map(async (file, index) => ({
      relativePath: declaredPaths[index] ?? file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
      mediaType: file.type || 'application/octet-stream',
    }))),
  }
}

function previewFamilies(
  families: AppFontFamilyImportCandidate[],
  input: {
    genericFallback: string
    licenseReference?: string
    licenseKind?: AppFontImportPreviewFamily['licenseKind']
  },
): AppFontImportPreviewFamily[] {
  return families.map((family) => {
    const license = chooseLicense(family.licenses.map((item) => ({
      kind: item.kind,
      relativePath: item.relativePath,
      sha256: item.sha256,
    })))
    const licenseKind = input.licenseKind ?? license?.kind ?? 'unknown'
    const recognizedLicense = input.licenseReference !== undefined || (license !== undefined && license.kind !== 'unknown')
    const faces = family.faces.map(faceSummary)
    return {
      familyKey: family.familyKey,
      displayName: family.displayName,
      status: recognizedLicense && family.warnings.length === 0 ? 'ready' : 'draft',
      licenseReference: input.licenseReference
        ?? (license ? `${license.relativePath}#sha256=${license.sha256}` : 'No license supplied; manual review required'),
      licenseKind,
      genericFallback: input.genericFallback,
      defaultFaceLabel: faceLabel(chooseDefaultFace(family.faces)),
      faces,
      warnings: family.warnings,
    }
  })
}

function chooseDefaultFace(faces: AppFontImportFaceCandidate[]): AppFontImportFaceCandidate {
  const face = [...faces].sort((left, right) => scoreDefaultFace(left) - scoreDefaultFace(right))[0]
  if (!face) throw new AppFontContractError('import_no_fonts', 'Imported App Font family has no face to use as default.')
  return face
}

function scoreDefaultFace(face: AppFontImportFaceCandidate): number {
  const stylePenalty = face.analysis.css.style === 'normal' ? 0 : 10_000
  const weight = face.analysis.css.weight
  const weightPenalty = weight.min <= 400 && weight.max >= 400 ? 0 : Math.abs(weight.default - 400)
  const stretch = face.analysis.css.stretch
  const stretchPenalty = stretch.min <= 100 && stretch.max >= 100 ? 0 : Math.abs(stretch.default - 100)
  return stylePenalty + weightPenalty + stretchPenalty
}

function faceSummary(face: AppFontImportFaceCandidate): AppFontImportPreviewFamily['faces'][number] {
  return {
    label: faceLabel(face),
    weight: face.analysis.css.weight.default,
    style: face.analysis.css.style,
    stretch: face.analysis.css.stretch.default,
    variable: face.variable,
    relativePath: face.relativePath,
  }
}

function faceLabel(face: AppFontImportFaceCandidate): string {
  return face.analysis.names.fullName
    ?? face.analysis.names.typographicSubfamily
    ?? face.analysis.names.subfamily
    ?? `${face.analysis.css.weight.default} ${face.analysis.css.style}`
}

function chooseLicense(licenses: Array<{ kind: AppFontLicenseKind; relativePath: string; sha256: string }>) {
  return licenses.find((license) => license.kind !== 'unknown') ?? licenses[0]
}

function importIntent(value: unknown): ImportIntent {
  return value === 'inspect' ? 'inspect' : 'import'
}

function parsePaths(value: FormDataEntryValue | null, expectedLength: number): string[] {
  if (typeof value !== 'string' || !value) return []
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed) || parsed.length !== expectedLength || parsed.some((entry) => typeof entry !== 'string')) {
      throw new Error('shape')
    }
    return parsed as string[]
  } catch {
    throw new AppFontContractError('import_paths', 'Uploaded folder path manifest is invalid.')
  }
}

function importStrategy(value: FormDataEntryValue | null): AppFontImportStrategy {
  if (value === 'variable' || value === 'static' || value === 'all') return value
  throw new AppFontContractError('import_strategy_invalid', 'Choose variable, static or all font faces.')
}

function googleFallback(category: string): 'serif' | 'sans-serif' | 'monospace' | 'cursive' {
  if (category === 'serif') return 'serif'
  if (category === 'monospace') return 'monospace'
  if (category === 'handwriting') return 'cursive'
  return 'sans-serif'
}

function hasSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return false
  try {
    const expectedHost = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? request.nextUrl.host
    return new URL(origin).host === expectedHost
  } catch {
    return false
  }
}
