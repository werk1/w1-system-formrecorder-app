import { MEDIA_STORAGE_ROOT } from "@/lib/media/mediaStorageRoot";
import { RichTextArrayWithStyle } from "@/payload/fields/RichTextArrayWithStyle";
import { createUsecaseField } from "@/payload/fields/usecase";
import {
  cleanupVideoVariants,
  maybeScheduleVideoOptimization,
  W1_SKIP_VIDEO_OPTIMIZATION,
} from "@/lib/video-optimization";
import { normalizeLowercaseText, slugFromTitle } from "@/payload/utils/slug";
import { APIError, type Access, type CollectionConfig, type CollectionSlug, type PayloadRequest } from "payload";

const adminOnly: Access = ({ req: { user } }) =>
  Boolean((user as { roles?: string[] } | null)?.roles?.includes("admin"));

const MEDIA_FILE_CACHE_CONTROL =
  "public, max-age=3600, stale-while-revalidate=86400";

function applyMediaFileCacheHeaders(headers: Headers): Headers {
  const contentType = headers.get("Content-Type")?.toLowerCase() ?? "";

  if (contentType.startsWith("video/") || contentType.startsWith("audio/")) {
    headers.set("Cache-Control", MEDIA_FILE_CACHE_CONTROL);
  }

  return headers;
}

type MediaTypeValue = "image" | "video" | "audio" | "document" | "other";

function normalizeMediaTypeValue(value: unknown): MediaTypeValue | null {
  const normalized = normalizeLowercaseText(value);
  if (
    normalized === "image" ||
    normalized === "video" ||
    normalized === "audio" ||
    normalized === "document" ||
    normalized === "other"
  ) {
    return normalized;
  }
  return null;
}

function deriveMediaTypeFromMimeType(value: unknown): MediaTypeValue | null {
  const mimeType = normalizeLowercaseText(value);
  if (!mimeType) return null;
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType === "application/pdf") return "document";
  return "other";
}

function deriveMediaSlug(data: Record<string, unknown>): string | null {
  return (
    normalizeLowercaseText(data.slug) ??
    slugFromTitle(data.importSlug) ??
    slugFromTitle(data.sourceFile) ??
    slugFromTitle(data.filename) ??
    normalizeLowercaseText(data.sourceAssetId)
  );
}

function normalizeMediaAltValue(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim();
  if (!normalized || /^\$ID[\\/]/i.test(normalized)) {
    return null;
  }

  return normalized;
}

function fileNameToAlt(value: unknown): string | null {
  const normalized = normalizeMediaAltValue(value);
  if (!normalized) return null;

  const withoutExtension = normalized.replace(/\.[^.]+$/, "").trim();
  return withoutExtension || null;
}

function deriveMediaAlt(data: Record<string, unknown>): string | null {
  return (
    normalizeMediaAltValue(data.alt) ??
    normalizeMediaAltValue(data.title) ??
    fileNameToAlt(data.sourceFile) ??
    fileNameToAlt(data.filename) ??
    normalizeMediaAltValue(data.sourceAssetId)
  );
}

function normalizeMediaMutationData(data: unknown): unknown {
  if (!data || typeof data !== "object") return data;

  const mutationData = data as Record<string, unknown>;

  const normalizedMimeType = normalizeLowercaseText(mutationData.mimeType);
  if (normalizedMimeType) {
    mutationData.mimeType = normalizedMimeType;
  }

  const normalizedMediaType =
    normalizeMediaTypeValue(mutationData.mediaType) ??
    deriveMediaTypeFromMimeType(normalizedMimeType);
  if (normalizedMediaType) {
    mutationData.mediaType = normalizedMediaType;
  }

  const normalizedSlug = deriveMediaSlug(mutationData);
  if (normalizedSlug) {
    mutationData.slug = normalizedSlug;
  }

  const normalizedAlt = deriveMediaAlt(mutationData);
  if (normalizedAlt) {
    mutationData.alt = normalizedAlt;
  }

  return mutationData;
}

const GENERATED_MEDIA_GUARD_COLLECTION = "flipbooks" as unknown as CollectionSlug;

/**
 * Module-neutral delete guard: only active when a `flipbooks` collection is
 * registered. Refuses deleting PDFs that a flipbook uses as source (or as
 * published PDF override) and page images of a published flipbook revision
 * (including `pageOverrides`). Imports no flipbook code.
 */
async function assertMediaNotReferencedByFlipbook({
  id,
  req,
}: {
  id: string | number;
  req: PayloadRequest;
}): Promise<void> {
  if (!req.payload.collections?.[GENERATED_MEDIA_GUARD_COLLECTION]) return;

  const { totalDocs } = await req.payload.find({
    collection: GENERATED_MEDIA_GUARD_COLLECTION,
    where: {
      or: [
        { sourcePdf: { equals: id } },
        { publishedSourcePdf: { equals: id } },
        { "pages.image": { equals: id } },
        { "cover.image": { equals: id } },
        { "pageOverrides.image": { equals: id } },
        { pdfOverride: { equals: id } },
      ],
    },
    limit: 1,
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req,
  });

  if (totalDocs > 0) {
    throw new APIError(
      "Dieses Medium wird von einem Flipbook verwendet und kann nicht gelöscht werden.",
      409,
    );
  }
}

export const Media: CollectionConfig = {
  slug: "media",
  labels: {
    singular: { de: "Medium", en: "Media" },
    plural: { de: "Medien", en: "Media" },
  },
  access: {
    read: () => true,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  hooks: {
    beforeValidate: [({ data }) => normalizeMediaMutationData(data)],
    beforeChange: [({ data }) => normalizeMediaMutationData(data)],
    afterChange: [
      // Video optimization pipeline (doc/w1-video-optimization.md): generates
      // delivery variants and a first-frame poster for every incoming video.
      // Fire-and-forget like the IDML import jobs; self-updates carry the
      // skip flag.
      ({ doc, req, context }) => {
        if (context?.[W1_SKIP_VIDEO_OPTIMIZATION]) return doc;
        maybeScheduleVideoOptimization(doc, req.payload);
        return doc;
      },
    ],
    beforeDelete: [
      async ({ id, req }) => {
        await assertMediaNotReferencedByFlipbook({ id, req });
      },
    ],
    afterDelete: [
      ({ doc }) => {
        cleanupVideoVariants(doc);
        return doc;
      },
    ],
    beforeRead: [
      ({ doc }) => {
        // Ensure sizes.thumb exists to prevent Payload's thumbnailURL hook from crashing
        // Payload's adminThumbnail: 'thumb' expects doc.sizes.thumb to exist
        if (
          doc &&
          doc.sizes &&
          !doc.sizes.thumb &&
          doc.mimeType !== "application/pdf"
        ) {
          // Create a fallback thumb entry using the original file or smallest available size
          doc.sizes.thumb = {
            url: doc.sizes.sm?.url || doc.sizes.md?.url || doc.url || null,
            width:
              doc.sizes.sm?.width || doc.sizes.md?.width || doc.width || null,
            height:
              doc.sizes.sm?.height ||
              doc.sizes.md?.height ||
              doc.height ||
              null,
            mimeType: doc.mimeType || null,
            filesize:
              doc.sizes.sm?.filesize ||
              doc.sizes.md?.filesize ||
              doc.filesize ||
              null,
            filename:
              doc.sizes.sm?.filename ||
              doc.sizes.md?.filename ||
              doc.filename ||
              null,
          };
        }
        return doc;
      },
    ],
  },
  admin: {
    baseListFilter: () => ({ generatedBy: { exists: false } }),
  },
  upload: {
    staticDir: MEDIA_STORAGE_ROOT,
    adminThumbnail: "thumb",
    modifyResponseHeaders: ({ headers }) =>
      applyMediaFileCacheHeaders(headers),
    mimeTypes: [
      "image/*",
      "video/mp4",
      "video/webm",
      "video/ogg",
      "video/quicktime",
      "audio/mpeg",
      "audio/mp3",
      "audio/wav",
      "audio/ogg",
      "audio/aac",
      "audio/flac",
      "application/pdf",
    ],
    formatOptions: { format: "webp", options: { quality: 80 } },
    filenameCompoundIndex: ["filename", "importSlug"],
    imageSizes: [
      {
        name: "thumb",
        width: 320,
        formatOptions: { format: "webp", options: { quality: 75 } },
      },
      {
        name: "sm",
        width: 640,
        formatOptions: { format: "webp", options: { quality: 80 } },
      },
      {
        name: "md",
        width: 1024,
        formatOptions: { format: "webp", options: { quality: 80 } },
      },
      {
        name: "lg",
        width: 1600,
        formatOptions: { format: "webp", options: { quality: 80 } },
      },
      {
        name: "xl",
        width: 2400,
        formatOptions: { format: "webp", options: { quality: 80 } },
      },
    ],
    resizeOptions: { withoutEnlargement: false },
  },
  fields: [
    {
      name: "slug",
      type: "text",
      index: true,
      admin: {
        description: "Slug für Referenzierung in Image/Video/Sound-Sections",
      },
    },
    {
      name: "mediaType",
      label: { de: "Medientyp", en: "Media Type" },
      type: "select",
      options: [
        { label: { de: "Bild", en: "Image" }, value: "image" },
        { label: { de: "Video", en: "Video" }, value: "video" },
        { label: { de: "Audio", en: "Audio" }, value: "audio" },
        { label: { de: "Dokument", en: "Document" }, value: "document" },
        { label: { de: "Sonstiges", en: "Other" }, value: "other" },
      ],
      index: true,
      admin: {
        description: "Automatisch aus mimeType abgeleitet",
        readOnly: true,
      },
    },
    createUsecaseField("hero"),
    {
      name: "importSlug",
      type: "text",
      index: true,
    },
    {
      name: "sourceFile",
      type: "text",
      index: true,
    },
    {
      name: "sourceChecksum",
      type: "text",
      index: true,
    },
    {
      name: "sourceAssetId",
      type: "text",
      index: true,
    },
    {
      name: "alt",
      label: { de: "Alt-Text", en: "Alt Text" },
      type: "text",
      required: true,
      localized: true,
    },
    {
      name: "videoMaxBitrateMbit",
      label: { de: "Video max. Bitrate", en: "Video Max Bitrate" },
      type: "select",
      defaultValue: "3",
      options: [
        { label: "2 Mbit/s", value: "2" },
        { label: "3 Mbit/s (Standard)", value: "3" },
        { label: "4 Mbit/s", value: "4" },
        { label: "6 Mbit/s", value: "6" },
        { label: "8 Mbit/s", value: "8" },
        { label: "12 Mbit/s", value: "12" },
      ],
      admin: {
        description:
          "Max. Bitrate der 1080er-Auslieferungs-Variante. Änderung + Speichern encodiert automatisch neu. 720er-Variante und Qualitätsparameter werden pro Stufe abgeleitet.",
        condition: (data) => data?.mediaType === "video",
      },
    },
    {
      name: "videoOptimization",
      label: { de: "Video-Optimierung", en: "Video Optimization" },
      type: "group",
      admin: {
        description:
          "Automatisch generierte Auslieferungs-Varianten (1080/720, faststart, 1s-GOP) und First-Frame-Poster — siehe doc/w1-video-optimization.md",
        condition: (data) => data?.mediaType === "video",
      },
      fields: [
        {
          name: "status",
          type: "select",
          options: [
            { label: "Pending", value: "pending" },
            { label: "Processing", value: "processing" },
            { label: "Ready", value: "ready" },
            { label: "Failed", value: "failed" },
            { label: "Skipped", value: "skipped" },
          ],
          admin: { readOnly: true },
        },
        { name: "sourceFilename", type: "text", admin: { readOnly: true } },
        { name: "maxBitrateMbit", type: "number", admin: { readOnly: true } },
        { name: "variant1080", type: "text", admin: { readOnly: true } },
        { name: "variant720", type: "text", admin: { readOnly: true } },
        { name: "poster", type: "text", admin: { readOnly: true } },
        { name: "width", type: "number", admin: { readOnly: true } },
        { name: "height", type: "number", admin: { readOnly: true } },
        { name: "durationMs", type: "number", admin: { readOnly: true } },
        { name: "error", type: "text", admin: { readOnly: true } },
      ],
    },
    {
      name: "generatedBy",
      type: "text",
      index: true,
      admin: {
        description:
          "Setzt das Modul, das dieses Medium erzeugt hat (z. B. flipbook). Erzeugte Medien sind in der Standardliste ausgeblendet.",
        readOnly: true,
      },
    },
    {
      name: "generatedFor",
      type: "text",
      index: true,
      admin: { readOnly: true },
    },
    {
      name: "generatedRevision",
      type: "text",
      index: true,
      admin: { readOnly: true },
    },
    {
      name: "generatedReleasedAt",
      type: "date",
      index: true,
      admin: {
        description:
          "Zeitpunkt, ab dem das erzeugte Medium nicht mehr veröffentlicht ist; die Aufbewahrungsfrist zählt ab hier.",
        readOnly: true,
      },
    },
    RichTextArrayWithStyle,
  ],
  indexes: [
    {
      fields: ["importSlug", "sourceAssetId"],
    },
  ],
};
