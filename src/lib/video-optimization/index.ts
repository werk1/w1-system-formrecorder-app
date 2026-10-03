/**
 * W1 Video Optimization — public API of the unit.
 *
 * - videoOptimizer: pure ffmpeg/ffprobe logic (no Payload imports)
 * - payloadVideoOptimization: Payload glue (hook orchestration, serial
 *   queue, status writes, backfill)
 *
 * See README.md in this folder and doc/w1-video-optimization.md.
 */

export {
  VIDEO_VARIANT_1080_SUFFIX,
  VIDEO_VARIANT_720_SUFFIX,
  VIDEO_POSTER_SUFFIX,
  isOptimizedVariantFilename,
  resolveVideoVariantFileNames,
  resolveMediaStaticDir,
  isVideoOptimizerAvailable,
  probeVideo,
  optimizeVideo,
  removeVideoVariants,
} from './videoOptimizer'
export type {
  VideoVariantFileNames,
  VideoProbeResult,
  OptimizeVideoResult,
} from './videoOptimizer'

export {
  W1_SKIP_VIDEO_OPTIMIZATION,
  maybeScheduleVideoOptimization,
  cleanupVideoVariants,
  backfillVideoOptimization,
  isVideoOptimizationBackfillRunning,
} from './payloadVideoOptimization'
export type {
  VideoOptimizationBackfillResult,
} from './payloadVideoOptimization'
