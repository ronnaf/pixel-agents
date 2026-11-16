import type { Conversation, DirectoryConversations } from '../../../core/src/messages.js';

/** A conversation with the Directory it was listed under (a resume needs its path). */
export interface PlacedConversation {
  conversation: Conversation;
  directory: DirectoryConversations;
}

/** How "Recent" is ordered: last activity, running first, title, or Directory. */
export type RecentSort = 'recent' | 'active' | 'name' | 'folder';

/** Every order, in the order the sort button cycles through them. */
export const RECENT_SORTS: readonly RecentSort[] = ['recent', 'active', 'name', 'folder'];

/** A running conversation's status (an agent card's `TabStatus`) as a rank: the
 *  more it needs the user, the lower. Keyed by string so this stays free of the
 *  component module (the tests' tsconfig has no JSX). */
const STATUS_RANK: Partial<Record<string, number>> = {
  attention: 0,
  disconnected: 1,
  working: 2,
  idle: 3,
};
/** A running one whose status is unknown ranks after those with one. */
const UNKNOWN_STATUS_RANK = 4;
/** A past one (no agent running it) ranks after every running one. */
const NOT_RUNNING_RANK = 5;

/** Newest first. */
const byRecency = (a: PlacedConversation, b: PlacedConversation) =>
  b.conversation.updatedAt - a.conversation.updatedAt;

/** A–Z, ignoring case. */
const byText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });

/**
 * The comparator for a `sort`; ties fall back to newest first. "Active first"
 * puts running ones first, those needing the user most (by `statusFor`) on top.
 */
export function recentComparator(
  sort: RecentSort,
  statusFor: (agentId: number) => string | null = () => null,
): (a: PlacedConversation, b: PlacedConversation) => number {
  switch (sort) {
    case 'active': {
      const rank = ({ conversation: { agentId } }: PlacedConversation) => {
        if (agentId === undefined) return NOT_RUNNING_RANK;
        const status = statusFor(agentId);
        return (status ? STATUS_RANK[status] : undefined) ?? UNKNOWN_STATUS_RANK;
      };
      return (a, b) => rank(a) - rank(b) || byRecency(a, b);
    }
    case 'name':
      return (a, b) => byText(a.conversation.title, b.conversation.title) || byRecency(a, b);
    case 'folder':
      return (a, b) => byText(a.directory.name, b.directory.name) || byRecency(a, b);
    case 'recent':
      return byRecency;
  }
}

/**
 * The first `count` conversations across every Directory in `sort` order
 * (newest first by default). Every listed one is sorted before the cut, so
 * "Name" gives the first by title, not the newest re-ordered. The server
 * lists each Directory's newest, so the newest overall are always among them.
 */
export function recentAcross(
  directories: readonly DirectoryConversations[],
  count: number,
  sort: RecentSort = 'recent',
  statusFor?: (agentId: number) => string | null,
): PlacedConversation[] {
  return directories
    .flatMap((directory) =>
      directory.conversations.map((conversation) => ({ conversation, directory })),
    )
    .sort(recentComparator(sort, statusFor))
    .slice(0, count);
}
