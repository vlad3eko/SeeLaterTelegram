# KinomanovNet — Instagram dynamic subtitles

Canonical source location in the application:

`server/global/engine/instagram/reel/subtitle/`

This module creates a timed ASS subtitle sidecar from the finalized clean Reel video. The caller passes the returned `assPath` to the existing video decorator so subtitles can be burned in the final video encode.

## Runtime dependency and font

Exact per-glyph positioning requires Fontkit:

```powershell
npm install fontkit@2.0.4
```

The font file is intentionally not included in this source archive. Put the supplied `Montserrat-ExtraBold.ttf` in the application at:

`public/instagram/fonts/Montserrat-ExtraBold.ttf`

Or set an absolute path in `.env`:

```ini
SUBTITLE_FONT_PATH=D:/JS/Apps/Practice/SeeLaterTelegram/public/instagram/fonts/Montserrat-ExtraBold.ttf
```

The same TTF must be available to libass during final rendering. The embedded family name must match `typography.fontName` (`Montserrat ExtraBold`). The renderer uses the TTF's own glyph metrics, cap height, advances and kerning to position each visible character. It intentionally disables ligatures so each character can receive its own event.

## Public API

```ts
import { prepareInstagramSubtitleTrack } from '#server/global/engine/instagram/reel/subtitle';

const subtitleTrack = await prepareInstagramSubtitleTrack({
  inputVideoPath: preparedInstagramPath,
  workDirectory: path.join(
    os.tmpdir(),
    'instagram-subtitles',
    `${keyTrailer}_${randomUUID()}`,
  ),
  modelPath: process.env.WHISPER_MODEL_PATH,
  whisperFfmpegPath: process.env.WHISPER_FFMPEG_PATH,
  ffprobePath: process.env.FFPROBE_PATH,
  fontFilePath: process.env.SUBTITLE_FONT_PATH,
  language: 'ru',
  queueSeconds: 10,
  useGpu: false,
  keepDebugArtifacts: true,
});

// Pass subtitleTrack.assPath directly to the existing ASS decorator option.
```

Each execution writes to its own run directory. The module does not create a separate subtitle MP4 as part of `prepareInstagramSubtitleTrack()`.

## Transcription FFmpeg and render FFmpeg are different

The Whisper transcription filter requires an FFmpeg build that exposes the `whisper` audio filter. Set `WHISPER_FFMPEG_PATH` to the tested Whisper-enabled binary. Do not assume the application's regular `ffmpeg-static` binary has that filter. The ASS renderer only needs an FFmpeg build with libass support.

Check the transcription binary with:

```powershell
& $env:WHISPER_FFMPEG_PATH -hide_banner -filters | Select-String whisper
```

## Layout and sizing

- The complete phrase is laid out before ASS generation, with a maximum of two rows.
- The layout builder uses character counts as a fast initial heuristic; immediately before rendering, a Fontkit-based final pass measures the actual glyph advances, visible bounds and kerning. If a row is too wide at the minimum permitted cap height, it automatically reflows the complete phrase at word boundaries into two balanced rows. The resulting `block.lines` is updated so `blocks.json` reflects the actual rendered layout.
- `fontkit` measures the actual Montserrat glyph advances, bounding boxes and kerning. No average character-width table is used for final positioning.
- **libass font size correction.** libass (like VSFilter) sizes a face so that its OS/2 `winAscent + winDescent` box equals `\fs`; it does not treat `\fs` as the em size. Fontkit layout uses em = font size. Every glyph event therefore emits `\fs = em × (winAscent + winDescent) / unitsPerEm` (hhea ascender/descender when OS/2 has no win metrics). Without this, Montserrat glyphs were drawn ~28% smaller than the positions computed for them, which produced very wide letter gaps and a real cap height below `minimumCapHeightPercentOfWidth`. `typography.fontSizeAtBase` is now the true em size; the default 21 keeps the visible letter size of the former 28. The reference video's size is about 28.
- Neon effect sizes (rims, tube lines, glows, plate softness) scale with the rendered glyph size (`neon.designFontSizeAtBase`), so small captions are not blurred by oversized glow.
- Uppercase cap height is kept at or above `minimumCapHeightPercentOfWidth` (3.2% by default), provided the phrase can fit within the configured safe width. An impossible line throws an explicit layout error rather than silently shrinking below the minimum.
- The row width is capped at 80% of the frame by `lineTrackingMaxWidthRatio`, leaving at least 10% side margins.
- A block split forced only by `maxWordsPerBlock` / `maxBlockDurationSeconds` is moved to the best word boundary (balanced, before a connector such as «И», at a speech gap or comma), so a phrase is no longer cut as «…НЕ СТАЛ БЫ ИХ» / «БИТЬ». Pause and punctuation boundaries are never moved.
- The upper and lower baselines are fixed at y=1048 and y=1108 on a 1080x1920 canvas. A one-line phrase always occupies the upper row; a two-line phrase uses both fixed rows. The vertical position is never re-centered.
- `fontScale` from block layout is respected, but the renderer rechecks the actual font metrics.
- The top row is predominantly white with at most one highlighted word. The lower row uses the phrase's neon accent. Neighboring blocks prefer sufficiently separated hues.

## Per-glyph ASS rendering

The renderer creates separate Dialogue events for individual glyphs. Every word has one of three **materials** (`render/neon-material.ts`), matched frame-by-frame to the reference video:

| Material | Used for | Look |
|---|---|---|
| `white` | non-highlighted words | Clean white letters, a faint soft contact shadow (no hard black stroke), a soft neutral plate. |
| `filled` | highlighted words (default) | Glossy neon: white-tinted core, saturated rim, top-lit specular sheen (stepped clip bands), wide + tight glow, plate tinted with the accent hue. |
| `tube` | every Nth highlighted run | Hollow neon tube: thin, almost-white line in the accent hue, saturated halo and wide glow built from the outline ring only, and a dark, strongly tinted plate that shows through the hollow letters. |

For each word/glyph it emits:

1. **One plate per word** — a soft rounded box (ASS vector drawing). Neutral (`neon.whitePlateColor`) under white words with the luminance-adaptive opacity (`glow.backingAlpha` / `glow.backingBrightAlpha`); tinted with the accent hue under neon words. It follows the row tracking (centre via `\move`, width via `\fscx`), fades while the exit wave crosses the word and finishes `exitBackingTailMs` after the last contour.
2. A wide glow (filled copy for `filled`, blurred outline ring for `tube`, faint bloom for `white`).
3. A tight glow / tube halo.
4. The glyph: white letter, glossy neon body + rim, or the tube line — followed by a separate contour-only Phase B event that continues exactly the contour of the Phase A event.
5. `filled` only: the specular sheen bands.

Plates of a block occupy their own layers below every glyph layer of that block, so a lower-row plate can never cover upper-row letters. A plate fades together with its word: it starts with the word's first exit Phase A and is front-loaded (`neon.plateFadeAccel`), so no empty box is left behind while only thin contours remain.

### Neon style selection

- `neon.styleMode: 'mixed'` (default) renders every `tubeEveryNthRun`-th (default 4th) highlighted run (starting at `tubeRunOffset`) as a tube and the rest as filled neon. A run is a sequence of adjacent highlighted words with the same colour on one row; one run never mixes styles.
- `'filled'` or `'tube'` forces one style everywhere.
- A key phrase can force its style: `{ text: 'ЯВИЛСЯ ИМ', color: '#2BFF5A', style: 'tube' }`.
- The resolved style is written to `word.neonStyle`, so `blocks.json` shows what was rendered.
- Dark accents (blue, violet, red) automatically receive a whiter core and tube line, so every hue reads equally bright (replaces the former fixed "cool neon" list).
- `neon.outlineSizeCompensation` shrinks neon glyphs by half of their outside rim/line so neon and white words keep the same visual cap height.

The row's horizontal tracking is shared across every glyph in the row. Glyphs are positioned from exact Fontkit metrics and move symmetrically away from the row center at a constant speed. This is the per-glyph equivalent of parent-level letter spacing; each glyph does not calculate its own independent speed. The line's tracking begins with the first visible word, not with the first word's exit.

### Word timings snapped to the voice (`transcription/voice-snap.ts`)

Recogniser word timestamps (Whisper and Gemini alike) absorb every pause into the neighbouring words: the word after a pause starts early, the last word before it is stretched over it. Captions then appear 1–2 s too early or stay after the voice has stopped (measured: `НО МЫ ЖЕ ВСЕ ДЕТИ` 11.98 s vs voice 13.45 s; `ВЫ НЕ ДЕТИ` until 17.42 s vs voice end 16.25 s).

After transcription the audio is analysed once (voice envelope: band-passed mid channel minus side channel, so centred speech stays and wide music is reduced). At every silence of at least 0.25 s that follows a punctuated word, that word is cut at the start of the silence and the words after it start at the voice onset; clumps of words with one shared start are spread over natural word durations. Words are moved only at such boundaries, never inside a sentence, by at most 2.5 s. `REEL_SUBTITLE_VOICE_SNAP=off` disables it; a failure keeps the recogniser's timestamps.

### Pairing sentences into two rows (`layout/build-subtitle-blocks.ts`)

Two neighbouring **complete** sentences are shown as one block of two rows when `layout.pairPhrases` is on (default): each sentence keeps its own row, e.g. `НО МЫ ЖЕ ВСЕ ДЕТИ` / `ВЫ НЕ ДЕТИ`, and both rows leave together.

- Both sentences must fit one row each (`maxCharsPerLine`), the pause between them is at most `pairMaxGapSeconds` (0.8 s), and both are spoken within `pairMaxSpanSeconds` (6 s).
- Fragments are never paired: a sentence cut by the word/duration limit from its neighbour (`ТАКОЕ ЧУВСТВО … ЗАГОНЯЮТ` / `В ГОЛОВУ ГВОЗДЬ`) stays with that neighbour.
- Sentences are never paired across a long silence, so a row does not wait on screen for the next one.
- A paired block keeps its rows exactly as the sentences; other blocks are split into rows by balanced length as before.

### Exit wave

- A phrase leaves `exitNoNextDelayMs` (500 ms) after its last word was **spoken** (timer), so nothing hangs on screen waiting for the next phrase. When the next phrase is about to appear (its displayed first word minus `exitTriggerLeadMs`, 600 ms) the exit starts earlier, so the hand-over stays in step.
- It never starts earlier than `phraseMinHoldMs` (600 ms) after the phrase's last word appeared, so a row cannot start fading while the other row is still being written.
- The nominal left-to-right character step is `exitWaveStepMs` (33.333 ms, one 30 fps frame).
- Phase A monotonically fades the solid fill, the sheen and both glow layers over `exitPhaseADurationMs` (300 ms), leaving the contour visible (white words: the fill fades to translucent grey and the dark contact edge remains, as in the reference; filled neon: the saturated rim; tubes: the tube line).
- Phase B fades the contour over `exitPhaseBDurationMs` (260 ms), blurs the glyph itself to `exitGlyphBlurPx` and moves it upward by `exitGlyphShiftPx`.
- At 30 fps, the phase gap is 9 frames and the character wave step is one frame (33.333 ms).
- Speech-end and entrance guards can move a glyph's scheduled exit later when its source word timing requires it. Remaining glyphs preserve the left-to-right step rather than collapsing onto one timestamp.
- A new row waits until old glyphs under it have faded to `exitCollisionMaxOpacity` (0.3, plus `exitWordClearanceMs`), so old and new letters are not mixed on screen. With the 1 s lead this costs only 0.1–0.3 s of the lead. Set it to 1 for the reference behaviour (new letters appear on top of fading old ones as soon as they start to fade).

### Entrance — row flow (`render/phrase-flow.ts`)

A caption row appears **as a whole**, not word by word: every word of a row gets the same earliest display time, `entryLeadMs` (1000 ms) before the first word of the row is spoken. The row then lights up as one smooth left-to-right sweep, letters at `entryLetterStepMs` (33.3 ms = one letter per 30 fps frame, the mirror of `exitWaveStepMs`), so it comes in the same way it leaves. Rows never appear out of order.

- The result is `word.displayStart` (also in `blocks.json`). Collision safety and the global 3-frame word gap are applied on top; `word-order.json` shows `displayStart`, the actual `firstAppearanceMs` and `leadMs` (positive = ahead of the voice) for every word.
- A word stays at least as long as it is spoken, counted from when it was shown, so the lead never shortens reading time.
- The backing, glow and glyph start on the same first-visible frame; no halo or dark backing leads the glyph.
- The first glyph frame is visible at approximately 15% opacity. White words become solid over `enterMs` (150 ms by default, about 4–5 frames at 30 fps, like the reference).
- Highlighted neon words **ignite** over `neonFillDurationMs` (500 ms by default): `filled` glyphs go from an unlit dim tint through a short white-hot flash (`neon.igniteFlashAt`, `neon.igniteFlashWhiteMix`) to the settled glossy core while the sheen fades in; `tube` glyphs light up from a dim, blurred line to the bright tube line. This matches the reference, where neon words appear dim and then switch on. Tube lines and glows are fully lit at `neon.igniteReadableAt` × `neonFillDurationMs` (~150 ms), so a highlighted word is readable as soon as a white one; the colour settle continues afterwards.

ASS alpha is inverse opacity: `\\alpha&H00&` is fully visible and `\\alpha&HFF&` is fully transparent.

## Transcription timing

Captions are scheduled from word timestamps plus a fixed lead, so the timestamps must follow the voice. Gemini returns better text but drifting word timestamps; with `REEL_SUBTITLE_TRANSCRIPTION_PROVIDER=gemini` the module therefore also runs the local Whisper filter and re-times the Gemini words with Whisper timestamps (`transcription/retime-words.ts`). Set `REEL_SUBTITLE_GEMINI_TIMING=gemini` to disable this. The Whisper pass needs `WHISPER_MODEL_PATH` and the Whisper-enabled FFmpeg, as for the Whisper provider.

## Gemini requests per clip

With `REEL_SUBTITLE_TRANSCRIPTION_PROVIDER=gemini` one clip costs one transcription request (automatic language detection, speaker labels) and then, only when they can help: up to `REEL_SUBTITLE_COVERAGE_MAX_CLIPS` coverage requests (default 3), one transcript-check request, up to `REEL_SUBTITLE_VERIFY_MAX_CLIPS` clips for speech the check found missing (default 2) and one translation request. A typical clip needs 2–3 requests; the worst case is 1 + 3 + 1 + 2 + 1. Order: transcription → re-timing → coverage → transcript check → translation.

- **Translation.** The language is not asked for separately: the transcriber labels every word, and a sentence counts as foreign when most of its words carry another language (or Latin letters stand in a Cyrillic transcript). Only foreign sentences are sent, all in one request, with low thinking effort. No foreign sentence means no request. One or two foreign words in an otherwise native clip (`OK`, a brand) are not worth one either: below `REEL_SUBTITLE_TRANSLATE_MIN_WORDS` foreign words (default 3) that are also under half of the clip, nothing is sent. A mostly foreign clip is always translated. The `[SUBTITLE] Foreign speech` log line shows `dominantLanguage`, `requested` and, when nothing was sent, `skipped`.
- **Coverage.** A stretch of voice with no transcribed word is sent again only when it is at least `REEL_SUBTITLE_COVERAGE_MIN_SECONDS` long (default 1.8 s including the 0.4 s padding on each side, about a second of voice). Shorter ones are breaths, laughter and noise. `0` sends every range; `REEL_SUBTITLE_COVERAGE_PASS=off` skips the pass. The `[SUBTITLE] Skipped speech re-transcribed` line shows `requested` and `skippedShort`.
- **Transcript check.** The second look. The audio (inline, no upload) and the finished text go to a model together (`REEL_SUBTITLE_VERIFY_MODEL`, default `gemini-3.8-flash`, falling back to `REEL_SUBTITLE_VERIFY_FALLBACK_MODEL`, default `gemini-3.5-flash-lite`), which answers with the problems only: a misheard word or misspelled name (`wrong`), a line that is not spoken (`extra`), audible speech without a line (`missing`). The title and overview of the film are passed as context for names. Nothing the model says is taken on trust: a rewrite must name the line, keep its script and stay close to the original (no paraphrase), and only the words change, never timing, speaker or language; a dropped line must lie on nearly silent audio; a missing line must lie on real voice and on words the transcript lacks; when the model disagrees with more than 40 % of the lines (and more than two) all of it is ignored. Each missing stretch is transcribed again as a short clip (the third look), except stretches the coverage pass already sent. `REEL_SUBTITLE_VERIFY=report` asks and logs what it would change without changing anything, `off` disables the check, `REEL_SUBTITLE_VERIFY_MAX_CLIPS=0` keeps the corrections but sends no clips. Clips under 3 words are not checked. The `[SUBTITLE] Transcript check` line shows `changes`, `removedLines`, `missing` and `rejected`; a failed check keeps the transcript as it was.
- **Translation models.** `REEL_SUBTITLE_TRANSLATE_MODEL` is tried first (up to three attempts at 1 s and 2.5 s pauses on a temporary failure), then the models of `REEL_SUBTITLE_TRANSLATE_FALLBACK_MODEL` (comma separated, default `gemini-3.5-flash-lite`, `none` for no fallback).

## Local preview without transcription

Use saved word timings to test layout and animation without another Whisper or Gemini request:

```powershell
node --env-file=.env --import tsx .\server\global\engine\instagram\reel\subtitle\scripts\preview.ts `
  --input ".\path\to\clean.mp4" `
  --words-json ".\tmp\subtitle-run\words.json" `
  --font-file ".\public\instagram\fonts\Montserrat-ExtraBold.ttf" `
  --out-dir ".\tmp\subtitle-preview" `
  --fonts-dir ".\public\instagram\fonts" `
  --preview-start 0 `
  --preview-seconds 8 `
  --preview-fps 30
```

`--preview-fps 30` exports every frame for a 30 fps source. Use `--preview-fps 2` only for a sparse contact sheet. The script applies the ASS filter before trimming the requested preview interval, preserving original video-relative subtitle timestamps.

For real transcription, provide `--model` and the Whisper-enabled `--ffmpeg`, or set the corresponding environment variables. Set `REEL_SUBTITLE_TRANSCRIPTION_PROVIDER=gemini` only when you intend to call the Gemini transcription API; fixture/words-json previews do not call Gemini.

## Global word order and adaptive backing

All words are placed on one global timeline ordered by source `(start, end, line, idx)`. The global list is sorted by `(start, end, line, idx)`. The first visible frame of each word must be at least `entryWordMinGapFrames` (3 by default) after the previous word, regardless of row. Individual characters inside a word build up left-to-right at `entryLetterStepMs`; the row sweep comes from the row flow. The generator writes `word-order.json`; the preview renders the MP4 and then validates those event-frame numbers and the two named regression pairs. This is an ASS-event timing check, not OCR/pixel recognition.

When the source video is supplied, the renderer samples a low-resolution grayscale version at 4 fps and measures mean luma in each word's Fontkit-derived bounds. If mean luma exceeds `backingBrightnessThreshold` (0.45), that word receives the stronger dark backing (`backingBrightAlpha`, about 65% opacity); otherwise it uses the normal backing (about 51%). This analysis runs once per source video, not once per word.

The final ASS Dialogue end is measured directly. `prepareInstagramSubtitleTrack()` returns `requiredVideoTailSeconds`, and both preview and `burnInstagramSubtitles()` put `tpad` before `ass` so the final phrase has time to complete its exit rather than freezing mid-word. The production decorator outside this folder must also consume `requiredVideoTailSeconds` and put its own `tpad` before its ASS filter; this subtitle package cannot alter an external decorator automatically.

## Debug artifacts

When `keepDebugArtifacts` is enabled, the run directory contains:

- `whisper-word-timestamps.ndjson`
- `words.json`
- `blocks.json`
- `sound-cues.json`
- `subtitles.ass`
- `word-order.json` — global first-appearance frame schedule across both rows, including the `ТЕБЯ`/`НИ` and `ПОКУПАТЕЛЬ`/`ПЛАТИТ` regression checks.

These are the most useful files for diagnosing word timestamps, line layout, per-glyph positions and animation timing.

## Limits

ASS/libass can approximate smoke using a blurred glyph, a colored halo and a delayed dark backing. It cannot create turbulent smoke particles or natural fluid motion. That requires a separate RGBA-frame renderer and compositing stage.
