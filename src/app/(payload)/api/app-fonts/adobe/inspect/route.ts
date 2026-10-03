import type { NextRequest } from 'next/server'

import { getPayloadClient } from '@/lib/payload/getPayloadClient'
import { hasAppFontAdminRole } from '@/payload/app-fonts/access'

type AdobeCssFace = {
  label: string
  weight: number
  style: 'normal' | 'italic' | 'oblique'
  stretch: number
}

type AdobeCssFamily = {
  providerFamily: string
  faces: AdobeCssFace[]
}

const PROJECT_ID_PATTERN = /^[a-z0-9]{4,32}$/

export async function GET(request: NextRequest) {
  const payload = await getPayloadClient()
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user) return Response.json({ error: 'Authentication is required.' }, { status: 401 })
  if (!hasAppFontAdminRole(auth.user)) return Response.json({ error: 'Administrator role is required.' }, { status: 403 })

  const projectId = (request.nextUrl.searchParams.get('projectId') ?? '').trim().toLowerCase()
  if (!PROJECT_ID_PATTERN.test(projectId)) {
    return Response.json({ error: 'Adobe Fonts Web Project ID must contain 4-32 lowercase letters or digits.' }, { status: 400 })
  }

  const stylesheetUrl = `https://use.typekit.net/${projectId}.css`
  try {
    const response = await fetch(stylesheetUrl, {
      headers: { Accept: 'text/css,*/*;q=0.8' },
      cache: 'no-store',
    })
    if (!response.ok) {
      return Response.json({ error: `Adobe Fonts CSS returned HTTP ${response.status}.` }, { status: 502 })
    }

    const css = await response.text()
    const families = parseAdobeCssFamilies(css)
    if (families.length === 0) {
      return Response.json({ error: 'No @font-face declarations were found in the Adobe Fonts CSS.' }, { status: 422 })
    }

    return Response.json({
      projectId,
      stylesheetUrl,
      licenseReference: `Adobe Fonts Web Project ${projectId} (${stylesheetUrl})`,
      families,
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    payload.logger.error({ err: error, projectId }, 'Adobe Fonts CSS inspection failed')
    return Response.json({ error: 'Adobe Fonts CSS inspection failed.' }, { status: 502 })
  }
}

function parseAdobeCssFamilies(css: string): AdobeCssFamily[] {
  const families = new Map<string, AdobeCssFace[]>()
  for (const block of css.matchAll(/@font-face\s*\{(?<body>[^}]*)\}/gim)) {
    const declarations = parseDeclarations(block.groups?.body ?? '')
    const providerFamily = cssStringValue(declarations.get('font-family') ?? '')
    if (!providerFamily) continue
    const weight = parseCssWeight(declarations.get('font-weight'))
    const style = parseCssStyle(declarations.get('font-style'))
    const stretch = parseCssStretch(declarations.get('font-stretch'))
    const face = { label: adobeFaceLabel(weight, style), weight, style, stretch }
    const current = families.get(providerFamily) ?? []
    if (!current.some((candidate) =>
      candidate.weight === face.weight &&
      candidate.style === face.style &&
      candidate.stretch === face.stretch
    )) {
      current.push(face)
    }
    families.set(providerFamily, current)
  }

  return [...families.entries()]
    .map(([providerFamily, faces]) => ({
      providerFamily,
      faces: faces.sort((left, right) =>
        left.weight - right.weight ||
        left.style.localeCompare(right.style) ||
        left.stretch - right.stretch),
    }))
    .sort((left, right) => left.providerFamily.localeCompare(right.providerFamily))
}

function parseDeclarations(body: string): Map<string, string> {
  const declarations = new Map<string, string>()
  for (const declaration of body.split(';')) {
    const separator = declaration.indexOf(':')
    if (separator <= 0) continue
    declarations.set(
      declaration.slice(0, separator).trim().toLowerCase(),
      declaration.slice(separator + 1).trim(),
    )
  }
  return declarations
}

function cssStringValue(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, '')
}

function parseCssWeight(value: string | undefined): number {
  if (!value) return 400
  const numeric = Number.parseInt(value, 10)
  return Number.isFinite(numeric) ? Math.min(1000, Math.max(1, numeric)) : 400
}

function parseCssStyle(value: string | undefined): AdobeCssFace['style'] {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized === 'italic' || normalized === 'oblique') return normalized
  return 'normal'
}

function parseCssStretch(value: string | undefined): number {
  const normalized = (value ?? '').trim().toLowerCase()
  if (!normalized || normalized === 'normal') return 100
  const percentage = Number.parseInt(normalized, 10)
  return Number.isFinite(percentage) ? Math.min(1000, Math.max(1, percentage)) : 100
}

function adobeFaceLabel(weight: number, style: AdobeCssFace['style']): string {
  const weightName = new Map([
    [100, 'Thin'],
    [200, 'Extra Light'],
    [300, 'Light'],
    [400, 'Regular'],
    [500, 'Medium'],
    [600, 'Semi Bold'],
    [700, 'Bold'],
    [800, 'Extra Bold'],
    [900, 'Black'],
  ]).get(weight) ?? String(weight)
  return style === 'normal' ? weightName : `${weightName} ${style === 'italic' ? 'Italic' : 'Oblique'}`
}
