import { Assets, Texture } from 'pixi.js';
import { useEffect, useState } from 'react';

const textureCache = new Map<string, Texture>();
const texturePromises = new Map<string, Promise<Texture>>();

const loadTexture = (url: string) => {
  const cached = textureCache.get(url);
  if (cached) {
    return Promise.resolve(cached);
  }

  const pending = texturePromises.get(url);
  if (pending) {
    return pending;
  }

  const promise = Assets.load(url).then((asset) => {
    const texture = asset as Texture;
    textureCache.set(url, texture);
    texturePromises.delete(url);
    return texture;
  });

  texturePromises.set(url, promise);
  return promise;
};

export const useTexture = (url?: string | null) => {
  const [texture, setTexture] = useState<Texture | null>(() => {
    if (!url) {
      return null;
    }
    return textureCache.get(url) ?? null;
  });

  useEffect(() => {
    if (!url) {
      setTexture(null);
      return;
    }

    const cached = textureCache.get(url);
    if (cached) {
      setTexture(cached);
      return;
    }

    let cancelled = false;
    loadTexture(url).then((loaded) => {
      if (!cancelled) {
        setTexture(loaded);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [url]);

  return texture;
};
