'use client'

import { PdfeditWorkspace } from './PdfeditWorkspace'
import { useFrontendMediaPicker } from './useFrontendMediaPicker'

/** Start-page edit view: the shared editor with the frontend media picker, filling the space below the header. */
export function PdfeditEditView({ docId }: { docId: string }) {
  const media = useFrontendMediaPicker()
  return <PdfeditWorkspace docId={docId} media={media} />
}
