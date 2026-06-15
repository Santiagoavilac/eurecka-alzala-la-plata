const GAME_AUDIO_SRC = "/audio/una-cunumi-remix.mp3";
const MUSIC_REQUESTED_KEY = "eureka_guess_player_music_requested";

declare global {
  interface Window {
    __eurekaGuessPlayerAudio?: HTMLAudioElement;
  }
}

function getAudio() {
  if (typeof window === "undefined") return null;
  if (!window.__eurekaGuessPlayerAudio) {
    const audio = new Audio(GAME_AUDIO_SRC);
    audio.loop = true;
    audio.volume = 0.55;
    window.__eurekaGuessPlayerAudio = audio;
  }
  return window.__eurekaGuessPlayerAudio;
}

export function markGameMusicRequested() {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(MUSIC_REQUESTED_KEY, "1");
}

export async function playGameMusic() {
  const audio = getAudio();
  if (!audio) return false;
  try {
    await audio.play();
    return true;
  } catch {
    return false;
  }
}

export function stopGameMusic() {
  if (typeof window === "undefined") return;
  window.__eurekaGuessPlayerAudio?.pause();
}

export async function playRequestedGameMusic() {
  if (typeof window === "undefined") return "not-requested" as const;
  if (window.sessionStorage.getItem(MUSIC_REQUESTED_KEY) !== "1") {
    return "not-requested" as const;
  }
  const played = await playGameMusic();
  return played ? ("played" as const) : ("blocked" as const);
}
