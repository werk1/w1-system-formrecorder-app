import { MEDIA_STORAGE_ROOT } from '@/lib/media/mediaStorageRoot'
import { execFile } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

/**
 * Pure video optimization logic — no Payload imports.
 *
 * Unit documentation: src/lib/video-optimization/README.md
 * System documentation: doc/w1-video-optimization.md
 *
 * Every incoming video is normalized into delivery variants the W1 video
 * stack relies on for native-like start latency: H.264 high / yuv420p with
 * faststart, ~1s keyframe interval, capped bitrate per variant, plus a
 * first-frame poster as visual cover for every element lifecycle.
 *
 * This module is intentionally self-contained (node built-ins + ffmpeg/ffprobe
 * binaries only) so it can be lifted into an owning @werk1 package
 * without changes. Payload-specific orchestration lives in
 * src/lib/video-optimization/payloadVideoOptimization.ts.
 */

export const VIDEO_VARIANT_1080_SUFFIX = '.w1v1080.mp4'
export const VIDEO_VARIANT_720_SUFFIX = '.w1v720.mp4'
export const VIDEO_POSTER_SUFFIX = '.w1poster.jpg'

/**
 * Editorial bitrate ladder: the selectable max bitrate (Mbit/s) of the 1080
 * variant. The pipeline properties that matter for startup performance
 * (faststart, ~1s GOP, poster) are identical across all steps — only the
 * quality/bitrate budget differs. CRF, 720-variant budget and x264 preset
 * are derived per step.
 */
export const VIDEO_MAX_BITRATE_OPTIONS_MBIT = [2, 3, 4, 6, 8, 12] as const

export type VideoMaxBitrateMbit = (typeof VIDEO_MAX_BITRATE_OPTIONS_MBIT)[number]

export const DEFAULT_VIDEO_MAX_BITRATE_MBIT: VideoMaxBitrateMbit = 3

export const resolveVideoMaxBitrateMbit = (value: unknown): VideoMaxBitrateMbit => {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN

  return (VIDEO_MAX_BITRATE_OPTIONS_MBIT as readonly number[]).includes(parsed)
    ? (parsed as VideoMaxBitrateMbit)
    : DEFAULT_VIDEO_MAX_BITRATE_MBIT
}

const FFMPEG_TIMEOUT_MS = 10 * 60 * 1000
const FFPROBE_TIMEOUT_MS = 30 * 1000

export type VideoVariantFileNames = {
  variant1080: string
  variant720: string
  poster: string
}

export type VideoProbeResult = {
  width: number | null
  height: number | null
  durationMs: number | null
  frameRate: number | null
}

export type OptimizeVideoResult = VideoVariantFileNames & VideoProbeResult

const stripExtension = (filename: string) => filename.replace(/\.[^.]+$/, '')

export const isOptimizedVariantFilename = (filename: string) =>
  filename.endsWith(VIDEO_VARIANT_1080_SUFFIX) ||
  filename.endsWith(VIDEO_VARIANT_720_SUFFIX) ||
  filename.endsWith(VIDEO_POSTER_SUFFIX)

export const resolveVideoVariantFileNames = (
  sourceFilename: string,
): VideoVariantFileNames => {
  const base = stripExtension(sourceFilename)
  return {
    variant1080: `${base}${VIDEO_VARIANT_1080_SUFFIX}`,
    variant720: `${base}${VIDEO_VARIANT_720_SUFFIX}`,
    poster: `${base}${VIDEO_POSTER_SUFFIX}`,
  }
}

export const resolveMediaStaticDir = () =>
  process.env.W1_MEDIA_STATIC_DIR ?? MEDIA_STORAGE_ROOT

async function commandExists(command: string): Promise<boolean> {
  try {
    await execFileAsync(command, ['-version'], { timeout: FFPROBE_TIMEOUT_MS })
    return true
  } catch {
    return false
  }
}

export const isVideoOptimizerAvailable = async (): Promise<boolean> =>
  (await commandExists('ffmpeg')) && (await commandExists('ffprobe'))

const parseFrameRate = (value: unknown): number | null => {
  if (typeof value !== 'string') return null
  const match = value.match(/^(\d+)\s*\/\s*(\d+)$/)
  if (match) {
    const numerator = Number(match[1])
    const denominator = Number(match[2])
    if (numerator > 0 && denominator > 0) return numerator / denominator
    return null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export async function probeVideo(filePath: string): Promise<VideoProbeResult> {
  const { stdout } = await execFileAsync(
    'ffprobe',
    [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,avg_frame_rate',
      '-show_entries', 'format=duration',
      '-of', 'json',
      filePath,
    ],
    { timeout: FFPROBE_TIMEOUT_MS },
  )

  const parsed = JSON.parse(stdout) as {
    streams?: Array<{ width?: number; height?: number; avg_frame_rate?: string }>
    format?: { duration?: string }
  }

  const stream = parsed.streams?.[0]
  const durationSeconds = Number(parsed.format?.duration)

  return {
    width: typeof stream?.width === 'number' ? stream.width : null,
    height: typeof stream?.height === 'number' ? stream.height : null,
    durationMs:
      Number.isFinite(durationSeconds) && durationSeconds > 0
        ? Math.round(durationSeconds * 1000)
        : null,
    frameRate: parseFrameRate(stream?.avg_frame_rate),
  }
}

type VariantEncodeProfile = {
  /** Cap for the video's longer edge; never upscales. */
  maxLongEdge: number
  crf: number
  maxrate: string
  bufsize: string
  /** x264 preset: slower presets buy quality per bit at encode-time cost. */
  preset: 'medium' | 'slow'
}

type EncodeLadderStep = {
  variant1080: VariantEncodeProfile
  variant720: VariantEncodeProfile
}

// Note on the ~1s GOP (set in buildEncodeArgs): frequent keyframes are what
// make instant start and seek-to-0 cheap, but they cost quality per bit
// compared to typical NLE exports with long GOPs (which is why an NLE export
// at a lower bitrate can look better than the same content here). The higher
// ladder steps compensate with lower CRF, higher caps and the slower x264
// preset. CRF stays the primary control: quiet content remains small even on
// high steps, the cap only limits peaks.
const ENCODE_LADDER: Record<VideoMaxBitrateMbit, EncodeLadderStep> = {
  2: {
    variant1080: { maxLongEdge: 1920, crf: 24, maxrate: '2M', bufsize: '4M', preset: 'medium' },
    variant720: { maxLongEdge: 1280, crf: 25, maxrate: '1.2M', bufsize: '2.4M', preset: 'medium' },
  },
  3: {
    variant1080: { maxLongEdge: 1920, crf: 23, maxrate: '3M', bufsize: '6M', preset: 'medium' },
    variant720: { maxLongEdge: 1280, crf: 24, maxrate: '1.8M', bufsize: '3.6M', preset: 'medium' },
  },
  4: {
    variant1080: { maxLongEdge: 1920, crf: 22, maxrate: '4M', bufsize: '8M', preset: 'slow' },
    variant720: { maxLongEdge: 1280, crf: 23, maxrate: '2.4M', bufsize: '4.8M', preset: 'slow' },
  },
  6: {
    variant1080: { maxLongEdge: 1920, crf: 20, maxrate: '6M', bufsize: '12M', preset: 'slow' },
    variant720: { maxLongEdge: 1280, crf: 21, maxrate: '3M', bufsize: '6M', preset: 'slow' },
  },
  8: {
    variant1080: { maxLongEdge: 1920, crf: 19, maxrate: '8M', bufsize: '16M', preset: 'slow' },
    variant720: { maxLongEdge: 1280, crf: 20, maxrate: '4M', bufsize: '8M', preset: 'slow' },
  },
  12: {
    variant1080: { maxLongEdge: 1920, crf: 17, maxrate: '12M', bufsize: '24M', preset: 'slow' },
    variant720: { maxLongEdge: 1280, crf: 19, maxrate: '5M', bufsize: '10M', preset: 'slow' },
  },
}

const buildEncodeArgs = (
  sourcePath: string,
  targetPath: string,
  profile: VariantEncodeProfile,
  frameRate: number | null,
): string[] => {
  // Orientation-agnostic: cap the longer edge, keep aspect, never upscale.
  const scaleFilter =
    `scale='if(gt(iw,ih),min(${profile.maxLongEdge},iw),-2)'` +
    `:'if(gt(iw,ih),-2,min(${profile.maxLongEdge},ih))'`

  // ~1s GOP keeps playback start and seek-to-0 cheap; sc_threshold 0 stops
  // scene-cut keyframes from stretching the interval.
  const gopSize = Math.max(1, Math.round(Math.min(frameRate ?? 30, 30)))

  const args = [
    '-y',
    '-i', sourcePath,
    '-vf', scaleFilter,
    '-c:v', 'libx264',
    '-profile:v', 'high',
    '-preset', profile.preset,
    '-crf', String(profile.crf),
    '-maxrate', profile.maxrate,
    '-bufsize', profile.bufsize,
    '-g', String(gopSize),
    '-keyint_min', String(gopSize),
    '-sc_threshold', '0',
    '-pix_fmt', 'yuv420p',
    // Audio is kept (other blocks may play with sound) but normalized; the
    // video carousel plays muted regardless.
    '-c:a', 'aac',
    '-b:a', '96k',
    '-movflags', '+faststart',
  ]

  if (frameRate !== null && frameRate > 30.5) {
    args.push('-r', '30')
  }

  args.push(targetPath)
  return args
}

export type OptimizeVideoOptions = {
  mediaDir?: string
  maxBitrateMbit?: VideoMaxBitrateMbit
}

export async function optimizeVideo(
  sourceFilename: string,
  options: OptimizeVideoOptions = {},
): Promise<OptimizeVideoResult> {
  const mediaDir = options.mediaDir ?? resolveMediaStaticDir()
  const maxBitrateMbit = options.maxBitrateMbit ?? DEFAULT_VIDEO_MAX_BITRATE_MBIT
  const encodeProfiles = ENCODE_LADDER[maxBitrateMbit]

  const sourcePath = path.join(mediaDir, sourceFilename)
  await fs.access(sourcePath)

  const probe = await probeVideo(sourcePath)
  const fileNames = resolveVideoVariantFileNames(sourceFilename)

  const variant1080Path = path.join(mediaDir, fileNames.variant1080)
  const variant720Path = path.join(mediaDir, fileNames.variant720)
  const posterPath = path.join(mediaDir, fileNames.poster)

  await execFileAsync(
    'ffmpeg',
    buildEncodeArgs(sourcePath, variant1080Path, encodeProfiles.variant1080, probe.frameRate),
    { timeout: FFMPEG_TIMEOUT_MS },
  )

  await execFileAsync(
    'ffmpeg',
    buildEncodeArgs(sourcePath, variant720Path, encodeProfiles.variant720, probe.frameRate),
    { timeout: FFMPEG_TIMEOUT_MS },
  )

  // First-frame poster from the 1080 variant so poster and video start frame
  // match exactly.
  await execFileAsync(
    'ffmpeg',
    ['-y', '-i', variant1080Path, '-frames:v', '1', '-q:v', '3', posterPath],
    { timeout: FFPROBE_TIMEOUT_MS },
  )

  return { ...fileNames, ...probe }
}

export async function removeVideoVariants(
  sourceFilename: string,
  mediaDir: string = resolveMediaStaticDir(),
): Promise<void> {
  const fileNames = resolveVideoVariantFileNames(sourceFilename)
  await Promise.all(
    [fileNames.variant1080, fileNames.variant720, fileNames.poster].map(
      async (filename) => {
        try {
          await fs.unlink(path.join(mediaDir, filename))
        } catch {
          // Missing variants (never generated, already cleaned) are fine.
        }
      },
    ),
  )
}
