/**
 * The game's top-level UI mode. Each mode owns the screen: in `build` the
 * normal header and bottom navigation step aside for the construction UI, in
 * `drive` the test drive runs full screen. CSS keys off `body[data-mode]`
 * (plus the `mode-build` / `driving` classes), so no two modes' chrome is
 * ever on screen at once.
 */
export type GameMode = 'play' | 'build' | 'drive';

let current: GameMode = 'play';

export function gameMode(): GameMode {
  return current;
}

export function setGameMode(mode: GameMode): void {
  current = mode;
  const b = document.body;
  b.dataset.mode = mode;
  b.classList.toggle('mode-build', mode === 'build');
  b.classList.toggle('driving', mode === 'drive');
  window.dispatchEvent(new CustomEvent('gamemode', { detail: mode }));
}

/** Enter a mode for a while; the returned function restores the previous one. */
export function enterMode(mode: GameMode): () => void {
  const before = current;
  setGameMode(mode);
  let done = false;
  return () => {
    if (done) return;
    done = true;
    setGameMode(before === mode ? 'play' : before);
  };
}
