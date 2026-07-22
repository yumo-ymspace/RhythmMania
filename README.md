<div align="center">

```
██████╗ ██╗  ██╗██╗   ██╗████████╗██╗  ██╗███╗   ███╗███╗   ███╗ █████╗ ███╗   ██╗██╗ █████╗
██╔══██╗██║  ██║╚██╗ ██╔╝╚══██╔══╝██║  ██║████╗ ████║████╗ ████║██╔══██╗████╗  ██║██║██╔══██╗
██████╔╝███████║ ╚████╔╝    ██║   ███████║██╔████╔██║██╔████╔██║███████║██╔██╗ ██║██║███████║
██╔══██╗██╔══██║  ╚██╔╝     ██║   ██╔══██║██║╚██╔╝██║██║╚██╔╝██║██╔══██║██║╚██╗██║██║██╔══██║
██║  ██║██║  ██║   ██║      ██║   ██║  ██║██║ ╚═╝ ██║██║ ╚═╝ ██║██║  ██║██║ ╚████║██║██║  ██║
╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝      ╚═╝   ╚═╝  ╚═╝╚═╝     ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝╚═╝  ╚═╝
```

**HIGH DENSITY MATRIX** · v0.7.6

RhythmMania is a high-performance, browser-native vertical scroll rhythm game (VSRG) built for the competitive mania community. By leveraging the **Web Audio API** for sub-millisecond timing and a dual rendering engine (**HTML5 Canvas 2D** default and **PixiJS v8** WebGL option), it delivers a professional-grade experience right in your browser.

### 🕹️ Play Now : **[https://www.rhythm-mania.com/](https://www.rhythm-mania.com/)**

[![License: PolyForm Perimeter](https://img.shields.io/badge/License-PolyForm_Perimeter-green)](https://polyformproject.org/licenses/perimeter/1.0.1)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)

</div>

---

## Overview

RhythmMania is a browser-based vertical-scroll rhythm game in the *mania* genre (think osu!mania, VSRG, or Stepmania). Notes fall down — or rise up — in columns, and you hit the corresponding key at the moment they reach the judgement line. It supports **2K through 8K** lane configurations, live `.osu` beatmap import from `.osz` packages, dual Canvas2D/PixiJS v8 playfield renderers, hit error tracking, and a full suite of precision calibration tools — all without any server-side runtime.

---

## Features

### Gameplay
- **2K – 8K lane modes** with per-key-count default bindings and full rebind support
- **Upward & downward scroll** direction toggle
- **Dual playfield renderers**: Canvas2D (immediate-mode default) and PixiJS v8 (WebGL scene-graph with sprite pooling and texture atlasing)
- **Six-tier judgement system**: Marvelous → Perfect → Great → Good → Bad → Miss, each with tuned timing windows, score weights, and HP deltas derived from `overallDifficulty`
- **Real-time precision diagnostics**: Live hit error meter, Unstable Rate (UR) metric calculation (population standard deviation of hit timing errors × 10), and post-play timing feedback
- **Hold notes** with early-release detection and a configurable release grace period to absorb brief key bounces
- **Autoplay (AT) mod**: Deterministic automation mode that plays all notes and hold tails perfectly for demonstration and practice; unranked, bypasses play history saving, and suppresses high score recording
- **Particle burst effects** on every hit; column colour-coded by standard competitive conventions (blue/white outer lanes, accent centre column)
- **Focus Mode** — collapses the HUD during play
- **HP drain & fail state** with a configurable drain rate sourced from beatmap metadata

### Beatmap Support
- **Drag & drop `.osu` / `.osz` import** — the app parses standard osu! mania format directly in-browser via JSZip
- **Bundled beatmap catalog**: Pre-packaged beatmaps served as static assets in `public/beatmaps/` with `manifest.json` for in-app catalog browsing and client-side downloading (no backend server process required)
- **Internal procedural beatmap generator**: Developer helper module (`src/data/songs.ts`) for seed-locked, deterministic map generation (note: internal helper with no active player UI path)
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
- Beatmaps and raw `.osz` ZIP packages stored in **IndexedDB** (`RhythmManiaDB` v3), with automatic one-way migration for legacy maps previously saved in `localStorage`
- User preferences (`rhythm_mania_v1_settings`) and play history (`rhythm_mania_v1_play_history`) persisted in `localStorage`
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
| Rendering | Dual Engine: HTML5 Canvas 2D (default) & PixiJS v8 (WebGL scene-graph) |
| Audio | Web Audio API |
| ZIP parsing | JSZip 3 |
| Icons | lucide-react |
| Animation | Motion (Framer Motion v12) |
| Persistence | IndexedDB (beatmaps/packages) + localStorage (settings/history) |

---

## Project Structure

```
RhythmMania/
├── index.html                          # App entry point HTML shell
├── package.json                        # Dependencies & scripts (React, Vite, Tailwind)
├── vite.config.ts                      # Vite build configuration
├── tsconfig.json                       # TypeScript configuration
├── metadata.json                       # App version/metadata manifest
├── LICENSE.md                          # License file
├── README.md                           # Project overview
│
├── public/
│   ├── sw.js                           # Service Worker for offline caching & PWA
│   ├── backgrounds/                    # Static background images for menus
│   └── beatmaps/                       # Static bundled beatmap packages (.osz) + manifest catalog
│       ├── manifest.json               # Catalog index of bundled downloadable beatmaps
│       └── *.osz                       # Bundled map packages
│
└── src/
    ├── main.tsx                        # React entry point, mounts <App/>, registers service worker
    ├── App.tsx                         # Root component: screen router, global state, history/settings management
    ├── types.ts                        # All shared TypeScript interfaces (HitObject, Beatmap, ScoreState, GameSettings, etc.)
    ├── index.css                       # Global styles, Tailwind imports, CSS variables, custom animations, scrollbar
    │
    ├── audio/
    │   └── AudioEngine.ts              # Web Audio API engine: music/hitsound playback, volume, offset, decoder
    │
    ├── data/
    │   └── songs.ts                    # Internal procedural beatmap generator helper (no active UI path)
    │
    ├── render/                         # Playfield rendering subsystem
    │   ├── Canvas2DRenderer.ts         # Immediate-mode Canvas2D playfield renderer
    │   ├── playfieldLayout.ts          # Column width, layout weights, and note position math
    │   ├── noteVisibility.ts           # Note culling and opacity calculation (including Hidden mod)
    │   ├── scrollVelocity.ts           # Scroll Velocity (SV) integral modeling & scroll position engine
    │   ├── skinTheme.ts                # Skin color resolution helpers
    │   ├── types.ts                    # PlayfieldFrame and IPlayfieldRenderer interfaces
    │   └── pixi/                       # PixiJS v8 WebGL renderer subsystem
    │       ├── PixiPlayfieldRenderer.ts # Root PixiJS container & layer manager
    │       ├── PixiAppFactory.ts        # Manual-tick PixiJS Application factory
    │       ├── layers/                 # Scene-graph layers (Background, Lane, Hold, Note, Receptor, Particle, MobileZone, HitError)
    │       ├── pool/                   # ObjectPool and SpritePool for sprite reuse
    │       └── skin/                   # TextureAtlasBuilder & SkinTextureCache
    │
    ├── components/
    │   ├── MainMenu.tsx                # Main menu screen with animated bg, play/settings/history nav
    │   ├── SongSelect.tsx              # Beatmap browser: search, filter, drag-drop import, download, mods (including AT), play
    │   ├── GameplayCanvas.tsx          # Core gameplay: dual Canvas2D/Pixi loop, input, timing, scoring, replay
    │   ├── ResultsScreen.tsx           # Post-play results: grade, max combo, hit error meter, history/replay
    │   ├── PlayZoneOverlay.tsx         # HUD overlay during gameplay (score, accuracy, focus toggle)
    │   ├── PersonalHistoryScreen.tsx   # Play history archive: song grouping, difficulty selector, replay/view
    │   ├── SettingsScreen.tsx          # Re-exports SettingsDrawer for the settings panel
    │   │
    │   └── settings/
    │       ├── SettingsDrawer.tsx       # Settings drawer container with sidebar + content pane
    │       ├── SettingsSidebar.tsx      # Left sidebar: category navigation in settings
    │       ├── SettingsPane.tsx         # Right pane: renders grouped setting rows per category
    │       ├── SettingsRow.tsx          # Single settings row: rail, label, control
    │       ├── SettingsSearchBar.tsx    # Search bar for filtering settings
    │       ├── settingsRegistry.tsx     # Central registry of all settings (categories, keys, controls)
    │       ├── defaultSettings.ts       # Default GameSettings values (frozen object)
    │       ├── SectionSkinPreview.tsx   # Skin preview component in settings
    │       ├── BindingMatrix.tsx        # Key binding matrix editor for lane columns
    │       ├── OffsetWizardModal.tsx    # Offset calibration wizard modal
    │       ├── skinParser.ts           # Parses .ini skin files to extract custom colors
    │       │
    │       └── controls/                # Reusable setting control components
    │           ├── SettingsSlider.tsx   # Range slider control
    │           ├── SettingsToggle.tsx   # Toggle/switch control
    │           ├── SettingsSelect.tsx   # Dropdown select control
    │           ├── SettingsButton.tsx   # Action button control
    │           ├── ColorSwatchRow.tsx   # Color picker row control
    │           └── ConfirmModal.tsx     # Confirmation dialog modal
    │
    └── utils/
        ├── beatmapParser.ts            # Parses .osu beatmap files into Beatmap objects & extracts media paths
        ├── performanceMetrics.ts       # Unstable Rate (UR) stddev calculation and per-column judgement metrics
        ├── storageManager.ts           # IndexedDB storage for beatmaps, packages, and LRU media cache
        ├── assetLifecycle.ts           # Manages lifecycle of blob URLs to prevent memory leaks
        ├── mediaRegistry.ts            # Global singleton registry for active HTMLVideoElement reference
        ├── zipResolver.ts              # Robust JSZip file finder/resolver for beatmap archives
        ├── unpackHelper.ts             # Unpacks beatmap media (audio, video, bg) from zip archives
        ├── tempMemoryCache.ts          # In-memory cache for zip buffers
        ├── videoSyncController.ts      # PLL-based video-audio sync controller during gameplay
        ├── gameplayTeardown.ts         # Cleanup: stops audio, cancels animation frame, revokes blobs
        ├── fullscreenManager.ts        # Fullscreen API wrapper for focus mode
        └── touchInputAdapter.ts        # Multi-touch input adapter for mobile gameplay on canvas
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
| Marvelous | ±16 ms | 320 | +3 |
| Perfect | max(20, 44 − 2.4×OD) ms | 300 | +2 |
| Great | max(35, 74 − 3.9×OD) ms | 200 | +1 |
| Good | max(53, 104 − 5.1×OD) ms | 100 | +0.2 |
| Bad | max(72, 134 − 6.2×OD) ms | 50 | −3 |
| Miss | — | 0 | −10 |

*Windows scale with beatmap `overallDifficulty` (0–10). At OD 8 the windows are: Miss 124 ms, Bad 84 ms, Good 63 ms, Great 43 ms, Perfect 25 ms. HP deltas are further multiplied by a drain-rate scalar (0.8× when `hpDrainRate > 5`, otherwise 1.2×).

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

Licensed under the [PolyForm Perimeter 1.0.1](LICENSE).

---

<div align="center">
Crafted by Yumo(yumo-ymspace) · Respecting competitive integrity & game feel
</div>
