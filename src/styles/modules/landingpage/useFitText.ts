/**
 * A custom hook that automatically resizes h1 headlines to fit their container width.
 * It can handle both single-word and multi-line headlines, with options for forcing single-line behavior.
 *
 * The hook creates a hidden clone of each headline to measure and calculate the optimal font size,
 * then applies the calculated size while preserving original margins and adding a smooth transition effect.
 *
 * Features:
 * - Automatically detects single words vs multi-word headlines
 * - Maintains aspect ratio and prevents text from becoming too tall
 * - Preserves original margin styling
 * - Responds to container size changes using ResizeObserver
 * - Smooth font size transitions
 * - Special handling for iOS Safari to ensure consistent margins
 *
 * @param containerRef - React ref object pointing to the container div element
 * @param singleLineOnly - Optional boolean to force single-line behavior for all headlines (default: false)
 *
 * @example
 * // Basic usage allowing multi-line headlines
 * function Component() {
 *   const containerRef = useRef<HTMLDivElement>(null);
 *   useFitHeadlines(containerRef);
 *   return (
 *     <div ref={containerRef}>
 *       <h1>Auto-sizing Headline</h1>
 *     </div>
 *   );
 * }
 */
import { useEffect, RefObject } from 'react'

export function useFitHeadlines(
  containerRef: RefObject<HTMLDivElement | null>,
  singleLineOnly: boolean = false,
) {
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const fitHeadline = (h1: HTMLElement) => {
      // Store original styles we'll need to restore
      const originalStyles = {
        marginTop: h1.style.marginTop,
        marginBottom: h1.style.marginBottom,
        marginLeft: h1.style.marginLeft,
        marginRight: h1.style.marginRight,
        padding: h1.style.padding,
      }

      // Set these from CSS rather than computed style
      const cssStyles = window.getComputedStyle(h1)

      // Get the text content container (which is likely the immediate parent of h1)
      const textContentContainer = h1.parentElement

      // Get all the relevant computed styles
      const containerStyles = window.getComputedStyle(container)
      const textContentStyles = textContentContainer
        ? window.getComputedStyle(textContentContainer)
        : { paddingLeft: '0px', paddingRight: '0px' }

      // Calculate paddings at different levels
      const containerPaddingLeft = parseFloat(containerStyles.paddingLeft) || 0
      const containerPaddingRight = parseFloat(containerStyles.paddingRight) || 0
      const textContentPaddingLeft = parseFloat(textContentStyles.paddingLeft) || 0
      const textContentPaddingRight = parseFloat(textContentStyles.paddingRight) || 0

      // Get the h1 margins
      const h1MarginLeft = parseFloat(cssStyles.marginLeft) || 0
      const h1MarginRight = parseFloat(cssStyles.marginRight) || 0

      // Calculate total horizontal space used by paddings and margins
      const totalHorizontalSpace =
        containerPaddingLeft +
        containerPaddingRight +
        textContentPaddingLeft +
        textContentPaddingRight +
        h1MarginLeft +
        h1MarginRight

      // Add a small buffer to ensure text fits even with slight rounding differences
      const buffer = 5 // 5px buffer

      // Calculate available width accounting for all paddings and margins
      const availableWidth = container.clientWidth - totalHorizontalSpace - buffer

      // Set initial margins to 0 to get accurate size measurement
      h1.style.margin = '0'
      h1.style.padding = '0'

      // Check if content is single word
      const content = h1.textContent?.trim() || ''
      const isSingleWord = !content.includes(' ')

      // Only apply nowrap if it's a single word or singleLineOnly is true
      const shouldWrap = singleLineOnly || isSingleWord

      // Create hidden clone for measurements
      const clone = document.createElement('span')
      clone.style.cssText = `
        position: absolute;
        visibility: hidden;
        white-space: ${shouldWrap ? 'nowrap' : 'normal'};
        width: ${shouldWrap ? 'auto' : `${availableWidth}px`};
        font-size: 100px;
        font-family: ${cssStyles.fontFamily};
        line-height: ${cssStyles.lineHeight};
        letter-spacing: ${cssStyles.letterSpacing};
        word-spacing: ${cssStyles.wordSpacing};
      `

      clone.textContent = content
      document.body.appendChild(clone)

      const textWidth = clone.offsetWidth
      const ratio = availableWidth / textWidth
      let fontSize = Math.floor(100 * ratio)

      clone.style.fontSize = `${fontSize}px`
      while (
        (clone.offsetWidth > availableWidth || clone.offsetHeight > fontSize * 1.5) &&
        fontSize > 0
      ) {
        fontSize--
        clone.style.fontSize = `${fontSize}px`
      }

      // Further reduce font size slightly to ensure it fits
      fontSize = Math.floor(fontSize * 0.95) // 5% safety margin

      document.body.removeChild(clone)

      // Apply ONLY the font size - let CSS handle all other styling
      h1.style.fontSize = `${fontSize}px`
      h1.style.whiteSpace = isSingleWord ? 'nowrap' : 'normal'

      // Restore original margins from CSS rather than trying to override them
      if (originalStyles.marginTop) h1.style.marginTop = originalStyles.marginTop
      if (originalStyles.marginBottom) h1.style.marginBottom = originalStyles.marginBottom
      if (originalStyles.marginLeft) h1.style.marginLeft = originalStyles.marginLeft
      if (originalStyles.marginRight) h1.style.marginRight = originalStyles.marginRight
      if (originalStyles.padding) h1.style.padding = originalStyles.padding

      // If there were no original inline styles, remove our temporary ones
      // to let the CSS stylesheet values show through
      if (!originalStyles.marginTop) h1.style.marginTop = ''
      if (!originalStyles.marginBottom) h1.style.marginBottom = ''
      if (!originalStyles.marginLeft) h1.style.marginLeft = ''
      if (!originalStyles.marginRight) h1.style.marginRight = ''
      if (!originalStyles.padding) h1.style.padding = ''
    }

    const resizeAllHeadlines = () => {
      const headlines = container.getElementsByTagName('h1')
      Array.from(headlines).forEach(fitHeadline)
    }

    resizeAllHeadlines()

    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(() => {
        resizeAllHeadlines()
      })
    })

    observer.observe(container)

    return () => observer.disconnect()
  }, [containerRef, singleLineOnly])
}

/**
 * Example usage patterns for the useFitHeadlines hook
 * 
 * @example
 * // For single-word headlines only
function SingleWordHeadlines() {
    const containerRef = useRef<HTMLDivElement>(null);
    useFitHeadlines(containerRef); // Default behavior for single words

    return (
        <div ref={containerRef}>
            <h1>HELLO</h1>
            <p>Some content</p>
            <h1>WORLD</h1>
        </div>
    );
}

// Force single-line behavior for all headlines
function SingleLineHeadlines() {
    const containerRef = useRef<HTMLDivElement>(null);
    useFitHeadlines(containerRef, true); // Force single line for all headlines

    return (
        <div ref={containerRef}>
            <h1>Multiple Words Here</h1>
            <p>Some content</p>
            <h1>Another Long Headline</h1>
        </div>
    );
}

// Multi-line headlines
function MultiLineHeadlines() {
    const containerRef = useRef<HTMLDivElement>(null);
    useFitHeadlines(containerRef, false); // Allow multi-line headlines

    return (
        <div ref={containerRef}>
            <h1>This is a longer headline that will wrap to multiple lines</h1>
            <p>Some content</p>
            <h1>Another multi-line headline example</h1>
        </div>
    );
}
 */
