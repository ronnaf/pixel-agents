import { describe, expect, it } from 'vitest';

import type { DirectoryConversations } from '../../core/src/messages.js';
import { recentAcross } from '../src/conversations/recent.js';

const dir = (name: string, times: number[]): DirectoryConversations => ({
  name,
  path: `/${name}`,
  conversations: times.map((t) => ({
    sessionId: `${name}-${t}`,
    title: `${name} ${t}`,
    updatedAt: t,
  })),
});

describe('recentAcross', () => {
  it('takes the newest across Directories, each with its Directory', () => {
    const recent = recentAcross([dir('a', [9, 4, 1]), dir('b', [8, 7, 2]), dir('c', [])], 4);
    expect(recent.map((r) => r.conversation.sessionId)).toEqual(['a-9', 'b-8', 'b-7', 'a-4']);
    expect(recent[1].directory.path).toBe('/b');
  });

  it('returns fewer when there are fewer', () => {
    expect(recentAcross([dir('a', [3])], 5)).toHaveLength(1);
    expect(recentAcross([], 5)).toEqual([]);
  });

  const ids = (recent: ReturnType<typeof recentAcross>) =>
    recent.map((r) => r.conversation.sessionId);

  it('sorts every listed one by title before cutting, ignoring case', () => {
    const b = dir('b', [9, 1]);
    b.conversations[1].title = 'Alpha';
    b.conversations[0].title = 'zeta';
    const a = dir('a', [5]);
    a.conversations[0].title = 'beta';
    expect(ids(recentAcross([a, b], 2, 'name'))).toEqual(['b-1', 'a-5']);
  });

  it('groups by Directory A–Z, newest first within one', () => {
    expect(ids(recentAcross([dir('b', [9]), dir('A', [1, 3])], 3, 'folder'))).toEqual([
      'A-3',
      'A-1',
      'b-9',
    ]);
  });

  it('puts running ones first, those needing the user on top', () => {
    const a = dir('a', [9, 5, 4, 1]);
    a.conversations[1].agentId = 1;
    a.conversations[2].agentId = 2;
    const status = (id: number) => (id === 2 ? 'attention' : 'working');
    expect(ids(recentAcross([a], 3, 'active', status))).toEqual(['a-4', 'a-5', 'a-9']);
  });
});
