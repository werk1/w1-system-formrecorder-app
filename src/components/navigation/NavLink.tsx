'use client';
import React from "react";
import Link from 'next/link';
import { useTransition, animated } from "@react-spring/web";
import { usePathname } from 'next/navigation';
import { NavLinkProps } from "./types/types";
import { useBoundStore } from '@/stores/boundStore'; // Add this import


const NavLink = ({
    to,
    label,
    openInNewTab,
    submenu,
    styleAgent,
    isSubnavOpen,
    setIsSubnavOpen,
}: NavLinkProps) => {
    const pathname = usePathname();
    const isActive = pathname === to;
    const AnimatedUl = animated('ul');
    const { setMenuOpen } = useBoundStore();

    const handleClick = (e: React.MouseEvent) => {
        if (submenu) {
            e.preventDefault();
            setIsSubnavOpen(!isSubnavOpen);
        } else {
            setMenuOpen(false);
        }
    };

    const springTransition = useTransition(isSubnavOpen, {
        from: {
            opacity: 0,
            transform: "translateY(-10px)",
            scale: 0.85,
            maxHeight: 0,
        },
        enter: {
            opacity: 1,
            transform: "translateY(0)",
            scale: 1,
            maxHeight: 100,
        },
        leave: {
            opacity: 0,
            transform: "translateY(-10px)",
            scale: 0.6,
            maxHeight: 0,
        },
    });

    return (
        <li>
            {submenu ? (
                <>
                    <div
                        onClick={handleClick}
                        className={`${styleAgent.navlink_main_subitem} ${isActive ? styleAgent.navlink_main_item_active : ''}`}
                    >
                        {label}
                        <span className={styleAgent.navlink_main_subicon}>
                            {isSubnavOpen ? "▲" : "▼"}
                        </span>
                    </div>
                    {springTransition((style, item) =>
                        item ? (
                            <AnimatedUl
                                className={styleAgent.navlink_animated_subcontainer}
                                style={style}
                            >
                                {submenu.map((item) => {
                                    const isSubItemActive = pathname === item.to;
                                    return (
                                        <Link
                                            key={item.to}
                                            href={item.to}
                                            target={item.openInNewTab ? '_blank' : undefined}
                                            rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
                                            className={`${styleAgent.navlink_sub_item} ${
                                                isSubItemActive ? styleAgent.navlink_sub_item_active : ''
                                            }`}
                                            onClick={() => setMenuOpen(false)} // Add this

                                        >
                                            {item.label}
                                        </Link>
                                    );
                                })}
                            </AnimatedUl>
                        ) : null
                    )}
                </>
            ) : (
                <Link 
                    href={to}
                    target={openInNewTab ? '_blank' : undefined}
                    rel={openInNewTab ? 'noopener noreferrer' : undefined}
                    className={`${styleAgent.navlink_main_item} ${
                        isActive ? styleAgent.navlink_main_item_active : ''
                    }`}
                    onClick={() => setMenuOpen(false)} // Add this
                >
                    {label}
                </Link>
            )}
        </li>
    );
};

export default NavLink;
