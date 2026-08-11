<div align="center">

```
██████╗ ██╗  ██╗██╗   ██╗████████╗██╗  ██╗███╗   ███╗███╗   ███╗ █████╗ ███╗   ██╗██╗ █████╗
██╔══██╗██║  ██║╚██╗ ██╔╝╚══██╔══╝██║  ██║████╗ ████║████╗ ████║██╔══██╗████╗  ██║██║██╔══██╗
██████╔╝███████║ ╚████╔╝    ██║   ███████║██╔████╔██║██╔████╔██║███████║██╔██╗ ██║██║███████║
██╔══██╗██╔══██║  ╚██╔╝     ██║   ██╔══██║██║╚██╔╝██║██║╚██╔╝██║██╔══██║██║╚██╗██║██║██╔══██║
██║  ██║██║  ██║   ██║      ██║   ██║  ██║██║ ╚═╝ ██║██║ ╚═╝ ██║██║  ██║██║ ╚████║██║██║  ██║
╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝      ╚═╝   ╚═╝  ╚═╝╚═╝     ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝╚═╝  ╚═╝
```

**HIGH DENSITY MATRIX** · v0.8.13

RhythmMania is a high-performance, browser-native vertical scroll rhythm game (VSRG) built for the competitive mania community. By leveraging the **Web Audio API** for sub-millisecond timing and two rendering engines (**HTML5 Canvas 2D** default and **Babylon.js 3D** PJ Sekai-style converging runway), it delivers a professional-grade experience right in your browser.

### 🕹️ Play Now : **[https://www.rhythm-mania.com/](https://www.rhythm-mania.com/)**

[![License: PolyForm Perimeter](https://img.shields.io/badge/License-PolyForm_Perimeter-green)](https://polyformproject.org/licenses/perimeter/1.0.1)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)

</div>

---

## Overview

RhythmMania is a browser-based vertical-scroll rhythm game in the *mania* genre (think osu!mania, VSRG, or Stepmania). Notes fall down — or rise up — in columns, and you hit the corresponding key at the moment they reach the judgement line. It supports **2K through 8K** lane configurations, live `.osu` beatmap import from `.osz` packages, Canvas2D and Babylon.js 3D playfield renderers, hit error tracking, and a full suite of precision calibration tools. Local gameplay runs entirely in the browser; optional Vercel Functions and PostgreSQL provide accounts, profiles, catalog registration, and online replay records.

RhythmMania is an **18+ service**. Minors may not use the game or any connected account, profile, catalog, or replay features, even with parental permission. See the in-app [Terms of Service](https://www.rhythm-mania.com/tos) and [Privacy Policy](https://www.rhythm-mania.com/privacypolicy).

---

## Features

### Gameplay
- **2K – 8K lane modes** with per-key-count default bindings and full rebind support
- **Upward & downward scroll** direction toggle
- **Dual playfield renderers**: Canvas2D (immediate-mode default) and Babylon.js 3D (PJ Sekai-style converging runway with bloom post-processing)
- **Six-tier judgement system**: Marvelous → Perfect → Great → Good → Bad → Miss, each with tuned timing windows, score weights, and HP deltas derived from `overallDifficulty`
- **Real-time precision diagnostics**: Live hit error meter, Unstable Rate (UR) metric calculation (population standard deviation of hit timing errors × 10), and post-play timing feedback
- **Hold notes** with early-release detection and a configurable release grace period to absorb brief key bounces
- **Autoplay (AT) mod**: Deterministic automation mode that plays all notes and hold tails perfectly for demonstration and practice; unranked, bypasses play history saving, and suppresses high score recording
- **Gameplay modifiers**: NF, EZ, HR, HT, DT, HD, AT, and K2–K8 key-conversion mods with score multipliers (NF/EZ ×0.5, HT ×0.3, HR/HD ×1.06, DT ×1.12); EZ↔HR and HT↔DT are mutually exclusive, EZ halves the effective OD, and HR scales it ×1.4 (capped at OD 10)
- **Particle burst effects** on every hit; column colour-coded by standard competitive conventions (blue/white outer lanes, accent centre column)
- **Focus Mode** — collapses the HUD during play
- **HP drain & fail state** with a configurable drain rate sourced from beatmap metadata

### Beatmap Support
- **Drag & drop `.osu` / `.osz` import** — the app parses standard osu! mania format directly in-browser via JSZip
- **Beatmap sources**: Users can import `.osu`/`.osz` files into local browser storage, or connect an osu! API token to search ranked/loved/graveyard mania sets. Archives download in-browser from Catboy mirror (Mino) with osudl.org fallback. Google sign-in enables register/activate for online scores.
- **Strain-based star estimation** on imported maps using an exponential decay model balanced between peak and sustained note density
- **Song previews** — a toggleable audio preview plays while browsing Song Select, using a lightweight HTMLAudio path kept deliberately independent of the Web Audio gameplay clock
- **Favorites** — star songs on Song Select for quick access; persisted locally

The parser supports mania maps and can convert standard-mode objects where
the format provides enough slider information. Imports are bounded to protect
the browser:

| Limit | Value |
| --- | ---: |
| Compressed beatmap package | 100 MB |
| Total uncompressed package | 250 MB |
| Package entries | 500 |
| Single uncompressed entry | 80 MB |
| `.osu` text | 2 MB |
| Hit objects | 20,000 |
| Timing points | 5,000 |

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
- **Background dim** sliders — one for gameplay and a separate **menu background dim** for the Song Select / Replay Select artwork
- **Video offset** fine-tune for storyboard video sync
- **Disable video** toggle
- **Progress bar position** toggle (top or bottom) and an optional **FPS counter** overlay
- **Disable particles** and **disable lane shake** toggles for performance and comfort
- **Skins menu**: choose RhythmMania Style Rectangular, RhythmPlus Classic Style Rectangular, RhythmPlus Dynamic Style Rectangular, or Circular Style, then adjust per-lane colors, opacity sliders (notes, receptors, judgement text, lane separators), note and receptor size scaling, and the live skin preview

### Background Video Sync
A PI (proportional-integral) sync controller (`VideoSyncController`) continuously monitors audio/video drift:
- **< 16 ms drift** → deadband: let the video run at the audio rate, do nothing
- **16 – 70 ms drift** → adjust `playbackRate` with a proportional + integral correction (max ±5% of the base rate) to smoothly close the gap
- **≥ 70 ms drift** → hard seek to re-align immediately (with a 150 ms seek cooldown to avoid thrash)

### Storage & Asset Management
- Beatmaps and raw `.osz` ZIP packages stored in **IndexedDB** (`RhythmManiaDB` v3), with automatic one-way migration for legacy maps previously saved in `localStorage`
- User preferences (`rhythm_mania_v1_settings`) and play history (`rhythm_mania_v1_play_history`) persisted in `localStorage`
- Raw `.osz` ZIP bytes stored as `ArrayBuffer` (more stable than `Blob` across page reloads)
- **LRU Blob URL cache** (capacity 3) tracks object URLs for audio, video, and background assets; evicts and revokes the least-recently-used entry automatically
- `AssetLifecycleManager` tracks every `URL.createObjectURL()` call and revokes on teardown, preventing memory leaks
- On map deletion, the storage layer checks for orphaned ZIP packages (no remaining difficulties) and removes them
- **Play record export/import** — download local history records as a schema-versioned JSON envelope and re-import them on another device (64 MB / 500-record caps per file; imported records are sanitised, migrated, and permanently marked local-only so they can never be uploaded)

### Touch Support
A `TouchInputAdapter` translates `TouchEvent`s to virtual key presses with equal-width lane mapping and supports horizontal slide gestures across lanes. When using the Babylon.js 3D renderer, touch input is full-screen (taps anywhere map to lanes).

---

## Accounts, profiles, and online replays

Google sign-in uses an HTTP-only PostgreSQL-backed session cookie. Signed-in
players can upload completed, non-failed, non-autoplay replays from supported
catalog difficulties. Local maps, autoplay runs, failed runs, unsupported
modes, and records without replay frames are not eligible.

Account and local gameplay features are available only to users aged 18 or
older. Minors may not use RhythmMania, including with parental permission.

Signed-in players also get an editable public profile at
`/profile/<userId>` or `/profile/<handle>`: display name, a unique lowercase
handle (3–20 chars, starting with a letter), a bio, social links, and an
avatar — uploaded as an image or chosen from eight presets in
`public/avatars/`. Public profiles show the player's stored replays and
stats and are viewable without an account; `/profile/edit` is the editing
route for the signed-in user.

The API surface is:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | Report application and database health |
| `GET /api/config` | Return public application capabilities |
| `GET /api/auth/me` | Read the current session |
| `GET /api/auth/google/url` | Start Google OAuth |
| `GET /api/auth/google/callback` | Complete Google OAuth |
| `GET /api/auth/osu/url` | Start osu! OAuth (catalog) |
| `GET /api/auth/osu/callback` | Complete osu! OAuth; return tokens to opener |
| `POST /api/auth/osu/refresh` | Refresh osu! auth-code tokens |
| `POST /api/auth/osu/byo-token` | Mint token from user-supplied OAuth app |
| `POST /api/auth/logout` | End the current session |
| `POST /api/replays/upload` | Upload an eligible replay |
| `GET /api/replays/list` | List the top replays for one exact chart revision |
| `GET /api/replays/get` | Retrieve a replay by ID |
| `GET /api/catalog/search` | Proxy osu!mania search with the user's osu! token |
| `POST /api/catalog/register-download` | Pending catalog registration (Google + osu! token) |
| `POST /api/catalog/activate-download` | Activate charts after private mirror verification; returns pending when verification cannot complete |
| `GET, PATCH /api/profile/me` | Read or update the signed-in user's profile |
| `GET /api/profile/handle-check` | Check whether a handle is available |
| `GET /api/profile/get` | Read a public profile by `userId` or `handle` |
| `GET, POST /api/profile/avatar` | Fetch an avatar image / upload a base64 avatar |
| `POST /api/profile/avatar/preset` | Select a preset avatar |

Create the PostgreSQL schema (users, sessions, beatmap_sets,
beatmap_difficulties, chart revisions, replays, user_profiles, and user_avatars) with
`database/schema.sql`. The repository currently ships the complete schema, but
no migration runner or separate migration files; existing deployments must
apply approved schema changes manually with PostgreSQL tooling. The
backend accepts either `DATABASE_URL`/`POSTGRES_URL` or the `PG*`/
`POSTGRES_*` connection variables. Google OAuth uses `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET`. osu! catalog OAuth uses `OSU_CLIENT_ID` and
`OSU_CLIENT_SECRET` (code exchange/refresh only). Set `SESSION_SECRET` in
deployed environments.

---

## Local persistence

| Store | Data |
| --- | --- |
| IndexedDB `RhythmManiaDB` v3 | Beatmaps and raw package buffers |
| `rhythm_mania_v1_settings` | Sanitized game settings |
| `rhythm_mania_v1_play_history` | Schema-v2 local play history and replay frames |
| `rhythm_mania_v1_history_limit` | Local history retention limit |
| `rhythm_mania_v1_custom_maps` | Legacy map storage migrated into IndexedDB |
| `rhythm_mania_v1_last_selected_map_id` | Last selected map |
| `rhythm_mania_v1_last_diff_by_song` | Last selected difficulty per song |
| `rhythm_mania_v1_favorite_songs` | Favorited songs on Song Select |

Media blob URLs are tracked and revoked through `AssetLifecycleManager`.
`storageManager` keeps a three-map least-recently-used media cache.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 (functional components, hooks) |
| Language | TypeScript 5.9 (strict) |
| Build | Vite 6 |
| Styling | Tailwind CSS v4 (Vite plugin) |
| Rendering | Dual Engine: HTML5 Canvas 2D (default), Babylon.js 3D (runway) |
| Audio | Web Audio API |
| ZIP parsing | JSZip 3 |
| Icons | lucide-react |
| Animation | Motion (Framer Motion v12) |
| Persistence | IndexedDB (beatmaps/packages) + localStorage (settings/history) |
| Distribution | Installable PWA (`manifest.webmanifest` + service worker cache) |

---

## Settings and controls

The settings drawer covers general, graphics, gameplay, audio, input, and
maintenance sections. Skin styles and playfield tuning live in the header's
Skins menu. Important defaults include:

- 4K mode with `D F J K` bindings.
- Scroll speed `21`, audio and visual offsets `0 ms`.
- Canvas2D renderer, square playfield, RhythmMania note style.
- Map scroll velocity enabled, song previews on, FPS counter off.
- Empty modifier selection.

All 2K-8K bindings can be changed. The default bindings are:

| Mode | Keys |
| --- | --- |
| 2K | `F J` |
| 3K | `F Space J` |
| 4K | `D F J K` |
| 5K | `D F Space J K` |
| 6K | `S D F J K L` |
| 7K | `S D F Space J K L` |
| 8K | `A S D F J K L ;` |

---

## Scoring

| Judgement | Timing Window* | Score | HP Delta |
|-----------|---------------|-------|----------|
| Marvelous | ±21 ms (fixed) | 320 | +3 |
| Perfect | max(20, 44 − 2.4×OD) + 5 ms | 300 | +2 |
| Great | max(35, 74 − 3.9×OD) + 5 ms | 200 | +1 |
| Good | max(53, 104 − 5.1×OD) + 5 ms | 100 | +0.2 |
| Bad | max(72, 134 − 6.2×OD) + 5 ms | 50 | −3 |
| Miss | — | 0 | −10 |

*Windows scale with beatmap `overallDifficulty` (0–10), and every tier includes a fixed +5 ms input grace on top of the OD-scaled formula. At OD 8 the effective windows are: Miss 129 ms, Bad 89 ms, Good 68 ms, Great 48 ms, Perfect 30 ms. HP deltas are further multiplied by a drain-rate scalar (0.8× when `hpDrainRate > 5`, otherwise 1.2×).

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
| F | Failed run (HP depleted, independent of accuracy) |

---

## Project structure

```text
RhythmMania-Beta/
├── api/                         Vercel Functions and shared backend helpers
├── database/                    PostgreSQL schema, migration, and update scripts
├── public/
│   ├── avatars/                 Preset profile avatars
│   ├── backgrounds/             Menu and history artwork
│   ├── icons/                   PWA and favicon icons
│   ├── manifest.webmanifest     Installable PWA manifest
│   └── sw.js                    Optional service worker
├── src/
│   ├── App.tsx                  Screen router and application state
│   ├── audio/AudioEngine.ts     Web Audio transport and fallback synth
│   ├── components/              Screens, gameplay host, and settings UI
│   ├── render/                  Shared math and Canvas2D/Babylon renderers
│   ├── utils/                   Parsing, storage, replay, preview, input, and media
│   └── types.ts                 Domain types
├── metadata.json                Build-time application metadata
├── package.json                 Scripts and dependencies
└── vite.config.ts               Vite, path alias, and build chunk configuration
```

`GameplayCanvas.tsx` owns live timing, input, scoring, replay recording,
media synchronization, and renderer hosting. Shared visual math belongs in
`src/render/`; update the Canvas2D and Babylon renderers when changing
playfield visuals.

---

## Development notes

Focused Node-only tests are available with `npm test`. The normal validation
commands are `npm run lint`, `npm test`, and `npm run build`, followed by manual
play checks for importing, 4K play, hold notes, modifiers, replay history,
video, touch input, and both render engines.

---

## License

Licensed under the [PolyForm Perimeter License 1.0.1](LICENSE.md).
Community beatmaps, audio, and video may be third-party content.

For privacy questions or suspected minor data, contact
`privacy@rhythm-mania.com`. Copyright concerns may be sent to
`copyright@rhythm-mania.com`.
