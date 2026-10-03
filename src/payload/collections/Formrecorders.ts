import { generateRandomEditableKey, slugFromTitle } from "@/payload/utils/slug";
import type { Access, CollectionConfig } from "payload";

const adminOnly: Access = ({ req: { user } }) =>
  Boolean((user as { roles?: string[] } | null)?.roles?.includes("admin"));

/**
 * Formrecorder documents bind a converted flipbook (page images + published
 * `textModel`). Editors capture entries on the rendered pages as ordered
 * records (`formrecords`): text blocks are assigned to records and named
 * afterwards in the package editor (`/admin/formrecorder`).
 */
export const Formrecorders: CollectionConfig = {
  slug: "formrecorders",
  labels: {
    singular: { de: "Formrecorder", en: "Form recorder" },
    plural: { de: "Formrecorder", en: "Form recorders" },
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
        data.slug = slugFromTitle(title) ?? generateRandomEditableKey("formrecorder");
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
          Field: "/payload/components/FormrecorderEditorLink#FormrecorderEditorLink",
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
