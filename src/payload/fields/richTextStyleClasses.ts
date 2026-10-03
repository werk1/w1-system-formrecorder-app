/**
 * @file richTextStyleClasses.ts
 * @description Centralized definition of available style classes for RichText fields
 *
 * This file is separate from field definitions to avoid importing server-only code
 * (like lexicalEditor) into client components.
 */

/**
 * Available style options for RichTextArrayWithStyle and RichTextWithStyle
 * Used both in Payload field definitions and PayloadTextContentLoader
 */
export const RICHTEXT_STYLE_OPTIONS = [
  { label: 'Hero1', value: 'hero1' },
  { label: 'Hero2', value: 'hero2' },
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
  { label: 'Display 1', value: 'display1' },
  { label: 'Display 2', value: 'display2' },
  { label: 'Headings 1', value: 'headings1' },
  { label: 'Headings 2', value: 'headings2' },
  { label: 'Copy 1', value: 'copy1' },
  { label: 'Copy 2', value: 'copy2' },
  { label: 'Copy 3', value: 'copy3' },
  { label: 'Copy 4', value: 'copy4' },
  { label: 'Copy 5', value: 'copy5' },
  { label: 'Biography 1', value: 'biography1' },
  { label: 'Biography 2', value: 'biography2' },
  { label: 'Biography 3', value: 'biography3' },
  { label: 'Description1', value: 'description1' },
  { label: 'Description2', value: 'description2' },
  { label: 'Description3', value: 'description3' },
  { label: 'Description4', value: 'description4' },
  { label: 'Description5', value: 'description5' },
  { label: 'Footer1', value: 'footer1' },
  { label: 'Footer2', value: 'footer2' },
  { label: 'Footer3', value: 'footer3' },
  { label: 'Footer4', value: 'footer4' },
  { label: 'Infobox1', value: 'infobox1' },
  { label: 'Infobox2', value: 'infobox2' },
  { label: 'Infobox3', value: 'infobox3' },
  { label: 'Data1', value: 'data1' },
  { label: 'Data2', value: 'data2' },
  { label: 'Data3', value: 'data3' },
  { label: 'Data4', value: 'data4' },
  { label: 'Data5', value: 'data5' },
  { label: 'Link1', value: 'link1' },
  { label: 'Link2', value: 'link2' },
  { label: 'Link3', value: 'link3' },
  { label: 'Link4', value: 'link4' },
  { label: 'Link5', value: 'link5' },
  { label: 'LinkURL1', value: 'linkURL1' },
  { label: 'LinkURL2', value: 'linkURL2' },
  { label: 'LinkURL3', value: 'linkURL3' },
  { label: 'LinkEmail1', value: 'linkEmail1' },
  { label: 'LinkEmail2', value: 'linkEmail2' },
  { label: 'LinkEmail3', value: 'linkEmail3' },
  { label: 'LinkPhone1', value: 'linkPhone1' },
  { label: 'LinkPhone2', value: 'linkPhone2' },
  { label: 'LinkPhone3', value: 'linkPhone3' },
]
