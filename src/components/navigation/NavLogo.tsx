import { useDeviceSpecificLayoutClasses } from '@/styles/hooks/device-specific-layout-classes/useDeviceSpecificLayoutClasses';

const NavLogo = () => {
	const { logoClass } = useDeviceSpecificLayoutClasses();
	// Header Height from CSS variables

	return (
		<div className={logoClass.base}>
			<object
				className={logoClass.object}
				data="/assets/WERK1Logo.svg"
				type="image/svg+xml"
			/>
		</div>
	);
};

export default NavLogo;
