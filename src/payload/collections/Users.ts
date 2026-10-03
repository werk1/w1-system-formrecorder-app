import type { CollectionConfig } from "payload";

export const Users: CollectionConfig = {
  slug: "users",
  labels: {
    singular: { de: "Benutzer", en: "User" },
    plural: { de: "Benutzer", en: "Users" },
  },
  admin: {
    useAsTitle: "email",
  },
  auth: true,
  access: {
    create: () => true,
    admin: ({ req: { user } }) =>
      Boolean(
        (user as { roles?: string[] } | null)?.roles?.some(
          (r) =>
            r === "admin" || r === "editor" || r === "sales" || r === "checkin",
        ),
      ),
  },
  hooks: {
    beforeOperation: [
      async ({ args, operation }) => {
        if (operation !== "create") return args;
        const { req } = args;
        const existing = await req.payload.find({
          collection: "users",
          limit: 1,
          depth: 0,
          pagination: false,
        });
        if (existing.totalDocs === 0) {
          args.data = { ...args.data, roles: ["admin"] };
        }
        return args;
      },
    ],
  },
  fields: [
    {
      name: "firstName",
      label: { de: "Vorname", en: "First name" },
      type: "text",
    },
    {
      name: "lastName",
      label: { de: "Nachname", en: "Last name" },
      type: "text",
    },
    {
      name: "roles",
      label: { de: "Rollen", en: "Roles" },
      type: "select",
      hasMany: true,
      options: [
        { label: { de: "Administrator", en: "Admin" }, value: "admin" },
        { label: { de: "Redakteur", en: "Editor" }, value: "editor" },
        { label: { de: "Kunde", en: "Customer" }, value: "customer" },
      ],
      defaultValue: ["customer"],
      saveToJWT: true,
      access: {
        update: ({ req: { user } }) =>
          Boolean(
            (user as { roles?: string[] } | null)?.roles?.includes("admin"),
          ),
      },
    },
  ],
};
