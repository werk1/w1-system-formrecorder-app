'use client'

import { Banner, Button, FieldDescription, FieldLabel, SelectInput, useField } from '@payloadcms/ui'
import type { UIFieldClientComponent } from 'payload'
import { useMemo, useState } from 'react'

type AdobeFaceSuggestion = {
  label: string
  weight: number
  style: 'normal' | 'italic' | 'oblique'
  stretch: number
}

type AdobeFamilySuggestion = {
  providerFamily: string
  faces: AdobeFaceSuggestion[]
}

type InspectResponse = {
  projectId?: string
  stylesheetUrl?: string
  licenseReference?: string
  families?: AdobeFamilySuggestion[]
  error?: string
}

type AssistantState =
  | { status: 'idle'; message?: string }
  | { status: 'working'; message: string }
  | { status: 'ready'; message: string; families: AdobeFamilySuggestion[]; licenseReference: string }
  | { status: 'error'; message: string }

export const AdobeFontsProjectAssistant: UIFieldClientComponent = ({ field, path }) => {
  const groupPath = path.includes('.') ? path.slice(0, path.lastIndexOf('.')) : 'adobeFonts'
  const projectIdField = useField<string>({ path: `${groupPath}.projectId` })
  const providerFamilyField = useField<string>({ path: `${groupPath}.providerFamily` })
  const licenseReferenceField = useField<string>({ path: `${groupPath}.licenseReference` })
  const facesField = useField<AdobeFaceSuggestion[]>({ path: `${groupPath}.faces` })
  const displayNameField = useField<string>({ path: 'displayName' })
  const [state, setState] = useState<AssistantState>({ status: 'idle' })

  const options = useMemo(() => {
    return state.status === 'ready'
      ? state.families.map((family) => ({
          label: `${family.providerFamily} (${family.faces.length} ${family.faces.length === 1 ? 'Schnitt' : 'Schnitte'})`,
          value: family.providerFamily,
        }))
      : []
  }, [state])

  async function inspectProject() {
    const projectId = String(projectIdField.value ?? '').trim().toLowerCase()
    if (!projectId) {
      setState({ status: 'error', message: 'Trage zuerst die Adobe Fonts Web Project ID ein.' })
      return
    }
    setState({ status: 'working', message: 'Adobe Fonts CSS wird gelesen ...' })
    try {
      const response = await fetch(`/api/app-fonts/adobe/inspect?projectId=${encodeURIComponent(projectId)}`, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      })
      const body = await response.json().catch(() => null) as InspectResponse | null
      if (!response.ok || !body?.families) {
        throw new Error(body?.error || `Adobe Fonts CSS konnte nicht gelesen werden (HTTP ${response.status}).`)
      }
      setState({
        status: 'ready',
        message: `${body.families.length} ${body.families.length === 1 ? 'CSS-Familie erkannt' : 'CSS-Familien erkannt'}.`,
        families: body.families,
        licenseReference: body.licenseReference ?? `Adobe Fonts Web Project ${projectId}`,
      })
      if (body.families.length === 1) applyFamily(body.families[0]!, body.licenseReference)
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : 'Adobe Fonts CSS konnte nicht gelesen werden.' })
    }
  }

  function applyFamily(family: AdobeFamilySuggestion, licenseReference = state.status === 'ready' ? state.licenseReference : '') {
    providerFamilyField.setValue(family.providerFamily)
    licenseReferenceField.setValue(licenseReference || `Adobe Fonts Web Project ${String(projectIdField.value ?? '').trim().toLowerCase()}`)
    facesField.setValue(family.faces)
    if (!String(displayNameField.value ?? '').trim()) {
      displayNameField.setValue(displayNameFromProviderFamily(family.providerFamily))
    }
  }

  function applySelected(value: unknown) {
    const selected = Array.isArray(value) ? value[0]?.value : value && typeof value === 'object' && 'value' in value ? value.value : undefined
    if (typeof selected !== 'string' || state.status !== 'ready') return
    const family = state.families.find((candidate) => candidate.providerFamily === selected)
    if (family) applyFamily(family)
  }

  return (
    <div className="app-font-adobe-assistant field-type">
      <FieldLabel label={field.label ?? 'Adobe CSS aus Web Project vorschlagen'} path={path} />
      <FieldDescription
        description="Liest die offizielle Adobe-CSS und füllt CSS-Familie, Lizenzreferenz und deklarierte Schnitte vor."
        path={path}
        marginPlacement="bottom"
      />
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Button buttonStyle="secondary" disabled={state.status === 'working'} margin={false} onClick={inspectProject} size="small">
          Vorschläge laden
        </Button>
        {state.status === 'ready' && options.length > 1 ? (
          <div style={{ minWidth: 280 }}>
            <SelectInput
              name={`${path}.providerFamilySuggestion`}
              path={`${path}.providerFamilySuggestion`}
              label="Adobe CSS font-family"
              options={options}
              value={String(providerFamilyField.value ?? '')}
              onChange={applySelected}
            />
          </div>
        ) : null}
      </div>
      {state.status === 'working' ? <Banner type="info">{state.message}</Banner> : null}
      {state.status === 'error' ? <Banner type="error">{state.message}</Banner> : null}
      {state.status === 'ready' ? <Banner type="success">{state.message}</Banner> : null}
    </div>
  )
}

function displayNameFromProviderFamily(providerFamily: string): string {
  return providerFamily
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
