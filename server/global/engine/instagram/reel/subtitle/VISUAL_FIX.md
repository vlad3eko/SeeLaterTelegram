# Subtitle rendering behavior — current version

## Word entrance and order

- Row flow: a row appears as a whole, `entryLeadMs` (1000 ms) before its first word is spoken, as a smooth left-to-right sweep (one letter per frame); it fades out `exitNoNextDelayMs` (500 ms) after its last word was spoken.
- All words from both rows use one global first-appearance schedule sorted by `(start, end, line, idx)`.
- The first visible frame of each word is at least 3 source-video frames after the previous word, even when the next word is on the other row.
- New words may appear on top of fading old letters; a phrase is held 600 ms after its last word before its exit wave.
- Backing, glow and glyph start on the same first-visible frame. The first glyph frame is about 15% visible; white words reach full opacity within 150 ms. Highlighted neon words ignite over `neonFillDurationMs`: dim → white-hot flash → glossy colour (filled), or dim → bright line (tube).

## Exit

- Exit trigger for a phrase is the next phrase's source start minus 600 ms. For the final phrase it is the last spoken word end plus 200 ms.
- Phase A (300 ms) monotonically fades fill and both glow layers, leaving the contour.
- Phase B (260 ms) fades the contour, applies glyph blur and moves it upward.
- The exit lead is never applied to incoming word timestamps.

## Layout and contrast

- Rows use fixed baseline anchors y=1048 and y=1108 on a 1080x1920 canvas; a one-row phrase always uses the upper row.
- Actual Fontkit glyph metrics and kerning are used. Rows are capped at 80% width with at least 10% side margins.
- Backing opacity is selected per word from source-frame mean luma. Bright regions use approximately 65% black backing; other regions use approximately 51%.
- Dark accents (blue/violet/red) automatically receive a whiter core and tube line.
- Materials: `white` (clean letters, soft contact shadow, neutral plate), `filled` (glossy neon with sheen, rim, glow, tinted plate), `tube` (hollow neon tube over a dark tinted plate). See README → Per-glyph ASS rendering.

## Validation and final video tail

The preview writes `word-order.json`, renders the MP4, then verifies the first-appearance frame sequence and the `ТЕБЯ`/`НИ` and `ПОКУПАТЕЛЬ`/`ПЛАТИТ` pairs. `word-order-render-check.json` records the result. This is an ASS-event frame-timing check, not OCR/pixel recognition.

The maximum end time is parsed from generated ASS Dialogue events. `prepareInstagramSubtitleTrack()` returns `requiredVideoTailSeconds`; `preview.ts` and `burn-subtitles.ts` pad the source before the ASS filter so the last phrase can finish its exit. An external production decorator must consume that returned tail as well.

## ASS limitations

The blurred glyph, colored glow and dark backing approximate smoke but do not simulate turbulent particles. Natural smoke turbulence would require a separate RGBA frame renderer and FFmpeg compositing.
