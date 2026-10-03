/**
 * _devicePPNav Component
 *
 * This component renders the navigation bar for phones in portrait mode.
 * It handles the display of a menu button and a popup menu with navigation items and submenus.
 *
 * @component
 * @param {Object} props - The component props
 * @param {React.ReactNode} props.children - Child components to be rendered inside the navigation (unused in this component)
 * @param {boolean} props.singleSubmenuMode - If true, only one submenu can be open at a time
 * @param {boolean} props.closeAllSubmenus - If true, all submenus will be closed
 */

'use client';
import styles from '@/styles/modules/navigation/PhonePortraitNav.module.css';
import React from 'react';
import { useTransition, animated, config } from '@react-spring/web';
import MenuIcon from '@mui/icons-material/Menu';
import NavLink from './NavLink';
import { StyleAgentType, StyleAgent } from './StyleAgent';
import { useSiteNavigation } from './hooks/useSiteNavigation';
import { useSubnavigationManager } from './hooks/useSubnavigationManager';
import { useBoundStore } from '@/stores/boundStore';

const styleAgent: StyleAgentType = StyleAgent('_devicePP', styles);

type _devicePPNavProps = {
	children?: React.ReactNode;
	singleSubmenuMode: boolean;
	closeAllSubmenus: boolean;
};

const PhonePortraitNav = ({ children, singleSubmenuMode, closeAllSubmenus }: _devicePPNavProps) => {
	const { ui, setMenuOpen } = useBoundStore();
	const navItems = useSiteNavigation();
	const AnimatedDiv = animated('div');

	const { openSubnav, handleSubnavs } = useSubnavigationManager({
		singleSubmenuMode,
		closeAllSubmenus,
		isPopupOpen: ui.isMenuOpen // Always false for desktop navigation
	});

	const springTransition = useTransition(ui.isMenuOpen, {
		from: { maxHeight: 0 },
		enter: { maxHeight: 225 },
		leave: { maxHeight: 0 },
		config: { ...config.stiff, clamp: false }
	});

	return (
		<nav className={styles.navBase}>
			<button
				title="Menu"
				type="button"
				onClick={() => setMenuOpen(!ui.isMenuOpen)}
				className={styles.navMenuIcon}
			>
				<MenuIcon />
			</button>
			{springTransition(
				(style, item) =>
					item ? (
						<AnimatedDiv className={styles.popupBase} style={style}>
							<div className={styles.popupContentContainer}>
								<ul>
									{navItems.map((item, index) => (
										<NavLink
											key={item.to}
											{...item}
											styleAgent={styleAgent}
											isSubnavOpen={openSubnav.has(index)}
											setIsSubnavOpen={() => handleSubnavs(index)}
										/>
									))}
								</ul>
							</div>
						</AnimatedDiv>
					) : null
			)}
			{children}
		</nav>
	);
};

export default PhonePortraitNav;
