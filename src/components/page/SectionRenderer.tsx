'use client'

import type { ResolvedPageSection } from '@/lib/pages/types'

type SectionRendererProps = {
  section: ResolvedPageSection
}

export function SectionRenderer({ section }: SectionRendererProps) {
  const Component = section.component as React.ComponentType<{ data: Record<string, unknown> }>
  return <Component data={section.data} />
}
