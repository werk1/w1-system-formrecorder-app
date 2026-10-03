/**
 * @fileoverview RichTextRenderer Component
 */

import React, { Component, ErrorInfo } from 'react';
import { RichTextNode } from './nodes/RichTextNode';
import styles from './styles/RichTextRenderer.module.css';
import {
  RichTextContent,
  isArrayContent,
  isStyledContent,
  isStyledSection,
} from './types/richTextTypes';

/**
 * CSS class names used by RichTextRenderer for container elements
 * Export for use in PayloadTextContentLoader's automatic device-specific mapping
 */
export const RICHTEXT_CONTAINER_CLASSES = [
  'richTextContainer',
  'richTextDefaultStyle',
] as const;

interface RichTextRendererProps {
  content: RichTextContent;
  singleCSSContainerClass?: string;
  externalCSSModule?: typeof styles;
  onError?: (error: Error) => void;
}

class RichTextErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('RichTextRenderer error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

const RichTextRendererInner: React.FC<RichTextRendererProps> = ({
  content,
  singleCSSContainerClass,
  externalCSSModule,
  onError,
}) => {
  // Use W1Block pattern: Complete CSS module replacement if externalCSSModule is provided
  const activeStyles = externalCSSModule || styles;

  try {
    if (!content) return null;
    if (!Array.isArray(content)) return null;
    if (content.length === 0) return null;

    return (
      <div className={`${activeStyles.richTextContainer} ${singleCSSContainerClass || ''}`}>
        {isStyledContent(content) ? (
          content.map((item, index) => (
            <div
              key={index}
              className={activeStyles[item.style] || activeStyles.richTextDefaultStyle}
            >
              {item.content.map((node, nodeIndex) => (
                <RichTextNode key={nodeIndex} node={node} externalCSSModule={externalCSSModule} />
              ))}
            </div>
          ))
        ) : isArrayContent(content) ? (
          content.map((section, index) => (
            <div
              key={index}
              className={isStyledSection(section)
                ? (activeStyles[section.style] || activeStyles.richTextDefaultStyle)
                : activeStyles.richTextDefaultStyle
              }
            >
              {isStyledSection(section) ? (
                section.content.map((node, nodeIndex) => (
                  <RichTextNode key={nodeIndex} node={node} externalCSSModule={externalCSSModule} />
                ))
              ) : (
                section.map((node, nodeIndex) => (
                  <RichTextNode key={nodeIndex} node={node} externalCSSModule={externalCSSModule} />
                ))
              )}
            </div>
          ))
        ) : (
          <div className={singleCSSContainerClass || activeStyles.richTextDefaultStyle}>
            {content.map((node, index) => (
              <RichTextNode key={index} node={node} externalCSSModule={externalCSSModule} />
            ))}
          </div>
        )}
      </div>
    );
  } catch (error) {
    if (error instanceof Error) {
      console.error('RichTextRenderer error:', error);
      onError?.(error);
    }
    return null;
  }
};

export const RichTextRenderer: React.FC<RichTextRendererProps> = (props) => (
  <RichTextErrorBoundary>
    <RichTextRendererInner {...props} />
  </RichTextErrorBoundary>
);


