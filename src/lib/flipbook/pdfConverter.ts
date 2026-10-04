import { execFile } from 'child_process'
import { createHash } from 'crypto'
import { createReadStream, promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

/**
 * Pure PDF conversion logic — no Payload imports.
 *
 * Unit documentation: src/lib/flipbook/README.md
 *
 * Wraps poppler-utils (`pdfinfo`, `pdftoppm`). `mupdf` (WASM) is a documented
 * alternative for environments without poppler but is not implemented.
 */

export const FLIPBOOK_MAX_PAGES = 300
export const FLIPBOOK_MAX_PDF_BYTES = 500 * 1024 * 1024
export const FLIPBOOK_TARGET_LONG_EDGE = 2400
export const FLIPBOOK_PROBE_TIMEOUT_MS = 30 * 1000
export const FLIPBOOK_PAGE_TIMEOUT_MS = 2 * 60 * 1000

export type FlipbookConversionErrorCode =
  | 'unavailable'
  | 'encrypted'
  | 'damaged'
  | 'too-many-pages'
  | 'too-large'
  | 'timeout'
  | 'render-failed'

const MESSAGES: Record<FlipbookConversionErrorCode, string> = {
  unavailable: 'PDF-Werkzeuge (poppler-utils) sind in dieser Laufzeit nicht verfügbar.',
  encrypted: 'Die PDF ist verschlüsselt oder passwortgeschützt und kann nicht konvertiert werden.',
  damaged: 'Die PDF ist beschädigt oder kann nicht gelesen werden.',
  'too-many-pages': `Die PDF hat mehr als ${FLIPBOOK_MAX_PAGES} Seiten.`,
  'too-large': `Die PDF ist größer als ${FLIPBOOK_MAX_PDF_BYTES / 1024 / 1024} MB.`,
  timeout: 'Die Konvertierung hat das Zeitlimit überschritten.',
  'render-failed': 'Eine Seite konnte nicht gerendert werden.',
}

export class FlipbookConversionError extends Error {
  readonly code: FlipbookConversionErrorCode

  constructor(code: FlipbookConversionErrorCode, detail?: string) {
    super(detail ? `${MESSAGES[code]} (${detail})` : MESSAGES[code])
    this.name = 'FlipbookConversionError'
    this.code = code
  }
}

export type PdfProbe = {
  pageCount: number
  encrypted: boolean
}

type ExecFailure = Error & {
  code?: string | number
  killed?: boolean
  signal?: string | null
  stderr?: string
}

async function run(
  command: string,
  args: string[],
  timeoutMs: number,
  maxBuffer = 8 * 1024 * 1024,
): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execFileAsync(command, args, {
      timeout: timeoutMs,
      maxBuffer,
    })
  } catch (error) {
    const failure = error as ExecFailure
    if (failure.code === 'ENOENT') throw new FlipbookConversionError('unavailable', command)
    if (failure.killed || failure.signal === 'SIGTERM') throw new FlipbookConversionError('timeout')
    const stderr = (failure.stderr ?? '').toLowerCase()
    if (stderr.includes('incorrect password') || stderr.includes('encrypted')) {
      throw new FlipbookConversionError('encrypted')
    }
    throw new FlipbookConversionError('damaged', stderr.trim().split('\n')[0]?.slice(0, 160))
  }
}

export async function isPdfToolingAvailable(): Promise<boolean> {
  try {
    await execFileAsync('pdfinfo', ['-v'], { timeout: FLIPBOOK_PROBE_TIMEOUT_MS })
    await execFileAsync('pdftoppm', ['-v'], { timeout: FLIPBOOK_PROBE_TIMEOUT_MS })
    return true
  } catch {
    return false
  }
}

export async function readPdfSignature(filePath: string): Promise<boolean> {
  const handle = await fs.open(filePath, 'r')
  try {
    const buffer = Buffer.alloc(1024)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    return buffer.subarray(0, bytesRead).includes('%PDF-')
  } finally {
    await handle.close()
  }
}

export function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('error', reject)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

export async function probePdf(filePath: string): Promise<PdfProbe> {
  const { stdout } = await run('pdfinfo', [filePath], FLIPBOOK_PROBE_TIMEOUT_MS)
  const pages = Number(/^Pages:\s+(\d+)/m.exec(stdout)?.[1])
  const encrypted = /^Encrypted:\s+yes/im.test(stdout)
  if (encrypted) throw new FlipbookConversionError('encrypted')
  if (!Number.isInteger(pages) || pages < 1) throw new FlipbookConversionError('damaged', 'keine Seiten')
  if (pages > FLIPBOOK_MAX_PAGES) throw new FlipbookConversionError('too-many-pages', `${pages} Seiten`)
  return { pageCount: pages, encrypted }
}

export type RenderedPage = {
  filePath: string
  width: number
  height: number
}

export function readPngSize(buffer: Buffer): { width: number; height: number } | null {
  const signature = '89504e470d0a1a0a'
  if (buffer.length < 24 || buffer.subarray(0, 8).toString('hex') !== signature) return null
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

export async function renderPage(
  filePath: string,
  pageNumber: number,
  outDir: string,
  options: { targetLongEdge?: number; timeoutMs?: number } = {},
): Promise<RenderedPage> {
  const base = path.join(outDir, `page-${String(pageNumber).padStart(4, '0')}`)
  await run(
    'pdftoppm',
    [
      '-png',
      '-singlefile',
      '-cropbox',
      '-scale-to',
      String(options.targetLongEdge ?? FLIPBOOK_TARGET_LONG_EDGE),
      '-f',
      String(pageNumber),
      '-l',
      String(pageNumber),
      filePath,
      base,
    ],
    options.timeoutMs ?? FLIPBOOK_PAGE_TIMEOUT_MS,
  )

  const output = `${base}.png`
  const png = await fs.readFile(output).catch(() => null)
  const size = png ? readPngSize(png) : null
  if (!size) throw new FlipbookConversionError('render-failed', `Seite ${pageNumber}`)
  return { filePath: output, ...size }
}

/**
 * Extracts the document's text layer as `pdftotext -bbox-layout` XHTML
 * (page/flow/block/line/word with CropBox coordinates in points). The
 * pdfedit package parses this into `W1FormTextModel`; the conversion
 * pipeline stores it alongside the published pages of a revision.
 */
export async function extractTextLayout(filePath: string): Promise<string> {
  const { stdout } = await run(
    'pdftotext',
    ['-bbox-layout', filePath, '-'],
    FLIPBOOK_PROBE_TIMEOUT_MS,
    64 * 1024 * 1024,
  )
  if (!stdout.includes('<page')) throw new FlipbookConversionError('render-failed', 'keine Textebene')
  return stdout
}

/**
 * Extracts the document's text styles (font, size in points, colour) as
 * `pdftohtml -xml -zoom 1 -i` XML. The pdfedit package maps them onto the
 * text blocks (`applyTextStyles`).
 */
export async function extractStyleLayout(filePath: string): Promise<string> {
  const { stdout } = await run(
    'pdftohtml',
    ['-xml', '-zoom', '1', '-i', '-stdout', filePath],
    FLIPBOOK_PROBE_TIMEOUT_MS,
    128 * 1024 * 1024,
  )
  if (!stdout.includes('<page')) throw new FlipbookConversionError('render-failed', 'keine Stilinformationen')
  return stdout
}

export const resolveFlipbookTempRoot = () =>
  process.env.W1_FLIPBOOK_TMP_DIR ?? path.join(os.tmpdir(), 'w1-flipbook')

export async function createJobDir(root = resolveFlipbookTempRoot()): Promise<string> {
  await fs.mkdir(root, { recursive: true })
  return fs.mkdtemp(path.join(root, 'job-'))
}

export async function removeJobDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true })
}

export async function clearTempRoot(root = resolveFlipbookTempRoot()): Promise<void> {
  await fs.rm(root, { recursive: true, force: true })
}

export function toUserMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.slice(0, 500)
}
