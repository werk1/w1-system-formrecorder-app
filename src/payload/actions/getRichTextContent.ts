'use server'

import { TextContent } from '@/payload-types'
import configPromise, { PROJECT_LOCALES, DEFAULT_LOCALE } from '@/payload.config'
import { RichTextContentResponse } from '@/payload/renderer/types/richTextTypes'
import { getPayload } from 'payload'

interface RichTextData {
  richText?: {
    content?: {
      root?: {
        children: any[]
      }
    }
  }
}

export async function getRichTextContent(
  identifier: string,
  options?: {
    timeout?: number
    locale?: (typeof PROJECT_LOCALES)[number] | 'all'
  },
): Promise<RichTextContentResponse> {
  const defaultTimeout = 8000
  const timeout = options?.timeout ?? defaultTimeout
  const locale = options?.locale ?? DEFAULT_LOCALE

  try {
    const payload = await getPayload({
      config: configPromise,
    })

    const startTime = Date.now()
    const content = (await Promise.race([
      payload.find({
        collection: 'text-content',
        where: {
          identifier: { equals: identifier },
        },
        depth: 0,
        limit: 1,
        overrideAccess: false,
        locale,
      }),
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Request timeout after ${timeout}ms`))
        }, timeout)
      }),
    ])) as Awaited<ReturnType<typeof payload.find>>

    const endTime = Date.now()

    if (!content?.docs?.length) {
      return {
        content: {
          richText: [],
          arrayContent: [],
        },
        error: 'No content found',
      }
    }

    const doc = content.docs[0] as TextContent & RichTextData

    if (process.env.NODE_ENV === 'development') {
      console.log(
        `✅ getRichTextContent: ${identifier} loaded in ${endTime - startTime}ms`,
      )
    }

    if (!doc) {
      console.warn(`[getRichTextContent] No document found for identifier: "${identifier}", locale: ${locale}`)
      console.warn(`[getRichTextContent] Total docs in text-content: ${content.totalDocs}`)
    }

    return {
      content: {
        richText: doc.richText?.content?.root?.children || [],
        arrayContent:
          doc.richTextArrayWithStyle?.map((item) => ({
            style: item.style,
            content: item.content?.root?.children || [],
          })) || [],
      },
    }
  } catch (error) {
    let errorMessage = 'Failed to fetch content'

    if (error instanceof Error) {
      if (error.name === 'AbortError' || error.message.includes('aborted')) {
        errorMessage = 'Request was cancelled'
      } else if (error.message.includes('timeout')) {
        errorMessage = 'Request timed out - please check your connection'
      } else if (error.message.includes('fetch')) {
        errorMessage = 'Network error - please try again'
      } else {
        errorMessage = error.message
      }
    }

    console.error('Error fetching rich text content:', {
      identifier,
      locale,
      error: error instanceof Error ? error.message : error,
      timestamp: new Date().toISOString(),
    })

    return {
      content: {
        richText: [],
        arrayContent: [],
      },
      error: errorMessage,
    }
  }
}
