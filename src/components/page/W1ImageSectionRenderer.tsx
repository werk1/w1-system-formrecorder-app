'use client'

import { useBoundStore } from '@/stores/boundStore'
import { W1ImageBlock } from '@werk1/w1-system-imageblock'

type W1ImageSectionRendererProps = {
  url: string
}

export function W1ImageSectionRenderer({ url }: W1ImageSectionRendererProps) {
  const deviceInfo = useBoundStore((state) => state.device)

  return (
    <section data-w1-section="image" style={{ width: '100%' }}>
      <W1ImageBlock
        deviceInfo={deviceInfo}
        mediaSource={{ type: 'directAccess', src: [url] }}
        transitionMode="none"
        width="100%"
        height={400}
      />
    </section>
  )
}
