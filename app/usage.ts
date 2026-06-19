'use client';

// session-scoped usage tracking. lives in memory and resets on reload, matching the spec's
// "no pii, session memory only" constraint. a tiny external store so any client component can
// record (record from the verify / chat / generate paths) and the meter can subscribe.
import { useSyncExternalStore } from 'react';

export interface Usage {
  verifications: number; // labels checked
  chats: number; // guide messages answered
  images: number; // labels generated
  tokens: number; // cumulative model tokens
}

let usage: Usage = { verifications: 0, chats: 0, images: 0, tokens: 0 };
const subscribers = new Set<() => void>();

export function recordUsage(delta: Partial<Usage>) {
  usage = {
    verifications: usage.verifications + (delta.verifications ?? 0),
    chats: usage.chats + (delta.chats ?? 0),
    images: usage.images + (delta.images ?? 0),
    tokens: usage.tokens + (delta.tokens ?? 0),
  };
  subscribers.forEach((fn) => fn());
}

export function useUsage(): Usage {
  return useSyncExternalStore(
    (cb) => {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
    () => usage,
    () => usage,
  );
}
