// W1_Icon.tsx - Simple W1 icon component like WERK1Logo
import React from 'react';
import W1IconSvg from './assets/W1Icon.svg';

interface W1IconProps {
    width?: number;
}

const W1_Icon: React.FC<W1IconProps> = ({ width = 26 }) => {
    const SvgComponent =
        typeof W1IconSvg === 'function'
            ? (W1IconSvg as unknown as React.ComponentType<React.SVGProps<SVGSVGElement>>)
            : null;

    const svgSrc =
        typeof W1IconSvg === 'string'
            ? W1IconSvg
            : W1IconSvg &&
                  typeof W1IconSvg === 'object' &&
                  'src' in W1IconSvg &&
                  typeof (W1IconSvg as { src?: unknown }).src === 'string'
                ? (W1IconSvg as { src: string }).src
                : null;

    if (SvgComponent) {
        return (
            <SvgComponent
                style={{ width: `${width}px`, height: 'auto' }}
                className="w1-icon-logo"
            />
        );
    }

    if (!svgSrc) return null;

    return (
        <img
            src={svgSrc}
            alt="W1 Icon"
            style={{ width: `${width}px`, height: 'auto' }}
            className="w1-icon-logo"
        />
    )
};

export default W1_Icon;
