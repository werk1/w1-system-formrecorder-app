import {
  FLIPBOOK_BOOLEAN_CONFIG_KEYS,
  FLIPBOOK_BOOLEAN_CONFIG_LABELS,
  FLIPBOOK_SELECT_OPTIONS,
} from "@/lib/blocks/flipbook/config";
import {
  FLIPBOOK_MAX_PDF_BYTES,
  readPdfSignature,
} from "@/lib/flipbook/pdfConverter";
import {
  deleteFlipbookGeneratedPages,
  maybeScheduleFlipbookConversion,
  W1_SKIP_FLIPBOOK_CONVERSION,
} from "@/lib/flipbook";
import { resolveCoverImageId } from "@/lib/flipbook/cover";
import { generateRandomEditableKey, slugFromTitle } from "@/payload/utils/slug";
import { W1_FLIPBOOK_DEFAULT_CONFIG } from "@werk1/w1-system-flipbook/config";
import path from "path";
import type { Access, CollectionConfig, Field } from "payload";

const adminOnly: Access = ({ req: { user } }) =>
  Boolean((user as { roles?: string[] } | null)?.roles?.includes("admin"));

const isAdmin = (user: unknown) =>
  Boolean((user as { roles?: string[] } | null)?.roles?.includes("admin"));

const readPublishedOrAdmin: Access = ({ req: { user } }) =>
  isAdmin(user) ? true : { isPublished: { equals: true } };

const selectField = (
  name: keyof typeof FLIPBOOK_SELECT_OPTIONS,
  label: string,
): Field => ({
  name,
  label,
  type: "select",
  options: [...FLIPBOOK_SELECT_OPTIONS[name]],
  admin: { description: "Leer = Standard des Pakets" },
});

const booleanFields: Field[] = FLIPBOOK_BOOLEAN_CONFIG_KEYS.map((name) => ({
  name,
  label: FLIPBOOK_BOOLEAN_CONFIG_LABELS[name],
  type: "checkbox",
  defaultValue: W1_FLIPBOOK_DEFAULT_CONFIG[name],
}));

async function validatePdfSource(
  value: unknown,
  { req }: { req: import("payload").PayloadRequest },
): Promise<true | string> {
  if (value === null || value === undefined || value === "") {
    return "Bitte eine PDF-Quelle auswählen.";
  }
  const id = typeof value === "object" ? (value as { id?: string | number }).id : value;
  if (id === undefined || id === null) return "Ungültige PDF-Quelle.";

  const media = (await req.payload
    .findByID({ collection: "media", id: id as string | number, depth: 0, overrideAccess: true, req })
    .catch(() => null)) as { mimeType?: string; filesize?: number; filename?: string } | null;

  if (!media) return "Die gewählte PDF wurde nicht gefunden.";
  if (media.mimeType !== "application/pdf") return "Das gewählte Medium ist keine PDF-Datei.";
  if (typeof media.filesize === "number" && media.filesize > FLIPBOOK_MAX_PDF_BYTES) {
    return `Die PDF ist größer als ${FLIPBOOK_MAX_PDF_BYTES / 1024 / 1024} MB.`;
  }

  const staticDir = req.payload.collections.media?.config?.upload?.staticDir;
  if (staticDir && media.filename) {
    const hasSignature = await readPdfSignature(path.join(staticDir, media.filename)).catch(() => false);
    if (!hasSignature) return "Die Datei enthält keine gültige PDF-Signatur (%PDF-).";
  }
  return true;
}

export const Flipbooks: CollectionConfig = {
  slug: "flipbooks",
  labels: {
    singular: { de: "PDF-Dokument", en: "PDF document" },
    plural: { de: "PDF-Dokumente", en: "PDF documents" },
  },
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "slug", "isPublished", "status", "pageCount", "updatedAt"],
  },
  access: {
    read: readPublishedOrAdmin,
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
        // Auto-generate when empty. `title` is localized and can arrive as a
        // plain string (admin save) or a per-locale object (local API).
        const rawTitle = data.title;
        const title =
          typeof rawTitle === "string"
            ? rawTitle
            : rawTitle && typeof rawTitle === "object"
              ? Object.values(rawTitle).find(
                  (value) => typeof value === "string" && value.trim().length > 0,
                )
              : null;
        data.slug = slugFromTitle(title) ?? generateRandomEditableKey("flipbook");
        return data;
      },
    ],
    beforeChange: [
      // Cover for listing, OG image and admin preview: page 1 by default, a
      // chosen page or an uploaded image. Recomputed on every change, including
      // the publication update of a conversion job.
      ({ data, originalDoc }) => {
        if (!data) return data;
        const cover = data.cover ?? originalDoc?.cover;
        const pages = data.pages ?? originalDoc?.pages;
        data.coverImage = resolveCoverImageId(cover, pages);
        return data;
      },
    ],
    afterChange: [
      // Conversion pipeline (src/lib/flipbook/README.md): (re)converts when the
      // source PDF changes. Fire-and-forget; self-updates carry the skip flag.
      ({ doc, previousDoc, operation, req, context }) => {
        if (context?.[W1_SKIP_FLIPBOOK_CONVERSION]) return doc;
        maybeScheduleFlipbookConversion({ doc, previousDoc, operation }, req.payload);
        return doc;
      },
    ],
    afterDelete: [
      async ({ id, req }) => {
        await deleteFlipbookGeneratedPages(req.payload, id).catch(() => undefined);
      },
    ],
  },
  fields: [
    {
      name: "embedLink",
      type: "ui",
      admin: {
        components: {
          Field: "/payload/components/FlipbookEmbedLink#FlipbookEmbedLink",
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
      name: "issue",
      label: { de: "Ausgabe", en: "Issue" },
      type: "text",
      localized: true,
      admin: {
        description: {
          de: "Steht im Reader unten in der Statuszeile zwischen Kundenname und Seitenzahl, zum Beispiel „Nr. 7/27“ oder „Ausgabe 5“. Ohne Eintrag entfällt sie.",
          en: "Shown in the reader's status bar at the bottom between client name and page count, for example \"No. 7/27\" or \"Issue 5\". Omitted when empty.",
        },
      },
    },
    {
      name: "slug",
      label: { de: "Slug", en: "Slug" },
      type: "text",
      unique: true,
      index: true,
      admin: {
        description: {
          de: "Eindeutiger Slug (Reader-URL /flipbooks/[slug]). Leer lassen, um ihn aus dem Titel zu generieren.",
          en: "Unique slug (reader URL /flipbooks/[slug]). Leave empty to generate it from the title.",
        },
      },
    },
    {
      name: "isPublished",
      label: { de: "Veröffentlicht", en: "Published" },
      type: "checkbox",
      defaultValue: false,
      index: true,
    },
    {
      name: "sortOrder",
      label: { de: "Sortierung", en: "Sort order" },
      type: "number",
      defaultValue: 100,
      admin: { description: "Kleinere Werte zuerst in der Listenansicht." },
    },
    {
      name: "sourcePdf",
      label: { de: "PDF-Quelle", en: "PDF source" },
      type: "upload",
      relationTo: "media",
      required: true,
      filterOptions: { mimeType: { equals: "application/pdf" } },
      validate: validatePdfSource as never,
      admin: {
        description:
          "Wird die PDF ersetzt, startet die Konvertierung automatisch. Die letzte veröffentlichte Revision bleibt bis zum Erfolg sichtbar.",
      },
    },
    {
      name: "conversion",
      type: "ui",
      admin: {
        components: {
          Field: "/payload/components/FlipbookConvertButton#FlipbookConvertButton",
        },
      },
    },
    { name: "sourceRevision", type: "text", admin: { readOnly: true, position: "sidebar" } },
    { name: "sourceStamp", type: "text", admin: { readOnly: true, hidden: true } },
    {
      name: "status",
      type: "select",
      defaultValue: "idle",
      options: [
        { label: "Idle", value: "idle" },
        { label: "Converting", value: "converting" },
        { label: "Ready", value: "ready" },
        { label: "Error", value: "error" },
      ],
      index: true,
      admin: { readOnly: true, position: "sidebar" },
    },
    { name: "progress", type: "text", admin: { readOnly: true, position: "sidebar" } },
    { name: "errorMessage", type: "textarea", admin: { readOnly: true, position: "sidebar" } },
    {
      name: "publishedSourcePdf",
      type: "upload",
      relationTo: "media",
      admin: { readOnly: true, position: "sidebar", description: "PDF der veröffentlichten Revision." },
    },
    { name: "publishedRevision", type: "text", admin: { readOnly: true, position: "sidebar" } },
    {
      // PDF.js manifest (text layer, links, chunks) of the published revision, built by the conversion.
      name: "manifestUrl",
      type: "text",
      admin: { readOnly: true, position: "sidebar" },
      access: { update: () => false },
    },
    { name: "pageCount", type: "number", admin: { readOnly: true, position: "sidebar" } },
    {
      // Published replacements of single pages (e.g. written by the pdfedit
      // module's "PDF aktualisieren"). The reader shows them instead of the
      // converted pages while `overrideRevision` equals `publishedRevision`.
      name: "pageOverrides",
      label: { de: "Aktualisierte Seiten", en: "Updated pages" },
      type: "array",
      admin: {
        readOnly: true,
        position: "sidebar",
        description: "Vom Reader statt der konvertierten Seite gezeigt (z. B. nach „PDF aktualisieren“).",
      },
      fields: [
        { name: "pageIndex", type: "number", required: true, min: 0 },
        { name: "image", type: "upload", relationTo: "media", required: true },
        { name: "width", type: "number" },
        { name: "height", type: "number" },
      ],
    },
    {
      name: "pdfOverride",
      label: { de: "Aktualisiertes PDF", en: "Updated PDF" },
      type: "upload",
      relationTo: "media",
      admin: { readOnly: true, position: "sidebar", description: "PDF-Link des Readers, solange die aktualisierten Seiten gelten." },
    },
    {
      name: "overrideRevision",
      type: "text",
      admin: { readOnly: true, position: "sidebar", description: "Revision, auf der die aktualisierten Seiten beruhen; bei Abweichung werden sie ignoriert." },
    },
    { name: "overrideSource", type: "text", admin: { readOnly: true, position: "sidebar", description: "Quelle der aktualisierten Seiten (Pdfedit-ID)." } },
    {
      // PDF.js manifest (text layer, links) of `pdfOverride`, published by the same module.
      // The reader uses it only while `overrideManifestFor` names the current `pdfOverride`.
      name: "overrideManifestUrl",
      type: "text",
      admin: { readOnly: true, position: "sidebar", description: "Manifest (Textebene, Links) des aktualisierten PDFs." },
    },
    { name: "overrideManifestFor", type: "text", admin: { readOnly: true, hidden: true } },
    {
      name: "textModel",
      type: "json",
      // The text model (blocks, lines, words, styles) easily exceeds 1 MB. The
      // admin form would send it back on every save and the request body gets
      // cut off, so the field is never read or written through the admin/REST
      // API. Server code (conversion, pdfedit endpoints) uses `overrideAccess`.
      access: {
        read: () => false,
        update: () => false,
        create: () => false,
      },
      admin: {
        readOnly: true,
        hidden: true,
        description:
          "Extrahierte Textebene (W1FormTextModel) der veröffentlichten Revision – Grundlage für Pdfedit-Overlay und Suche.",
      },
    },
    {
      name: "imageModel",
      type: "json",
      // Same reasoning as `textModel`: server-only, never exposed through the
      // admin form or REST. Filled lazily per revision by the pdfedit endpoints.
      access: {
        read: () => false,
        update: () => false,
        create: () => false,
      },
      admin: {
        readOnly: true,
        hidden: true,
        description:
          "Extrahierte Bildplatzierungen (W1PdfImageModel) der veröffentlichten Revision – Grundlage für den Pdfedit-Bildeditor.",
      },
    },
    {
      name: "cover",
      label: { de: "Cover", en: "Cover" },
      type: "group",
      admin: {
        description:
          "Cover für Übersicht, Vorschaubild beim Teilen und Admin-Vorschau. Standard ist Seite 1.",
      },
      fields: [
        {
          name: "source",
          label: { de: "Quelle", en: "Source" },
          type: "select",
          defaultValue: "page",
          options: [
            { label: { de: "Seite aus der PDF", en: "Page of the PDF" }, value: "page" },
            { label: { de: "Eigenes Bild", en: "Own image" }, value: "upload" },
          ],
        },
        {
          name: "page",
          label: { de: "Seite (1-basiert)", en: "Page (1-based)" },
          type: "number",
          defaultValue: 1,
          min: 1,
          admin: {
            condition: (_, siblingData) => siblingData?.source !== "upload",
            description:
              "Liegt die Seite nach einer Neukonvertierung hinter der letzten Seite, wird Seite 1 verwendet.",
          },
        },
        {
          name: "image",
          label: { de: "Cover-Bild", en: "Cover image" },
          type: "upload",
          relationTo: "media",
          filterOptions: { mediaType: { equals: "image" } },
          admin: { condition: (_, siblingData) => siblingData?.source === "upload" },
          validate: ((value: unknown, { siblingData }: { siblingData?: { source?: unknown } }) =>
            siblingData?.source === "upload" && (value === null || value === undefined || value === "")
              ? "Bitte ein Cover-Bild hochladen oder auswählen."
              : true) as never,
        },
      ],
    },
    {
      name: "coverImage",
      type: "upload",
      relationTo: "media",
      admin: {
        readOnly: true,
        position: "sidebar",
        description: "Aufgelöstes Cover (automatisch aus der Cover-Einstellung).",
      },
    },
    {
      name: "pages",
      type: "array",
      admin: {
        readOnly: true,
        initCollapsed: true,
        description: "Seiten der veröffentlichten Revision.",
      },
      fields: [
        { name: "image", type: "upload", relationTo: "media", required: true },
        { name: "width", type: "number", required: true },
        { name: "height", type: "number", required: true },
        { name: "label", type: "text" },
      ],
    },
    {
      name: "defaultConfig",
      label: { de: "Standard-Konfiguration", en: "Default configuration" },
      type: "group",
      admin: { description: "Standardwerte; Page-Sections können sie überschreiben." },
      fields: [
        selectField("spreadMode", "Seitenmodus"),
        selectField("coverMode", "Cover-Modus"),
        selectField("direction", "Leserichtung"),
        selectField("theme", "Theme"),
        selectField("engine", "Umblätter-Engine"),
        { name: "startPage", label: "Startseite (1-basiert)", type: "number", min: 1 },
        { name: "aspectRatio", label: "Seitenverhältnis (CSS)", type: "text" },
        { name: "maxWidthPx", label: "Maximale Breite (px)", type: "number", min: 200 },
        ...booleanFields,
      ],
    },
  ],
};
