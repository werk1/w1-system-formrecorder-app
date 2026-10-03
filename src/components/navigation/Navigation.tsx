'use client';
import { memo, useEffect, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import DesktopNav from './DesktopNav';
import PhonePortraitNav from './PhonePortraitNav';
import PhoneLandscapeNav from './PhoneLandscapeNav';
import { useBoundStore } from '@/stores/boundStore';

const Navigation = memo(() => {
	const { is_devicePP, is_devicePL } = useBoundStore((state) => state.device);
	const pathname = usePathname();
	const { setMenuOpen } = useBoundStore();

	useEffect(
		() => {
			setMenuOpen(false);
		},
		[ pathname, setMenuOpen ]
	);

	// Memoize the navigation component to prevent re-renders
	const NavigationComponent = useMemo(
		() => {
			if (is_devicePP) {
				return <PhonePortraitNav singleSubmenuMode={true} closeAllSubmenus={true} />;
			} else if (is_devicePL) {
				return <PhoneLandscapeNav singleSubmenuMode={true} closeAllSubmenus={true} />;
			}
			return <DesktopNav singleSubmenuMode={true} closeAllSubmenus={true} />;
		},
		[ is_devicePP, is_devicePL ]
	);

	return NavigationComponent;
});

Navigation.displayName = 'Navigation';

export default Navigation;
