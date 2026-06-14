const audioCache = new Map<string, HTMLAudioElement>();

export function preloadAudio(): void {
  const files: Record<string, string> = {
    place: '/sounds/place.mp3',
    complete: '/sounds/complete.mp3',
    collision: '/sounds/collision.mp3',
    click: '/sounds/click.mp3',
  };

  for (const [key, url] of Object.entries(files)) {
    try {
      const audio = new Audio();
      audio.src = url;
      audio.preload = 'auto';
      audio.volume = 0.5;
      audioCache.set(key, audio);
    } catch {
      // Audio not critical
    }
  }
}

export function playSound(name: string): void {
  const audio = audioCache.get(name);
  if (!audio) return;
  try {
    const clone = audio.cloneNode() as HTMLAudioElement;
    clone.volume = audio.volume;
    clone.play().catch(() => {});
  } catch {
    // Ignore autoplay errors
  }
}

export function useAudio() {
  return {
    playPlace: () => playSound('place'),
    playComplete: () => playSound('complete'),
    playCollision: () => playSound('collision'),
    playClick: () => playSound('click'),
  };
}
