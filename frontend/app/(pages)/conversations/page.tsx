"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Paperclip, Phone, X } from "lucide-react";
import Link from "next/link";
import { Suspense, useEffect, useRef, useState, type FormEvent, type ChangeEvent } from "react";

import { Button } from "@/components/ui/button";
import { DirectCall } from "@/components/conversations/direct-call";
import { GroupCall } from "@/components/conversations/group-call";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { Input } from "@/components/ui/input";
import { BackendApiError } from "@/lib/api-client";
import { getAccessToken } from "@/lib/auth-token";
import { backendApi } from "@/lib/backend-api";
import type { Attachment, Conversation, Message, PublicUserProfile, RoomParticipant } from "@/lib/backend-types";
import { AttachmentFileSchema, MessageInputSchema, UserSearchSchema } from "@/lib/page-schemas";

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : "The request could not be completed.";
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(date);
}

async function loadMessageAttachments(
  conversationId: string,
  messages: Message[],
): Promise<Record<string, Attachment>> {
  const fileMessages = messages.filter((message) => message.type === "FILE");
  const results = await Promise.all(fileMessages.map(async (message) => {
    try {
      return await backendApi.attachments.getForMessage(conversationId, message.id);
    } catch (error) {
      if (error instanceof BackendApiError && error.status === 404) return null;
      throw error;
    }
  }));
  return Object.fromEntries(
    results.filter((attachment): attachment is Attachment => attachment !== null)
      .map((attachment) => [attachment.messageId, attachment]),
  );
}

function ConversationsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedConversationId = searchParams.get("conversationId");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationParticipants, setConversationParticipants] = useState<Record<string, RoomParticipant[]>>({});
  const [currentUserId, setCurrentUserId] = useState("");
  const [localSelectedId, setLocalSelectedId] = useState("");
  const selectedId =
    requestedConversationId &&
    conversations.some((conversation) => conversation.id === requestedConversationId)
      ? requestedConversationId
      : localSelectedId;
  const [messages, setMessages] = useState<Message[]>([]);
  const [attachments, setAttachments] = useState<Record<string, Attachment>>({});
  const [messagesConversationId, setMessagesConversationId] = useState("");
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<PublicUserProfile[]>([]);
  const [messageText, setMessageText] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace("/auth/login");
      return;
    }

    let active = true;
    void Promise.all([backendApi.conversations.list(), backendApi.users.me()])
      .then(([result, currentUser]) => {
        if (!active) return;
        setConversations(result);
        setCurrentUserId(currentUser.id);
        const requestedConversation = result.find(
          (conversation) => conversation.id === requestedConversationId,
        );
        setLocalSelectedId(requestedConversation?.id ?? "");
      })
      .catch((loadError: unknown) => {
        if (active) setError(messageFrom(loadError));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [requestedConversationId, router]);

  useEffect(() => {
    if (!selectedId) return;

    let active = true;
    void backendApi.conversations.listMessages(selectedId)
      .then((result) => {
        return loadMessageAttachments(selectedId, result).then((attachmentMap) => {
          if (!active) return;
          setMessages(result);
          setAttachments(attachmentMap);
          setMessagesConversationId(selectedId);
        });
      })
      .catch((loadError: unknown) => {
        if (active) setError(messageFrom(loadError));
      });

    return () => {
      active = false;
    };
  }, [selectedId]);

  async function searchUsers(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    const parsed = UserSearchSchema.safeParse({ query: search });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a valid search.");
      return;
    }

    setIsSearching(true);
    try {
      setUsers(await backendApi.users.search(parsed.data.query));
    } catch (searchError) {
      setError(messageFrom(searchError));
    } finally {
      setIsSearching(false);
    }
  }

  async function startConversation(user: PublicUserProfile) {
    setError("");
    setNotice("");
    try {
      const conversation = await backendApi.conversations.createDirect(user.id);
      setConversations((current) =>
        current.some((item) => item.id === conversation.id)
          ? current
          : [conversation, ...current],
      );
      setLocalSelectedId(conversation.id);
      router.replace(`/conversations?conversationId=${encodeURIComponent(conversation.id)}`, { scroll: false });
      setUsers([]);
      setSearch("");
      setNotice(`Conversation with ${user.displayName || user.username || "user"} is ready.`);
    } catch (createError) {
      setError(messageFrom(createError));
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const parsed = MessageInputSchema.safeParse({ content: messageText });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Write a valid message.");
      return;
    }
    if (!selectedId) {
      setError("Select a conversation before sending a message.");
      return;
    }

    setIsSending(true);
    try {
      const message = await backendApi.conversations.sendMessage(selectedId, parsed.data);
      setMessages((current) => [...current, message]);
      setMessagesConversationId(selectedId);
      setMessageText("");
    } catch (sendError) {
      setError(messageFrom(sendError));
    } finally {
      setIsSending(false);
    }
  }

  async function uploadAttachment(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || !selectedId) return;
    setError("");
    const parsedFile = AttachmentFileSchema.safeParse(file);
    if (!parsedFile.success) {
      setError(parsedFile.error.issues[0]?.message ?? "Choose a supported attachment.");
      return;
    }

    setIsUploading(true);
    try {
      await backendApi.attachments.upload(selectedId, parsedFile.data);
      const updatedMessages = await backendApi.conversations.listMessages(selectedId);
      const attachmentMap = await loadMessageAttachments(selectedId, updatedMessages);
      setMessages(updatedMessages);
      setAttachments(attachmentMap);
      setMessagesConversationId(selectedId);
      setNotice("Attachment uploaded.");
    } catch (uploadError) {
      setError(messageFrom(uploadError));
    } finally {
      setIsUploading(false);
    }
  }

  async function downloadAttachment(attachment: Attachment) {
    setError("");
    try {
      const blob = await backendApi.attachments.download(attachment.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = attachment.filename;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (downloadError) {
      setError(messageFrom(downloadError));
    }
  }

  const selectedConversation = conversations.find((item) => item.id === selectedId);
  const selectedDirectUser = selectedConversation?.type === "DIRECT"
    ? conversationParticipants[selectedConversation.id]?.find((participant) => participant.id !== currentUserId)
    : undefined;

  useEffect(() => {
    if (!selectedConversation || conversationParticipants[selectedConversation.id]) return;
    let active = true;
    void backendApi.conversations.listParticipants(selectedConversation.id)
      .then((participants) => {
        if (active) {
          setConversationParticipants((current) => ({ ...current, [selectedConversation.id]: participants }));
        }
      })
      .catch((participantError: unknown) => {
        if (active) setError(messageFrom(participantError));
      });
    return () => {
      active = false;
    };
  }, [conversationParticipants, selectedConversation]);

  useEffect(() => {
    if (!selectedConversation) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setLocalSelectedId("");
        router.replace("/conversations", { scroll: false });
      }
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [router, selectedConversation]);

  return (
    <main className="min-h-full bg-[#090909] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-400">Your inbox</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Conversations</h1>
          <p className="mt-2 text-sm text-zinc-400">Choose a chat or find someone to start a new one.</p>
        </div>

        {error && (
          <p role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-950/50 px-4 py-3 text-sm text-red-200">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">
            {notice}
          </p>
        )}

        <section className="max-w-3xl space-y-6">
          <div className="space-y-4">
            <form onSubmit={searchUsers} className="space-y-2">
              <label htmlFor="user-search" className="text-sm font-medium text-zinc-200">Start a conversation</label>
              <div className="flex gap-2">
                <Input
                  id="user-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search username or name"
                  className="h-10 border-white/10 bg-black/40 text-white placeholder:text-zinc-600"
                />
                <Button type="submit" disabled={isSearching} className="bg-red-600 text-white hover:bg-red-500">
                  {isSearching ? "…" : "Find"}
                </Button>
              </div>
            </form>

            {users.length > 0 && (
              <ul className="space-y-1 border-b border-white/10 pb-3">
                {users.map((user) => (
                  <li key={user.id}>
                    <button
                      type="button"
                      onClick={() => void startConversation(user)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-white/5"
                    >
                      <ProfileAvatar avatarUrl={user.avatarUrl} label={user.displayName || user.username || "ChatApp user"} className="size-9" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-white">{user.displayName || user.username || "ChatApp user"}</span>
                        <span className="block truncate text-xs text-zinc-500">@{user.username || "no username"}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="rounded-2xl border border-white/10 bg-[#111111] p-4">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Recent chats</h2>
              {isLoading ? (
                <p className="px-3 py-4 text-sm text-zinc-500">Loading conversations…</p>
              ) : conversations.length === 0 ? (
                <p className="px-3 py-4 text-sm leading-6 text-zinc-500">No conversations yet. Search for someone above to get started.</p>
              ) : (
                <ul className="space-y-1">
                  {conversations
                    .filter((conversation) => {
                      const partner = conversationParticipants[conversation.id]?.find((participant) => participant.id !== currentUserId);
                      const label = conversation.type === "DIRECT"
                        ? `${partner?.username ?? ""} ${partner?.displayName ?? ""}`
                        : conversation.title ?? "";
                      return !search.trim() || label.toLowerCase().includes(search.trim().toLowerCase());
                    })
                    .map((conversation) => {
                    const partner = conversation.type === "DIRECT"
                      ? conversationParticipants[conversation.id]?.find((participant) => participant.id !== currentUserId)
                      : undefined;
                    return (
                    <li key={conversation.id}>
                      <button
                        type="button"
                        aria-current={selectedId === conversation.id ? "page" : undefined}
                        onClick={() => {
                          setLocalSelectedId(conversation.id);
                          router.replace(
                            `/conversations?conversationId=${encodeURIComponent(conversation.id)}`,
                            { scroll: false },
                          );
                        }}
                        className={`w-full rounded-xl px-3 py-3 text-left transition ${
                          selectedId === conversation.id
                            ? "bg-red-600/15 ring-1 ring-red-500/30"
                            : "hover:bg-white/5"
                        }`}
                      >
                        <span className="flex items-center gap-3">
                          {conversation.type === "DIRECT" && (
                            <ProfileAvatar avatarUrl={partner?.avatarUrl ?? null} label={partner?.displayName || partner?.username || "Direct conversation"} className="size-9" />
                          )}
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-white">
                              {partner
                                ? partner.username ? `@${partner.username}` : partner.displayName || "Direct conversation"
                                : conversation.title || (conversation.type === "DIRECT" ? "Direct conversation" : "Untitled room")}
                            </span>
                            <span className="mt-1 block text-xs text-zinc-500">
                              {partner?.displayName || conversation.type}
                            </span>
                          </span>
                        </span>
                      </button>
                    </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </section>

        {selectedConversation && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6 md:left-[280px]">
            <button
              type="button"
              onClick={() => {
                setLocalSelectedId("");
                router.replace("/conversations", { scroll: false });
              }}
              aria-label="Close conversation"
              className="absolute inset-0 bg-black/75 backdrop-blur-sm"
            />
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="conversation-dialog-title"
              className="relative flex h-[min(88dvh,800px)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#111111] shadow-2xl"
            >
                <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
                  {selectedConversation.type === "DIRECT" && (
                    <ProfileAvatar
                      avatarUrl={selectedDirectUser?.avatarUrl ?? null}
                      label={selectedDirectUser?.displayName || selectedDirectUser?.username || "Direct conversation"}
                      className="size-10"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <h2 id="conversation-dialog-title" className="truncate font-semibold">
                      {selectedDirectUser
                        ? selectedDirectUser.username
                          ? `@${selectedDirectUser.username}`
                          : selectedDirectUser.displayName || "Direct conversation"
                        : selectedConversation.title || "Conversation"}
                    </h2>
                    <p className="mt-1 text-xs text-zinc-500">
                      {selectedDirectUser?.displayName || selectedConversation.type}
                    </p>
                  </div>
                  {selectedConversation.type === "DIRECT" ? (
                    <Link
                      href={`/calls?conversationId=${encodeURIComponent(selectedConversation.id)}`}
                      className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-200 hover:bg-white/5"
                    >
                      <Phone className="size-4" /> Call page
                    </Link>
                  ) : null}
                  <Link
                    href={`/attachments?conversationId=${encodeURIComponent(selectedConversation.id)}`}
                    className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-200 hover:bg-white/5"
                  >
                    <Paperclip className="size-4" /> Files
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setLocalSelectedId("");
                      router.replace("/conversations", { scroll: false });
                    }}
                    aria-label="Close conversation"
                    className="rounded-lg p-2 text-zinc-400 hover:bg-white/10 hover:text-white"
                  >
                    <X className="size-5" />
                  </button>
                </header>
                {selectedConversation.type === "DIRECT" ? (
                  <DirectCall key={selectedConversation.id} conversationId={selectedConversation.id} />
                ) : (
                  <GroupCall key={selectedConversation.id} conversationId={selectedConversation.id} />
                )}
                <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
                  {messagesConversationId !== selectedConversation.id ? (
                    <p className="py-10 text-center text-sm text-zinc-500">Loading messages…</p>
                  ) : messages.length === 0 ? (
                    <p className="py-10 text-center text-sm text-zinc-500">No messages here yet. Send the first one.</p>
                  ) : messages.map((message) => {
                    const isOwnMessage = message.senderId === currentUserId;
                    const sender = conversationParticipants[selectedConversation.id]?.find(
                      (participant) => participant.id === message.senderId,
                    );
                    return (
                      <div key={message.id} className={`flex items-end gap-2 ${isOwnMessage ? "justify-end" : "justify-start"}`}>
                        {!isOwnMessage && (
                          <ProfileAvatar
                            avatarUrl={sender?.avatarUrl ?? null}
                            label={sender?.displayName || sender?.username || "Conversation participant"}
                            className="size-8"
                          />
                        )}
                        <article className={`max-w-2xl rounded-xl border px-4 py-3 ${
                          isOwnMessage
                            ? "border-red-500/30 bg-red-600/20"
                            : "border-white/5 bg-black/30"
                        }`}>
                          <p className={`whitespace-pre-wrap break-words text-sm text-zinc-100 ${isOwnMessage ? "text-right" : ""}`}>
                            {message.deletedAt
                              ? "This message was deleted."
                              : message.type === "FILE"
                                ? attachments[message.id]?.filename ?? "Attachment"
                                : message.content || ""}
                          </p>
                          {message.type === "FILE" && attachments[message.id] && (
                            <button
                              type="button"
                              onClick={() => void downloadAttachment(attachments[message.id])}
                              className={`mt-2 block text-xs font-medium text-red-300 underline underline-offset-4 hover:text-red-200 ${isOwnMessage ? "ml-auto" : ""}`}
                            >
                              Download {attachments[message.id].filename}
                            </button>
                          )}
                          <p className="mt-2 text-right text-[11px] text-zinc-300/70">{formatTime(message.createdAt)}</p>
                        </article>
                        {isOwnMessage && (
                          <ProfileAvatar
                            avatarUrl={sender?.avatarUrl ?? null}
                            label={sender?.displayName || sender?.username || "You"}
                            className="size-8"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
                <form onSubmit={sendMessage} className="flex gap-2 border-t border-white/10 p-3 sm:p-4">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain"
                    onChange={(event) => void uploadAttachment(event)}
                    className="sr-only"
                    tabIndex={-1}
                    aria-label="Choose attachment"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isUploading}
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="Attach a file"
                    className="h-11 border-white/15 bg-white/5 px-3 text-white hover:bg-white/10 hover:text-white"
                  >
                    <Paperclip className="size-4" />
                    <span className="sr-only sm:not-sr-only sm:ml-2">{isUploading ? "Uploading…" : "Attach"}</span>
                  </Button>
                  <Input
                    value={messageText}
                    onChange={(event) => setMessageText(event.target.value)}
                    maxLength={4000}
                    aria-label="Message"
                    placeholder="Write a message…"
                    className="h-11 border-white/10 bg-black/40 text-white placeholder:text-zinc-600"
                  />
                  <Button type="submit" disabled={isSending} className="bg-red-600 text-white hover:bg-red-500">
                    {isSending ? "Sending…" : "Send"}
                  </Button>
                </form>
          </section>
          </div>
        )}

      </div>
    </main>
  );
}

export default function ConversationsPage() {
  return (
    <Suspense fallback={<div className="min-h-full bg-[#090909]" />}>
      <ConversationsPageContent />
    </Suspense>
  );
}
