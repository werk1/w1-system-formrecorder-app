'use client'

import {
  CheckboxInput,
  FieldDescription,
  FieldLabel,
  SelectInput,
  useField,
  useFormFields,
} from '@payloadcms/ui'
import type { JSONFieldClientComponent } from 'payload'
import { useEffect, useMemo, useState } from 'react'

type NumericRange = { min: number; default: number; max: number }
type InventoryFace = {
  faceId: string
  label: string
  familyName: string
  weight: NumericRange
  style: 'normal' | 'italic' | 'oblique'
  stretch: NumericRange
  variableAxes: Array<NumericRange & { tag: string; name?: string }>
  sourceLabel: string
  metadataTrust: 'font-table' | 'provider-declared'
}
type InventoryResponse = {
  familyId?: string
  familyName?: string
  faces?: InventoryFace[]
  error?: string
}
type FaceSelection = { all: boolean; faceIds: string[] }
type WeightSubstitution = { requestedWeight: number; replacementWeight: number }

const STANDARD_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const

export const AppFontRolePublishedFacesField: JSONFieldClientComponent = ({ field, path }) => {
  const { value, setValue } = useField<unknown>({ path })
  const rolePath = rolePathFromFieldPath(path)
  const { familyName, faces, loading, error } = useAppFontRoleFaceInventory(rolePath)
  const selection = normalizeFaceSelection(value)
  const selectedSet = useMemo(
    () => new Set(selection.all ? faces.map((face) => face.faceId) : selection.faceIds),
    [faces, selection.all, selection.faceIds],
  )

  function toggleFace(faceId: string, checked: boolean) {
    const next = new Set(selectedSet)
    if (checked) next.add(faceId)
    else next.delete(faceId)
    const all = faces.length > 0 && next.size === faces.length
    setValue({ all, faceIds: all ? [] : [...next].sort() })
  }

  function toggleAll(checked: boolean) {
    setValue({ all: checked, faceIds: [] })
  }

  return (
    <div className="app-font-face-inventory field-type">
      <FieldLabel label={field.label} path={path} />
      <FieldDescription description={field.admin?.description} path={path} marginPlacement="bottom" />

      {!familyName ? <p className="app-font-face-inventory__empty">Wähle zuerst eine bereite Fontfamilie.</p> : null}
      {loading ? <p className="app-font-face-inventory__empty">Erkannte Schriftschnitte werden geladen …</p> : null}
      {error ? <p className="app-font-face-inventory__error">{error}</p> : null}
      {familyName && !loading && !error ? (
        <div className="app-font-face-inventory__panel">
          <div className="app-font-face-inventory__summary">
            <strong>{familyName}</strong>
            <span>
              {faces.length} {faces.length === 1 ? 'erkannter Schnitt' : 'erkannte Schnitte'} ·{' '}
              {selection.all ? 'alle werden veröffentlicht' : `${selectedSet.size} ausgewählt`}
            </span>
          </div>
          <div className="app-font-face-inventory__all">
            <CheckboxInput
              checked={selection.all}
              id={fieldId(path, 'all')}
              name={`${path}.all`}
              onToggle={(event) => toggleAll(event.target.checked)}
              Label={<strong>Alle</strong>}
            />
          </div>
          {faces.length === 0 ? (
            <p className="app-font-face-inventory__empty">Diese Familie enthält keine auswertbaren Faces.</p>
          ) : (
            <div className="app-font-face-inventory__faces">
              {faces.map((face) => {
                const checked = selectedSet.has(face.faceId)
                return (
                  <div className="app-font-face-inventory__face" key={face.faceId}>
                    <CheckboxInput
                      checked={checked}
                      id={fieldId(path, face.faceId)}
                      name={`${path}.${face.faceId}`}
                      onToggle={(event) => toggleFace(face.faceId, event.target.checked)}
                      Label={(
                        <div className="app-font-face-inventory__face-label">
                          <strong>{face.label}</strong>
                          <span>{describeFace(face)}</span>
                        </div>
                      )}
                    />
                    <div className="app-font-face-inventory__metadata">
                      <span>{face.sourceLabel}</span>
                      <span>{face.metadataTrust === 'font-table' ? 'aus Fonttabellen analysiert' : 'vom Provider deklariert'}</span>
                    </div>
                    {face.variableAxes.length > 0 ? (
                      <div className="app-font-face-inventory__axes" aria-label="Variable-Font-Achsen">
                        {face.variableAxes.map((axis) => (
                          <span key={axis.tag}>{axis.tag} {formatRange(axis)}</span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
          {!selection.all && selectedSet.size === 0 ? (
            <p className="app-font-face-inventory__warning">Wähle mindestens einen Schnitt, bevor du das Font-Set speicherst.</p>
          ) : null}
          {faces.some((face) => face.metadataTrust === 'provider-declared') ? (
            <p className="app-font-face-inventory__provider-note">
              Bei Adobe Fonts begrenzt diese Auswahl den W1-Font-Set-Vertrag. Welche Bytes das externe Web Project tatsächlich ausliefert, bleibt unter Kontrolle von Adobe; W1 kopiert diese Fonts nicht.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export const AppFontRoleWeightSubstitutionsField: JSONFieldClientComponent = ({ field, path }) => {
  const { value, setValue } = useField<unknown>({ path })
  const rolePath = rolePathFromFieldPath(path)
  const selection = normalizeFaceSelection(useRoleFieldValue(rolePath, 'faceSelection'))
  const { familyName, faces, loading, error } = useAppFontRoleFaceInventory(rolePath)
  const publishedFaces = selection.all
    ? faces
    : faces.filter((face) => selection.faceIds.includes(face.faceId))
  const defaults = defaultWeightSubstitutions(publishedFaces)
  const stored = new Map(normalizeWeightSubstitutions(value)
    .map((substitution) => [substitution.requestedWeight, substitution.replacementWeight]))
  const replacementWeights = availableReplacementWeights(publishedFaces)
  const substitutions = defaults.map((substitution) => ({
    ...substitution,
    replacementWeight: replacementWeights.includes(stored.get(substitution.requestedWeight) ?? Number.NaN)
      ? stored.get(substitution.requestedWeight)!
      : substitution.replacementWeight,
  }))

  function setReplacementWeight(requestedWeight: number, replacementWeight: number) {
    setValue(substitutions.map((substitution) => substitution.requestedWeight === requestedWeight
      ? { ...substitution, replacementWeight }
      : substitution))
  }

  return (
    <div className="app-font-weight-substitutions field-type">
      <FieldLabel label={field.label} path={path} />
      <FieldDescription description={field.admin?.description} path={path} marginPlacement="bottom" />
      {!familyName ? <p className="app-font-face-inventory__empty">Wähle zuerst eine bereite Fontfamilie.</p> : null}
      {loading ? <p className="app-font-face-inventory__empty">Weight-Abdeckung wird geladen …</p> : null}
      {error ? <p className="app-font-face-inventory__error">{error}</p> : null}
      {!loading && !error && familyName && publishedFaces.length === 0 ? (
        <p className="app-font-face-inventory__warning">Wähle zuerst mindestens einen Font-Schnitt.</p>
      ) : null}
      {!loading && !error && publishedFaces.length > 0 && substitutions.length === 0 ? (
        <p className="app-font-face-inventory__empty">Alle Standard-Weights 100–900 sind abgedeckt. Es ist keine Ersetzung notwendig.</p>
      ) : null}
      {!loading && !error && substitutions.length > 0 ? (
        <div className="app-font-weight-substitutions__grid">
          {substitutions.map((substitution) => (
            <SelectInput
              key={substitution.requestedWeight}
              name={`${path}.${substitution.requestedWeight}`}
              path={`${path}.${substitution.requestedWeight}`}
              label={`Fehlendes Weight ${substitution.requestedWeight}`}
              value={String(substitution.replacementWeight)}
              options={replacementWeights.map((weight) => ({ label: `durch ${weight} ersetzen`, value: String(weight) }))}
              onChange={(option) => {
                const next = Array.isArray(option) ? option[0]?.value : option?.value
                if (typeof next === 'string') setReplacementWeight(substitution.requestedWeight, Number(next))
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function useAppFontRoleFaceInventory(rolePath: string) {
  const familyValue = useRoleFieldValue(rolePath, 'family')
  const familyId = relationId(familyValue)
  const [state, setState] = useState<{
    familyId: string
    familyName: string
    faces: InventoryFace[]
    loading: boolean
    error: string
  }>({ familyId: '', familyName: '', faces: [], loading: false, error: '' })

  useEffect(() => {
    if (!familyId) {
      setState({ familyId: '', familyName: '', faces: [], loading: false, error: '' })
      return
    }
    let cancelled = false
    setState({ familyId, familyName: '', faces: [], loading: true, error: '' })
    void fetch(`/api/app-fonts/family-face-inventory?familyId=${encodeURIComponent(familyId)}`, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as InventoryResponse | null
        if (!response.ok || !Array.isArray(body?.faces)) {
          throw new Error(body?.error || `Das Face-Inventar konnte nicht geladen werden (HTTP ${response.status}).`)
        }
        if (!cancelled) {
          setState({
            familyId,
            familyName: typeof body.familyName === 'string' ? body.familyName : familyId,
            faces: body.faces,
            loading: false,
            error: '',
          })
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            familyId,
            familyName: familyId,
            faces: [],
            loading: false,
            error: error instanceof Error ? error.message : 'Das Face-Inventar konnte nicht geladen werden.',
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [familyId])

  return state
}

function useRoleFieldValue(rolePath: string, fieldName: string): unknown {
  return useFormFields(([fields]) => fields[`${rolePath}.${fieldName}`]?.value)
}

function rolePathFromFieldPath(path: string): string {
  const finalDot = path.lastIndexOf('.')
  return finalDot >= 0 ? path.slice(0, finalDot) : path
}

function relationId(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (value && typeof value === 'object' && 'id' in value) return String((value as { id: unknown }).id)
  return ''
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === 'string' && item.length > 0))].sort()
    : []
}

function normalizeFaceSelection(value: unknown): FaceSelection {
  if (!value || typeof value !== 'object') return { all: true, faceIds: [] }
  const selection = value as { all?: unknown; faceIds?: unknown }
  return {
    all: selection.all !== false,
    faceIds: normalizeStringArray(selection.faceIds),
  }
}

function normalizeWeightSubstitutions(value: unknown): WeightSubstitution[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const candidate = item as { requestedWeight?: unknown; replacementWeight?: unknown }
    return typeof candidate.requestedWeight === 'number' && typeof candidate.replacementWeight === 'number'
      ? [{ requestedWeight: candidate.requestedWeight, replacementWeight: candidate.replacementWeight }]
      : []
  })
}

function defaultWeightSubstitutions(faces: InventoryFace[]): WeightSubstitution[] {
  const candidates = availableReplacementWeights(faces)
  if (candidates.length === 0) return []
  return STANDARD_WEIGHTS
    .filter((weight) => !faces.some((face) => weight >= face.weight.min && weight <= face.weight.max))
    .map((requestedWeight) => ({
      requestedWeight,
      replacementWeight: [...candidates].sort((left, right) =>
        Math.abs(left - requestedWeight) - Math.abs(right - requestedWeight)
        || right - left)[0]!,
    }))
}

function availableReplacementWeights(faces: InventoryFace[]): number[] {
  return [...new Set(faces.flatMap((face) => [face.weight.min, face.weight.default, face.weight.max]))]
    .sort((left, right) => left - right)
}

function describeFace(face: InventoryFace): string {
  const variable = face.variableAxes.length > 0 ? 'Variable Font' : 'statisch'
  return `Weight ${formatRange(face.weight)} · ${styleLabel(face.style)} · Stretch ${formatRange(face.stretch)} · ${variable}`
}

function formatRange(range: NumericRange): string {
  return range.min === range.max ? String(range.default) : `${range.min}–${range.max}`
}

function styleLabel(style: InventoryFace['style']): string {
  if (style === 'italic') return 'kursiv'
  if (style === 'oblique') return 'schräg'
  return 'normal'
}

function fieldId(path: string, faceId: string): string {
  return `${path}-${faceId}`.replace(/[^a-zA-Z0-9_-]/g, '-')
}

