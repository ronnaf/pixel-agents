/**
 * The radio's YouTube source: a link pasted into the radio's settings plays
 * through YouTube's IFrame Player API in a small frame beside the player (the
 * API's terms forbid a hidden player), driven by the player's own buttons.
 * While it plays the built-in radio is paused; when it ends, fails or is
 * turned off the built-in radio takes over again.
 *
 * Standalone only (`isBrowserRuntime`): a VS Code webview's origin is not a
 * web origin YouTube will embed for. The last link, and whether it was the
 * source, are remembered per browser.
 */
import { MUSIC_YOUTUBE_POLL_MS, MUSIC_YOUTUBE_STORAGE_KEY } from '../constants.js';
import { isBrowserRuntime } from '../runtime.js';
import { officeRadio } from './musicEngine.js';
import { parseYouTubeUrl, type YouTubeLink } from './youtubeUrl.js';

/** Whether this host can play YouTube links at all. */
export const youtubeAvailable = isBrowserRuntime;

export interface YouTubeState {
  /** YouTube is the radio's source (its frame shows beside the player). */
  active: boolean;
  /** The last link played (kept after switching back, to prefill the box). */
  url: string;
  link: YouTubeLink | null;
  playing: boolean;
  /** The video's title once YouTube reports it, else ''. */
  title: string;
  /** 0-1 through the video (0 for a live stream). */
  progress: number;
  /** Why the last link stopped, shown in the settings panel; null when fine. */
  error: string | null;
}

/** The slice of the IFrame API's player this file uses. */
interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  nextVideo(): void;
  setVolume(v: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlaylist(): string[] | null;
  getPlaylistIndex(): number;
  getVideoData?(): { title?: string };
  destroy(): void;
}
interface YTNamespace {
  Player: new (
    el: HTMLIFrameElement,
    opts: {
      events: {
        onReady?: () => void;
        onStateChange?: (e: { data: number }) => void;
        onError?: (e: { data: number }) => void;
      };
    },
  ) => YTPlayer;
}
type YTWindow = Window & { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void };

const ENDED = 0;
const PLAYING = 1;
const PAUSED = 2;

/** Short reasons for the IFrame API's error codes. */
const ERRORS: Record<number, string> = {
  2: "That link doesn't name a playable video.",
  5: "YouTube couldn't play that video here.",
  100: 'That video is gone or private.',
  101: "That video's owner doesn't allow playing it outside YouTube.",
  150: "That video's owner doesn't allow playing it outside YouTube.",
  153: 'YouTube refused to play here.',
};

let apiPromise: Promise<YTNamespace> | null = null;

/** Loads YouTube's IFrame API script once; rejects if it can't be fetched. */
function loadApi(): Promise<YTNamespace> {
  const w = window as YTWindow;
  if (w.YT?.Player) return Promise.resolve(w.YT);
  apiPromise ??= new Promise<YTNamespace>((resolve, reject) => {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(w.YT!);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => {
      apiPromise = null;
      s.remove();
      reject(new Error('YouTube API failed to load'));
    };
    document.head.appendChild(s);
  });
  return apiPromise;
}

/** The embed URL for a link; `autoplay` only from a click (browsers allow no other). */
function embedSrc(link: YouTubeLink, autoplay: boolean): string {
  const params = new URLSearchParams({
    enablejsapi: '1',
    playsinline: '1',
    rel: '0',
    autoplay: autoplay ? '1' : '0',
    origin: window.location.origin,
  });
  if (link.listId) params.set('list', link.listId);
  return `https://www.youtube.com/embed/${link.videoId ?? 'videoseries'}?${params}`;
}

function loadStored(): { url: string; active: boolean } {
  try {
    const raw = JSON.parse(localStorage.getItem(MUSIC_YOUTUBE_STORAGE_KEY) ?? '{}') as {
      url?: unknown;
      active?: unknown;
    };
    const url = typeof raw.url === 'string' ? raw.url : '';
    return { url, active: raw.active === true && parseYouTubeUrl(url) !== null };
  } catch {
    return { url: '', active: false };
  }
}

class YouTubeSource {
  private state: YouTubeState;
  private listeners = new Set<() => void>();
  private host: HTMLElement | null = null;
  private iframe: HTMLIFrameElement | null = null;
  private player: YTPlayer | null = null;
  /** The user wants it playing (a paste or Play click): a frame built now
   *  starts by itself, and a failure hands over to the radio still playing. */
  private wanted = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    const stored = youtubeAvailable ? loadStored() : { url: '', active: false };
    this.state = {
      active: stored.active,
      url: stored.url,
      link: stored.active ? parseYouTubeUrl(stored.url) : null,
      playing: false,
      title: '',
      progress: 0,
      error: null,
    };
    // Volume and mute are the radio's; mirror them onto the video.
    officeRadio.subscribe(this.applyVolume);
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getState = (): YouTubeState => this.state;

  /**
   * Plays a pasted link (call it from the click or submit that pasted it, so
   * the browser lets it start with sound). False when it isn't a YouTube link.
   */
  play(input: string): boolean {
    const link = youtubeAvailable ? parseYouTubeUrl(input) : null;
    if (!link) return false;
    if (officeRadio.getState().playing) void officeRadio.toggle();
    this.wanted = true;
    this.set({ active: true, url: input.trim(), link, title: '', progress: 0, error: null });
    this.save();
    // Already mounted: swap the frame now. Otherwise the frame mounts (attach).
    if (this.host) this.build();
    return true;
  }

  /** Play/pause, from the radio's main button. */
  toggle(): void {
    if (!this.player) return;
    this.wanted = !this.state.playing;
    if (this.wanted) this.player.playVideo();
    else this.player.pauseVideo();
  }

  /** The radio's Next: the playlist's next video, else back to the built-in radio. */
  next(): void {
    const p = this.player;
    const list = p?.getPlaylist();
    if (p && list && p.getPlaylistIndex() < list.length - 1) p.nextVideo();
    else this.stop(true);
  }

  /**
   * Back to the built-in radio (the link stays, to prefill the box).
   * `resume` starts the radio — by default only if YouTube was playing.
   */
  stop(resume = this.state.playing): void {
    if (!this.state.active) return;
    this.teardown();
    this.wanted = false;
    this.set({ active: false, playing: false, progress: 0 });
    this.save();
    if (resume && !officeRadio.getState().playing) void officeRadio.toggle();
  }

  /** The player's frame slot mounted: build the frame in it. */
  attach(host: HTMLElement): void {
    this.host = host;
    this.build();
  }

  /** The frame slot unmounted (switched off, or the player hidden): drop the frame. */
  detach(host: HTMLElement): void {
    if (this.host !== host) return;
    this.teardown();
    this.host = null;
    if (this.state.playing) this.set({ playing: false });
  }

  /** Builds a fresh frame for the current link and wires the API to it. */
  private build(): void {
    const { link } = this.state;
    if (!this.host || !link) return;
    this.teardown();
    const iframe = document.createElement('iframe');
    iframe.src = embedSrc(link, this.wanted);
    iframe.title = 'YouTube player';
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
    // index.html sends no Referer (the standalone URL carries the token), but
    // YouTube refuses embeds without one (error 153): send only our origin.
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.className = 'block w-full h-full border-0';
    this.host.appendChild(iframe);
    this.iframe = iframe;

    loadApi().then(
      (YT) => {
        if (this.iframe !== iframe) return;
        this.player = new YT.Player(iframe, {
          events: {
            onReady: () => {
              this.applyVolume();
              this.readTitle();
            },
            onStateChange: (e) => this.onStateChange(e.data),
            onError: (e) => this.fail(ERRORS[e.data] ?? "YouTube couldn't play that link."),
          },
        });
      },
      () => {
        if (this.iframe === iframe) this.fail("Couldn't reach YouTube.");
      },
    );
  }

  private onStateChange(s: number): void {
    if (s === PLAYING) {
      this.readTitle();
      this.wanted = true;
      this.set({ playing: true });
      this.pollTimer ??= setInterval(this.poll, MUSIC_YOUTUBE_POLL_MS);
    } else if (s === PAUSED) {
      this.wanted = false;
      this.set({ playing: false });
    } else if (s === ENDED) {
      // A playlist moves on by itself until its last video.
      const p = this.player;
      const list = p?.getPlaylist();
      if (!p || !list || p.getPlaylistIndex() >= list.length - 1) this.stop(true);
    }
  }

  /** The link can't play: say why and hand back to the built-in radio. */
  private fail(message: string): void {
    this.stop(this.wanted || this.state.playing);
    this.set({ error: message });
  }

  private readTitle(): void {
    const title = this.player?.getVideoData?.().title;
    if (title && title !== this.state.title) this.set({ title });
  }

  private poll = (): void => {
    const p = this.player;
    if (!p) return;
    const d = p.getDuration();
    const progress = d > 0 ? Math.min(1, p.getCurrentTime() / d) : 0;
    if (Math.abs(progress - this.state.progress) > 0.002) this.set({ progress });
  };

  private applyVolume = (): void => {
    const v = officeRadio.getState().volume;
    this.player?.setVolume(Math.round(v * 100));
  };

  private teardown(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    try {
      this.player?.destroy();
    } catch {
      // The API had not finished wiring the frame; removing it below is enough.
    }
    this.player = null;
    this.iframe?.remove();
    this.iframe = null;
  }

  private set(patch: Partial<YouTubeState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  private save(): void {
    try {
      localStorage.setItem(
        MUSIC_YOUTUBE_STORAGE_KEY,
        JSON.stringify({ url: this.state.url, active: this.state.active }),
      );
    } catch {
      // Private window or blocked storage: the link lasts for this session only.
    }
  }
}

export const youtubeSource = new YouTubeSource();
