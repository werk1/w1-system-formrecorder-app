"use client";

import { useBoundStore } from "@/stores/boundStore";
import {
  getCSSVariableNumber,
  getCSSVariableString,
} from "@/styles/utils/getCSSVariables";
import type { DeviceIdentifier } from "@werk1/w1-system-device-info";
import { useEffect, useMemo, useState } from "react";

type DeviceConfig = {
  baseName: string;
  deviceVariants?: DeviceIdentifier[];
  prefix?: string;
  defaultValue?: number;
};

const DEFAULT_DEVICE_VARIANTS: DeviceIdentifier[] = [
  "PPSM",
  "PP",
  "PPXL",
  "PLSM",
  "PL",
  "PLXL",
  "D",
  "DS",
  "DM",
  "DL",
  "TP",
  "TL",
];

/**
 * Ermittelt eine numerische CSS-Massvariable passend zum aktuellen Device-State.
 *
 * Der Hook ist die Bruecke zwischen dem App-CSS und JavaScript-Layoutlogik:
 * `w1-system-device-info` sagt, welches Device aktiv ist, und dieser Hook liest
 * dazu die passende CSS-Variable aus dem App-Stylesheet. Aus
 * `baseName: 'headerHeight'` und Phone Portrait wird zum Beispiel zuerst
 * `--measure_headerHeight_devicePP` gelesen. Falls kein passender
 * device-spezifischer Wert existiert, faellt der Hook auf
 * `--measure_headerHeight` zurueck.
 *
 * Wichtige Details:
 * - `0px` ist ein gueltiger device-spezifischer Wert.
 * - Small/XL-Phones koennen auf ihre Basisvariante zurueckfallen
 *   (`PPSM -> PP`, `PPXL -> PP`, `PLSM -> PL`, `PLXL -> PL`).
 * - Desktop-Groessen fallen auf die Desktop-Basis zurueck
 *   (`DS -> D`, `DM -> D`, `DL -> D`).
 * - Tablets koennen auf Desktop-Stile zurueckfallen
 *   (`TP -> DS -> D`, `TL -> DL -> D`), wenn diese Varianten in
 *   `deviceVariants` erlaubt sind.
 * - Der Hook gehoert bewusst in den App-Host, nicht in
 *   `@werk1/w1-system-device-info`, weil er App-CSS-Variablennamen kennt.
 */
export function useResponsiveDimension({
  baseName,
  deviceVariants = DEFAULT_DEVICE_VARIANTS,
  prefix = "--measure_",
  defaultValue = 0,
}: DeviceConfig) {
  const { device } = useBoundStore();
  const {
    viewportWidth,
    viewportHeight,
    is_devicePP,
    is_devicePL,
    is_devicePPSM,
    is_devicePPXL,
    is_devicePLSM,
    is_devicePLXL,
    is_deviceD,
    is_deviceDS,
    is_deviceDM,
    is_deviceDL,
    is_deviceTP,
    is_deviceTL,
  } = device ?? {};
  const [dimension, setDimension] = useState(defaultValue);
  const deviceVariantsKey = deviceVariants.join("|");

  const allowedVariants = useMemo(
    () =>
      new Set<DeviceIdentifier>(
        deviceVariantsKey
          ? (deviceVariantsKey.split("|") as DeviceIdentifier[])
          : [],
      ),
    [deviceVariantsKey],
  );

  useEffect(() => {
    const getCSSNumberIfDefined = (variableName: string): number | null => {
      const rawValue = getCSSVariableString(variableName);
      if (!rawValue || rawValue.trim() === "") return null;

      return getCSSVariableNumber(variableName);
    };

    const getDeviceMeasure = (candidateDevices: DeviceIdentifier[]) => {
      let hasAllowedCandidate = false;

      for (const candidateDevice of candidateDevices) {
        if (!allowedVariants.has(candidateDevice)) continue;
        hasAllowedCandidate = true;

        const deviceSpecific = getCSSNumberIfDefined(
          `${prefix}${baseName}_device${candidateDevice}`,
        );
        if (deviceSpecific !== null) return deviceSpecific;
      }

      if (!hasAllowedCandidate) return null;

      return getCSSNumberIfDefined(`${prefix}${baseName}`);
    };

    const resolveDeviceCandidates = (): DeviceIdentifier[] | null => {
      if (is_deviceDS) return ["DS", "D"];
      if (is_deviceDM) return ["DM", "D"];
      if (is_deviceDL) return ["DL", "D"];
      if (is_deviceD) return ["D"];
      if (is_devicePPSM) return ["PPSM", "PP"];
      if (is_devicePPXL) return ["PPXL", "PP"];
      if (is_devicePP) return ["PP"];
      if (is_devicePLSM) return ["PLSM", "PL"];
      if (is_devicePLXL) return ["PLXL", "PL"];
      if (is_devicePL) return ["PL"];
      if (is_deviceTP) return ["TP", "DS", "D"];
      if (is_deviceTL) return ["TL", "DL", "D"];

      return null;
    };

    const candidateDevices = resolveDeviceCandidates();
    if (!candidateDevices) {
      setDimension(defaultValue);
      return;
    }

    const newDimension = getDeviceMeasure(candidateDevices);
    setDimension(newDimension ?? defaultValue);
  }, [
    allowedVariants,
    baseName,
    defaultValue,
    prefix,
    viewportWidth,
    viewportHeight,
    is_devicePP,
    is_devicePL,
    is_devicePPSM,
    is_devicePPXL,
    is_devicePLSM,
    is_devicePLXL,
    is_deviceD,
    is_deviceDS,
    is_deviceDM,
    is_deviceDL,
    is_deviceTP,
    is_deviceTL,
  ]);

  return dimension;
}
