/**
 * DesktopNav Component
 *
 * This component renders the navigation bar for desktop and mobile views.
 * It handles the display of navigation items, submenus, and a popup menu for smaller screens.
 *
 * @component
 * @param {Object} props - The component props
 * @param {React.ReactNode} props.children - Child components to be rendered inside the navigation
 * @param {boolean} props.singleSubmenuMode - If true, only one submenu can be open at a time
 * @param {boolean} props.closeAllSubmenus - If true, all submenus will be closed
 */

'use client';
import styles from '@/styles/modules/navigation/DesktopNav.module.css';
import stylesPopup from '@/styles/modules/navigation/DesktopPopup.module.css';
import MenuIcon from '@mui/icons-material/Menu';
import React from 'react';
// import { StyleAgent, StyleAgentType } from "./StyleAgent";
import { useBoundStore } from '@/stores/boundStore';
import { animated, useSpring } from '@react-spring/web';
import { useSubnavigationManager } from './hooks/useSubnavigationManager';
import { useSiteNavigation } from './hooks/useSiteNavigation';
import NavLink from './NavLink';
import { StyleAgent } from './StyleAgent';

type DesktopNavProps = {
	children?: React.ReactNode;
	singleSubmenuMode: boolean;
	closeAllSubmenus: boolean;
};

// const styleAgent: StyleAgentType = StyleAgent("_deviceD", styles);
// const styleAgentPopup: StyleAgentType = StyleAgent("_deviceDS", stylesPopup);
const AnimatedDiv = animated('div');

const DesktopNav = ({ children, singleSubmenuMode, closeAllSubmenus }: DesktopNavProps) => {
	const { deviceWidth } = useBoundStore((state) => state.device);
	const { ui, setMenuOpen } = useBoundStore();
	const navItems = useSiteNavigation();

	const styleAgent = StyleAgent('_deviceD', styles);
	const styleAgentPopup = StyleAgent('_deviceDS', stylesPopup);
	const { POPUP_HEIGHT_deviceDS } = ui.constants;

	const { progress } = useSpring({
		progress: ui.isMenuOpen ? 1 : 0,
		config: {
			mass: 1,
			tension: 299,
			friction: 44,
			damping: 44,
			clamp: false,
			precision: 0.01
		}
	});

	const { openSubnav, handleSubnavs } = useSubnavigationManager({
		singleSubmenuMode,
		closeAllSubmenus,
		isPopupOpen: ui.isMenuOpen
	});

	// Render mobile view for screens <= 800px wide
	if (deviceWidth <= 800) {
		return (
			<div className={styles.navBase}>
				<button
					title="Menu"
					type="button"
					onClick={() => setMenuOpen(!ui.isMenuOpen)}
					className={styles.navMenuIcon}
				>
					<MenuIcon />
				</button>
				{/**
                 * Visual Effect
                 * This creates a smooth animation where the popup:
                 * Starts 10% above its final position (when closed)
                 * Slides down to its natural position (as it opens)
                 * You could change the -10 to a different value to adjust the intensity of this effect:
                 * Larger value (e.g., -20): More dramatic slide-down
                 * Smaller value (e.g., -5): More subtle slide-down
                 */}
				<AnimatedDiv
					className={stylesPopup.popupBase}
					style={{
						// Animate multiple properties based on progress
						height: progress.to((p) => p * POPUP_HEIGHT_deviceDS),
						opacity: progress.to([ 0, 0.5, 1 ], [ 0, 0.3, 1 ]),
						transform: progress.to((p) => `translateY(${(1 - p) * -10}%)`),
						pointerEvents: progress.to((p) => (p === 0 ? 'none' : 'auto')),
						overflow: 'hidden'
					}}
				>
					<div className={stylesPopup.popupContentContainer}>
						<ul>
							{navItems.map((item, index) => (
								<NavLink
									key={item.to}
									{...item}
									styleAgent={styleAgentPopup}
									isSubnavOpen={openSubnav.has(index)}
									setIsSubnavOpen={() => handleSubnavs(index)}
								/>
							))}
						</ul>
					</div>
				</AnimatedDiv>
			</div>
		);
	}

	// Render desktop view for screens > 800px wide
	return (
		<div className={styles.navBase}>
			<ul className={styles.navLinkContainer}>
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
	);
};

export default DesktopNav;
