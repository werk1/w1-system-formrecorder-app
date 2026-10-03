import { RichTextArrayWithStyle } from "@/payload/fields/RichTextArrayWithStyle";
import type { Access, CollectionConfig } from "payload";

const adminOnly: Access = ({ req: { user } }) =>
  Boolean((user as { roles?: string[] } | null)?.roles?.includes("admin"));

export const TextContent: CollectionConfig = {
  slug: "text-content",
  labels: {
    singular: { de: "Textinhalt", en: "Text Content" },
    plural: { de: "Textinhalte", en: "Text Contents" },
  },
  access: {
    read: () => true,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  admin: {
    useAsTitle: "identifier",
  },
  hooks: {
    beforeChange: [
      ({ data }) => {
        if (data && typeof data.identifier === "object") {
          // Normalize localized identifiers to lowercase
          Object.keys(data.identifier).forEach((locale) => {
            if (typeof data.identifier[locale] === "string") {
              data.identifier[locale] = data.identifier[locale]
                .trim()
                .toLowerCase();
            }
          });
        } else if (typeof data.identifier === "string") {
          // Normalize non-localized identifier to lowercase
          data.identifier = data.identifier.trim().toLowerCase();
        }
        return data;
      },
    ],
  },
  fields: [
    {
      name: "identifier",
      label: { de: "Bezeichner", en: "Identifier" },
      type: "text",
      required: false,
      unique: true,
      localized: true,
    },
    RichTextArrayWithStyle,
  ],
};
