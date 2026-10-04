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
```

The first render downloads Chrome Headless Shell (~110 MB, cached).
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
- **Music**: the video is silent (LinkedIn autoplays muted). To add a track,
  drop a file in `public/` and add
  `<Audio src={staticFile('music.mp3')} />` from `remotion` inside
  `Promo.tsx`.

Copy follows the app's rule: no em or en dashes.

## License

The promo source is MIT, like the rest of the repo. Remotion itself is not:
it has its own license, free for individuals and companies of up to 3
people, with a paid company license above that. See
https://www.remotion.dev/license before rendering this for a larger
organization.
