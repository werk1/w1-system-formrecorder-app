import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { AppFontWebDerivative } from '@werk1/w1-system-font-manager'
import { createAppFontWebDerivative } from '@werk1/w1-system-font-manager/derivatives'

export interface CreateStoredAppFontWebDerivativeInput {
  sourceBytes: Uint8Array
  storageRoot: string
  createdAt: string
}

export async function createStoredAppFontWebDerivative(
  input: CreateStoredAppFontWebDerivativeInput,
): Promise<{ derivative: AppFontWebDerivative; analysis: Record<string, unknown> }> {
  const created = await createAppFontWebDerivative({
    bytes: input.sourceBytes,
    createdAt: input.createdAt,
  })
  const storageKey = `${created.derivative.sha256}.woff2`
  await persistVerifiedBytes(input.storageRoot, storageKey, created.bytes, created.derivative.sha256)

  return {
    derivative: { ...created.derivative, storageKey },
    analysis: created.analysis as unknown as Record<string, unknown>,
  }
}

async function persistVerifiedBytes(
  storageRoot: string,
  storageKey: string,
  bytes: Uint8Array,
  expectedSha256: string,
): Promise<void> {
  const root = path.resolve(storageRoot)
  const destination = path.resolve(root, storageKey)
  if (path.basename(storageKey) !== storageKey || !destination.startsWith(`${root}${path.sep}`)) {
    throw new Error('Generated App Font derivative storage key is invalid.')
  }

  await mkdir(root, { recursive: true })
  if (await existingFileMatches(destination, expectedSha256)) return

  const temporary = path.resolve(root, `.${storageKey}.${randomUUID()}.tmp`)
  try {
    await writeFile(temporary, bytes, { flag: 'wx' })
    try {
      await rename(temporary, destination)
    } catch (error) {
      if (!(await existingFileMatches(destination, expectedSha256))) throw error
    }
  } finally {
    await unlink(temporary).catch(() => undefined)
  }
}

async function existingFileMatches(filePath: string, expectedSha256: string): Promise<boolean> {
  try {
    const bytes = await readFile(filePath)
    return createHash('sha256').update(bytes).digest('hex') === expectedSha256
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return false
    throw error
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

