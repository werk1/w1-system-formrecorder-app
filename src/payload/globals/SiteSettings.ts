import { LOGO_SCALE } from "@/lib/theme/clientLogoVariants";
import type { GlobalConfig } from "payload";

export const SiteSettings: GlobalConfig = {
  slug: "site-settings",
  label: { de: "Seiteneinstellungen", en: "Site Settings" },
  access: {
    read: () => true,
    update: ({ req }) => Boolean(req.user),
  },
  fields: [
    {
      name: "siteTitle",
      label: { de: "Seitentitel", en: "Site Title" },
      type: "text",
      required: true,
      defaultValue: "W1 System Core",
      localized: true,
    },
    {
      name: "siteDescription",
      label: { de: "Seitenbeschreibung", en: "Site Description" },
      type: "textarea",
      defaultValue: "W1 System Core",
      localized: true,
    },
    {
      name: "colorScheme",
      label: { de: "Farbschema", en: "Color scheme" },
      type: "relationship",
      relationTo: "color-schemes",
      admin: {
        description: {
          de: "Farben der Reader-Oberfläche (Collection Farbschemata). Ohne Auswahl gilt Graphit. Hell oder Dunkel folgt automatisch dem System bzw. Browser der Besucher.",
          en: "Colors of the reader UI (Colour schemes collection). Graphite when empty. Light or dark follows the visitor's system or browser automatically.",
        },
      },
    },
    {
      name: "clientLogo",
      label: { de: "Kunde: Name, Logo, Piktogramm", en: "Client: name, logo, pictogram" },
      type: "group",
      admin: {
        description: {
          de: "Name: steht links oben im Reader, solange kein Logo geladen ist, und immer als Text unten in der Statuszeile, vor Ausgabe und Seitenzahl. Logo: ersetzt den Namen links oben. Piktogramm: steht am Handy im Querformat oben in der schmalen Leiste. PNG mit transparentem Hintergrund. Ist nur eine Variante geladen, gilt sie für Hell und Dunkel.",
          en: "Name: shown at the top left of the reader while no logo is set, and always as text in the status bar at the bottom, before issue and page count. Logo: replaces the name at the top left. Pictogram: sits at the top of the slim bar on phones in landscape. PNG with a transparent background. If only one variant is set it is used for light and dark.",
        },
      },
      fields: [
        {
          name: "name",
          label: { de: "Kundenname", en: "Client name" },
          type: "text",
          admin: {
            description: {
              de: "Zum Beispiel ADVANTAGE. Ohne Eintrag steht oben der Titel des PDF-Dokuments.",
              en: "For example ADVANTAGE. Without an entry the PDF document title is shown on top.",
            },
          },
        },
        {
          name: "pageWordMode",
          label: { de: "Wort vor der Seitenzahl", en: "Word before the page number" },
          type: "select",
          defaultValue: "default",
          options: [
            { label: { de: "Standard (Seite / Page je Sprache)", en: "Default (Seite / Page by language)" }, value: "default" },
            { label: { de: "Kein Wort (nur Zahlen)", en: "No word (numbers only)" }, value: "none" },
            { label: { de: "Eigenes Wort", en: "Custom word" }, value: "custom" },
          ],
          admin: {
            description: {
              de: "Statuszeile des Readers, zum Beispiel „Seite 10–11 | 78“. Am Handy im Hochformat stehen immer nur die Zahlen.",
              en: "Status bar of the reader, for example \"Page 10–11 | 78\". Phones in portrait always show the numbers only.",
            },
          },
        },
        {
          name: "pageWord",
          label: { de: "Eigenes Wort", en: "Custom word" },
          type: "text",
          admin: {
            condition: (_, siblingData) => siblingData?.pageWordMode === "custom",
            description: { de: "Zum Beispiel „S.“ oder „Page“.", en: "For example \"p.\" or \"Page\"." },
          },
        },
        {
          name: "positive",
          label: { de: "Logo positiv (für helle Flächen)", en: "Logo positive (for light surfaces)" },
          type: "upload",
          relationTo: "media",
          filterOptions: { mimeType: { contains: "image" } },
        },
        {
          name: "negative",
          label: { de: "Logo negativ (für dunkle Flächen)", en: "Logo negative (for dark surfaces)" },
          type: "upload",
          relationTo: "media",
          filterOptions: { mimeType: { contains: "image" } },
        },
        {
          name: "logoScale",
          label: { de: "Logo-Größe (%)", en: "Logo size (%)" },
          type: "number",
          defaultValue: LOGO_SCALE.default,
          min: LOGO_SCALE.min,
          max: LOGO_SCALE.max,
          admin: {
            step: 5,
            description: {
              de: `Größe des Logos links oben: 100 = Standard, erlaubt sind ${LOGO_SCALE.min} bis ${LOGO_SCALE.max}. Das Logo bleibt links ausgerichtet, die Höhe der Kopfzeile ändert sich nicht.`,
              en: `Size of the logo at the top left: 100 = standard, allowed are ${LOGO_SCALE.min} to ${LOGO_SCALE.max}. The logo stays left-aligned, the height of the header does not change.`,
            },
          },
        },
        {
          name: "pictogramPositive",
          label: { de: "Piktogramm positiv (für helle Flächen)", en: "Pictogram positive (for light surfaces)" },
          type: "upload",
          relationTo: "media",
          filterOptions: { mimeType: { contains: "image" } },
          admin: {
            description: {
              de: "Quadratisches Bildzeichen für die schmale Leiste am Handy im Querformat. Ohne Piktogramm steht dort der Anfangsbuchstabe als rundes Zeichen in der Primärfarbe.",
              en: "Square mark for the slim bar on phones in landscape. Without a pictogram the initial is shown as a round badge in the primary colour.",
            },
          },
        },
        {
          name: "pictogramNegative",
          label: { de: "Piktogramm negativ (für dunkle Flächen)", en: "Pictogram negative (for dark surfaces)" },
          type: "upload",
          relationTo: "media",
          filterOptions: { mimeType: { contains: "image" } },
        },
      ],
    },
    {
      name: "navigation",
      label: { de: "Navigation", en: "Navigation" },
      type: "array",
      admin: {
        description: {
          de: "Zentrales Navigationsmodell für Onepager und mehrseitige Apps.",
          en: "Central navigation model for one-pager and multi-page apps.",
        },
      },
      fields: [
        {
          name: "label",
          label: { de: "Bezeichnung", en: "Label" },
          type: "text",
          required: true,
          localized: true,
        },
        {
          name: "href",
          label: { de: "Link", en: "Link" },
          type: "text",
          required: true,
        },
        {
          name: "order",
          label: { de: "Reihenfolge", en: "Order" },
          type: "number",
          defaultValue: 0,
          required: true,
        },
        {
          name: "openInNewTab",
          label: { de: "In neuem Tab öffnen", en: "Open in New Tab" },
          type: "checkbox",
          defaultValue: false,
        },
      ],
    },
  ],
};
