import { type ReactNode, useState } from 'react';

import type { Conversation, DirectoryConversations } from '../../../core/src/messages.js';
import type { TabStatus } from '../components/AgentCard.js';
import { CharacterMugShot } from '../components/CharacterMugShot.js';
import { STATUS_DOT } from '../components/statusDot.js';
import { PixelIcon } from '../components/ui/PixelIcon.js';
import { PixelText } from '../components/ui/PixelText.js';
import {
  MUGSHOT_CROP_SIDE_PX,
  RECENT_CONVERSATIONS_COUNT,
  RECENT_CONVERSATIONS_SORT_KEY,
} from '../constants.js';
import { RECENT_SORTS, recentAcross, type RecentSort } from './recent.js';
import { timeAgo } from './timeAgo.js';
import { type ConversationLimits, useConversations } from './useConversations.js';

interface ConversationListProps {
  /** Whether it shows: the list is only fetched (and kept fresh) while it does. */
  open: boolean;
  /** A past conversation pressed: resume it. */
  onResume: (sessionId: string, directoryPath: string) => void;
  /** A running one pressed: go to its agent (as its card would). */
  onOpenAgent: (agentId: number) => void;
  /** A running conversation's status dot, the same as its agent card's. */
  statusFor: (agentId: number) => TabStatus | null;
  /** Rows sized for a finger (the phone's panel). */
  roomy?: boolean;
  /** Open the search over every conversation (or one Directory's). */
  onSearch?: (scope: ConversationSearchScope) => void;
}

/** Where a search looks: every Directory, or the one named. */
export interface ConversationSearchScope {
  directoryPath?: string;
  directoryName?: string;
}

/** Every Directory lists its default number of conversations: "Recent" draws on those. */
const DEFAULT_LIMITS: ConversationLimits = {};

/** The sort button's name for each order. */
const SORT_LABEL: Record<RecentSort, string> = {
  recent: 'Recent',
  active: 'Active first',
  name: 'Name',
  folder: 'Folder',
};

/** The order this browser last chose for "Recent" (newest first if none). */
function storedSort(): RecentSort {
  try {
    const stored = localStorage.getItem(RECENT_CONVERSATIONS_SORT_KEY);
    return RECENT_SORTS.find((sort) => sort === stored) ?? 'recent';
  } catch {
    return 'recent';
  }
}

function storeSort(sort: RecentSort): void {
  try {
    localStorage.setItem(RECENT_CONVERSATIONS_SORT_KEY, sort);
  } catch {
    // Not remembered; it still sorts.
  }
}

/**
 * The recent conversations, shared by the desktop sidebar and the phone's
 * panel: the newest across every Directory ("Recent", each with its
 * Directory's name). Titled as the coding agent
 * titles them, each with a mug shot of the character its agent wore. One an
 * agent in the office is running shows its status dot, and pressing it goes
 * to that agent; pressing a past one resumes it.
 */
export function ConversationList({
  open,
  onResume,
  onOpenAgent,
  statusFor,
  roomy = false,
  onSearch,
}: ConversationListProps) {
  /** What pressing a row does: a running one opens its agent, a past one resumes. */
  const press = (conversation: Conversation, directory: DirectoryConversations) => () =>
    conversation.agentId !== undefined
      ? onOpenAgent(conversation.agentId)
      : onResume(conversation.sessionId, directory.path);
  const list = useConversations(open, DEFAULT_LIMITS);
  const [sort, setSort] = useState(storedSort);
  const nextSort = RECENT_SORTS[(RECENT_SORTS.indexOf(sort) + 1) % RECENT_SORTS.length];
  /** The sort button: on to the next order (remembered per browser). */
  const cycleSort = () => {
    storeSort(nextSort);
    setSort(nextSort);
  };

  // flex-1 even while empty: whatever sits below the list stays at the bottom.
  if (list === null || list.directories.length === 0) {
    return (
      <p className="flex-1 m-0 px-10 py-8 text-sm text-text-muted">
        {list === null ? 'Loading…' : 'No Directories yet.'}
      </p>
    );
  }
  const recent = recentAcross(list.directories, RECENT_CONVERSATIONS_COUNT, sort, statusFor);
  const now = list.receivedAt;
  return (
    <div className="flex-1 min-h-0 quiet-scrollbar no-scrollbar">
      {onSearch && <SearchField onPress={() => onSearch({})} roomy={roomy} />}
      <section data-testid="recent-conversations" className="pb-6">
        <SectionHeading
          action={
            recent.length > 0 ? (
              <span className="flex items-baseline gap-4">
                <TextButton
                  testId="conversations-sort"
                  label={`Sort recent conversations: ${SORT_LABEL[sort]}. Press for ${SORT_LABEL[nextSort]}.`}
                  onPress={cycleSort}
                >
                  {`Sort: ${SORT_LABEL[sort]}`}
                </TextButton>
                {onSearch && (
                  <TextButton testId="conversations-see-all" onPress={() => onSearch({})}>
                    See all
                  </TextButton>
                )}
              </span>
            ) : undefined
          }
        >
          Recent
        </SectionHeading>
        {recent.length === 0 ? (
          <p className="m-0 px-10 py-2 text-xs text-text-muted">No conversations</p>
        ) : (
          recent.map(({ conversation, directory }) => (
            <ConversationRow
              key={conversation.sessionId}
              conversation={conversation}
              where={directory.name}
              onPress={press(conversation, directory)}
              statusFor={statusFor}
              now={now}
              roomy={roomy}
            />
          ))
        )}
      </section>
    </div>
  );
}

/** Looks like a search field; pressing it opens the search (ConversationSearch). */
function SearchField({ onPress, roomy }: { onPress: () => void; roomy: boolean }) {
  return (
    <div className="px-8 pt-8">
      <button
        type="button"
        data-testid="conversations-search"
        onClick={onPress}
        className={`w-full flex items-center gap-6 px-6 ${roomy ? 'py-6' : 'py-3'} bg-bg-dark border-2 border-border rounded-none cursor-text text-left text-sm text-text-muted hover:border-accent`}
      >
        <PixelIcon name="search" scale={1} />
        Search conversations
      </button>
    </div>
  );
}

/** A small text-only button (a heading's "See all", a section's "Show 5 more"). */
function TextButton({
  children,
  onPress,
  testId,
  label,
}: {
  children: string;
  onPress: () => void;
  testId?: string;
  /** Its accessible name, when the visible text alone says too little. */
  label?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      title={label}
      onClick={onPress}
      className="shrink-0 px-2 bg-transparent border-none rounded-none cursor-pointer text-2xs text-text-muted hover:text-text normal-case tracking-normal"
    >
      {children}
    </button>
  );
}

/** A group's label: small, muted, uppercase-spaced, above its rows; an
 *  `action` (a "See all") at its other end. */
function SectionHeading({ children, action }: { children: string; action?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-8 pl-10 pr-8 pt-10 pb-4">
      <h3 className="m-0 text-2xs font-normal tracking-wider uppercase text-text-muted">
        {children}
      </h3>
      {action}
    </div>
  );
}

export interface RowProps {
  conversation: Conversation;
  /** The Directory's name, shown under the title (the Recent section). */
  where?: string;
  onPress: () => void;
  statusFor: ConversationListProps['statusFor'];
  now: number;
  roomy: boolean;
}

export function ConversationRow({ conversation, where, onPress, statusFor, now, roomy }: RowProps) {
  const { title, updatedAt, palette, repeat, agentId } = conversation;
  const status = agentId !== undefined ? statusFor(agentId) : null;
  return (
    <button
      type="button"
      data-testid="conversation-row"
      onClick={onPress}
      title={agentId !== undefined ? `Go to "${title}"` : `Resume "${title}"`}
      className={`w-full flex items-center gap-8 px-10 ${roomy ? 'py-8' : where ? 'py-3' : 'py-5'} bg-transparent border-none rounded-none cursor-pointer text-left text-text hover:bg-btn-bg`}
    >
      <span className="shrink-0 flex" style={{ width: MUGSHOT_CROP_SIDE_PX }}>
        {palette !== undefined ? (
          <CharacterMugShot palette={palette} repeat={repeat ?? 0} zoom={1} />
        ) : (
          // Never seen in the office: it gets a character when it resumes.
          <span
            aria-hidden="true"
            className="border-2 border-dashed border-border"
            style={{ width: MUGSHOT_CROP_SIDE_PX, height: MUGSHOT_CROP_SIDE_PX }}
          />
        )}
      </span>
      {/* leading-none: the pixel font's line height opens a wide gap
          between the title and its Directory. */}
      <span className="flex-1 min-w-0 flex flex-col leading-none">
        <span className="text-sm overflow-hidden text-ellipsis whitespace-nowrap">{title}</span>
        {where && (
          <span className="-mt-1 text-2xs text-text-muted overflow-hidden text-ellipsis whitespace-nowrap">
            {where}
          </span>
        )}
      </span>
      <RowTrail
        running={agentId !== undefined}
        status={status}
        at={updatedAt}
        now={now}
        testId="conversation-status"
      />
    </button>
  );
}

interface RowTrailProps {
  running: boolean;
  status: TabStatus | null;
  /** When it was last written (nothing shows without it). */
  at: number | undefined;
  now: number;
  /** Pushed to the row's end (the header's; a row's title already fills). */
  push?: boolean;
  /** The status dot's test id. */
  testId?: string;
}

/**
 * A row's end: running, its agent card's status colour in place of the time,
 * as a round dot (a square one reads as a stop button); else how long ago.
 */
function RowTrail({ running, status, at, now, push = false, testId }: RowTrailProps) {
  if (running) {
    return (
      <span
        data-testid={testId}
        aria-label={status ?? 'running'}
        className={`shrink-0 flex ${push ? 'ml-auto ' : ''}mx-4 ${status ? STATUS_DOT[status] : 'text-text-muted'}`}
      >
        <PixelIcon name="dot" scale={1} />
      </span>
    );
  }
  if (at === undefined) return null;
  return (
    <PixelText
      text={timeAgo(at, now)}
      smaller
      className={`shrink-0 ${push ? 'ml-auto ' : ''}text-xs text-text-muted`}
    />
  );
}
