'use client'

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { UIStateSlice } from './ui-state/uiStateTypes'
import { createUIStateSlice } from './ui-state/uiStateSlice'

import { DeviceInfoSlice, createDeviceInfoSlice } from '@werk1/w1-system-device-info'
import {
  MediaManagerSlice,
  createMediaManagerSlice,
} from '@werk1/w1-system-media-manager'

type BoundStore = DeviceInfoSlice &
  UIStateSlice &
  MediaManagerSlice

export const useBoundStore = create<BoundStore>()(
  persist(
    (...a) => ({
      ...createDeviceInfoSlice(...a),
      ...createUIStateSlice(...a),
      ...createMediaManagerSlice(...a),
    }),
    {
      name: 'w1_core-ui-state', // unique name for the sessionStorage key
      // Only the language choice is kept, and only for the tab: everything else
      // in `ui` is transient or recomputed on load. Nothing stays in the browser.
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        ui: { currentLocale: state.ui.currentLocale },
      }),
      // `ui` is a nested object: merge the saved locale into it instead of
      // letting the one-field object replace the whole slice.
      merge: (persisted, current) => {
        const locale = (persisted as { ui?: { currentLocale?: typeof current.ui.currentLocale } } | undefined)?.ui
          ?.currentLocale
        return locale ? { ...current, ui: { ...current.ui, currentLocale: locale } } : current
      },
      // Earlier versions kept the whole `ui` slice and two debug flags in
      // localStorage; clear what is still on visitors' devices. The debug
      // flags are only touched in production, development keeps them.
      onRehydrateStorage: () => () => {
        try {
          const keys = ['w1_core-ui-state']
          if (process.env.NODE_ENV === 'production') keys.push('debug_panel', 'media_debug')
          for (const key of keys) localStorage.removeItem(key)
        } catch {
          // No storage (private mode): nothing to clear.
        }
      },
      skipHydration: true,
      version: 1,
    },
  ),
)
