# Mirio audio

The soundtrack, chimes, bubbles, engine, synthesized effects and room impulse are
original work created for Mirio and distributed under the repository's MIT
license. The music is a sixteen-bar composition with changing instrumentation,
phrase variations and distinct exploration, moon, race, boss and victory arrangements.
No existing commercial recording or melody is sampled.

## Public-domain foley

Selected recordings are by **Kenney**, from these official packs:

- [Impact Sounds 1.0](https://kenney.nl/assets/impact-sounds), CC0 1.0.
- [RPG Audio](https://kenney.nl/assets/rpg-audio), CC0 1.0.

The official pack pages and the license text inside both downloaded archives
were checked on 27 September 2026. CC0 permits redistribution and modification;
attribution is not required, but Kenney deserves the credit. The original
notices are included as [Kenney-Impact-License.txt](Kenney-Impact-License.txt)
and [Kenney-RPG-License.txt](Kenney-RPG-License.txt). See the
[CC0 public-domain dedication](https://creativecommons.org/publicdomain/zero/1.0/).

Only the following eleven recordings are shipped, converted from the original
OGG files to mono 44.1 kHz variable-bitrate MP3 for browser compatibility. Pitch,
volume and layering are adjusted at playback; the recordings are otherwise
unchanged. The complete shipped sample library is about 50 KB.

| Shipped file | Pack | Original file |
| --- | --- | --- |
| `grass-1.mp3` | Impact Sounds | `footstep_grass_000.ogg` |
| `grass-2.mp3` | Impact Sounds | `footstep_grass_001.ogg` |
| `grass-3.mp3` | Impact Sounds | `footstep_grass_002.ogg` |
| `stone-1.mp3` | Impact Sounds | `footstep_concrete_000.ogg` |
| `stone-2.mp3` | Impact Sounds | `footstep_concrete_001.ogg` |
| `land.mp3` | Impact Sounds | `impactSoft_heavy_001.ogg` |
| `thump.mp3` | Impact Sounds | `impactPunch_heavy_001.ogg` |
| `tap.mp3` | Impact Sounds | `impactWood_light_001.ogg` |
| `cloth.mp3` | RPG Audio | `cloth1.ogg` |
| `swish.mp3` | RPG Audio | `knifeSlice.ogg` |
| `coins.mp3` | RPG Audio | `handleCoins2.ogg` |

## Playback design

Audio starts only after a user gesture. Samples load asynchronously and every
major gameplay cue retains a synthesis layer if a file cannot load. A short
stereo room, soft transient envelopes, restrained stereo placement and master
compression keep the mix comfortable. Major rewards briefly lower music so the
fanfare stays clear. Frequent impacts have cooldowns; footsteps follow distance
rather than frame rate. Unused source nodes disconnect when they finish.

The mixer supports independent music and effects levels, a master level and
mute, with preferences saved locally when browser storage is available. Audio
and the scheduler pause together, and returning from a background tab skips
missed notes rather than replaying a burst. The soundtrack changes arrangement
on a bar boundary.

## Integration

The existing `Sound` API remains available: `unlock`, `play`, `engine`,
`startMusic`, `stopMusic`, `setMuted`, `tone` and `noise`.

- `setScene('explore' | 'moon' | 'boss' | 'race' | 'victory')` selects the next arrangement.
- `setPaused(boolean)` suspends/resumes sound and music together. Combine menu
  pause and tab visibility before calling it.
- `setVolume(0..1)`, `setMusicVolume(0..1)`, `setEffectsVolume(0..1)` save mixer settings.
- `footstep({ speed, surface, grounded, dt })` advances a distance-based cadence;
  `surface` may be `'grass'`, `'stone'` or `'moon'` and `dt` is in seconds.
- `play('trailStart' | 'ring' | 'trailWin' | 'trailFail' | 'click')` adds gentle
  optional challenge and UI cues.
- `ready` resolves after sample loading has settled, including offline failures.
- `dispose()` stops and releases the audio context.

## Regression checks

With the repository served at `http://127.0.0.1:8766/`, run
`node tests/mirio-audio-e2e.mjs`. Set `PLAYWRIGHT` to an installed Playwright
module if it is not available locally, `BASE_URL` for a different server, or
`BROWSER=webkit` to run in Safari's engine. The suite decodes all shipped files,
checks saved preferences and pause/resume cleanup, renders every arrangement
and cue through a real offline audio graph, checks headroom, and exercises
blocked storage and unavailable sample downloads. It does not start the 3D
world or contact a third-party host.
