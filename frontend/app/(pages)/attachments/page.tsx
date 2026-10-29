"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Check, ChevronDown, MessageCircle, Users } from "lucide-react";
import { useRef } from "react";

import { backendApi } from "@/lib/backend-api";
import { BackendApiError } from "@/lib/api-client";
import { getAccessToken } from "@/lib/auth-token";
import type { Attachment, Conversation, Message } from "@/lib/backend-types";

type ConversationFiles = {
  message: Message;
  attachment: Attachment;
};

function AttachmentsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedId = searchParams.get("conversationId");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [files, setFiles] = useState<ConversationFiles[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isConversationMenuOpen, setIsConversationMenuOpen] = useState(false);
  const conversationPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace("/auth/login");
      return;
    }

    let active = true;
    void backendApi.conversations.list()
      .then((items) => {
        if (!active) return;
        setConversations(items);
        const selectedConversationId = items.find((conversation) => conversation.id === requestedId)?.id ?? "";
        setSelectedId(selectedConversationId);
        setIsLoading(Boolean(selectedConversationId));
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Could not load conversations.");
      });
    return () => {
      active = false;
    };
  }, [requestedId, router]);

  useEffect(() => {
    if (!isConversationMenuOpen) return;

    function closeOnOutsideClick(event: PointerEvent) {
      if (!conversationPickerRef.current?.contains(event.target as Node)) {
        setIsConversationMenuOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsConversationMenuOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isConversationMenuOpen]);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    void backendApi.conversations.listMessages(selectedId)
      .then(async (messages) => {
        const fileMessages = messages.filter((message) => message.type === "FILE");
        const results = await Promise.all(fileMessages.map(async (message) => {
          try {
            return { message, attachment: await backendApi.attachments.getForMessage(selectedId, message.id) };
          } catch (attachmentError) {
            if (attachmentError instanceof BackendApiError && attachmentError.status === 404) return null;
            throw attachmentError;
          }
        }));
        if (active) setFiles(results.filter((item): item is ConversationFiles => item !== null));
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Could not load attachments.");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedId]);

  async function download(attachment: Attachment) {
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
      setError(downloadError instanceof Error ? downloadError.message : "The attachment could not be downloaded.");
    }
  }

  const selectedConversation = conversations.find((conversation) => conversation.id === selectedId);

  function chooseConversation(conversationId: string) {
    setFiles([]);
    setError("");
    setIsLoading(Boolean(conversationId));
    setSelectedId(conversationId);
    setIsConversationMenuOpen(false);
    router.replace(
      conversationId ? `/attachments?conversationId=${encodeURIComponent(conversationId)}` : "/attachments",
      { scroll: false },
    );
  }

  return (
    <main className="min-h-full bg-[#090909] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-400">Shared files</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Attachments</h1>
        <p className="mt-2 text-sm text-zinc-400">Browse and download files shared in your conversations.</p>
        {error && <p role="alert" className="mt-5 rounded-xl border border-red-500/30 bg-red-950/50 p-3 text-sm text-red-200">{error}</p>}

        <div className="mt-6 space-y-4">
          <div className="space-y-2">
            <label id="attachment-conversation-label" className="block text-sm font-medium text-zinc-200">
              Conversation
            </label>
            <div ref={conversationPickerRef} className="relative max-w-xl">
              <button
                type="button"
                aria-labelledby="attachment-conversation-label"
                aria-haspopup="listbox"
                aria-expanded={isConversationMenuOpen}
                onClick={() => setIsConversationMenuOpen((open) => !open)}
                className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-white/10 bg-[#111111] px-4 py-3 text-left shadow-sm transition hover:border-white/20 hover:bg-[#151515] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/5 text-zinc-400">
                  {selectedConversation?.type === "GROUP"
                    ? <Users className="size-4" />
                    : <MessageCircle className="size-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm ${selectedConversation ? "font-medium text-white" : "text-zinc-400"}`}>
                    {selectedConversation
                      ? selectedConversation.title || (selectedConversation.type === "DIRECT" ? "Direct conversation" : "Group conversation")
                      : "Select a conversation"}
                  </span>
                  {selectedConversation && (
                    <span className="mt-0.5 block text-xs text-zinc-500">
                      {selectedConversation.type === "DIRECT" ? "Direct chat" : "Group chat"}
                    </span>
                  )}
                </span>
                <ChevronDown className={`size-4 shrink-0 text-zinc-500 transition-transform ${isConversationMenuOpen ? "rotate-180" : ""}`} />
              </button>

              {isConversationMenuOpen && (
                <div
                  role="listbox"
                  aria-labelledby="attachment-conversation-label"
                  className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 max-h-80 overflow-y-auto rounded-xl border border-white/10 bg-[#151515] p-1.5 shadow-2xl shadow-black/50"
                >
                  {conversations.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-zinc-500">No conversations available.</p>
                  ) : conversations.map((conversation) => {
                    const title = conversation.title
                      || (conversation.type === "DIRECT" ? "Direct conversation" : "Group conversation");
                    const isSelected = selectedId === conversation.id;
                    return (
                      <button
                        key={conversation.id}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => chooseConversation(conversation.id)}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition ${
                          isSelected ? "bg-red-600/15 text-white" : "text-zinc-300 hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/5 text-zinc-400">
                          {conversation.type === "GROUP"
                            ? <Users className="size-4" />
                            : <MessageCircle className="size-4" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{title}</span>
                          <span className="mt-0.5 block text-xs text-zinc-500">
                            {conversation.type === "DIRECT" ? "Direct chat" : "Group chat"}
                          </span>
                        </span>
                        {isSelected && <Check className="size-4 shrink-0 text-red-300" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {!selectedId ? (
            <p className="rounded-2xl border border-white/10 bg-[#111111] p-5 text-sm text-zinc-400">Choose a conversation to see its attachments.</p>
          ) : isLoading ? (
            <p role="status" className="rounded-2xl border border-white/10 bg-[#111111] p-5 text-sm text-zinc-400">Loading attachments…</p>
          ) : files.length === 0 ? (
            <p className="rounded-2xl border border-white/10 bg-[#111111] p-5 text-sm text-zinc-400">No attachments in this conversation yet.</p>
          ) : (
            <ul className="divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-[#111111]">
              {files.map(({ message, attachment }) => (
                <li key={attachment.id} className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{attachment.filename}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {(attachment.sizeBytes / 1024).toFixed(1)} KB · {new Date(message.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void download(attachment)}
                    className="shrink-0 rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-500"
                  >
                    Download
                  </button>
                </li>
              ))}
            </ul>
          )}
          {selectedId && (
            <Link href={`/conversations?conversationId=${encodeURIComponent(selectedId)}`} className="inline-block text-sm text-red-300 underline underline-offset-4 hover:text-red-200">
              Open conversation to upload another file
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}

export default function AttachmentsPage() {
  return (
    <Suspense fallback={<div className="min-h-full bg-[#090909]" />}>
      <AttachmentsPageContent />
    </Suspense>
  );
}
