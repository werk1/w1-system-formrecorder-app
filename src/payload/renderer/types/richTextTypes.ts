export interface SerializedLexicalNode {
  type: string
  text?: string
  format?: number
  style?: string
  $?: Record<string, unknown>
  children?: SerializedLexicalNode[]
  url?: string
  version: number
  tag?: string
  target?: string
  rel?: string
  openInNewTab?: boolean
  fields?: {
    url: string
    newTab?: boolean
    linkType?: string
  }
}

export interface RichTextArrayItem {
  style: string
  content: SerializedLexicalNode[]
}

export type ArraySection = SerializedLexicalNode[] | RichTextArrayItem

export type RichTextContent =
  | SerializedLexicalNode[]
  | RichTextArrayItem[]
  | ArraySection[]

export interface RichTextContentResponse {
  content: {
    richText: RichTextContent
    arrayContent: RichTextContent
  }
  error?: string
}

export const isStyledContent = (
  content: RichTextContent,
): content is RichTextArrayItem[] => {
  if (!Array.isArray(content) || content.length === 0) return false
  const firstItem = content[0]
  return (
    typeof firstItem === 'object' &&
    firstItem !== null &&
    'style' in firstItem &&
    'content' in firstItem &&
    Array.isArray(firstItem.content)
  )
}

export const isArrayContent = (content: RichTextContent): content is ArraySection[] => {
  if (!Array.isArray(content) || content.length === 0) return false
  const firstItem = content[0]
  return (
    Array.isArray(firstItem) ||
    (typeof firstItem === 'object' &&
      firstItem !== null &&
      'style' in firstItem &&
      'content' in firstItem &&
      Array.isArray(firstItem.content))
  )
}

export const isStyledSection = (section: ArraySection): section is RichTextArrayItem => {
  return (
    !Array.isArray(section) &&
    typeof section === 'object' &&
    section !== null &&
    'style' in section &&
    'content' in section &&
    Array.isArray(section.content)
  )
}
