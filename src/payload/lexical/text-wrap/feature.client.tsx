'use client'

import React, { useEffect } from 'react'
import {
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $getState,
  $isRangeSelection,
  $isTextNode,
  $setState,
  createState,
  type BaseSelection,
  type LexicalEditor,
  type LexicalNode,
} from 'lexical'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'

const textWrapBalanceState = createState('textWrapBalance', {
  parse: (value: unknown) => value === true,
})

export const idmlParagraphHyphensState = createState('idmlParagraphHyphens', {
  parse: (value: unknown) => (value === 'none' || value === 'auto' ? value : ''),
})

function getCustomProperty(style: string | undefined, property: string): string | undefined {
  if (!style) return undefined
  const declarations = style.split(';')
  for (const declaration of declarations) {
    const index = declaration.indexOf(':')
    if (index === -1) continue
    const name = declaration.slice(0, index).trim()
    if (name !== property) continue
    const value = declaration.slice(index + 1).trim()
    return value || undefined
  }
  return undefined
}

function selectionTopLevelKeys(selection: BaseSelection | null): string[] {
  if (!$isRangeSelection(selection)) return []
  const keys: string[] = []
  const seen = new Set<string>()
  const nodes = selection.getNodes()
  for (const n of nodes) {
    const element = $isTextNode(n) ? n.getParent() : n
    const topLevel = element?.getTopLevelElement()
    if (!topLevel) continue
    const k = (topLevel as LexicalNode).getKey()
    if (!seen.has(k)) { seen.add(k); keys.push(k) }
  }
  if (keys.length === 0) {
    const anchorNode = selection.anchor.getNode()
    const element = $isTextNode(anchorNode) ? anchorNode.getParent() : anchorNode
    const topLevel = element?.getTopLevelElement()
    if (topLevel) keys.push((topLevel as LexicalNode).getKey())
  }
  return keys
}


function getTextWrapBalanceFromTopLevel(topLevel: unknown): boolean {
  return $getState(topLevel as LexicalNode, textWrapBalanceState) === true
}

function setTextWrapBalanceOnTopLevel(topLevel: unknown, active: boolean): void {
  const tl = topLevel as LexicalNode
  const existingHyphens = $getState(tl, idmlParagraphHyphensState)
  if (existingHyphens !== 'none' && existingHyphens !== 'auto') {
    const serialized = tl.exportJSON() as { textStyle?: string }
    const hyphens = getCustomProperty(serialized.textStyle, '--idml-para-hyphens')
    if (hyphens === 'none' || hyphens === 'auto') {
      $setState(tl, idmlParagraphHyphensState, hyphens)
    }
  }
  $setState(tl, textWrapBalanceState, active)
}

function isTextWrapBalanceActive({ selection }: { selection: BaseSelection | null }): boolean {
  if (!$isRangeSelection(selection)) return false
  const nodes = selection.getNodes()
  const seen = new Set<string>()
  for (const n of nodes) {
    const element = $isTextNode(n) ? n.getParent() : n
    const topLevel = element?.getTopLevelElement()
    if (!topLevel) continue
    const k = (topLevel as LexicalNode).getKey()
    if (seen.has(k)) continue
    seen.add(k)
    if (getTextWrapBalanceFromTopLevel(topLevel)) return true
  }
  return false
}

function TextWrapBalancePlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    const id = 'text-wrap-balance-wysiwyg'
    if (!document.getElementById(id)) {
      const style = document.createElement('style')
      style.id = id
      style.textContent = `.ContentEditable__root [data-text-wrap-balance="true"] { text-wrap: balance; }`
      document.head.appendChild(style)
    }

    const syncDomAttributes = () => {
      const updates: Array<() => void> = []
      editor.getEditorState().read(() => {
        const children = $getRoot().getChildren()
        for (const tl of children) {
          const key = tl.getKey()
          const active = getTextWrapBalanceFromTopLevel(tl)
          updates.push(() => {
            const el = editor.getElementByKey(key)
            if (!el) return
            if (active) el.setAttribute('data-text-wrap-balance', 'true')
            else el.removeAttribute('data-text-wrap-balance')
          })
        }
      })
      for (const update of updates) update()
    }

    syncDomAttributes()
    const unregister = editor.registerUpdateListener(() => syncDomAttributes())
    return () => unregister()
  }, [editor])

  return null
}

function TextWrapIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="10" x2="17" y2="10" />
      <line x1="3" y1="14" x2="21" y2="14" />
      <line x1="3" y1="18" x2="14" y2="18" />
      <path d="M19 15 L22 18 L19 21" />
    </svg>
  )
}

function toggleTextWrapBalance(editor: LexicalEditor, isActive: boolean): void {
  const next = !isActive
  editor.update(() => {
    const keys = selectionTopLevelKeys($getSelection())
    for (const k of keys) {
      const node = $getNodeByKey(k)
      if (!node) continue
      setTextWrapBalanceOnTopLevel(node, next)
    }
  })
}

function createClientFeature<TProps = unknown>(
  feature: ((args: Record<string, unknown>) => Record<string, unknown>) | Record<string, unknown>,
) {
  return (props?: TProps) => {
    const featureProviderClient: Record<string, unknown> = {
      clientFeatureProps: props ?? null,
    }

    if (typeof feature === 'function') {
      featureProviderClient.feature = (args: Record<string, unknown>) => {
        const result = feature({ ...args, props }) as Record<string, unknown>
        if (result.sanitizedClientFeatureProps === null) {
          result.sanitizedClientFeatureProps = props ?? null
        }
        return result
      }
    } else {
      featureProviderClient.feature = {
        ...feature,
        sanitizedClientFeatureProps: props ?? null,
      }
    }

    return featureProviderClient
  }
}

const textWrapToolbarGroup = {
  type: 'buttons' as const,
  key: 'textWrapBalance',
  order: 30,
  items: [
    {
      ChildComponent: TextWrapIcon,
      isActive: ({ selection }: { selection: BaseSelection | null }) =>
        isTextWrapBalanceActive({ selection }),
      key: 'textWrapBalanceToggle',
      label: 'text-wrap: balance',
      onSelect: ({ editor, isActive }: { editor: LexicalEditor; isActive: boolean }) =>
        toggleTextWrapBalance(editor, isActive),
    },
  ],
}

export const TextWrapFeatureClient = createClientFeature(() => ({
  plugins: [
    {
      Component: () => <TextWrapBalancePlugin />,
      position: 'top',
    },
  ],
  toolbarFixed: {
    groups: [textWrapToolbarGroup],
  },
  toolbarInline: {
    groups: [textWrapToolbarGroup],
  },
}))
