# Subtitle update 5 — Gemini text with Whisper timing

## Diagnosis

The latest preview was transcribed by Gemini (`REEL_SUBTITLE_TRANSCRIPTION_PROVIDER=gemini`), the one before by Whisper. Compared word by word on the same audio:

- Whisper starts match the voice within ~0.1 s for the whole clip.
- Gemini starts drift early as the clip goes on: ~0.2 s at the start, 0.5–1.26 s at the end (mean 0.42 s), and the first word of a phrase is glued to the end of the previous phrase ("Благодарим" 25.95 s, voice 26.6 s; "За" 37.93 s, voice 38.6 s).
- The renderer adds a fixed lead to the word timings, so drifting timings turned a 0.55 s lead into 2–3 s at the end. No single entryLeadMs can fix that.

## Changed

- New `transcription/retime-words.ts`: aligns the Gemini words with the Whisper words (fuzzy weighted LCS on normalised tokens) and gives matched words the Whisper start/end; unmatched words are placed between their matched neighbours. On the preview: 57 of 63 words matched.
- `transcription/whisper.ts`: with the Gemini provider, a local Whisper pass runs only for timing and the Gemini text is re-timed (`<output>.whisper-timing.ndjson` is kept for diagnosis). `REEL_SUBTITLE_GEMINI_TIMING=gemini` keeps Gemini timestamps; any Whisper failure or too few matches falls back to Gemini timestamps with a warning.

---

# Subtitle update 4 — consistent lead to the end of the video

## Diagnosis of the new preview

- `word-order.json` and the rendered frames agree to the frame: every word appeared 0.17–0.77 s before its Whisper start, also at the end.
- Whisper starts were checked against the voice (centre-channel isolation of the stereo track removes most of the music): phrase starts match the voice within ~0.1 s, also at 28–39 s. So there is no timestamp drift.
- Why it still read as late: the later phrases are short (2–3 words) and usually contain a neon word. Tube lines and glows reached full brightness only after 250–300 ms, which ate most of the 0.4 s lead. The first seconds use a long phrase whose even beat builds up extra lead, so they felt right.

## Changed

- `entryLeadMs` 400 → 800 ms (your estimate of the reference).
- New `neon.igniteReadableAt` (0.3): tube lines and glows are fully lit after ~150 ms; the colour settle continues.
- Result on your words.json: every phrase starts 0.8 s before the voice (first phrase at video start: 0.2 s); all words 0.2–1.17 s ahead, median 0.8 s.

---

# Subtitle update 3 — even phrase flow ahead of the voice

Diagnosis of the 40 s preview (`word-order.json`, `blocks.json`, rendered frames) against the reference (per-word light-up frames and a spectrogram of its audio).

## Measured

- Reference: words light up whole (letters within 1–2 frames) at an even 8–12-frame beat, row after row; captions run 0–0.6 s (≈0.3 s average) ahead of the voice.
- Previous render: every word late by +0.27 s median, up to +1.0 s (new words waited until old letters at the same place were below 30% opacity + 300 ms); letters typed one frame each, then a pause until the next Whisper timestamp; a phrase started fading while its second row was still being written; the greedy 10-word limit cut «…НЕ СТАЛ БЫ ИХ» / «БИТЬ».

## Implemented

- New `render/phrase-flow.ts`: even word beat per flow run (split at speech pauses), `entryLeadMs` ahead of the voice, clamped beat, optional length weighting. Writes `word.displayStart`.
- Letters build a word at `entryLetterStepMs` (two per frame) instead of one frame per glyph.
- Collision rule: a new word may overlap old letters once they start fading (`exitCollisionMaxOpacity: 1`, clearance 60 ms) — as in the reference.
- Exit wave follows the next phrase's displayed start and is held `phraseMinHoldMs` after the phrase's last word; glyph minimum display = spoken duration counted from when it appeared.
- Forced block splits are rebalanced to the best boundary.
- Global word-order enforcement compares whole frames (letter steps are sub-frame).
- `word-order.json` now includes `displayStart` and `leadMs` per word.
- Result on your words.json: every word 167–767 ms ahead of the voice (median 400 ms), in-phrase beat 5–13 frames, no word delayed by more than 100 ms beyond the flow.

---

# Subtitle update 2 — fixes found on the real Montserrat render

Analysis of the 80 preview frames rendered with the real Montserrat ExtraBold.

## Fixed

1. **Wide letter gaps / undersized letters (pre-existing).** libass scales a face so that OS/2 `winAscent + winDescent` equals `\fs`, while fontkit positions glyphs with em = font size. For Montserrat that box is ~1.38 em, so glyphs were drawn ~28% smaller than their computed slots (measured: real cap height 14 px instead of the computed 19.6 px at 720×1280; gaps 8–12 px instead of ~3 px). Glyph events now emit `\fs = em × assFontSizePerEm` (`getLibassFontMetrics`). `fontSizeAtBase` 28 → 21 keeps the visible letter size you had chosen while restoring natural letter spacing; the reference video's size is about 28.
2. **Glow and rims too large on small captions.** Neon effect sizes now scale with the rendered glyph em (`neon.designFontSizeAtBase`, default 24) instead of the canvas only. Line/rim widths have a minimum so they never disappear.
3. **Empty plates after the letters had gone.** The word plate now fades from the word's first Phase A, front-loaded (`neon.plateFadeAccel`), and is transparent when the last contour ends.
4. **White-word exit.** The reference fades white letters to translucent grey with a dark edge. The light "ghost" outline is replaced by the dark contact contour (`neon.whiteExitContourAlpha`).
5. **Gloss and plate vertical placement.** Caps are not centred on the `\an5` anchor; the cap-centre offset from the font metrics is now used for the sheen bands, the plates and background luminance sampling.
6. **Dark accents too pale.** Less white is added to the body of red/blue/violet filled neon.
7. Tube share closer to the reference: every 4th neon run (was 3rd).

---

# Subtitle update — neon materials matched to the reference (glossy fill, hollow tubes, word plates)

## Why

The reference neon letters are not "fill + outline": they are either glossy filled neon (lit core, saturated rim, top-lit sheen, soft glow, hue-tinted plate) or hollow neon tubes (thin bright line over a dark tinted plate). White words have no black stroke; they sit on a soft neutral plate. These looks were measured pixel-by-pixel on the reference frames and rebuilt with libass layers.

## Implemented

- New `render/neon-material.ts`: pure material model — palette derivation from one accent colour (core, rim, flash, dim, tube line, plate tint, exit contour), luminance-aware boost for dark accents, deterministic tube/filled run assignment, optional outline-size compensation.
- `generate-ass.ts`: glyph event builders rewritten per material (glow, glyph, specular sheen, Phase B contour); per-glyph black backing replaced by one soft rounded plate per word that follows the row tracking; plates moved to dedicated layers under all glyph layers of a block. Entry/exit timing, tracking, collision delays, global word order and reports are unchanged.
- Neon ignition: dim → white-hot flash → settled glossy colour (filled) / dim → bright line (tube) over `neonFillDurationMs`.
- `types.ts` / `config.ts`: new `neon` config section (all values documented), `NeonStyle`, `KeyPhrase.style`, `SubtitleWord.neonStyle`. Retuned `glow` defaults (softer filled glow, plate softness). Legacy `glow.whiteHotCore*` kept for override compatibility.
- `layout/build-subtitle-blocks.ts`: a key phrase may force `style: 'tube' | 'filled'`.
- Removed dead code (`makeEntranceTransform`, unused locals).

## Validation performed here

- `tsc -p tsconfig.subtitle.json --noEmit` passes (only the external `@google/genai` package is unavailable here); an additional pass with `noUnusedLocals` + `noUncheckedIndexedAccess` reports no new issues in the changed files.
- Full ASS generation + libass render of the reference phrases at 480x854 and of the saved `words.json` at 720x1280; side-by-side frame comparison with the reference video (entry ignition, settled look, exit wave).
- Montserrat ExtraBold and fontkit were not in the archive, so the visual test used a stand-in font with the same family name and a fontkit-compatible metrics shim. Final shapes with the real Montserrat will be slightly wider; all sizes are relative to the cap height, so the look carries over.

---

# Subtitle update — global word ordering, adaptive backing and final phrase completion

## Implemented

- One global word first-appearance schedule spans both fixed rows. Entries are sorted by source `(start, end, line, idx)` and enforced at a minimum of 3 source-video frames between word starts.
- Per-glyph entrance remains one frame per glyph. No exit-lead offset is applied to word entry; the 600 ms lead is used only to schedule the outgoing phrase.
- `word-order.json` records source times, row/index, scheduled first-appearance frame and regression checks for `ТЕБЯ` → `НИ` and `ПОКУПАТЕЛЬ` → `ПЛАТИТ`.
- Preview performs a post-render ASS-event frame-order validation and writes `word-order-render-check.json`. This validates generated event/frame timing, not pixels via OCR.
- Exit Phase A uses a monotonic alpha ramp from the held opacity to transparent; fill and glow cannot brighten at the start of exit. The contour remains for Phase B.
- White word fill reaches full opacity within 90 ms (about 3 frames at 30 fps). Highlighted neon words retain a contour-first entrance and complete their fill ramp in 240 ms; cool purple/blue/cyan accents receive a separate 1 px white hot-core stroke.
- Backing, halo and glyph begin on the same frame. No entry lead is applied.
- Cool purple/blue/cyan neon uses a lighter, sharper inner glow core.
- Background luma is measured under each word using a single quarter-resolution FFmpeg pass at 4 fps. Words over mean luma >0.45 use about 65% black backing opacity; other words use about 51%.
- Fixed row baselines remain y=1048 and y=1108 at 1080x1920; one-line phrases stay in the upper row. Maximum row width is 80%.
- `probeInstagramVideo()` returns source frame rate. ASS generation uses that frame rate for the 3-frame global gap and frame reports.
- Preview retains audio (`0:a:0?`, AAC) and verifies the generated word-order schedule after MP4 render.
- Final video tail is computed from the maximum actual ASS Dialogue end, not a manually estimated final-block duration. `prepareInstagramSubtitleTrack()` returns `requiredVideoTailSeconds` and `wordOrderPath`.

## Validation performed here

- Strict `tsc -p tsconfig.subtitle.json --noEmit` passed using temporary local type stubs only for unavailable external packages; stubs are not included in this archive.
- Synthetic 1080x1920, 30 fps source created and processed through `generateInstagramSubtitleAss()`.
- Adaptive background analysis sampled all 10 test words and selected the stronger backing on the bright gray source.
- Both regression pairs passed; all global first-appearance frame gaps were at least 3 frames.
- Full `preview.ts` run with saved `words.json` completed, rendered H.264 video with AAC audio, and passed the post-render ASS-event timing check.
- FFmpeg/libass used Montserrat ExtraBold and rendered 250 per-glyph Dialogue events successfully, including the dedicated white hot-core stroke for cool neon accents.

The test is synthetic, not a full render of the user's original movie. Pixel-level OCR detection is not performed; the post-render order check verifies the exact per-glyph ASS event frames used by libass.

---

# Subtitle update 6 — whole rows in, timer out

- Entrance: a row is shown as a whole (one shared `displayStart` per row) `entryLeadMs` = 1000 ms before its first word is spoken, as a smooth left-to-right sweep at `entryLetterStepMs` = 33.3 ms per letter. The word-pause-word beat is gone; the `flowMinWordStepMs`, `flowMaxWordStepMs`, `flowPauseSplitMs` and `flowLengthWeight` options were removed.
- Exit: a phrase fades `exitNoNextDelayMs` = 500 ms after its last word was spoken, or earlier when the next phrase is about to appear (`exitTriggerLeadMs`). Previously it waited for the next phrase, so rows hung on screen during pauses (up to ~7 s on a 40 s test).
- `phraseMinHoldMs` still guarantees a minimum readable time.

---

# Subtitle update 7 — two neighbouring sentences in one block

- New `layout.pairPhrases`, `pairMaxGapSeconds` (0.8) and `pairMaxSpanSeconds` (6): two neighbouring complete one-row sentences share one block of two rows that leaves together (`НО МЫ ЖЕ ВСЕ ДЕТИ` / `ВЫ НЕ ДЕТИ`). Sentences cut by a size limit and sentences separated by a longer pause are not paired.

---

# Subtitle update 8 — sentence boundaries, clean hand-over

- `mergeShortBlocks` no longer glues a finished sentence to the next one (`ДЕРЖИСЬ ВЫ / ПРО …`); a short sentence stays on its own row and is paired by `pairNeighbourPhrases` (`ДЕРЖИСЬ` / `ВЫ ПРО НАУЧНЫЙ КОМПЛЕКС?`).
- `exitCollisionMaxOpacity` 1 → 0.3: a new row appears when old letters under it have faded, so the two rows are not mixed. The row lead drops by 0.1–0.3 s only where the previous row was still on screen.

---

# Subtitle update 9 — word timings snapped to the voice

- New `transcription/voice-snap.ts`, called from `transcription/whisper.ts` after transcription (Whisper provider, and Gemini after the Whisper re-timing). At pauses after punctuated words the last word is cut at the voice's end and the next words start at the voice onset (`REEL_SUBTITLE_VOICE_SNAP=off` disables). Fixes captions that appeared 1–2 s too early after a pause and rows that stayed up to 1.2 s after the voice stopped.

---

# Subtitle update 10 — plate grows with the letters

- The word plate is left-anchored (`\an4`) and its width is keyframed per glyph: the right edge reaches each glyph when that glyph appears. Before, the full-width plate appeared with the first letter and waited for the rest of the word, so a coloured box stood empty while the letters swept in.

## Update 11 — reference-driven rhythm (words mode, sentence blocks)

- `animation.entryMode: 'words'` (default): every word materialises as a whole (`entryWordLetterStepMs: 4`, `enterMs: 350`) just before it is spoken; lead grows from `entryLeadStartMs: 200` to `entryLeadEndMs: 450` over a sentence. `entryMode: 'row'` keeps the previous whole-row behaviour (`entryLeadMs`).
- Exit starts right after the voice ends (`exitNoNextDelayMs: 100`), wave step 20 ms (~1 s per row); new text overlays fading text (`exitCollisionMaxOpacity: 1`).
- Blocks follow sentences: `splitOnPauseSeconds: 1.0`, `maxBlockDurationSeconds: 6`, `maxWordsPerBlock: 14`; row breaks prefer a comma/clause end or a breath pause (`findBestSplit`).
- `assignPhraseFlow` now takes blocks (rows of words).

## Update 12 — speaker awareness

- New `transcription/speaker-analysis.ts`: per-word `speaker` ('S1', 'S2', …). Sources: Gemini diarization (`diarization_mode: 'speaker'`, automatically retried without it if the API rejects it) checked against a voice analysis (pitch + cepstral timbre of each utterance, pure TypeScript, audio via ffmpeg). Works on voice alone for the Whisper provider.
- Block builder: a speaker change cuts a block even without a pause (`layout.splitOnSpeakerChange`); the same speaker pausing up to `layout.sameSpeakerContinueSeconds` (2 s) inside an unfinished sentence does not start a new block ("Ты вряд ли поверишь в то, / что там творится" stays one block). Phrases of different speakers are never merged (they can still be paired into two rows).
- `REEL_SUBTITLE_SPEAKERS=off` disables labels (old pause-only behaviour). Any failure leaves `speaker` undefined.
- `WordTiming.speaker?: string` added to types.

## Update 13 — quiet speech inside a pause (voice-snap)

- Case: "Ты вряд ли поверишь (пауза) в то (пауза) / что там творится". The recogniser put "в то," right after "поверишь" (33.95–34.4 s), but the voice stops at 34.25 s and "в то" is murmured at ~35.3 s, below the 0.2 voice threshold.
- `voice-snap.ts` now looks for a weak island (≥1.8× the pause floor, 0.15–0.9 s, clear of both pause ends) inside a pause of ≥0.8 s. Up to three short words (≤3 letters) at the end of the loud part (the boundary word and its predecessors) are moved into the island; the loud word before them is extended to the real end of the voice. Summary field `movedToIsland` counts them.
- Tested on the user's preview clip: exactly one island found, only "в то," moved; all other words unchanged.

## Update 14 — pauses without punctuation (voice-segment alignment)

- Problem (second clip): "И этой … женщине известно всё" — the recogniser put "женщине известно" 1.4 s before the voice, because the pause inside the sentence had no punctuation and `snapWordsToVoice` only snapped at punctuated words.
- New in `voice-snap.ts`: `alignWordsToVoiceSegments`. Voice segments (speech between pauses) are matched to words by a monotone dynamic programme: distance of a word from its segment + tempo mismatch (syllables per second against the median tempo measured on THIS clip, fast side penalised harder, segments cut by the clip edges are ignored on the slow side) + a penalty for an empty long segment. Only words that sit in a pause (≥0.15 s from any voice) and whose move improves the fit by ≥0.35 are relocated; they are laid out at the start/end of the segment at its own tempo.
- `trimWordsToVoiceEnd`: a word that runs into a pause ends where the voice stops (exit timers then follow the real voice end).
- Summary fields `relocated`, `trimmed`. Verified on two clips: second clip relocates exactly "женщине известно всё"; first clip: no unwanted moves.

## Update 15 — unmatched words next to laughter / music (retime)

- Third clip: Whisper hears sound effects ("СМЕХ", "ДИНАМИЧНАЯ МУЗЫКА"). Gemini's "В" (before "общем") found no match and `retime-words.ts` spread it over the whole hole after "Нравится?" — i.e. into the laughter: "В" appeared at 16.8 s instead of 18.6 s (1.8 s early).
- Fix (general): an unmatched run inside a hole much longer than the words need (> 1.5 × natural duration + 0.8 s) is no longer spread over it. A run that follows a sentence end is placed right before the next matched word; a run that ends a sentence right after the previous one; mid-sentence holes behave as before.
- Not changed: speaker analysis still limited to 400 Hz pitch (child voices give unreliable F0; timbre and Gemini labels still decide).

## Update 16 — calmer neon

- `colors.palette`: ~20 % less saturation / slightly less brightness (old values kept in a comment in config.ts). Glow softer (`glow.outerAlpha` 130→150, `innerAlpha` 128→142), weaker ignite flash (`neon.igniteFlashWhiteMix` 0.6→0.5). Colours still derive from one accent via `buildNeonPalette`, so tubes/filled/plates follow automatically.

## Update 17 — foreign speech: auto language + translation

- Gemini transcription now detects the language itself (`language_codes` omitted); fallbacks if the API refuses: no diarization → forced language. `REEL_SUBTITLE_AUTO_LANGUAGE=off` restores the old forced `--language`. A word's `language` is filled only when Gemini really reports one.
- New `transcription/translate-foreign.ts`: sentences (end punctuation / pause > 1 s / speaker change) are classified as foreign by the transcriber's language label or by script (Latin letters in a Cyrillic transcript). All foreign sentences go to Gemini in ONE text request (`REEL_SUBTITLE_TRANSLATE_MODEL`, default gemini-2.5-flash) and are translated into `--language` (now the SUBTITLE language). The translated words are laid over the span of the original sentence by syllable weight (≥ 0.1 s each, may extend to the next word); speaker kept, `sourceLanguage` recorded.
- Order in the Gemini pipeline: transcribe → retime (Whisper) → translate foreign → voice snap → speakers. `REEL_SUBTITLE_TRANSLATE=off` disables translation; any failure keeps the transcript. Log line: `[SUBTITLE] Foreign speech { sentences, foreign, translated, languages }`.
- Limits: Latin→Latin pairs (Italian in an English reel) need Gemini's language label; the Whisper provider is not translated.

## Update 18 — coverage pass: speech the first Gemini request skipped

- Problem (first real run of update 17): the Gemini transcript ended at 11.7 s with 12 words although voice (and Whisper) was present at ~14.9–35 s — foreign lines were simply not returned, so there was nothing to translate (`foreign: 0`).
- New `transcription/coverage-pass.ts` + `findUncoveredSpeech` (voice-snap.ts): voice segments ≥ 0.35 s whose words cover < 25 % are merged (gaps ≤ 3 s, ±0.4 s padding, at most 6 ranges, total ≥ 0.8 s). Each range is cut from the audio and sent to Gemini again (`clip` option of `transcribeInstagramTranscriptWithGemini`; language always automatic; timestamps shifted back; speaker labels prefixed so the voice analysis decides). Words that sit on an already transcribed word are dropped.
- Order: transcribe → retime (Whisper) → **coverage pass** → translate foreign → voice snap → speakers. `REEL_SUBTITLE_COVERAGE_PASS=off` disables it; a failing clip keeps the transcript.
- Logs: `[GEMINI TRANSCRIBE COMPLETED]` now shows which request variant worked (`request: 'auto-language, speakers'`); `[SUBTITLE] Skipped speech re-transcribed { ranges, requested, addedWords }`.
- Limit: laughter/music may be sent too; Gemini then returns nothing (or rarely text) for them.

## Update 19 — translation model

- `gemini-2.5-flash` is no longer available (404 NOT_FOUND "no longer available to new users"), so every translation request failed and foreign lines stayed untranslated. The default of `REEL_SUBTITLE_TRANSLATE_MODEL` is now `gemini-3.8-flash` (the model the API itself recommends). A different model can be set in `.env`.

## Update 20 — coverage clips replace, not duplicate

- Problem (Italian/English reel with hard-coded Russian subtitles): the first request ran with the forced language, so Gemini had already rendered the foreign speech into Russian — with its own timing. The coverage pass then added its (translated) words beside them, giving doubled and interleaved captions ("МЫ МЕРТВЫ / МЁРТВ", "СЕБЯ ТАК ЕШЬ / ИГРАЕТ", "ЧТО ЭТОТ ОГО ЭТОТ ПАРЕНЬ").
- `coverage-pass.ts`: `replaceCoverageWords` — the words of the clip transcript replace all first-request words whose centre lies in the clip range. Safety: if the clip returns fewer than half as many words as it would replace, the old words stay and only non-overlapping clip words are added. Empty clip answers change nothing. Summary now has `replacedWords`.
- Translation of the replaced words is unchanged (they go through `translateForeign` like any foreign sentence).

## Update 21 — security / robustness audit

Checked every place where outside data (CLI flags, caller options, recogniser and LLM output, input media) reaches a path, an FFmpeg command, a prompt, the ASS file or memory. ASS text escaping (`escapeAssText`: `\`, `{`, `}`, newlines) and the FFmpeg process calls (no shell, argument arrays) were already correct and are unchanged.

Fixed:
- **FFmpeg filter-graph injection**: `--language` / `language` went into the Whisper filter string unchecked (`ru:destination=…`). New `utils/safe-input.ts` `assertLanguageCode` (`ru`, `en-US`, `auto`) is applied in `whisper.ts`, `translate-foreign.ts` and `prepareInstagramSubtitleTrack`.
- **Path traversal**: `runId` became a directory name (`../x`, `a/b`, absolute paths). `assertSafeRunId` allows letters, digits, `.`, `_`, `-` only (no `..`).
- **Untrusted transcript**: `sanitizeWords` (in `prepareInstagramSubtitleTrack`) drops words with NaN / negative / reversed times or a start beyond the video, clamps ends to the video, strips control characters, limits word (64), speaker label (32) and list (20 000) length.
- **LLM output**: `acceptTranslation` — a translation is used only when it has no control characters, is ≤ 400 characters, not > 5× longer than the line (an injected instruction or an explanation), and has no markup/code; ids that were not requested are ignored. Otherwise the original line stays.
- **One bad timestamp no longer kills the transcript** (`gemini.ts`): invalid `word_info` items are skipped and counted; coverage-clip words are clamped to the clip.
- **Memory**: voice analysis (stereo), speaker analysis (mono) and background sampling stop at 30 min of audio / 512 MB of frames instead of buffering without limit; `Int16Array` is built from an aligned copy (a Buffer at an odd offset threw on very short audio); ffmpeg stderr is capped.
- **API quota** (free Gemini tier: 25 requests/day): coverage clips are capped (`REEL_SUBTITLE_COVERAGE_MAX_CLIPS`, 1–6, default 3; nearest ranges are merged to fit), and a 429 / "rate limit" / quota error stops the remaining clips and the variant chain of a clip (`isRateLimitError`, `utils/rate-limit.ts`). Summary field `stoppedByRateLimit`.
- **Leftover debug file**: `*.whisper-timing.ndjson` is now removed together with the other debug files when `keepDebugArtifacts` is false.
