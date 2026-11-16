/** What a YouTube link names: a video, a playlist, or a video inside a playlist. */
export interface YouTubeLink {
  videoId: string | null;
  listId: string | null;
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const LIST_ID = /^[A-Za-z0-9_-]{2,64}$/;
/** Hosts a link may come from (after dropping `www.` / `m.`). */
const HOSTS = new Set(['youtube.com', 'music.youtube.com', 'youtu.be']);
/** youtube.com paths whose next segment is the video id. */
const ID_PATHS = new Set(['shorts', 'live', 'embed']);

/**
 * Reads a pasted YouTube link: `youtube.com/watch?v=…`, `youtu.be/…`,
 * `youtube.com/shorts|live|embed/…`, `music.youtube.com/watch?v=…`, and any
 * of them (or `youtube.com/playlist`) with `list=…`. The scheme is optional.
 * Null when it isn't a YouTube link or names neither a video nor a playlist.
 */
export function parseYouTubeUrl(input: string): YouTubeLink | null {
  const text = input.trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, '');
  if (!HOSTS.has(host)) return null;

  const [first = '', second = ''] = url.pathname.split('/').filter(Boolean);
  let video: string | null = null;
  if (host === 'youtu.be') video = first;
  else if (first === 'watch') video = url.searchParams.get('v');
  else if (ID_PATHS.has(first)) video = second;

  const list = url.searchParams.get('list');
  const result: YouTubeLink = {
    videoId: video && VIDEO_ID.test(video) ? video : null,
    listId: list && LIST_ID.test(list) ? list : null,
  };
  return result.videoId || result.listId ? result : null;
}
