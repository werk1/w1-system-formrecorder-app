import type { Access, CollectionConfig } from "payload";

const adminOnly: Access = ({ req: { user } }) =>
  Boolean((user as { roles?: string[] } | null)?.roles?.includes("admin"));

/**
 * Captured records of a pdfedit document: one doc per entry (e.g. a
 * hotel listing). `blocks` is the ordered list of assigned text blocks
 * `{ blockId, name?, text, edited?, spans? }` defined by
 * `@werk1/w1-system-pdfedit`. `order` is the explicit export order.
 */
export const Pdfeditrecords: CollectionConfig = {
  slug: "pdfeditrecords",
  labels: {
    singular: { de: "Datensatz", en: "Record" },
    plural: { de: "Datensätze", en: "Records" },
  },
  admin: {
    defaultColumns: ["order", "pageIndex", "updatedAt"],
    hidden: true,
  },
  access: {
    read: adminOnly,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  fields: [
    {
      name: "pdfedit",
      type: "relationship",
      relationTo: "pdfedits",
      required: true,
      index: true,
    },
    {
      name: "order",
      label: { de: "Position", en: "Position" },
      type: "number",
      required: true,
      defaultValue: 0,
      index: true,
    },
    {
      name: "name",
      label: { de: "Name", en: "Name" },
      type: "text",
      admin: {
        description: "Anzeigename für den Überblick im Editor (optional).",
      },
    },
    {
      name: "pageIndex",
      label: { de: "Anker-Seite (0-basiert)", en: "Anchor page (0-based)" },
      type: "number",
      min: 0,
    },
    {
      name: "blocks",
      type: "json",
      admin: {
        description:
          'Zugewiesene Textblöcke: [{ "blockId": string, "name"?: string, "text": string, "edited"?: boolean, "spans"?: [{ "text": string, "style"?: { "fontFamily"?, "bold"?, "italic"?, "color"? } }] }]',
      },
    },
  ],
};
