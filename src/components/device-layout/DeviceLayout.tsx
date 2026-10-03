'use client';

import { useDeviceSpecificLayoutClasses } from '@/styles/hooks/device-specific-layout-classes/useDeviceSpecificLayoutClasses';

type DeviceLayoutProps = {
	children: React.ReactNode;
};

export function DeviceLayout({ children }: DeviceLayoutProps) {
	const { deviceLayoutClass } = useDeviceSpecificLayoutClasses();

	return <div className={deviceLayoutClass}>{children}</div>;
}
