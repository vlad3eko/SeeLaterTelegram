/**
 * Public API for the existing Instagram Reel pipeline.
 *
 * Use prepareInstagramSubtitleTrack() to create an ASS sidecar and pass its
 * assPath to decorateInstagramVideo(). Do not render a separate subtitle MP4:
 * decorateInstagramVideo already performs the final H.264 encode.
 */
export { prepareInstagramSubtitleTrack } from './prepare-subtitle-track.js';
export { prepareSaveCtaTrack, chooseSaveCtaStarts, SAVE_CTA_VISIBLE_SECONDS } from './cta.js';
export type { SaveCtaOptions, SaveCtaResult, SpeechWindow } from './cta.js';
export {
  resolveSubtitleConfig,
  defaultSubtitleConfig,
  squareSubtitleOverrides,
  getFormatSubtitleOverrides,
  mergeSubtitleOverrides,
} from './config.js';
export { transcribeInstagramAudio, transcribeInstagramTranscript } from './transcription/whisper.js';
export { parseWhisperNdjson, parseWhisperTranscriptNdjson } from './transcription/parse-whisper-json.js';
export { buildInstagramSubtitleBlocks } from './layout/build-subtitle-blocks.js';
export { generateInstagramSubtitleAss, getMaximumDialogueEndSeconds } from './render/generate-ass.js';
export type { SubtitleAssGenerationOptions } from './render/generate-ass.js';
export { burnInstagramSubtitles } from './render/burn-subtitles.js';
export { probeInstagramVideo } from './utils/probe-video.js';
export type * from './types.js';
