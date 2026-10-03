import type { W1FlipbookConfig, W1FlipbookInput } from '@werk1/w1-system-flipbook/types'

export type FlipbookSectionOverrides = Pick<
  W1FlipbookConfig,
  | 'spreadMode'
  | 'coverMode'
  | 'direction'
  | 'theme'
  | 'engine'
  | 'startPage'
  | 'showControls'
  | 'showThumbnails'
  | 'aspectRatio'
  | 'maxWidthPx'
>

export type ResolvedFlipbookBlockData = {
  flipbookSlug: string | null
  locale: string
  input: W1FlipbookInput | null
}
