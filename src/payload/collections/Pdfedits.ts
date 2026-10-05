import { generateRandomEditableKey, slugFromTitle } from "@/payload/utils/slug";
import type { Access, CollectionConfig } from "payload";

const adminOnly: Access = ({ req: { user } }) =>
  Boolean((user as { roles?: string[] } | null)?.roles?.includes("admin"));

/**
 * Pdfedit documents bind a converted flipbook (page images + published
 * `textModel`). Editors capture entries on the rendered pages as ordered
 * records (`pdfeditrecords`): text blocks are assigned to records and named
 * afterwards in the package editor (start page, `/?book=<slug>&edit=1`).
 */
export const Pdfedits: CollectionConfig = {
  slug: "pdfedits",
  labels: {
    singular: { de: "Pdfedit", en: "PDF edit" },
    plural: { de: "Pdfedit", en: "PDF edits" },
  },
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "slug", "flipbook", "updatedAt"],
  },
  access: {
    read: adminOnly,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (!data) return data;
        const incomingSlug = typeof data.slug === "string" ? data.slug.trim().toLowerCase() : "";
        if (incomingSlug) {
          data.slug = incomingSlug;
          return data;
        }
        const rawTitle = data.title;
        const title =
          typeof rawTitle === "string"
            ? rawTitle
            : rawTitle && typeof rawTitle === "object"
              ? Object.values(rawTitle).find(
                  (value) => typeof value === "string" && value.trim().length > 0,
                )
              : null;
        data.slug = slugFromTitle(title) ?? generateRandomEditableKey("pdfedit");
        return data;
      },
    ],
  },
  fields: [
    {
      name: "editorLink",
      type: "ui",
      admin: {
        components: {
          Field: "/payload/components/PdfeditEditorLink#PdfeditEditorLink",
        },
      },
    },
    {
      name: "title",
      label: { de: "Titel", en: "Title" },
      type: "text",
      required: true,
      localized: true,
    },
    {
      name: "slug",
      label: { de: "Slug", en: "Slug" },
      type: "text",
      unique: true,
      index: true,
      admin: {
        description: "Leer lassen, um ihn aus dem Titel zu generieren.",
      },
    },
    {
      name: "flipbook",
      label: { de: "PDF-Dokument", en: "PDF document" },
      type: "relationship",
      relationTo: "flipbooks",
      required: true,
      admin: {
        description:
          "Seitenbilder und Textmodell kommen aus der veröffentlichten Revision des PDF-Dokuments. Das PDF-Dokument muss konvertiert sein (Status „ready“).",
      },
    },
    {
      name: "imageEdits",
      label: { de: "Bildänderungen", en: "Image edits" },
      type: "json",
      admin: {
        readOnly: true,
        description:
          'Ersetzte Bilder: [{ "imageId": string, "revision": string, "pageIndex": number, "mediaId": string (leer bei entferntem Bild), "remove"?: true, "rect": { "x", "y", "w", "h" } (Container), "zoom"?: number, "panX"?: number, "panY"?: number }]. Wird vom Editor über /api/pdfedit-images gepflegt; Einträge einer anderen Revision werden ignoriert.',
      },
    },
    {
      type: "collapsible",
      label: { de: "Aktualisiertes PDF", en: "Updated PDF" },
      admin: {
        initCollapsed: true,
        description:
          "Wird vom Editor über „PDF aktualisieren“ erzeugt. Das Original bleibt als Sicherung erhalten.",
      },
      fields: [
        {
          name: "originalPdf",
          label: { de: "Original-PDF (Sicherung)", en: "Original PDF (backup)" },
          type: "upload",
          relationTo: "media",
          admin: { readOnly: true },
        },
        {
          name: "editedPdf",
          label: { de: "Aktualisiertes PDF", en: "Updated PDF" },
          type: "upload",
          relationTo: "media",
          admin: { readOnly: true },
        },
        {
          name: "editedPages",
          label: { de: "Vorschau geänderter Seiten", en: "Edited page previews" },
          type: "array",
          admin: { readOnly: true },
          fields: [
            { name: "pageIndex", type: "number", required: true, min: 0 },
            { name: "image", type: "upload", relationTo: "media", required: true },
            { name: "width", type: "number" },
            { name: "height", type: "number" },
          ],
        },
        { name: "editedAt", type: "date", admin: { readOnly: true } },
        {
          name: "editedRevision",
          type: "text",
          admin: {
            readOnly: true,
            description: "Flipbook-Revision, auf der das aktualisierte PDF beruht. Ändert sich die Quelle, wird es ignoriert.",
          },
        },
      ],
    },
  ],
};
