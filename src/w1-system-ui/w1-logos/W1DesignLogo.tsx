'use client'

// W1_DesignLogo.tsx - Clean W1 Design logo component

import React from 'react';
import W1DesignSvg from './assets/W1Design.svg';
interface W1DesignLogoProps {
    width?: number;
}

const W1DesignLogo: React.FC<W1DesignLogoProps> = ({ width = 155 }) => {
    const SvgComponent =
        typeof W1DesignSvg === 'function'
            ? (W1DesignSvg as unknown as React.ComponentType<React.SVGProps<SVGSVGElement>>)
            : null;

    const svgSrc =
        typeof W1DesignSvg === 'string'
            ? W1DesignSvg
            : W1DesignSvg &&
                  typeof W1DesignSvg === 'object' &&
                  'src' in W1DesignSvg &&
                  typeof (W1DesignSvg as { src?: unknown }).src === 'string'
                ? (W1DesignSvg as { src: string }).src
                : null;

    if (SvgComponent) {
        return (
            <SvgComponent
                style={{ width: `${width}px`, height: 'auto' }}
                className="w1-design-logo"
            />
        );
    }

    if (!svgSrc) return null;

    return (
        <img
            src={svgSrc}
            alt="W1 Design Logo"
            style={{ width: `${width}px`, height: 'auto' }}
            className="w1-design-logo"
        />
    )
};

export default W1DesignLogo;
