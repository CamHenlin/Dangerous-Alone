/**
 * Web Audio player for the extracted Zelda Bank-0 music, cues and DPCM samples.
 *
 * Sequencing, envelope and arbitration logic lives in tools/shared so it can be
 * unit tested; this file only owns the WebAudio graph.
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

const FRAME_HZ = 60.0988;

/** CustomEnvelopeSong is walked from index $20, so it is constant past frame 32. */
const ENVELOPE_FRAMES = 33;

/** ROM `@PlayNote` @ Z_00.asm:483 pins $4004 to $86 for every Tune1 note. */
const TUNE1_DUTY = 0x86;

/** The four song voices, each on its own gain node so cues can duck them. */
const SONG_VOICES = ['sq1', 'sq2', 'triangle', 'noise'];

/**
 * @typedef {object} AudioApi
 * @property {() => Promise<void>} unlock
 * @property {(name: string) => void} playMusic
 * @property {(name: string) => void} playFanfare
 * @property {() => void} stopMusic
 * @property {(name: string) => void} playSfx
 * @property {(on: boolean) => void} setMuted
 * @property {() => boolean} isMuted
 * @property {(v: number) => void} setVolume
 * @property {() => number} getVolume
 * @property {() => string | null} currentMusic
 */

/**
 * @param {object} pack extracted audio.json
 * @returns {AudioApi}
 */
export function createAudio(pack) {
  /** @type {AudioContext | null} */
  let ctx = null;
  let muted = localStorage.getItem('zelda_mute') === '1';
  let volume = Number(localStorage.getItem('zelda_vol') ?? '0.45');
  if (!Number.isFinite(volume)) volume = 0.45;
  volume = Math.min(1, Math.max(0, volume));

  /** @type {string | null} */
  let musicName = null;
  /** @type {number} */
  let musicPart = 0;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let musicTimer = null;
  /** @type {(OscillatorNode | AudioBufferSourceNode)[]} */
  let liveSong = [];
  /** @type {(OscillatorNode | AudioBufferSourceNode)[]} */
  let liveCue = [];
  /** @type {GainNode | null} */
  let master = null;
  /** @type {Record<string, GainNode>} */
  let songBus = {};
  /** @type {GainNode | null} */
  let cueBus = null;

  const frameSec = 1 / (pack.frameHz ?? FRAME_HZ);
  const songEnvelope = pack.envelopes?.song ?? [];
  const tune1Envelope = pack.envelopes?.tune1 ?? [];

  /** ROM channel arbitration state (see @shared/audioMixer.js). */
  let mixer = createChannelState();
  /** @type {Record<string, ReturnType<typeof setTimeout> | null>} */
  const cueTimers = { tune0: null, tune1: null, effect: null, sample: null };
  /** Absolute ctx time each song voice is ducked until. */
  const duckedUntil = { sq1: 0, sq2: 0, triangle: 0, noise: 0 };

  /** @type {Uint8Array | null} */
  let pcmBytes = null;
  /** @type {Map<string, AudioBuffer>} */
  const sampleBuffers = new Map();

  function ensureCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : volume;
      master.connect(ctx.destination);
      songBus = {};
      for (const ch of SONG_VOICES) {
        const g = ctx.createGain();
        g.gain.value = 1;
        g.connect(master);
        songBus[ch] = g;
      }
      cueBus = ctx.createGain();
      cueBus.gain.value = 1;
      cueBus.connect(master);
    }
    return ctx;
  }

  async function unlock() {
    const c = ensureCtx();
    if (c.state === 'suspended') await c.resume();
  }

  function applyGain() {
    if (master) master.gain.value = muted ? 0 : volume;
  }

  /**
   * @param {(OscillatorNode | AudioBufferSourceNode)[]} nodes
   */
  function stopNodes(nodes) {
    for (const n of nodes) {
      try {
        n.stop();
      } catch {
        /* already stopped */
      }
    }
    nodes.length = 0;
  }

  function clearMusicTimer() {
    if (musicTimer != null) {
      clearTimeout(musicTimer);
      musicTimer = null;
    }
  }

  function stopMusic() {
    clearMusicTimer();
    stopNodes(liveSong);
    musicName = null;
    musicPart = 0;
    mixer = { ...mixer, songActive: false };
  }

  /**
   * ROM behaviour: a cue owns its channel outright for as long as it plays, so
   * the song's voice is muted rather than mixed underneath.
   * @param {string} channel
   * @param {number} start
   * @param {number} durSec
   */
  function duckSongVoice(channel, start, durSec) {
    const g = songBus[channel];
    if (!g) return;
    const until = start + durSec;
    if (until <= duckedUntil[channel]) return;
    // Drop any pending un-duck from a shorter cue that is still running.
    g.gain.cancelScheduledValues(start);
    g.gain.setValueAtTime(0, start);
    g.gain.setValueAtTime(1, until);
    duckedUntil[channel] = until;
  }

  /**
   * @param {(OscillatorNode | AudioBufferSourceNode)[]} sink
   * @param {OscillatorNode | AudioBufferSourceNode} node
   */
  function track(sink, node) {
    sink.push(node);
    node.onended = () => {
      const i = sink.indexOf(node);
      if (i >= 0) sink.splice(i, 1);
    };
  }

  /**
   * @param {'tune0'|'tune1'|'effect'|'sample'} channel
   * @param {number} durSec
   */
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
   * Schedule one square-wave note, shaping its gain from a per-frame volume.
   * @param {GainNode} bus
   * @param {(OscillatorNode | AudioBufferSourceNode)[]} sink
   * @param {number} hz
   * @param {number} start
   * @param {number} frames
   * @param {(frame: number) => number} volumeAt 0..15
   * @param {number} peak
   */
  function scheduleSquare(bus, sink, hz, start, frames, volumeAt, peak) {
    const c = ensureCtx();
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
    track(sink, osc);
  }

  /**
   * @param {GainNode} bus
   * @param {(OscillatorNode | AudioBufferSourceNode)[]} sink
   * @param {number} hz
   * @param {number} start
   * @param {number} frames
   * @param {number} peak
   */
  function scheduleTriangle(bus, sink, hz, start, frames, peak) {
    const c = ensureCtx();
    if (hz <= 0 || frames <= 0) return;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'triangle';
    osc.frequency.value = hz;
    // The NES triangle has no volume control; it is on or off.
    g.gain.setValueAtTime(peak, start);
    g.gain.setValueAtTime(0, start + frames * frameSec);
    osc.connect(g);
    g.connect(bus);
    osc.start(start);
    osc.stop(start + frames * frameSec + 0.01);
    track(sink, osc);
  }

  /**
   * @param {GainNode} bus
   * @param {(OscillatorNode | AudioBufferSourceNode)[]} sink
   * @param {{ t: number, dur: number, period: number, volume: number }[]} events
   * @param {number} start
   * @param {number} amplitude
   */
  function scheduleNoise(bus, sink, events, start, amplitude) {
    const c = ensureCtx();
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
    track(sink, src);
  }

  /**
   * The song's noise voice stores raw control notes; ROM `@HandleNoise`
   * @ Z_00.asm:1036 turns bits 1-5 into an index into NoiseVolumes /
   * NoisePeriods.
   * @param {{ t: number, dur: number, note: number }[]} events
   */
  function songNoiseEvents(events) {
    const volumes = pack.noise?.volumes ?? [];
    const periods = pack.noise?.periods ?? [];
    return events.map((ev) => {
      const idx = (ev.note & 0x3e) >> 4;
      return {
        t: ev.t,
        dur: ev.dur,
        period: periods[idx] ?? 0,
        volume: dutyVolume(volumes[idx] ?? 0).volume,
      };
    });
  }

  /**
   * @param {object} song
   * @param {number} when
   * @returns {number} end time (ctx seconds)
   */
  function scheduleSong(song, when) {
    // Prefer voice-A (sq2) end — matches NES song end; ignore harmony that
    // bleeds past the phrase into the next script in ROM (item → overworld).
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
        scheduleNoise(bus, liveSong, songNoiseEvents(clipped), when, 0.28);
        continue;
      }
      for (const ev of events) {
        if (phraseEnd && ev.t >= phraseEnd) continue;
        const frames = phraseEnd ? Math.min(ev.dur, phraseEnd - ev.t) : ev.dur;
        if (frames <= 0 || ev.hz <= 0) continue;
        const start = when + ev.t * frameSec;
        if (ch === 'triangle') {
          scheduleTriangle(bus, liveSong, ev.hz, start, frames, 0.1);
          continue;
        }
        const volumeAt = (f) => songEnvelopeVolume(songEnvelope, selector, f);
        const peak = ch === 'sq2' ? 0.11 : 0.08;
        scheduleSquare(bus, liveSong, ev.hz, start, frames, volumeAt, peak);
      }
    }
    return when + phraseEnd * frameSec;
  }

  function playMusicPart() {
    if (!musicName) return;
    const pl = pack.playlists?.[musicName];
    if (!pl?.parts?.length) return;
    const c = ensureCtx();
    stopNodes(liveSong);
    const key = pl.parts[musicPart];
    const song = pack.songs?.[key];
    if (!song) return;
    const start = c.currentTime + 0.02;
    const end = scheduleSong(song, start);
    const delayMs = Math.max(50, (end - c.currentTime) * 1000);
    clearMusicTimer();
    musicTimer = setTimeout(() => {
      musicPart += 1;
      if (musicPart >= pl.parts.length) {
        if (!pl.loop) {
          musicName = null;
          mixer = { ...mixer, songActive: false };
          return;
        }
        // ROM `SetPrevPhraseIndex`: looping songs restart at a later phrase, so
        // an intro phrase only plays once.
        musicPart = Math.min(pl.loopStart ?? 0, pl.parts.length - 1);
      }
      playMusicPart();
    }, delayMs);
  }

  /** @type {string | null} */
  let resumeMusic = null;

  /**
   * @param {string} name playlist key
   */
  function playMusic(name) {
    if (!pack.playlists?.[name]) return;
    if (musicName === name) return;
    void unlock().then(() => {
      stopMusic();
      resumeMusic = name;
      musicName = name;
      musicPart = 0;
      mixer = { ...mixer, songActive: true };
      playMusicPart();
    });
  }

  /**
   * One-shot fanfare; resumes prior looping music when done.
   * @param {string} name
   */
  function playFanfare(name) {
    if (!pack.playlists?.[name]) return;
    void unlock().then(() => {
      const prev = resumeMusic;
      clearMusicTimer();
      stopNodes(liveSong);
      musicName = name;
      musicPart = 0;
      mixer = { ...mixer, songActive: true };
      const pl = pack.playlists[name];
      const c = ensureCtx();
      let when = c.currentTime + 0.02;
      for (const key of pl.parts) {
        const song = pack.songs?.[key];
        if (song) when = scheduleSong(song, when);
      }
      const delayMs = Math.max(50, (when - c.currentTime) * 1000);
      musicTimer = setTimeout(() => {
        musicName = null;
        if (prev) {
          musicName = prev;
          musicPart = 0;
          playMusicPart();
        }
      }, delayMs);
    });
  }

  /**
   * @param {object} sfx sample entry from the pack
   * @param {number} initialDac
   */
  function sampleBuffer(sfx, initialDac) {
    const key = `${sfx.pcmOffset}:${sfx.byteLength}:${initialDac}`;
    const cached = sampleBuffers.get(key);
    if (cached) return cached;
    const c = ensureCtx();
    if (!pcmBytes) pcmBytes = base64ToBytes(pack.samples?.pcm ?? '');
    const slice = pcmBytes.subarray(sfx.pcmOffset, sfx.pcmOffset + sfx.byteLength);
    const pcm = renderDpcm(slice, { initialDac });
    const buf = c.createBuffer(1, pcm.length, sfx.sampleHz);
    buf.getChannelData(0).set(pcm);
    sampleBuffers.set(key, buf);
    return buf;
  }

  /**
   * @param {object} sfx
   * @param {number} start
   */
  function playSampleCue(sfx, start) {
    const c = ensureCtx();
    const decision = requestSample(mixer, sfx.bit);
    mixer = decision.state;
    const buf = sampleBuffer(sfx, decision.initialDac);
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    g.gain.value = 0.5;
    src.connect(g);
    g.connect(/** @type {GainNode} */ (cueBus));
    src.start(start);
    track(liveCue, src);
    holdCue('sample', buf.duration);
  }

  /**
   * @param {string} name
   */
  function playSfx(name) {
    const sfx = pack.sfx?.[name];
    if (!sfx) return;
    void unlock().then(() => {
      const c = ensureCtx();
      const start = c.currentTime + 0.01;
      const bus = /** @type {GainNode} */ (cueBus);

      if (sfx.kind === 'sample') {
        playSampleCue(sfx, start);
        return;
      }

      if (sfx.kind === 'effect') {
        const decision = requestEffect(mixer, sfx.bit);
        mixer = decision.state;
        const durSec = sfx.durationFrames * frameSec;
        duckSongVoice('noise', start, durSec);
        scheduleNoise(bus, liveCue, sfx.events, start, 0.45);
        holdCue('effect', durSec);
        return;
      }

      if (sfx.kind === 'tune0') {
        const decision = requestTune0(mixer, sfx.bit);
        mixer = decision.state;
        if (decision.silenceSong) stopMusic();
        if (!decision.accepted) return;
        const durSec = sfx.durationFrames * frameSec;
        duckSongVoice('sq1', start, durSec);
        for (const ev of sfx.events) {
          // Every Tune0 note rewrites $4003, restarting the length counter, so
          // the hardware envelope never gets a chance to decay.
          const vol = hardwareEnvelopeVolume(ev.duty, 0);
          scheduleSquare(bus, liveCue, ev.hz, start + ev.t * frameSec, ev.dur, () => vol, 0.16);
        }
        holdCue('tune0', durSec);
        return;
      }

      if (sfx.kind === 'tune1') {
        const decision = requestTune1(mixer, sfx.bit);
        mixer = decision.state;
        if (decision.silenceSong) stopMusic();
        if (!decision.accepted) return;
        const durSec = sfx.durationFrames * frameSec;
        duckSongVoice('sq2', start, durSec);
        for (const ev of sfx.events) {
          const volumeAt = sfx.envelope
            ? (f) => tune1EnvelopeVolume(tune1Envelope, f)
            : (f) => hardwareEnvelopeVolume(TUNE1_DUTY, f);
          scheduleSquare(bus, liveCue, ev.hz, start + ev.t * frameSec, ev.dur, volumeAt, 0.16);
        }
        holdCue('tune1', durSec);
      }
    });
  }

  return {
    unlock,
    playMusic,
    playFanfare,
    stopMusic,
    playSfx,
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
  };
}
