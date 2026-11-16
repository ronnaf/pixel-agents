import { describe, expect, it } from 'vitest';

import { parseYouTubeUrl } from '../src/music/youtubeUrl.js';

const ID = 'dQw4w9WgXcQ';
const LIST = 'PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG';

describe('parseYouTubeUrl', () => {
  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `youtube.com/watch?v=${ID}&t=42s`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}?si=abc`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/live/${ID}?feature=share`,
    `https://music.youtube.com/watch?v=${ID}`,
    `  https://www.youtube.com/embed/${ID}  `,
  ])('reads a video from %s', (url) => {
    expect(parseYouTubeUrl(url)).toEqual({ videoId: ID, listId: null });
  });

  it('reads a playlist, alone or around a video', () => {
    expect(parseYouTubeUrl(`https://www.youtube.com/playlist?list=${LIST}`)).toEqual({
      videoId: null,
      listId: LIST,
    });
    expect(parseYouTubeUrl(`https://www.youtube.com/watch?v=${ID}&list=${LIST}`)).toEqual({
      videoId: ID,
      listId: LIST,
    });
  });

  it.each([
    '',
    'TOWN-5-8F3A21C0',
    'not a url at all',
    `https://vimeo.com/watch?v=${ID}`,
    `https://youtube.com.evil.example/watch?v=${ID}`,
    `javascript://youtube.com/watch?v=${ID}`,
    'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/',
  ])('rejects %s', (input) => {
    expect(parseYouTubeUrl(input)).toBeNull();
  });
});
