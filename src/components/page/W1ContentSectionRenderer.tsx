'use client'

import { PayloadTextContentLoader } from '@/payload/components/PayloadTextContentLoader'
import contentSectionStyles from '@/styles/modules/ContentSections.module.css'
import type { ReactNode } from 'react'

type W1ContentSectionRendererProps = {
  sectionSlug: string | null
  sectionVariant: string | null
  fallback: ReactNode
}

function resolveContentSectionClassName(sectionVariant: string | null) {
  switch (sectionVariant) {
    case 'intro':
      return contentSectionStyles.intro
    case 'hero':
      return contentSectionStyles.hero
    case 'footer':
      return contentSectionStyles.footer
    case 'highlight':
      return contentSectionStyles.highlight
    case 'sidebar':
      return contentSectionStyles.sidebar
    case 'default':
    default:
      return contentSectionStyles.default
  }
}

export function W1ContentSectionRenderer({ sectionSlug, sectionVariant, fallback }: W1ContentSectionRendererProps) {
  const className = `${contentSectionStyles.section} ${resolveContentSectionClassName(sectionVariant)}`

  return (
    <section
      className={className}
      data-w1-section="content"
      data-variant={sectionVariant ?? undefined}
    >
      {sectionSlug ? (
        <PayloadTextContentLoader contentKey={sectionSlug} virtualized={false} />
      ) : (
        fallback
      )}
    </section>
  )
}
