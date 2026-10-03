"use client";

import { useGSAPRuntime } from "@/components/client-layout/GSAPRuntimeContext";
import {
  useW1GSAPScrollTrigger,
  type W1GSAPScrollTriggerOptions,
} from "@werk1/w1-system-gsap-scroll";
import { useId, useMemo } from "react";

const DEFAULT_SECTION_SCROLL_TRIGGER: Readonly<W1GSAPScrollTriggerOptions> = {
  start: "top 80%",
  end: "bottom 20%",
  markers: false,
  showDebounceMs: 400,
  hideDebounceMs: 150,
};

export function useManagedSectionScrollTrigger(
  idPrefix: string,
  overrides?: Partial<W1GSAPScrollTriggerOptions>,
) {
  const { isScrollTriggerReady } = useGSAPRuntime();
  const sectionId = useId().replace(/:/g, "");

  const options = useMemo(
    () => ({
      ...DEFAULT_SECTION_SCROLL_TRIGGER,
      ...(overrides ?? {}),
      id: overrides?.id ?? `${idPrefix}-${sectionId}`,
    }),
    [idPrefix, overrides, sectionId],
  );

  return useW1GSAPScrollTrigger(options, isScrollTriggerReady);
}
