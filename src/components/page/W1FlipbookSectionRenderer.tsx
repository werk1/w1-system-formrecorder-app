'use client'

import { useMemo } from 'react'
import { createFlipbookLabels } from '@/lib/blocks/flipbook/labels'
import { useBoundStore } from '@/stores/boundStore'
import { W1FlipbookBlock, type W1FlipbookInput } from '@werk1/w1-system-flipbook'
import { devCurlTuning, IS_DEV } from '@/components/flipbook/dev/devCurlTuning'
import { renderFlipbookNavigationWidget } from '@/components/flipbook/FlipbookNavigationWidget'
import { renderFlipbookThumbnailRail } from '@/components/flipbook/FlipbookThumbnailRail'
import { renderFlipbookToolbarBar } from '@/components/flipbook/FlipbookToolbar'

type W1FlipbookSectionRendererProps = {
  input: W1FlipbookInput
  locale: string
}

export function W1FlipbookSectionRenderer({ input, locale }: W1FlipbookSectionRendererProps) {
  const deviceInfo = useBoundStore((state) => state.device)
  const labels = useMemo(() => createFlipbookLabels(locale), [locale])

  return (
    <W1FlipbookBlock
      input={input}
      labels={labels}
      deviceInfo={deviceInfo}
      renderThumbnails={renderFlipbookThumbnailRail}
      renderToolbar={renderFlipbookToolbarBar}
      renderNavigation={renderFlipbookNavigationWidget}
      curlTuning={IS_DEV ? devCurlTuning : undefined}
    />
  )
}
