export interface NavItem {
	to: string;
	label: string;
	openInNewTab?: boolean;
	submenu?: NavItem[];
}

export const DEFAULT_NAV_ITEMS: NavItem[] = [
	{
		to: '/',
		label: 'HOME'
	},
	{
		to: '/about',
		label: 'ABOUT'
	},
	{
		to: '/contact',
		label: 'CONTACT'
	}
];

export default DEFAULT_NAV_ITEMS;
