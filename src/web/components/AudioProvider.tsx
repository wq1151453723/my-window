import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export interface SpeakableItem {
  id: string;
  title: string;
  subtitle?: string;
  script: string;
  audioPath?: string | null;
  section: string;
}

interface AudioContextValue {
  current: SpeakableItem | null;
  playing: boolean;
  progress: number;
  duration: number;
  rate: number;
  usingFallback: boolean;
  play: (item: SpeakableItem) => void;
  toggle: () => void;
  stop: () => void;
  seek: (ratio: number) => void;
  setRate: (rate: number) => void;
}

const Ctx = createContext<AudioContextValue | null>(null);

export function useAudio(): AudioContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAudio 必须在 AudioProvider 内使用");
  return ctx;
}

export function AudioProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [current, setCurrent] = useState<SpeakableItem | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRateState] = useState(1);
  const [usingFallback, setUsingFallback] = useState(false);
  const fallbackTimer = useRef<number | null>(null);

  const stopFallback = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    if (fallbackTimer.current !== null) {
      window.clearInterval(fallbackTimer.current);
      fallbackTimer.current = null;
    }
  }, []);

  const playFallback = useCallback(
    (item: SpeakableItem) => {
      if (!("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(item.script);
      utter.lang = "zh-CN";
      utter.rate = rate;
      const voices = window.speechSynthesis.getVoices();
      const zh = voices.find((v) => v.lang?.toLowerCase().startsWith("zh"));
      if (zh) utter.voice = zh;
      utter.onend = () => {
        setPlaying(false);
        setProgress(1);
      };
      utter.onerror = () => setPlaying(false);
      window.speechSynthesis.speak(utter);
      const estimated = Math.max(30, item.script.length / 4.2);
      setDuration(estimated);
      const startedAt = Date.now();
      if (fallbackTimer.current !== null) window.clearInterval(fallbackTimer.current);
      fallbackTimer.current = window.setInterval(() => {
        const ratio = Math.min(1, (Date.now() - startedAt) / 1000 / estimated);
        setProgress(ratio);
      }, 250);
    },
    [rate]
  );

  const play = useCallback(
    (item: SpeakableItem) => {
      stopFallback();
      setCurrent(item);
      setProgress(0);
      if (item.audioPath) {
        setUsingFallback(false);
        const el = audioRef.current;
        if (el) {
          el.src = `/audio/${item.audioPath}`;
          el.playbackRate = rate;
          void el.play().catch(() => {
            setUsingFallback(true);
            playFallback(item);
          });
        }
      } else {
        setUsingFallback(true);
        playFallback(item);
      }
    },
    [playFallback, rate, stopFallback]
  );

  const toggle = useCallback(() => {
    if (!current) return;
    if (usingFallback) {
      if (playing) {
        stopFallback();
        setPlaying(false);
      } else {
        playFallback(current);
        setPlaying(true);
      }
      return;
    }
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
    } else {
      el.pause();
    }
  }, [current, playFallback, playing, stopFallback, usingFallback]);

  const stop = useCallback(() => {
    stopFallback();
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.removeAttribute("src");
    }
    setCurrent(null);
    setPlaying(false);
    setProgress(0);
    setDuration(0);
  }, [stopFallback]);

  const seek = useCallback((ratio: number) => {
    const el = audioRef.current;
    if (el && el.duration) el.currentTime = ratio * el.duration;
    setProgress(ratio);
  }, []);

  const setRate = useCallback((r: number) => {
    setRateState(r);
    const el = audioRef.current;
    if (el) el.playbackRate = r;
  }, []);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => {
      if (el.duration) {
        setDuration(el.duration);
        setProgress(el.currentTime / el.duration);
      }
    };
    const onEnd = () => {
      setPlaying(false);
      setProgress(0);
    };
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onTime);
    el.addEventListener("play", () => setPlaying(true));
    el.addEventListener("pause", () => setPlaying(false));
    el.addEventListener("ended", onEnd);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onTime);
      el.removeEventListener("ended", onEnd);
    };
  }, []);

  const value = useMemo<AudioContextValue>(
    () => ({ current, playing, progress, duration, rate, usingFallback, play, toggle, stop, seek, setRate }),
    [current, playing, progress, duration, rate, usingFallback, play, toggle, stop, seek, setRate]
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <audio ref={audioRef} preload="none" className="hidden" />
    </Ctx.Provider>
  );
}