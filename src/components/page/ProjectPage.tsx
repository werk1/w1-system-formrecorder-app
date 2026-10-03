import type { ResolvedPageSection } from "@/lib/pages/types";
import type React from "react";
import { SectionRenderer } from "./SectionRenderer";

type ProjectPageProps = {
  sections: ResolvedPageSection[];
  navigation?: React.ReactNode;
};

export function ProjectPage({ sections, navigation }: ProjectPageProps) {
  return (
    <>
      {/* TODO: Add navigation back when needed */}
      {/* {navigation} */}
      {sections.map((section) => (
        <SectionRenderer key={section.key} section={section} />
      ))}
    </>
  );
}
