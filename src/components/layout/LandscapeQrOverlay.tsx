'use client'

import Image from 'next/image'
import QRCode from '@/assets/qr-code.png'
import { useW1FullscreenElement } from '@/hooks'
import { useBoundStore } from '@/stores/boundStore'
import styles from '@/styles/modules/landingpage/landingpage.module.css'

export function LandscapeQrOverlay() {
  const isPhoneLandscape = useBoundStore((state) => state.device.is_devicePL)
  const isReady = useBoundStore((state) => state.device.isReady)
  const suppressLandscapeOverlay = useBoundStore((state) => state.ui.suppressLandscapeOverlay)
  const { isFullscreen } = useW1FullscreenElement()

  if (!isReady || !isPhoneLandscape || isFullscreen || suppressLandscapeOverlay) return null

  return (
    <div className={styles.landscapeContainer}>
      <Image
        src={QRCode.src}
        alt="QR Code"
        width={250}
        height={250}
        priority
      />
    </div>
  )
}
