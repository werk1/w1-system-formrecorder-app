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
      name: 'w1_core-ui-state',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        ui: state.ui,
      }),
      skipHydration: true,
      version: 1,
    },
  ),
)
