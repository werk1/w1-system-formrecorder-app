/**
 * Get CSS variable value as string
 */
export const getCSSVariableString = (variableName: string): string => {
  if (typeof window !== 'undefined') {
    return getComputedStyle(document.documentElement).getPropertyValue(variableName).trim()
  }
  return '0'
}

/**
 * Get CSS variable value as number
 */
export const getCSSVariableNumber = (variableName: string): number => {
  const value = getCSSVariableString(variableName)
  return parseFloat(value) || 0
}
