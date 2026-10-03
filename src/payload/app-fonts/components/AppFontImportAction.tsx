'use client'

import { Banner, Button, Dropzone, SelectInput, TextInput } from '@payloadcms/ui'
import { type ChangeEvent, type InputHTMLAttributes, useRef, useState } from 'react'

type ImportStrategy = 'variable' | 'static' | 'all'
type GoogleMode = 'variable' | 'static'

interface GoogleFamily {
  family: string
  variants: string[]
  subsets: string[]
  version: string
  category: string
  axes: Array<{ tag: string; start: number; end: number }>
}

interface ImportedFaceSummary {
  label: string
  weight: number
  style: string
  stretch: number
  variable: boolean
  relativePath: string
}

interface ImportFamilySummary {
  displayName: string
  status: 'draft' | 'ready'
  licenseReference: string
  defaultFaceLabel: string
  faces: ImportedFaceSummary[]
  warnings: string[]
}

interface ImportedFamily extends ImportFamilySummary {
  familyId: string
  assetIds: string[]
  reusedAssetIds: string[]
}

interface PreviewFamily extends ImportFamilySummary {
  familyKey: string
  licenseKind: string
  genericFallback: string
}

type ActionState =
  | { status: 'idle' }
  | { status: 'working'; message: string }
  | { status: 'success'; message: string; families: ImportedFamily[] }
  | { status: 'preview'; message: string; families: PreviewFamily[] }
  | { status: 'error'; message: string }

type FolderInputProps = InputHTMLAttributes<HTMLInputElement> & {
  directory?: string
  webkitdirectory?: string
}

export function AppFontImportAction() {
  const [strategy, setStrategy] = useState<ImportStrategy>('variable')
  const [localFiles, setLocalFiles] = useState<File[]>([])
  const [localPaths, setLocalPaths] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [googleFamilies, setGoogleFamilies] = useState<GoogleFamily[]>([])
  const [googleMode, setGoogleMode] = useState<GoogleMode>('variable')
  const [state, setState] = useState<ActionState>({ status: 'idle' })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  const folderInputProps: FolderInputProps = {
    type: 'file',
    multiple: true,
    directory: '',
    webkitdirectory: '',
    className: 'app-font-import__hidden-input',
    onChange: selectLocalFiles,
  }

  function selectLocalFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])]
    applyLocalFiles(files, files.map((file) => {
      const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath
      return relativePath || file.name
    }))
  }

  function applyLocalFiles(files: File[], paths = files.map((file) => file.name)) {
    setLocalFiles(files)
    setLocalPaths(paths)
    setState({ status: 'idle' })
  }

  function localImportBody(intent: 'inspect' | 'import') {
    const body = new FormData()
    body.set('intent', intent)
    body.set('strategy', strategy)
    body.set('paths', JSON.stringify(localPaths))
    localFiles.forEach((file) => body.append('files', file, file.name))
    return body
  }

  async function inspectLocal() {
    if (localFiles.length === 0) {
      setState({ status: 'error', message: 'Wähle zuerst Fontdateien, einen Ordner oder ein ZIP-Paket aus.' })
      return
    }
    setState({ status: 'working', message: 'Das lokale Fontpaket wird analysiert …' })
    try {
      const families = await inspectRequest(localImportBody('inspect'))
      setState({
        status: 'preview',
        message: `${families.length} ${families.length === 1 ? 'Fontfamilie wurde erkannt' : 'Fontfamilien wurden erkannt'}.`,
        families,
      })
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : 'Die Fontpaket-Prüfung ist fehlgeschlagen.' })
    }
  }

  async function importLocal() {
    if (localFiles.length === 0) {
      setState({ status: 'error', message: 'Wähle zuerst Fontdateien, einen Ordner oder ein ZIP-Paket aus.' })
      return
    }
    setState({ status: 'working', message: 'Das lokale Fontpaket wird analysiert und importiert …' })
    try {
      const families = await importRequest(localImportBody('import'))
      setState({ status: 'success', message: `${families.length} ${families.length === 1 ? 'Fontfamilie wurde' : 'Fontfamilien wurden'} importiert.`, families })
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : 'Der Fontimport ist fehlgeschlagen.' })
    }
  }

  async function searchGoogle() {
    setState({ status: 'working', message: 'Der Google-Fonts-Katalog wird geladen …' })
    try {
      const response = await fetch(`/api/app-fonts/google?q=${encodeURIComponent(query)}`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      })
      const body = await response.json() as { families?: GoogleFamily[]; error?: string }
      if (!response.ok) throw new Error(body.error || `Die Google-Fonts-Suche ist mit HTTP ${response.status} fehlgeschlagen.`)
      setGoogleFamilies(body.families ?? [])
      setState({ status: 'idle' })
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : 'Die Google-Fonts-Suche ist fehlgeschlagen.' })
    }
  }

  async function importGoogle(family: GoogleFamily) {
    setState({ status: 'working', message: `${family.family} wird aus Google Fonts importiert …` })
    try {
      const families = await importRequest(JSON.stringify({ family: family.family, mode: googleMode, intent: 'import' }), 'application/json')
      setState({ status: 'success', message: `${family.family} wurde importiert.`, families })
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : 'Der Google-Fonts-Import ist fehlgeschlagen.' })
    }
  }

  async function inspectGoogle(family: GoogleFamily) {
    setState({ status: 'working', message: `${family.family} wird aus Google Fonts geprüft …` })
    try {
      const families = await inspectRequest(JSON.stringify({ family: family.family, mode: googleMode, intent: 'inspect' }), 'application/json')
      setState({
        status: 'preview',
        message: `${family.family}: ${families.length} ${families.length === 1 ? 'Import-Vorschlag' : 'Import-Vorschläge'} erkannt.`,
        families,
      })
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : 'Die Google-Fonts-Prüfung ist fehlgeschlagen.' })
    }
  }

  return (
    <div className="app-font-import">
      <h3>App Fonts importieren</h3>
      <p>
        Jeder Import erzeugt geprüfte Assets und gruppiert sie zu Familien. Ein Import verändert die laufende
        Anwendung nicht. Weise bereite Familien unten Rollen zu und veröffentliche erst den fertigen Entwurf.
      </p>

      <div className="app-font-import__grid">
        <section className="app-font-import__card">
          <header className="app-font-import__card-header">
            <h4>Dateien, Ordner oder ZIP</h4>
            <p>Wähle einzelne TTF-/OTF-Dateien, einen vollständigen Ordner oder ein ZIP mit Fonts und Lizenztext.</p>
          </header>

          <SelectInput
            name="app-font-import-strategy"
            path="app-font-import-strategy"
            label="Auswahl der Schriftschnitte"
            value={strategy}
            isClearable={false}
            options={[
              { label: 'Variable Fonts bevorzugen', value: 'variable' },
              { label: 'Statische Schnitte bevorzugen', value: 'static' },
              { label: 'Variable und statische Schnitte zur manuellen Prüfung importieren', value: 'all' },
            ]}
            onChange={(option) => {
              const selected = Array.isArray(option) ? option[0]?.value : option?.value
              if (selected === 'variable' || selected === 'static' || selected === 'all') setStrategy(selected)
            }}
          />

          <Dropzone
            className="app-font-import__dropzone"
            disabled={state.status === 'working'}
            multipleFiles
            onChange={(files) => applyLocalFiles([...files])}
          >
            <div className="app-font-import__dropzone-content">
              <strong>Fontdateien hier ablegen</strong>
              <span>TTF, OTF, Lizenztexte oder ein ZIP-Paket</span>
              <div className="app-font-import__actions">
                <Button
                  buttonStyle="secondary"
                  disabled={state.status === 'working'}
                  margin={false}
                  onClick={() => fileInputRef.current?.click()}
                  size="small"
                >
                  Dateien oder ZIP auswählen
                </Button>
                <Button
                  buttonStyle="secondary"
                  disabled={state.status === 'working'}
                  margin={false}
                  onClick={() => folderInputRef.current?.click()}
                  size="small"
                >
                  Ordner auswählen
                </Button>
              </div>
              <input
                ref={fileInputRef}
                className="app-font-import__hidden-input"
                type="file"
                multiple
                accept=".ttf,.otf,.zip,.txt,font/ttf,font/otf,application/zip"
                onChange={selectLocalFiles}
              />
              <input {...folderInputProps} ref={folderInputRef} />
            </div>
          </Dropzone>

          <p className="app-font-import__selection">
            {localFiles.length > 0 ? `${localFiles.length} Datei(en) ausgewählt` : 'Noch kein lokales Paket ausgewählt.'}
          </p>
          <Button
            buttonStyle="secondary"
            className="app-font-import__primary-action"
            disabled={state.status === 'working' || localFiles.length === 0}
            margin={false}
            onClick={inspectLocal}
          >
            Ausgewähltes Paket prüfen
          </Button>
          <Button
            buttonStyle="primary"
            disabled={state.status === 'working' || localFiles.length === 0}
            margin={false}
            onClick={importLocal}
          >
            Ausgewähltes Paket importieren
          </Button>
        </section>

        <section className="app-font-import__card">
          <header className="app-font-import__card-header">
            <h4>Google Fonts</h4>
            <p>Durchsuche den offiziellen Katalog und importiere kontrollierte Fontbytes, Achsen und Lizenznachweise.</p>
            <p className="app-font-import__configuration-note">
              Erfordert einmalig den serverseitigen Schlüssel <code>APP_FONTS_GOOGLE_API_KEY</code>.
            </p>
          </header>

          <div className="app-font-import__search-row">
            <TextInput
              path="app-font-google-search"
              label="Schriftfamilie suchen"
              placeholder="Inter, Roboto, Noto Sans …"
              value={query}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
            />
            <Button
              buttonStyle="secondary"
              disabled={state.status === 'working' || query.trim().length === 0}
              margin={false}
              onClick={searchGoogle}
            >
              Suchen
            </Button>
          </div>

          <SelectInput
            name="app-font-google-mode"
            path="app-font-google-mode"
            label="Importmodus"
            value={googleMode}
            isClearable={false}
            options={[
              { label: 'Variable Font', value: 'variable' },
              { label: 'Statische Schnitte', value: 'static' },
            ]}
            onChange={(option) => {
              const selected = Array.isArray(option) ? option[0]?.value : option?.value
              if (selected === 'variable' || selected === 'static') setGoogleMode(selected)
            }}
          />

          <div className="app-font-import__results">
            {googleFamilies.map((family) => (
              <div className="app-font-import__result" key={family.family}>
                <strong>{family.family}</strong>
                <div className="app-font-import__result-meta">
                  {family.category} · {family.axes.length > 0
                    ? family.axes.map((axis) => `${axis.tag} ${axis.start}–${axis.end}`).join(', ')
                    : family.variants.join(', ')}
                </div>
                <Button
                  buttonStyle="secondary"
                  disabled={state.status === 'working' || (googleMode === 'variable' && family.axes.length === 0)}
                  margin={false}
                  onClick={() => inspectGoogle(family)}
                  size="small"
                >
                  Vorschau
                </Button>
                <Button
                  buttonStyle="secondary"
                  disabled={state.status === 'working' || (googleMode === 'variable' && family.axes.length === 0)}
                  margin={false}
                  onClick={() => importGoogle(family)}
                  size="small"
                >
                  {googleMode === 'variable' ? 'Variable Font importieren' : 'Statische Schnitte importieren'}
                </Button>
              </div>
            ))}
          </div>
        </section>

        <section className="app-font-import__card">
          <header className="app-font-import__card-header">
            <h4>Adobe Fonts</h4>
            <p>
              Adobe Fonts bleiben beim Provider gehostet. Lege eine Adobe-Familie mit Web-Project-ID, CSS-Familie,
              deklarierten Schnitten und Lizenzreferenz an. Danach kann sie Web- oder Admin-Vorschau-Rollen zugewiesen werden.
            </p>
          </header>
          <Button
            buttonStyle="secondary"
            className="app-font-import__primary-action"
            el="link"
            margin={false}
            to="/admin/collections/app-font-families/create"
          >
            Adobe-Familie anlegen
          </Button>
        </section>
      </div>

      {state.status === 'working' ? <Banner className="app-font-import__status" type="info">{state.message}</Banner> : null}
      {state.status === 'error' ? <Banner className="app-font-import__status" type="error">{state.message}</Banner> : null}
      {state.status === 'preview' ? (
        <Banner className="app-font-import__status" type="info">
          <p>{state.message}</p>
          <ImportFamilySummaryList families={state.families} mode="preview" />
        </Banner>
      ) : null}
      {state.status === 'success' ? (
        <Banner className="app-font-import__status" type="success">
          <p>{state.message}</p>
          <ImportFamilySummaryList families={state.families} mode="imported" />
        </Banner>
      ) : null}
    </div>
  )
}

function ImportFamilySummaryList({ families, mode }: {
  families: Array<(PreviewFamily | ImportedFamily)>
  mode: 'preview' | 'imported'
}) {
  return (
    <ul>
      {families.map((family) => (
        <li key={mode === 'imported' && 'familyId' in family ? family.familyId : family.displayName}>
          {mode === 'imported' && 'familyId' in family ? (
            <a href={`/admin/collections/app-font-families/${family.familyId}`}>{family.displayName}</a>
          ) : family.displayName}
          {' '}({family.status === 'ready' ? 'bereit' : 'Entwurf'}, {family.faces.length} Schnitt(e), Default: {family.defaultFaceLabel})
          <br />
          Lizenz: {family.licenseReference}
          {family.warnings.length > 0 ? <><br />Hinweis: {family.warnings.join(' ')}</> : null}
          <ul>
            {family.faces.slice(0, 8).map((face) => (
              <li key={`${face.relativePath}-${face.label}`}>
                {face.label}: Weight {face.weight}, {face.style}, Stretch {face.stretch}{face.variable ? ', Variable Font' : ''}
              </li>
            ))}
            {family.faces.length > 8 ? <li>{family.faces.length - 8} weitere Schnitt(e)</li> : null}
          </ul>
        </li>
      ))}
    </ul>
  )
}

async function importRequest(body: BodyInit, contentType?: string): Promise<ImportedFamily[]> {
  return appFontImportRequest<ImportedFamily>(body, contentType)
}

async function inspectRequest(body: BodyInit, contentType?: string): Promise<PreviewFamily[]> {
  return appFontImportRequest<PreviewFamily>(body, contentType)
}

async function appFontImportRequest<TFamily>(body: BodyInit, contentType?: string): Promise<TFamily[]> {
  const response = await fetch('/api/app-fonts/import', {
    method: 'POST',
    body,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(contentType ? { 'Content-Type': contentType } : {}),
    },
  })
  const result = await response.json().catch(() => null) as { families?: TFamily[]; error?: string } | null
  if (!response.ok) throw new Error(result?.error || `Der Fontimport ist mit HTTP ${response.status} fehlgeschlagen.`)
  return result?.families ?? []
}
