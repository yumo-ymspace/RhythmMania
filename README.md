<div align="center">

```
██████╗ ██╗  ██╗██╗   ██╗████████╗██╗  ██╗███╗   ███╗ █████╗ ███╗   ██╗██╗ █████╗
██╔══██╗██║  ██║╚██╗ ██╔╝╚══██╔══╝██║  ██║████╗ ████║██╔══██╗████╗  ██║██║██╔══██╗
██████╔╝███████║ ╚████╔╝    ██║   ███████║██╔████╔██║███████║██╔██╗ ██║██║███████║
██╔══██╗██╔══██║  ╚██╔╝     ██║   ██╔══██║██║╚██╔╝██║██╔══██║██║╚██╗██║██║██╔══██║
██║  ██║██║  ██║   ██║      ██║   ██║  ██║██║ ╚═╝ ██║██║  ██║██║ ╚████║██║██║  ██║
╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝      ╚═╝   ╚═╝  ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝╚═╝  ╚═╝
```

**HIGH DENSITY MATRIX** · v0.4.0

A precision mania-style rhythm game that runs entirely in the browser.
Load your own `.osu` maps, tune your offsets, and compete for perfect accuracy.

**Live site: https://www.rhythm-mania.com/**

[![License: GNU GPL v3](https://img.shields.io/badge/License-GNU_GPL_v3-green)](https://www.gnu.org/licenses/gpl-3.0.html)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)

</div>

---

## Overview

RhythmMania is a browser-based vertical-scroll rhythm game in the *mania* genre (think osu!mania, VSRG, or Stepmania). Notes fall down — or rise up — in columns, and you hit the corresponding key at the moment they reach the judgement line. It supports **2K through 8K** lane configurations, live `.osu` beatmap import from `.osz` packages, procedural beatmap generation, and a full suite of precision calibration tools — all without any server-side runtime.

Everything is rendered on an HTML Canvas with a Web Audio API timing engine and persisted in IndexedDB, so the app works offline after first load.

---

## Features

### Gameplay
- **2K – 8K lane modes** with per-key-count default bindings and full rebind support
- **Upward & downward scroll** direction toggle
- **Six-tier judgement system**: Marvelous → Perfect → Great → Good → Bad → Miss, each with tuned timing windows, score weights, and HP deltas derived from `overallDifficulty`
- **Hold notes** with early-release detection and a configurable release grace period to absorb brief key bounces
- **Particle burst effects** on every hit; column colour-coded by standard competitive conventions (blue/white outer lanes, accent centre column)
- **Focus Mode** — collapses the HUD during play
- **HP drain & fail state** with a configurable drain rate sourced from beatmap metadata

### Beatmap Support
- **Drag & drop `.osu` / `.osz` import** — the app parses standard osu! mania format directly in-browser via JSZip
- **Bundled server map**: *Odo* by Ado, ships in `public/beatmaps/`
- **Procedural beatmap engine** — generates deterministic, seed-locked beatmaps on the fly; supports stairs, trills, chords, and hold patterns scaled to a 1.0–10.0 star target
- **Strain-based star estimation** on imported maps using an exponential decay model balanced between peak and sustained note density

### Audio
- **Web Audio API engine** with interpolated, sub-millisecond `getCurrentTimeMs()` — smooths over the coarse 128-sample block increments of `AudioContext.currentTime` using `performance.now()` interpolation
- **Synthesised hitsound** (frequency-swept decay pulse) generated once at init, no asset downloads required
- **Fallback drum sequencer** — when a track can't be fetched (offline, CORS, etc.) a pentatonic arp + kick/hi-hat pattern plays in sync so the map is always playable
- **Independent music and SFX gain nodes** (master → music / master → sfx)
- Seek, pause, and resume with accurate position restoration

### Calibration & Settings
- **Audio offset** (ms) — shifts the timing window relative to the audio clock
- **Visual offset** (ms) — shifts note rendering time independently of audio
- **Interactive metronome tap calibration** — tap along to a 120 BPM click to auto-compute your system latency offset
- **Scroll speed** multiplier
- **Hitsound and music volume** sliders
- **Per-mode key rebinding** matrix (2K – 8K, live keyboard intercept, persisted to `localStorage`)
- **Background dim** and **video opacity** sliders
- **Video offset** fine-tune for storyboard video sync
- **Disable video** toggle

### Background Video Sync
A Phase-Locked Loop controller (`VideoSyncController`) continuously monitors audio/video drift:
- **< 60 ms drift** → let the browser run at 1.0×, do nothing
- **60 – 900 ms drift** → adjust `playbackRate` proportionally (±0.15× max) to smoothly close the gap
- **> 900 ms drift** → hard seek to re-align immediately

### Storage & Asset Management
- Beatmap metadata and note data stored in **IndexedDB** (`RhythmManiaDB`) with automatic migration from a legacy `localStorage` fallback
- Raw `.osz` ZIP bytes stored as `ArrayBuffer` (more stable than `Blob` across page reloads)
- **LRU Blob URL cache** (capacity 3) tracks object URLs for audio, video, and background assets; evicts and revokes the least-recently-used entry automatically
- `AssetLifecycleManager` tracks every `URL.createObjectURL()` call and revokes on teardown, preventing memory leaks
- On map deletion, the storage layer checks for orphaned ZIP packages (no remaining difficulties) and removes them

### Touch Support
A `TouchInputAdapter` translates `TouchEvent`s to virtual key presses with proportional lane-width mapping (the wider spacebar column in 5K/7K gets proportionally more hit area) and supports horizontal slide gestures across lanes.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 (functional components, hooks) |
| Language | TypeScript 5.8 (strict) |
| Build | Vite 6 |
| Styling | Tailwind CSS v4 (Vite plugin) |
| Rendering | HTML Canvas 2D API |
| Audio | Web Audio API |
| ZIP parsing | JSZip 3 |
| Icons | lucide-react |
| Animation | Motion (Framer Motion v12) |
| Persistence | IndexedDB + localStorage fallback |

---

## Project Structure

```
src/
├── App.tsx                        # Root screen router and global state
├── types.ts                       # All shared TypeScript interfaces
├── main.tsx                       # React entry point
├── index.css                      # Global base styles
│
├── components/
│   ├── GameplayCanvas.tsx         # Main game loop, Canvas renderer, input handler
│   ├── SongSelect.tsx             # Song/difficulty browser, .osz importer
│   ├── SettingsScreen.tsx         # Key bindings, offsets, calibration metronome
│   ├── ResultsScreen.tsx          # Post-game grade, accuracy, hit breakdown
│   └── PlayZoneOverlay.tsx        # In-game HUD overlay (score, HP, combo)
│
├── audio/
│   └── AudioEngine.ts             # Web Audio timing engine + fallback sequencer
│
├── data/
│   └── songs.ts                   # Procedural beatmap generator + LCG seeder
│
├── utils/
│   ├── beatmapParser.ts           # .osu file parser, BPM calculator, star estimator
│   ├── storageManager.ts          # IndexedDB wrapper + LRU blob cache
│   ├── zipResolver.ts             # 3-phase case-insensitive .osz asset resolver
│   ├── videoSyncController.ts     # PLL-based audio/video drift correction
│   ├── touchInputAdapter.ts       # Touch-to-lane mapping with slide support
│   ├── assetLifecycle.ts          # Blob URL creation/revocation tracking
│   └── gameplayTeardown.ts        # Safe cleanup on exit (audio, RAF, refs)
│
public/
└── beatmaps/
    ├── manifest.json              # Server-hosted map index
    └── osz_files.osz              # Bundled maps
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+

### Installation

```bash
git clone https://github.com/yumo-ymspace/RhythmMania.git
cd RhythmMania
npm install
```

### Running Locally

```bash
npm run dev
```

The app will be available at `http://localhost:3000`.

### Building for Production

```bash
npm run build
npm run preview   # Preview the production build locally
```

### Type Checking

```bash
npm run lint   # Runs tsc --noEmit
```

---

## Importing Beatmaps

RhythmMania reads standard osu! mania beatmaps:

1. **Drag and drop** a `.osz` file (or plain `.osu` file) anywhere on the Song Select screen.
2. The parser extracts all mania difficulties, resolves audio/video/background assets from the ZIP, and stores everything in IndexedDB.
3. Maps persist across page reloads. Delete them individually from the Song Select screen.

**Supported fields from `.osu` files:** `Title`, `Artist`, `Creator`, `Version`, `CircleSize` (key count), `OverallDifficulty`, `HPDrainRate`, `AudioFilename`, `[TimingPoints]`, `[HitObjects]`, storyboard video/background via `[Events]`.

---

## Scoring

| Judgement | Timing Window* | Score | HP Delta |
|-----------|---------------|-------|----------|
| Marvelous | ±16 ms | 320 | +2 |
| Perfect | ±40 ms | 300 | +1 |
| Great | ±73 ms | 200 | 0 |
| Good | ±103 ms | 100 | −2 |
| Bad | ±127 ms | 55 | −5 |
| Miss | — | 0 | −10 |

*Windows scale with beatmap `overallDifficulty` (0–10). Combo multiplier applies on top of base scores.

---

## Default Key Bindings

| Mode | Keys |
|------|------|
| 2K | `F` `J` |
| 3K | `F` `Space` `J` |
| 4K | `D` `F` `J` `K` |
| 5K | `D` `F` `Space` `J` `K` |
| 6K | `S` `D` `F` `J` `K` `L` |
| 7K | `S` `D` `F` `Space` `J` `K` `L` |
| 8K | `A` `S` `D` `F` `J` `K` `L` `;` |

All bindings are fully rebindable per lane count in the Settings screen.

---

## Grading

| Grade | Accuracy |
|-------|----------|
| SS | 100% |
| S | ≥ 95% |
| A | ≥ 90% |
| B | ≥ 80% |
| C | ≥ 70% |
| D | < 70% |

---

## License

Licensed under the [GNU General Public License v3.0](LICENSE).

---

<div align="center">
Crafted by Yumo(yumo-ymspace) · Respecting competitive integrity & game feel
</div>
