import styles from './W1SystemMark.module.css'

/**
 * Small W1System wordmark for the end of the status bar. The public SVG is
 * used as a mask, so the mark takes the text colour of the active scheme:
 * dark on light, light on dark.
 */
export function W1SystemMark() {
  return <span className={styles.mark} role="img" aria-label="W1 System" />
}
