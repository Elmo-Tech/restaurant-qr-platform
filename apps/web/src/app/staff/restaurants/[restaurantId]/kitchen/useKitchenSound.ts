'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const SOUND_KEY = 'kitchen-sound';

/**
 * Whether the device can actually play the chime right now -- separate from
 * the saved preference. `blocked`: the browser has not allowed audio yet (no
 * user gesture since the page loaded, or the device suspended it).
 */
export type KitchenAudioState = 'unsupported' | 'blocked' | 'ready';

function audioContextClass(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ??
    null
  );
}

/**
 * Kitchen K1: the opt-in new-ticket chime. One AudioContext for the whole
 * visit, created and resumed only from an explicit click (browsers refuse to
 * start audio otherwise), and closed when the board unmounts. The saved
 * preference ("I want sound") is kept apart from `audio` ("sound can play"),
 * so the board can say when sound is on but blocked.
 */
export function useKitchenSound() {
  const [preference, setPreference] = useState(false);
  const [audio, setAudio] = useState<KitchenAudioState>('blocked');
  const preferenceRef = useRef(false);
  const contextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    let stored = false;
    try {
      stored = window.localStorage.getItem(SOUND_KEY) === 'on';
    } catch {
      // Storage may be unavailable; the board works without it.
    }
    const supported = audioContextClass() !== null;
    preferenceRef.current = stored;
    queueMicrotask(() => {
      setPreference(stored);
      setAudio(supported ? 'blocked' : 'unsupported');
    });
    return () => {
      const context = contextRef.current;
      contextRef.current = null;
      if (context) {
        context.onstatechange = null;
        void context.close().catch(() => undefined);
      }
    };
  }, []);

  /** Must run inside a click handler: the user gesture is what lets the browser start audio. */
  const unlock = useCallback(async (): Promise<boolean> => {
    const AudioContextClass = audioContextClass();
    if (!AudioContextClass) {
      setAudio('unsupported');
      return false;
    }
    try {
      let context = contextRef.current;
      if (!context || context.state === 'closed') {
        const created = new AudioContextClass();
        created.onstatechange = () => {
          if (contextRef.current === created) setAudio(created.state === 'running' ? 'ready' : 'blocked');
        };
        contextRef.current = created;
        context = created;
      }
      if (context.state !== 'running') await context.resume();
    } catch {
      // Refused or no output device: reported as blocked below.
    }
    const running = contextRef.current?.state === 'running';
    setAudio(running ? 'ready' : 'blocked');
    return running;
  }, []);

  /** A short, soft two-note chime on the shared context. Silent unless sound is wanted AND allowed. */
  const play = useCallback(() => {
    const context = contextRef.current;
    if (!preferenceRef.current || !context || context.state !== 'running') return;
    try {
      const now = context.currentTime;
      [660, 880].forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, now + index * 0.18);
        gain.gain.exponentialRampToValueAtTime(0.25, now + index * 0.18 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.18 + 0.3);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(now + index * 0.18);
        oscillator.stop(now + index * 0.18 + 0.32);
      });
    } catch {
      // A failing audio device must never break the board.
    }
  }, []);

  const toggle = useCallback(() => {
    const next = !preferenceRef.current;
    preferenceRef.current = next;
    setPreference(next);
    try {
      window.localStorage.setItem(SOUND_KEY, next ? 'on' : 'off');
    } catch {
      // Ignore: the choice still applies for this visit.
    }
    if (next) {
      void unlock().then((ready) => {
        if (ready) play(); // a preview, so the user hears what to listen for
      });
    } else {
      const context = contextRef.current;
      if (context?.state === 'running') void context.suspend().catch(() => undefined);
    }
  }, [unlock, play]);

  /** The explicit "tap to enable" path when the preference is on but the browser has not allowed audio yet. */
  const enable = useCallback(() => {
    void unlock().then((ready) => {
      if (ready) play();
    });
  }, [unlock, play]);

  return { preference, audio, toggle, enable, play };
}
