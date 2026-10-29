"use client";

import { ImagePlus, Menu, MessageCircle, Plus, RefreshCw, Search, Trash2, Users, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";

import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { IncomingCallNotifications } from "@/components/conversations/incoming-call-notifications";
import { Input } from "@/components/ui/input";
import { getAccessToken } from "@/lib/auth-token";
import { backendApi } from "@/lib/backend-api";
import type { Conversation, RoomParticipant, RoomSummary, PublicUserProfile, UserProfile } from "@/lib/backend-types";
import { ProfileImageSchema, UserSearchSchema } from "@/lib/page-schemas";

function displayConversation(conversation: Conversation): string {
  return conversation.title?.trim() || (conversation.type === "DIRECT" ? "Direct conversation" : "Untitled room");
}

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationParticipants, setConversationParticipants] = useState<Record<string, RoomParticipant[]>>({});
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<PublicUserProfile[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const isAuthRoute = pathname.startsWith("/auth/");
  const refreshLists = useCallback(async () => {
    setError("");
    try {
      const [conversationList, roomList] = await Promise.all([
        backendApi.conversations.list(),
        backendApi.rooms.list(),
      ]);
      const participantEntries = await Promise.all(conversationList.map(async (conversation) => [
        conversation.id,
        await backendApi.conversations.listParticipants(conversation.id),
      ] as const));
      setConversations(conversationList);
      setConversationParticipants(Object.fromEntries(participantEntries));
      setRooms(roomList);
      if (getAccessToken()) setProfile(await backendApi.users.me());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load your sidebar.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (pathname.startsWith("/auth/")) return;
    if (!getAccessToken()) {
      void Promise.resolve().then(() => setIsLoading(false));
      return;
    }

    void Promise.all([
      backendApi.conversations.list(),
      backendApi.rooms.list(),
      backendApi.users.me(),
    ])
      .then(async ([conversationList, roomList, currentProfile]) => {
        const participantEntries = await Promise.all(conversationList.map(async (conversation) => [
          conversation.id,
          await backendApi.conversations.listParticipants(conversation.id),
        ] as const));
        setConversations(conversationList);
        setConversationParticipants(Object.fromEntries(participantEntries));
        setRooms(roomList);
        setProfile(currentProfile);
        setIsLoading(false);
      })
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : "Could not load your sidebar.");
        setIsLoading(false);
      });
  }, [pathname]);

  async function searchPeople(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = UserSearchSchema.safeParse({ query: search });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter at least 2 characters to search.");
      setSearchResults([]);
      setHasSearched(false);
      return;
    }

    setError("");
    setHasSearched(false);
    setIsSearching(true);
    try {
      setSearchResults(await backendApi.users.search(parsed.data.query));
      setHasSearched(true);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "Could not search users.");
    } finally {
      setIsSearching(false);
    }
  }

  async function openDirectConversation(user: PublicUserProfile) {
    setError("");
    try {
      const conversation = await backendApi.conversations.createDirect(user.id);
      const participants = await backendApi.conversations.listParticipants(conversation.id);
      setConversations((current) => current.some((item) => item.id === conversation.id)
        ? current
        : [conversation, ...current]);
      setConversationParticipants((current) => ({ ...current, [conversation.id]: participants }));
      setSearchResults([]);
      setSearch("");
      setIsMobileOpen(false);
      router.push(`/conversations?conversationId=${encodeURIComponent(conversation.id)}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not start the conversation.");
    }
  }

  async function updateAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    const parsed = ProfileImageSchema.safeParse(file);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Choose a supported profile image.");
      return;
    }
    try {
      setError("");
      setProfile(await backendApi.users.uploadAvatar(parsed.data));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "The profile image could not be uploaded.");
    }
  }

  async function removeAvatar() {
    try {
      setError("");
      await backendApi.users.removeAvatar();
      setProfile((current) => current ? { ...current, avatarUrl: null } : current);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "The profile image could not be removed.");
    }
  }

  if (isAuthRoute) {
    return <>{children}</>;
  }

  const sidebar = (
    <aside className="flex h-full min-h-0 w-full flex-col border-r border-white/10 bg-[#0d0d0d]">
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-5">
        <Link href="/" className="text-sm font-bold tracking-[0.25em]">
          CHAT<span className="text-red-500">APP</span>
        </Link>
        <button
          type="button"
          onClick={() => void refreshLists()}
          aria-label="Refresh conversations and rooms"
          className="rounded-lg p-2 text-zinc-400 transition hover:bg-white/5 hover:text-white"
        >
          <RefreshCw className="size-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 border-b border-white/10 p-3">
        <Link
          href="/conversations"
          onClick={() => setIsMobileOpen(false)}
          className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
            pathname.startsWith("/conversations") ? "bg-red-600 text-white" : "bg-white/5 text-zinc-300 hover:bg-white/10"
          }`}
        >
          <MessageCircle className="size-4" />
          Chats
        </Link>
        <Link
          href="/room"
          onClick={() => setIsMobileOpen(false)}
          className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
            pathname === "/room" ? "bg-red-600 text-white" : "bg-white/5 text-zinc-300 hover:bg-white/10"
          }`}
        >
          <Users className="size-4" />
          Rooms
        </Link>
      </div>

      <form onSubmit={searchPeople} className="space-y-2 border-b border-white/10 p-3">
        <label htmlFor="sidebar-user-search" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
          Find people
        </label>
        <div className="flex gap-2">
          <Input
            id="sidebar-user-search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setSearchResults([]);
              setHasSearched(false);
            }}
            placeholder="Search username or name"
            className="h-9 min-w-0 border-white/10 bg-black/40 text-sm text-white placeholder:text-zinc-600"
          />
          <button
            type="submit"
            disabled={isSearching}
            aria-label="Search users"
            className="grid size-9 shrink-0 place-items-center rounded-lg bg-red-600 text-white transition hover:bg-red-500 disabled:opacity-50"
          >
            <Search className="size-4" />
          </button>
        </div>
        {searchResults.length > 0 && (
          <ul aria-label="People search results" className="max-h-48 space-y-1 overflow-y-auto">
            {searchResults.map((user) => (
              <li key={user.id}>
                <button
                  type="button"
                  onClick={() => void openDirectConversation(user)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-white/5"
                >
                  <ProfileAvatar avatarUrl={user.avatarUrl} label={user.displayName || user.username || "ChatApp user"} className="size-8" />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium text-white">{user.displayName || user.username || "ChatApp user"}</span>
                    <span className="block truncate text-[11px] text-zinc-500">@{user.username || "no username"}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {searchResults.length === 0 && hasSearched && !isSearching && (
          <p className="text-xs text-zinc-500">No matching people found.</p>
        )}
      </form>

      <nav aria-label="Conversations and rooms" className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3">
        <section>
          <div className="mb-2 flex items-center justify-between px-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Conversations</h2>
            <Link
              href="/conversations"
              aria-label="Start a conversation"
              className="rounded-md p-1 text-zinc-400 transition hover:bg-white/10 hover:text-white"
            >
              <Plus className="size-4" />
            </Link>
          </div>
          {isLoading ? (
            <p className="px-2 py-2 text-xs text-zinc-600">Loading chats…</p>
          ) : conversations.length === 0 ? (
            <p className="px-2 py-2 text-xs leading-5 text-zinc-600">Your conversations will appear here.</p>
          ) : (
            <ul className="space-y-1">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <Link
                    href={`/conversations?conversationId=${encodeURIComponent(conversation.id)}`}
                    onClick={() => setIsMobileOpen(false)}
                    title={displayConversation(conversation)}
                    className={`flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition ${
                      pathname.startsWith("/conversations")
                        ? "text-zinc-300 hover:bg-white/5 hover:text-white"
                        : "text-zinc-400 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    {conversation.type === "DIRECT" ? (
                      (() => {
                        const otherUser = conversationParticipants[conversation.id]?.find(
                          (participant) => participant.id !== profile?.id,
                        );
                        const title = otherUser
                          ? otherUser.username ? `@${otherUser.username}` : otherUser.displayName || "Direct conversation"
                          : displayConversation(conversation);
                        return (
                          <>
                            <ProfileAvatar avatarUrl={otherUser?.avatarUrl ?? null} label={otherUser?.displayName || otherUser?.username || "Direct conversation"} className="size-8" />
                            <span className="min-w-0">
                              <span className="block truncate text-sm">{title}</span>
                              {otherUser?.displayName && <span className="block truncate text-[11px] text-zinc-500">{otherUser.displayName}</span>}
                            </span>
                          </>
                        );
                      })()
                    ) : (
                      <>
                        <span className="flex -space-x-2">
                          {(conversationParticipants[conversation.id] ?? []).slice(0, 3).map((participant) => (
                            <ProfileAvatar
                              key={participant.id}
                              avatarUrl={participant.avatarUrl}
                              label={participant.displayName || participant.username}
                              className="size-7 border-2 border-[#0d0d0d]"
                            />
                          ))}
                        </span>
                        <span className="min-w-0 truncate">{displayConversation(conversation)}</span>
                      </>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between px-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Rooms</h2>
            <Link
              href="/room"
              aria-label="Create or discover rooms"
              className="rounded-md p-1 text-zinc-400 transition hover:bg-white/10 hover:text-white"
            >
              <Plus className="size-4" />
            </Link>
          </div>
          {isLoading ? (
            <p className="px-2 py-2 text-xs text-zinc-600">Loading rooms…</p>
          ) : rooms.length === 0 ? (
            <p className="px-2 py-2 text-xs leading-5 text-zinc-600">Discover or create a room.</p>
          ) : (
            <ul className="space-y-1">
              {rooms.map((room) => (
                <li key={room.id}>
                  <Link
                    href={`/room?roomId=${encodeURIComponent(room.id)}`}
                    onClick={() => setIsMobileOpen(false)}
                    title={room.roomname}
                    className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-white"
                  >
                    <span className="flex -space-x-2">
                      {(conversationParticipants[room.id] ?? []).slice(0, 3).map((participant) => (
                        <ProfileAvatar
                          key={participant.id}
                          avatarUrl={participant.avatarUrl}
                          label={participant.displayName || participant.username}
                          className="size-7 border-2 border-[#0d0d0d]"
                        />
                      ))}
                    </span>
                    <span className="min-w-0 truncate">{room.roomname}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {error && <p role="status" className="px-2 text-xs leading-5 text-red-300">{error}</p>}
      </nav>
      {profile && (
        <div className="flex shrink-0 items-center gap-3 border-t border-white/10 p-3">
          <ProfileAvatar avatarUrl={profile.avatarUrl} label={profile.displayName || profile.username || "Your profile"} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{profile.displayName || profile.username || "Your profile"}</p>
            <p className="truncate text-xs text-zinc-500">{profile.username ? `@${profile.username}` : profile.email}</p>
          </div>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            onChange={(event) => void updateAvatar(event)}
            className="sr-only"
            tabIndex={-1}
            aria-label="Choose profile image"
          />
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            aria-label="Upload profile image"
            title="Upload profile image"
            className="rounded-lg p-2 text-zinc-400 hover:bg-white/10 hover:text-white"
          >
            <ImagePlus className="size-4" />
          </button>
          {profile.avatarUrl && (
            <button
              type="button"
              onClick={() => void removeAvatar()}
              aria-label="Remove profile image"
              title="Remove profile image"
              className="rounded-lg p-2 text-zinc-400 hover:bg-red-950/60 hover:text-red-200"
            >
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      )}
    </aside>
  );

  return (
    <div className="flex h-[100dvh] min-h-0 w-full overflow-hidden bg-[#090909] text-white">
      <div className="hidden h-full w-[280px] shrink-0 md:block">
        {sidebar}
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/10 bg-[#0d0d0d] px-4 md:hidden">
          <button
            type="button"
            onClick={() => setIsMobileOpen(true)}
            aria-label="Open conversations and rooms sidebar"
            aria-expanded={isMobileOpen}
            className="rounded-lg p-2 text-zinc-300 hover:bg-white/10"
          >
            <Menu className="size-5" />
          </button>
          <Link href="/" className="text-xs font-bold tracking-[0.25em]">
            CHAT<span className="text-red-500">APP</span>
          </Link>
          <span className="ml-auto truncate text-xs text-zinc-500">
            {pathname.startsWith("/conversations") ? "Conversations" : pathname === "/room" ? "Rooms" : pathname === "/calls" ? "Calls" : pathname === "/attachments" ? "Attachments" : ""}
          </span>
        </header>

        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
          {children}
        </main>
      </div>

      <IncomingCallNotifications />

      {isMobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close sidebar"
            onClick={() => setIsMobileOpen(false)}
            className="absolute inset-0 bg-black/70"
          />
          <div className="relative h-full w-[min(84vw,320px)] shadow-2xl">
            <button
              type="button"
              onClick={() => setIsMobileOpen(false)}
              aria-label="Close conversations and rooms sidebar"
              className="absolute right-2 top-4 z-10 rounded-lg p-2 text-zinc-400 hover:bg-white/10 hover:text-white"
            >
              <X className="size-5" />
            </button>
            {sidebar}
          </div>
        </div>
      )}
    </div>
  );
}
