import React from 'react';
import styles from '../styles/RichTextRenderer.module.css';
import { SerializedLexicalNode } from '../types/richTextTypes';

/**
 * CSS class names used by RichTextNode for rendering elements
 * Export for use in PayloadTextContentLoader's automatic device-specific mapping
 */
export const RICHTEXT_ELEMENT_CLASSES = [
  // Block elements
  'paragraph', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'quote', 'link', 'invalidLink',
  // Inline formatting
  'bold', 'italic', 'underline', 'strikethrough',
] as const;

interface RichTextNodeProps {
  node: SerializedLexicalNode;
  externalCSSModule?: typeof styles;
}

export const RichTextNode: React.FC<RichTextNodeProps> = ({ node, externalCSSModule }) => {
  // Use W1Block pattern: Complete CSS module replacement
  const activeStyles = externalCSSModule || styles;
  if (!node || typeof node !== 'object') {
    console.warn('Invalid node received:', node);
    return null;
  }

  if (node.type === 'linebreak') {
    return <br className={activeStyles.lineBreak} />;
  }

  if (node.text !== undefined) {
    const renderTextWithLineBreaks = (text: string): React.ReactNode => {
      if (!text.includes('\n')) return text;
      const parts = text.split('\n');
      return (
        <>
          {parts.map((part, i) => (
            <React.Fragment key={i}>
              {i > 0 ? <br className={activeStyles.lineBreak} /> : null}
              {part}
            </React.Fragment>
          ))}
        </>
      );
    };

    let element: React.ReactNode = renderTextWithLineBreaks(node.text);
    switch (node.format) {
      case 1:
        element = <strong className={activeStyles.bold}>{element}</strong>;
        break;
      case 2:
        element = <em className={activeStyles.italic}>{element}</em>;
        break;
      case 3:
        element = <u className={activeStyles.underline}>{element}</u>;
        break;
      case 4:
        element = <s className={activeStyles.strikethrough}>{element}</s>;
        break;
      case 5:
        element = <strong className={activeStyles.bold}><em className={activeStyles.italic}>{element}</em></strong>;
        break;
    }
    return <>{element}</>;
  }

  if (!node.type) {
    console.warn('Node type is missing:', node);
    return null;
  }

  const children = node.children?.map((child, i) => (
    <RichTextNode key={i} node={child} externalCSSModule={externalCSSModule} />
  ));

  switch (node.type) {
    case 'paragraph': {
      const isBalance = node.$?.['textWrapBalance'] === true
      return (
        <p
          className={activeStyles.paragraph}
          style={isBalance ? { textWrap: 'balance' } as React.CSSProperties : undefined}
        >
          {children}
        </p>
      )
    }
    case 'heading':
      const headingTag = node.tag || 'h1';
      switch (headingTag) {
        case 'h1': return <h1 className={activeStyles.h1}>{children}</h1>;
        case 'h2': return <h2 className={activeStyles.h2}>{children}</h2>;
        case 'h3': return <h3 className={activeStyles.h3}>{children}</h3>;
        case 'h4': return <h4 className={activeStyles.h4}>{children}</h4>;
        case 'h5': return <h5 className={activeStyles.h5}>{children}</h5>;
        case 'h6': return <h6 className={activeStyles.h6}>{children}</h6>;
        default: return <h1 className={activeStyles.h1}>{children}</h1>;
      }
    case 'quote':
      return <blockquote className={activeStyles.quote}>{children}</blockquote>;
    case 'link':
      return node.url ? (
        <a
          href={node.url}
          className={activeStyles.link}
          target={node.target || (node.openInNewTab ? "_blank" : undefined)}
          rel={node.rel || (node.openInNewTab ? "noopener noreferrer" : undefined)}
        >
          {children}
        </a>
      ) : (
        <span className={activeStyles.invalidLink}>{children}</span>
      );
    case 'autolink':
      if (node.fields && node.fields.url) {
        return (
          <a
            href={node.fields.url}
            className={activeStyles.link}
            target={node.fields.newTab ? "_blank" : undefined}
            rel={node.fields.newTab ? "noopener noreferrer" : undefined}
          >
            {children}
          </a>
        );
      } else if (node.url) {
        return (
          <a href={node.url} className={activeStyles.link} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        );
      } else {
        return <span className={activeStyles.invalidLink}>{children}</span>;
      }
    case 'linebreak':
      return <br className={activeStyles.lineBreak} />;
    default:
      console.warn(`Unknown node type: ${node.type}`);
      return <>{children}</>;
  }
};


