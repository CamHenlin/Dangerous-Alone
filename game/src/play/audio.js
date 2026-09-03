/**
 * Web Audio player for extracted Bank-0 music, cues and DPCM samples.
 *
 * Sequencing, envelope and arbitration logic lives in tools/shared so it can be
 * unit tested; this file only owns the WebAudio graph.
 *
 * Music and SFX use separate AudioContexts. Stopping or switching BGM closes the
 * music context, which is the only reliable way to silence in-flight notes
 * (Web Audio forbids rescheduling stop() once stop(endTime) has been set).
 */

import {
  dutyVolume,
  hardwareEnvelopeVolume,
  songEnvelopeVolume,
  tune1EnvelopeVolume,
} from '@shared/audioTables.js';
import { base64ToBytes, renderDpcm, renderNoiseEvents } from '@shared/audioRender.js';
import {
  createChannelState,
  endCue,
  requestEffect,
  requestSample,
  requestTune0,
  requestTune1,
} from '@shared/audioMixer.js';
import { mapSongNoiseEvents } from '@shared/musicFormat.js';

const FRAME_HZ = 60.0988;
const ENVELOPE_FRAMES = 33;
const TUNE1_DUTY = 0x86;
const SONG_VOICES = ['sq1', 'sq2', 'triangle', 'noise'];
const DISPOSE_KEY = '__zeldaAudioDispose';
/** SampleRequest bits for the three boss roars (`boss_roar_1/2/3`). */
const BOSS_ROAR_SAMPLE_BITS = new Set([0x10, 0x20, 0x40]);

/**
 * @typedef {object} AudioApi
 * @property {() => Promise<void>} unlock
 * @property {(name: string) => void} playMusic
 * @property {(name: string) => void} playFanfare
 * @property {() => void} stopMusic
 * @property {() => void} stopSfx
 * @property {(name: string, opts?: { background?: boolean }) => void} playSfx
 * @property {() => void} dispose
 * @property {(on: boolean) => void} setMuted
 * @property {() => boolean} isMuted
 * @property {(v: number) => void} setVolume
 * @property {() => number} getVolume
 * @property {() => string | null} currentMusic
 * @property {() => number} currentMusicGen
 */

/**
 * @param {object} pack extracted audio.json
 * @returns {AudioApi}
 */
export function createAudio(pack) {
  const prevDispose = /** @type {(() => void) | undefined} */ (globalThis[DISPOSE_KEY]);
  if (typeof prevDispose === 'function') {
    try {
      prevDispose();
    } catch {
      /* */
    }
  }

  /** SFX context */
  /** @type {AudioContext | null} */
  let sfxCtx = null;
  /** @type {GainNode | null} */
  let sfxMaster = null;
  /** @type {GainNode | null} */
  let cueBus = null;

  /** Music context — closed on every stop/switch so no note can linger. */
  /** @type {AudioContext | null} */
  let musicCtx = null;
  /** @type {GainNode | null} */
  let musicMaster = null;
  /** @type {Record<string, GainNode>} */
  let songBus = {};

  let muted = localStorage.getItem('zelda_mute') === '1';
  let volume = Number(localStorage.getItem('zelda_vol') ?? '0.45');
  if (!Number.isFinite(volume)) volume = 0.45;
  volume = Math.min(1, Math.max(0, volume));

  /** @type {string | null} */
  let musicName = null;
  let musicPart = 0;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let musicTimer = null;
  let musicGen = 0;
  let sfxGen = 0;
  /** @type {string | null} */
  let resumeMusic = null;

  /** @type {(AudioScheduledSourceNode)[]} */
  let liveCue = [];
  let mixer = createChannelState();
  /** @type {Record<string, ReturnType<typeof setTimeout> | null>} */
  const cueTimers = { tune0: null, tune1: null, effect: null, sample: null };
  const duckedUntil = { sq1: 0, sq2: 0, triangle: 0, noise: 0 };

  const frameSec = 1 / (pack.frameHz ?? FRAME_HZ);
  const songEnvelope = pack.envelopes?.song ?? [];
  const tune1Envelope = pack.envelopes?.tune1 ?? [];

  /** @type {Uint8Array | null} */
  let pcmBytes = null;
  /** @type {Map<string, AudioBuffer>} */
  const sampleBuffers = new Map();

  function audioCtor() {
    return window.AudioContext || window.webkitAudioContext;
  }

  function ensureSfxCtx() {
    if (!sfxCtx || sfxCtx.state === 'closed') {
      sfxCtx = new (audioCtor())();
      sfxMaster = sfxCtx.createGain();
      sfxMaster.gain.value = muted ? 0 : volume;
      sfxMaster.connect(sfxCtx.destination);
      cueBus = sfxCtx.createGain();
      cueBus.gain.value = 1;
      cueBus.connect(sfxMaster);
    }
    return sfxCtx;
  }

  function buildMusicGraph(ctx) {
    musicMaster = ctx.createGain();
    musicMaster.gain.value = muted ? 0 : volume;
    musicMaster.connect(ctx.destination);
    songBus = {};
    for (const ch of SONG_VOICES) {
      const g = ctx.createGain();
      g.gain.value = 1;
      g.connect(musicMaster);
      songBus[ch] = g;
      duckedUntil[ch] = 0;
    }
  }

  function ensureMusicCtx() {
    if (!musicCtx || musicCtx.state === 'closed') {
      musicCtx = new (audioCtor())();
      buildMusicGraph(musicCtx);
    }
    return musicCtx;
  }

  function applyGain() {
    const v = muted ? 0 : volume;
    if (sfxMaster) sfxMaster.gain.value = v;
    if (musicMaster) musicMaster.gain.value = v;
  }

  async function unlock() {
    const sfx = ensureSfxCtx();
    if (sfx.state === 'suspended') await sfx.resume();
    // Music context is created on demand; resume it if it already exists.
    if (musicCtx && musicCtx.state === 'suspended') await musicCtx.resume();
  }

  function clearMusicTimer() {
    if (musicTimer != null) {
      clearTimeout(musicTimer);
      musicTimer = null;
    }
  }

  /** Close the music context — every in-flight BGM note dies with it. */
  function cutSong() {
    clearMusicTimer();
    const old = musicCtx;
    musicCtx = null;
    musicMaster = null;
    songBus = {};
    if (old && old.state !== 'closed') {
      try {
        void old.close();
      } catch {
        /* */
      }
    }
  }

  function haltSongPlayback() {
    // Invalidate pending playMusic unlock callbacks so a late SilenceSong
    // cannot revive the track that was just cut.
    musicGen += 1;
    cutSong();
    musicName = null;
    musicPart = 0;
    mixer = { ...mixer, songActive: false };
  }

  function stopMusic() {
    haltSongPlayback();
    resumeMusic = null;
  }

  function clearCueTimers() {
    for (const channel of Object.keys(cueTimers)) {
      if (cueTimers[channel]) {
        clearTimeout(cueTimers[channel]);
        cueTimers[channel] = null;
      }
    }
  }

  function stopCueNodes(nodes) {
    const now = sfxCtx?.currentTime;
    const list = nodes.slice();
    nodes.length = 0;
    for (const n of list) {
      try {
        n.onended = null;
      } catch {
        /* */
      }
      try {
        n.disconnect();
      } catch {
        /* */
      }
      if (typeof n.stop === 'function') {
        try {
          n.stop(now ?? 0);
        } catch {
          /* */
        }
      }
    }
  }

  function stopSfx() {
    sfxGen += 1;
    clearCueTimers();
    stopCueNodes(liveCue);
    mixer = { ...mixer, tune0: 0, tune1: 0, effect: 0, sample: 0 };
    // Unduck on the current music graph if any.
    const t = musicCtx?.currentTime ?? 0;
    for (const ch of SONG_VOICES) {
      const g = songBus[ch];
      if (!g) continue;
      try {
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(1, t);
      } catch {
        /* */
      }
      duckedUntil[ch] = 0;
    }
  }

  function duckSongVoice(channel, start, durSec) {
    const g = songBus[channel];
    if (!g || !musicCtx) return;
    const until = start + durSec;
    if (until <= duckedUntil[channel]) return;
    g.gain.cancelScheduledValues(start);
    g.gain.setValueAtTime(0, start);
    g.gain.setValueAtTime(1, until);
    duckedUntil[channel] = until;
  }

  function trackCue(sink, source) {
    sink.push(source);
    source.onended = () => {
      const i = sink.indexOf(source);
      if (i >= 0) sink.splice(i, 1);
    };
  }

  function holdCue(channel, durSec) {
    if (cueTimers[channel]) clearTimeout(cueTimers[channel]);
    cueTimers[channel] = setTimeout(
      () => {
        mixer = endCue(mixer, channel);
        cueTimers[channel] = null;
      },
      Math.max(16, durSec * 1000),
    );
  }

  /**
   * @param {GainNode} bus
   * @param {AudioContext} c
   * @param {number} hz
   * @param {number} start
   * @param {number} frames
   * @param {(frame: number) => number} volumeAt
   * @param {number} peak
   */
  function scheduleSquare(bus, c, hz, start, frames, volumeAt, peak) {
    if (hz <= 0 || frames <= 0) return;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'square';
    osc.frequency.value = hz;
    const shaped = Math.min(frames, ENVELOPE_FRAMES);
    for (let f = 0; f < shaped; f += 1) {
      g.gain.setValueAtTime((volumeAt(f) / 15) * peak, start + f * frameSec);
    }
    if (frames > shaped) {
      g.gain.setValueAtTime((volumeAt(shaped) / 15) * peak, start + shaped * frameSec);
    }
    const durSec = frames * frameSec;
    g.gain.setValueAtTime(0, start + durSec);
    osc.connect(g);
    g.connect(bus);
    osc.start(start);
    osc.stop(start + durSec + 0.01);
    return osc;
  }

  /**
   * @param {GainNode} bus
   * @param {AudioContext} c
   * @param {number} hz
   * @param {number} start
   * @param {number} frames
   * @param {number} peak
   */
  function scheduleTriangle(bus, c, hz, start, frames, peak) {
    if (hz <= 0 || frames <= 0) return;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'triangle';
    osc.frequency.value = hz;
    g.gain.setValueAtTime(peak, start);
    g.gain.setValueAtTime(0, start + frames * frameSec);
    osc.connect(g);
    g.connect(bus);
    osc.start(start);
    osc.stop(start + frames * frameSec + 0.01);
  }

  /**
   * @param {GainNode} bus
   * @param {AudioContext} c
   * @param {{ t: number, dur: number, period: number, volume: number }[]} events
   * @param {number} start
   * @param {number} amplitude
   * @param {(src: AudioBufferSourceNode) => void} [onCreate]
   */
  function scheduleNoise(bus, c, events, start, amplitude, onCreate) {
    if (!events.length) return;
    const pcm = renderNoiseEvents(events, {
      sampleRate: c.sampleRate,
      frameHz: pack.frameHz ?? FRAME_HZ,
      amplitude,
    });
    const buf = c.createBuffer(1, pcm.length, c.sampleRate);
    buf.getChannelData(0).set(pcm);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(bus);
    src.start(start);
    onCreate?.(src);
  }

  function songNoiseEvents(events) {
    return mapSongNoiseEvents(events, pack.noise ?? {});
  }

  /**
   * @param {object} song
   * @param {number} when
   * @param {AudioContext} c
   */
  function scheduleSong(song, when, c) {
    let phraseEnd = 0;
    for (const e of song.channels?.sq2 ?? []) {
      phraseEnd = Math.max(phraseEnd, e.t + e.dur);
    }
    if (!phraseEnd) phraseEnd = song.durationFrames ?? 0;
    const selector = song.envelopeSelector ?? 0;

    for (const [ch, events] of Object.entries(song.channels ?? {})) {
      const bus = songBus[ch];
      if (!bus) continue;
      if (ch === 'noise') {
        const clipped = events.filter((ev) => !phraseEnd || ev.t < phraseEnd);
        scheduleNoise(bus, c, songNoiseEvents(clipped), when, 0.28);
        continue;
      }
      for (const ev of events) {
        if (phraseEnd && ev.t >= phraseEnd) continue;
        const frames = phraseEnd ? Math.min(ev.dur, phraseEnd - ev.t) : ev.dur;
        if (frames <= 0 || ev.hz <= 0) continue;
        const start = when + ev.t * frameSec;
        if (ch === 'triangle') {
          scheduleTriangle(bus, c, ev.hz, start, frames, 0.1);
          continue;
        }
        const volumeAt = (f) => songEnvelopeVolume(songEnvelope, selector, f);
        const peak = ch === 'sq2' ? 0.11 : 0.08;
        scheduleSquare(bus, c, ev.hz, start, frames, volumeAt, peak);
      }
    }
    return when + phraseEnd * frameSec;
  }

  /**
   * @param {number} gen
   * @param {string} name
   */
  function playMusicPart(gen, name) {
    if (gen !== musicGen || musicName !== name) return;
    const pl = pack.playlists?.[name];
    if (!pl?.parts?.length) return;

    // Each phrase runs on a fresh music context so prior stop(end)-scheduled
    // notes cannot bleed into the next phrase or the next playlist.
    const part = musicPart;
    cutSong();
    if (gen !== musicGen || musicName !== name) return;
    musicPart = part;

    const ctx = ensureMusicCtx();
    void ctx.resume().then(() => {
      if (gen !== musicGen || musicName !== name || !musicCtx || musicCtx !== ctx) {
        return;
      }
      const key = pl.parts[musicPart];
      const song = pack.songs?.[key];
      if (!song) return;
      const start = ctx.currentTime + 0.02;
      const end = scheduleSong(song, start, ctx);
      const delayMs = Math.max(50, (end - ctx.currentTime) * 1000);
      clearMusicTimer();
      musicTimer = setTimeout(() => {
        if (gen !== musicGen || musicName !== name) return;
        musicPart += 1;
        if (musicPart >= pl.parts.length) {
          if (!pl.loop) {
            musicName = null;
            mixer = { ...mixer, songActive: false };
            cutSong();
            return;
          }
          musicPart = Math.min(pl.loopStart ?? 0, pl.parts.length - 1);
        }
        playMusicPart(gen, name);
      }, delayMs);
    });
  }

  /**
   * @param {string} name playlist key
   */
  function playMusic(name) {
    if (!pack.playlists?.[name]) return;
    if (
      musicName === name
      && mixer.songActive
      && musicCtx
      && musicCtx.state === 'running'
    ) {
      return;
    }
    const gen = ++musicGen;
    cutSong();
    musicName = name;
    resumeMusic = name;
    musicPart = 0;
    mixer = { ...mixer, songActive: true };
    void unlock().then(() => {
      if (gen !== musicGen) return;
      musicName = name;
      mixer = { ...mixer, songActive: true };
      playMusicPart(gen, name);
    });
  }

  /**
   * @param {string} name
   */
  function playFanfare(name) {
    if (!pack.playlists?.[name]) return;
    const gen = ++musicGen;
    const prev = resumeMusic;
    cutSong();
    musicName = name;
    musicPart = 0;
    mixer = { ...mixer, songActive: true };
    void unlock().then(() => {
      if (gen !== musicGen) return;
      const ctx = ensureMusicCtx();
      void ctx.resume().then(() => {
        if (gen !== musicGen) return;
        musicName = name;
        const pl = pack.playlists[name];
        let when = ctx.currentTime + 0.02;
        for (const key of pl.parts) {
          const song = pack.songs?.[key];
          if (song) when = scheduleSong(song, when, ctx);
        }
        const delayMs = Math.max(50, (when - ctx.currentTime) * 1000);
        clearMusicTimer();
        musicTimer = setTimeout(() => {
          if (gen !== musicGen) return;
          musicName = null;
          mixer = { ...mixer, songActive: false };
          cutSong();
          if (prev) playMusic(prev);
        }, delayMs);
      });
    });
  }

  function sampleBuffer(sfx, initialDac) {
    const key = `${sfx.pcmOffset}:${sfx.byteLength}:${initialDac}`;
    const cached = sampleBuffers.get(key);
    if (cached) return cached;
    const c = ensureSfxCtx();
    if (!pcmBytes) pcmBytes = base64ToBytes(pack.samples?.pcm ?? '');
    const slice = pcmBytes.subarray(sfx.pcmOffset, sfx.pcmOffset + sfx.byteLength);
    const pcm = renderDpcm(slice, { initialDac });
    const buf = c.createBuffer(1, pcm.length, sfx.sampleHz);
    buf.getChannelData(0).set(pcm);
    sampleBuffers.set(key, buf);
    return buf;
  }

  function playSampleCue(sfx, start, opts = {}) {
    const c = ensureSfxCtx();
    const bit = opts.background ? sfx.bit | 0x80 : sfx.bit;
    const decision = requestSample(mixer, bit);
    mixer = decision.state;
    const buf = sampleBuffer(sfx, decision.initialDac);
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    g.gain.value = 0.5;
    src.connect(g);
    g.connect(/** @type {GainNode} */ (cueBus));
    src.start(start);
    trackCue(liveCue, src);
    holdCue('sample', buf.duration);
  }

  /**
   * @param {string} name
   * @param {{ background?: boolean }} [opts]
   */
  function playSfx(name, opts = {}) {
    const sfx = pack.sfx?.[name];
    if (!sfx) return;
    // Sea ($20) is re-requested every OW frame on shoreline rooms; the NES
    // `@ContinueSeaSfx` path wins over `@PlaySeaSfx`, so keep the ramp.
    // Claim the mixer slot synchronously so stacked unlock callbacks cannot
    // schedule overlapping sea buffers.
    const seaClaim = sfx.kind === 'effect' && sfx.bit === 0x20;
    if (seaClaim) {
      if (mixer.effect === 0x20) return;
      mixer = { ...mixer, effect: 0x20 };
    }
    // Adjacent-room rumble ORs $80 (DAC $7F) and is retriggered by the sim
    // every $A0 frames. DMC is one shot — skip while the slot is busy.
    const roarClaim = sfx.kind === 'sample' && BOSS_ROAR_SAMPLE_BITS.has(sfx.bit);
    if (roarClaim) {
      if (mixer.sample !== 0) return;
      mixer = { ...mixer, sample: sfx.bit };
    }
    const background = Boolean(opts.background);
    const gen = sfxGen;
    void unlock().then(() => {
      if (gen !== sfxGen) {
        if (seaClaim && mixer.effect === 0x20) mixer = { ...mixer, effect: 0 };
        if (roarClaim && mixer.sample === sfx.bit) mixer = { ...mixer, sample: 0 };
        return;
      }
      const c = ensureSfxCtx();
      const start = c.currentTime + 0.01;
      const bus = /** @type {GainNode} */ (cueBus);

      if (sfx.kind === 'sample') {
        playSampleCue(sfx, start, { background });
        return;
      }

      if (sfx.kind === 'effect') {
        const decision = requestEffect(mixer, sfx.bit);
        mixer = decision.state;
        if (!decision.accepted) return;
        const durSec = sfx.durationFrames * frameSec;
        // Noise duck only applies when music is on the shared graph; with a
        // separate music context, duck the music bus if present.
        duckSongVoice('noise', musicCtx?.currentTime ?? start, durSec);
        scheduleNoise(bus, c, sfx.events, start, 0.45, (src) => trackCue(liveCue, src));
        holdCue('effect', durSec);
        return;
      }

      if (sfx.kind === 'tune0') {
        const decision = requestTune0(mixer, sfx.bit);
        mixer = decision.state;
        if (decision.silenceSong) haltSongPlayback();
        if (!decision.accepted) return;
        const durSec = sfx.durationFrames * frameSec;
        duckSongVoice('sq1', musicCtx?.currentTime ?? start, durSec);
        for (const ev of sfx.events) {
          const vol = hardwareEnvelopeVolume(ev.duty, 0);
          const osc = scheduleSquare(
            bus,
            c,
            ev.hz,
            start + ev.t * frameSec,
            ev.dur,
            () => vol,
            0.16,
          );
          if (osc) trackCue(liveCue, osc);
        }
        holdCue('tune0', durSec);
        return;
      }

      if (sfx.kind === 'tune1') {
        const decision = requestTune1(mixer, sfx.bit);
        mixer = decision.state;
        if (decision.silenceSong) haltSongPlayback();
        if (!decision.accepted) return;
        const durSec = sfx.durationFrames * frameSec;
        duckSongVoice('sq2', musicCtx?.currentTime ?? start, durSec);
        for (const ev of sfx.events) {
          const volumeAt = sfx.envelope
            ? (f) => tune1EnvelopeVolume(tune1Envelope, f)
            : (f) => hardwareEnvelopeVolume(TUNE1_DUTY, f);
          const osc = scheduleSquare(
            bus,
            c,
            ev.hz,
            start + ev.t * frameSec,
            ev.dur,
            volumeAt,
            0.16,
          );
          if (osc) trackCue(liveCue, osc);
        }
        holdCue('tune1', durSec);
      }
    });
  }

  function dispose() {
    stopMusic();
    stopSfx();
    if (sfxCtx && sfxCtx.state !== 'closed') {
      try {
        void sfxCtx.close();
      } catch {
        /* */
      }
    }
    sfxCtx = null;
    sfxMaster = null;
    cueBus = null;
    if (globalThis[DISPOSE_KEY] === dispose) {
      globalThis[DISPOSE_KEY] = undefined;
    }
  }

  globalThis[DISPOSE_KEY] = dispose;

  return {
    unlock,
    playMusic,
    playFanfare,
    stopMusic,
    stopSfx,
    playSfx,
    dispose,
    setMuted(on) {
      muted = Boolean(on);
      localStorage.setItem('zelda_mute', muted ? '1' : '0');
      applyGain();
    },
    isMuted() {
      return muted;
    },
    setVolume(v) {
      volume = Math.min(1, Math.max(0, v));
      localStorage.setItem('zelda_vol', String(volume));
      applyGain();
    },
    getVolume() {
      return volume;
    },
    currentMusic() {
      return musicName;
    },
    currentMusicGen() {
      return musicGen;
    },
  };
}
