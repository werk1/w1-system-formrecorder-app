import { generateRandomEditableKey, slugFromTitle } from "@/payload/utils/slug";
import type { Access, CollectionConfig } from "payload";

const adminOnly: Access = ({ req: { user } }) =>
  Boolean((user as { roles?: string[] } | null)?.roles?.includes("admin"));

/**
 * Pdfedit documents bind a converted flipbook (page images + published
 * `textModel`). Editors capture entries on the rendered pages as ordered
 * records (`pdfeditrecords`): text blocks are assigned to records and named
 * afterwards in the package editor (`/admin/pdfedit`).
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
      label: { de: "Flipbook", en: "Flipbook" },
      type: "relationship",
      relationTo: "flipbooks",
      required: true,
      admin: {
        description:
          "Seitenbilder und Textmodell kommen aus der veröffentlichten Flipbook-Revision. Das Flipbook muss konvertiert sein (Status „ready“).",
      },
    },
  ],
};
