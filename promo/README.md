# Wird promo video

A ~49 second motion-graphics promo for Wird (1920x1080, 30 fps, H.264),
made with [Remotion](https://www.remotion.dev): every scene is a React
component, rendered frame by frame in headless Chrome.

Output: `out/wird-promo.mp4`

Everything lives in this folder. It has its own `package.json` and
`node_modules`, and it does not touch the app.

## Re-render

```
cd promo
npm install
npm run render        # -> out/wird-promo.mp4
npm run studio        # live preview with a timeline scrubber
npm run thumbnail     # -> out/wird-thumbnail.png and .jpg (cover image)
```

Both commands first synthesize the sound effects into `public/sfx/` (see
[Sound](#sound)). The first render downloads Chrome Headless Shell (~110 MB,
cached).
Remotion ships its own ffmpeg, so nothing else needs installing.

Quick visual checks without a full render:

```
node scripts/stills.mjs 60 300 900                # frames of the full film
node scripts/stills.mjs --comp scene-week 40 150  # frames of one scene
```

Stills land in `out/still-*.png`. Everything in `out/` (the mp4 included)
is git-ignored.

## The story

| # | Scene (`src/scenes/`) | What it says |
|---|---|---|
| 1 | `Goals.tsx` | You want to learn German, Python, drawing, Quran. Your day has 2 hours. The goals drop into a 120 min bar: Wird makes it fit. |
| 2 | `Title.tsx` | The ribbon-W logo writes itself. Wird, *wird* (وِرد): a daily portion. |
| 3 | `AiPlan.tsx` | Tell any AI what you want, it writes plan.json, Wird imports it. |
| 4 | `Week.tsx` | The week fills around your time: fasting days lighter, weekends fuller. A missed session rolls forward. |
| 5 | `Today.tsx` | Tick tasks off, points fly into the ring, the small goal secures the streak. |
| 6 | `Quran.tsx` | 604 pages filling in memorization order, a review wave passing back over them. |
| 7 | `Streak.tsx` | A year heatmap and a streak counter. Rest days pause, never break. |
| 8 | `Local.tsx` | The real app (screenshots) at 127.0.0.1, flipping from English to Arabic. |
| 9 | `Outro.tsx` | "The most beloved deeds are the most constant, even if small." Then the logo, tagline, platforms and repo link. |

## Tweaking

- **Timing and order**: `src/timeline.ts`. Each scene has a duration in
  frames (30 = 1 s) and the two background glow colors. Scenes cross-fade
  over `OVERLAP` frames; changing a duration shifts everything after it.
- **Inside a scene**: beats are named constants at the top of each file
  (for example `DROP` and `FIT` in `Goals.tsx`, `MISS` and `ROLL` in
  `Week.tsx`). Copy is plain JSX text.
- **Colors and fonts**: `src/theme.ts`, copied from the app's dark theme
  (`src/web/styles.css`). Fonts are the app's own: Plus Jakarta Sans,
  JetBrains Mono, IBM Plex Sans Arabic and Amiri (via Fontsource).
- **Screenshots**: `public/today-desktop.png` and `public/today-ar-desktop.png`
  are copies of `screenshots/` from the e2e run. Replace them to refresh.
- **Hadith in the outro**: set `SHOW_QUOTE = false` in `Outro.tsx` to go
  straight to the logo (then shorten the outro's duration in `timeline.ts`
  by about 90 frames).
- **Thumbnail**: `src/Thumbnail.tsx`, a still (`Thumbnail` in the Studio)
  built from the film's logo, colors and fonts. The JPEG is for sites with
  an upload size limit (YouTube allows 2 MB).
- **Sound**: see below.

## Sound

There is no music and no voiceover, by design: no track, pad, melody or
beat, nothing musical at all. The film tells its story in text and must work
fully muted (LinkedIn autoplays muted), so the only audio is a quiet layer of
sound effects on the scene beats. It is a bonus, never the carrier of
meaning.

- **Off switch**: set `SOUND = false` in `src/Sound.tsx` for a silent render
  (no audio stream at all). `MASTER` there scales the whole layer.
- **Cues**: `src/Sound.tsx` lists every cue against the scenes' own beat
  constants (`DROP`, `FIT`, `PRESS`, `ROLL`, `SECURED`, `SWEEP_AT`, `SIGN`...),
  so moving a beat moves its sound. A whoosh sits on every cut, peaking in
  the middle of the cross-fade. The Quran scene and the hadith are quiet on
  purpose. The solo `scene-*` compositions play their scene's cues too.
- **The sounds**: synthesized by `scripts/sfx.mjs` (plain Node, no
  dependencies) into `public/sfx/*.wav`, which is git-ignored. `npm run
  render` and `npm run studio` regenerate them first; `npm run sfx` does it
  alone. The generator is seeded, so every run writes the same bytes.
- **What keeps it non-musical**: longer sounds are pure filtered noise (air),
  and the only pitched parts are transients under 0.2 s whose pitch sweeps
  (a click, a bloop, a soft thump), so no note is heard. Pitched transients
  are never layered into chords or sequenced into a melody: each one lands
  where the visuals put it.
- **Levels and edges**: each file is normalized and faded to exact zero at
  both ends (a few ms in, up to 400 ms out), so no cut clicks. Cue volumes
  keep the mix around -17 dBFS peak, far under the visuals.
- **Two sounds mirror scene timing** and need `sfx.mjs` edited if those
  change: `rain` follows the heatmap sweep (`SWEEP_DUR` and the easeOut
  curve in `Streak.tsx`), and `riffle` has one tap per Week block (26 blocks,
  1.6 frames apart).

| File | Made from | Where |
|---|---|---|
| `whoosh-a`, `whoosh-b` | pink noise, band-pass sweeping 260 Hz up to 2.4 kHz and back, panned left to right | every scene cut (alternating) |
| `swish` | white noise, band-pass sweeping 0.9 to 4.2 kHz, 0.4 s | AiPlan arrows, Week roll-forward, Local language flip |
| `tick` | 2 ms noise transient through a short 1.9 kHz resonance | Goals "makes it fit" check, AiPlan import press, Today check-offs |
| `pop` | 0.1 s sine sweeping 820 to 240 Hz plus a noise click | AiPlan "Imported", points landing in the Today ring |
| `thud` | 0.2 s sine sweeping 150 to 58 Hz plus low noise | Goals pills landing in the day bar, Week rolled session landing |
| `rise` | stereo pink noise, low-pass opening 180 Hz to 3.2 kHz over 1.1 s | Title, while the logo writes itself |
| `riffle` | 26 band-passed noise grains, one per block | Week sessions filling the columns |
| `rain` | 364 tiny noise grains, one per heatmap cell, panned by week | Streak year heatmap filling |
| `sparkle` | high noise grains and a little air, decaying | Today "Streak secured" with the confetti |
| `resolve` | low sweeping thump, then 3 s of pink noise settling (low-pass 2.2 kHz down to 260 Hz) | Outro, as the logo lands |

**License**: every sound is generated by `scripts/sfx.mjs` in this repo. No
samples, recordings or third-party audio are used, so the audio is MIT like
the rest of the promo source.

Copy follows the app's rule: no em or en dashes.

## License

The promo source is MIT, like the rest of the repo. Remotion itself is not:
it has its own license, free for individuals and companies of up to 3
people, with a paid company license above that. See
https://www.remotion.dev/license before rendering this for a larger
organization.
