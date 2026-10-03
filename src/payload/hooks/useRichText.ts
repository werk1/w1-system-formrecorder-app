'use client'
import { getRichTextContent } from '@/payload/actions/getRichTextContent'
import { RichTextContent } from '@/payload/renderer/types/richTextTypes'
import { useBoundStore } from '@/stores/boundStore'
import { useEffect, useRef, useState } from 'react'

export function useRichText(contentKey: string) {
    const currentLocale = useBoundStore((state) => state.ui.currentLocale)

    const [content, setContent] = useState<{
        richText: RichTextContent
        arrayContent: RichTextContent
    }>({ richText: [], arrayContent: [] })
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const abortControllerRef = useRef<AbortController | null>(null)
    const isMountedRef = useRef(true)

    useEffect(() => {
        isMountedRef.current = true

        async function fetchData() {
            try {
                if (abortControllerRef.current) {
                    abortControllerRef.current.abort()
                }

                abortControllerRef.current = new AbortController()

                setIsLoading(true)
                setError(null)

                const response = await getRichTextContent(contentKey, {
                    timeout: 6000,
                    locale: currentLocale,
                })

                if (isMountedRef.current && !abortControllerRef.current.signal.aborted) {
                    if (response.error) {
                        setError(response.error)
                    } else {
                        setContent(response.content)
                    }
                }
            } catch (error) {
                if (isMountedRef.current && !abortControllerRef.current?.signal.aborted) {
                    if (error instanceof Error && error.name === 'AbortError') {
                        console.log(`Request for ${contentKey} was cancelled`)
                    } else {
                        setError('Error fetching content')
                        console.error('Error fetching content:', error)
                    }
                }
            } finally {
                if (isMountedRef.current) {
                    setIsLoading(false)
                }
            }
        }

        fetchData()

        return () => {
            isMountedRef.current = false
            if (abortControllerRef.current) {
                abortControllerRef.current.abort()
            }
        }
    }, [contentKey, currentLocale])

    useEffect(() => {
        return () => {
            isMountedRef.current = false
            if (abortControllerRef.current) {
                abortControllerRef.current.abort()
            }
        }
    }, [])

    const arrayLength = content?.arrayContent ? (Array.isArray(content.arrayContent) ? content.arrayContent.length : 0) : 0

    return {
        content,
        isLoading,
        error,
        arrayLength,
    }
}


