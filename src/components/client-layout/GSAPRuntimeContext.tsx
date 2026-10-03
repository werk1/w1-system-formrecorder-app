"use client";

import { createContext, useContext } from "react";

type GSAPRuntimeContextValue = {
  isGestureReady: boolean;
  isScrollTriggerReady: boolean;
};

const defaultValue: GSAPRuntimeContextValue = {
  isGestureReady: false,
  isScrollTriggerReady: false,
};

const GSAPRuntimeContext = createContext<GSAPRuntimeContextValue>(defaultValue);

type GSAPRuntimeProviderProps = {
  children: React.ReactNode;
  value: GSAPRuntimeContextValue;
};

export function GSAPRuntimeProvider({
  children,
  value,
}: GSAPRuntimeProviderProps) {
  return (
    <GSAPRuntimeContext.Provider value={value}>
      {children}
    </GSAPRuntimeContext.Provider>
  );
}

export function useGSAPRuntime() {
  return useContext(GSAPRuntimeContext);
}
