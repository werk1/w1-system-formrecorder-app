'use client'

import { useState } from 'react'
import { DEFAULT_CURL_TUNING, type W1FlipbookCurlTuning } from '@werk1/w1-system-flipbook'
import { devCurlTuning, loadDevCurlTuning, resetDevCurlTuning, saveDevCurlTuning } from './devCurlTuning'
import styles from './DevTools.module.css'

type NumericKey = Exclude<keyof W1FlipbookCurlTuning, 'ease'>

const FIELDS: Array<{ key: NumericKey; label: string; hint: string; min: number; max: number; step: number }> = [
  { key: 'curlMaxDeg', label: 'Einrollen der Kante', hint: '°', min: 0, max: 140, step: 1 },
  // γ ≤ 1 gives an unbounded curl slope at the spine; the model needs γ > 1.
  { key: 'gamma', label: 'Lage der Wölbung', hint: 'γ · höher = nur die Kante rollt', min: 1.1, max: 4, step: 0.05 },
  { key: 'tiltMaxRad', label: 'Diagonale beim Ziehen', hint: 'rad', min: 0, max: 1, step: 0.01 },
  { key: 'autoTiltRad', label: 'Diagonale bei Tipp / Pfeil', hint: 'rad', min: 0, max: 0.6, step: 0.01 },
  { key: 'tiltSmoothing', label: 'Diagonale folgt dem Finger', hint: '0–1 · kleiner = träger', min: 0.02, max: 1, step: 0.01 },
  { key: 'baseDuration', label: 'Dauer des Umblätterns', hint: 's', min: 0.2, max: 2, step: 0.05 },
  { key: 'shadeScale', label: 'Schatten auf dem Blatt', hint: '×', min: 0, max: 2, step: 0.05 },
  { key: 'glossScale', label: 'Glanz', hint: '×', min: 0, max: 2, step: 0.05 },
  { key: 'thicknessScale', label: 'Papierkante', hint: '×', min: 0, max: 3, step: 0.05 },
]

const EASES = ['power1.inOut', 'power2.inOut', 'power3.inOut', 'power4.inOut', 'sine.inOut', 'circ.inOut', 'expo.inOut', 'none']

/**
 * Live tuning of the WebGL page turn (dev tools, tab "Shader"). Changes apply
 * on the next frame of a turn; "Werte kopieren" puts the values on the
 * clipboard to bake them in as package defaults.
 */
export function CurlTuningPanel() {
  // Stored values load on the client's first render; the dev panel opens on
  // demand, so server and client markup stay identical.
  const [values, setValues] = useState<W1FlipbookCurlTuning>(() => {
    if (typeof window !== 'undefined') loadDevCurlTuning()
    return { ...devCurlTuning }
  })
  const [copied, setCopied] = useState(false)

  const set = <K extends keyof W1FlipbookCurlTuning>(key: K, value: W1FlipbookCurlTuning[K]) => {
    devCurlTuning[key] = value
    saveDevCurlTuning()
    setValues({ ...devCurlTuning })
    setCopied(false)
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(devCurlTuning, null, 2))
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <>
      <p className={styles.note}>Wirkt live beim nächsten Umblättern. Nur die WebGL-Engine.</p>
      {FIELDS.map((field) => (
        <label key={field.key} className={styles.field}>
          <span className={styles.row}>
            <span>{field.label}</span>
            <span className={styles.value}>
              {values[field.key]}
              {values[field.key] !== DEFAULT_CURL_TUNING[field.key] ? ' •' : ''}
            </span>
          </span>
          <input
            type="range"
            min={field.min}
            max={field.max}
            step={field.step}
            value={values[field.key]}
            onChange={(e) => set(field.key, Number(e.currentTarget.value))}
          />
          <span className={styles.hint}>
            {field.hint} · Standard {DEFAULT_CURL_TUNING[field.key]}
          </span>
        </label>
      ))}
      <label className={styles.field}>
        <span className={styles.row}>
          <span>Easing</span>
        </span>
        <select value={values.ease} onChange={(e) => set('ease', e.currentTarget.value)}>
          {EASES.map((ease) => (
            <option key={ease} value={ease}>
              {ease}
            </option>
          ))}
        </select>
        <span className={styles.hint}>Standard {DEFAULT_CURL_TUNING.ease}</span>
      </label>
      <div className={styles.actions}>
        <button
          type="button"
          onClick={() => {
            resetDevCurlTuning()
            setValues({ ...devCurlTuning })
            setCopied(false)
          }}
        >
          Zurücksetzen
        </button>
        <button type="button" onClick={copy}>
          {copied ? 'Kopiert' : 'Werte kopieren'}
        </button>
      </div>
    </>
  )
}
