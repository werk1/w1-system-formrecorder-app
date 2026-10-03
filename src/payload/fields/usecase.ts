import type { Field } from 'payload'

export const usecaseOptions = [
	{ label: 'Hero', value: 'hero' },
	{ label: 'Section1', value: 'section1' },
	{ label: 'Section2', value: 'section2' },
	{ label: 'Section3', value: 'section3' },
	{ label: 'Section4', value: 'section4' },
	{ label: 'Section5', value: 'section5' },
	{ label: 'Block1', value: 'block1' },
	{ label: 'Block2', value: 'block2' },
	{ label: 'Block3', value: 'block3' },
	{ label: 'Block4', value: 'block4' },
	{ label: 'Block5', value: 'block5' },
	{ label: 'Block6', value: 'block6' },
	{ label: 'Block7', value: 'block7' },
	{ label: 'Block8', value: 'block8' },
	{ label: 'Block9', value: 'block9' },
	{ label: 'Block10', value: 'block10' },
	{ label: 'Article Image', value: 'article-image' },
] as const

export function createUsecaseField(defaultValue?: string): Field {
	return {
		name: 'usecase',
		type: 'select',
		options: [...usecaseOptions],
		...(defaultValue ? { defaultValue } : {}),
	}
}
