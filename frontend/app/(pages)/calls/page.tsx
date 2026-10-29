"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { DirectCall } from "@/components/conversations/direct-call";
import { GroupCall } from "@/components/conversations/group-call";
import { backendApi } from "@/lib/backend-api";
import { getAccessToken } from "@/lib/auth-token";
import type { Conversation } from "@/lib/backend-types";

function CallsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedId = searchParams.get("conversationId");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [incomingConversationIds, setIncomingConversationIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");

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
        setSelectedId(items.find((conversation) => conversation.id === requestedId)?.id ?? "");
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Could not load conversations.");
      });
    return () => {
      active = false;
    };
  }, [requestedId, router]);

  useEffect(() => {
    if (!getAccessToken()) return;
    let active = true;
    const refreshIncomingCalls = () => {
      void backendApi.calls.listIncoming()
        .then((calls) => {
          if (active) {
            setIncomingConversationIds([...new Set(calls.map((call) => call.conversationId))]);
          }
        })
        .catch((loadError: unknown) => {
          if (active) setError(loadError instanceof Error ? loadError.message : "Could not check incoming calls.");
        });
    };
    refreshIncomingCalls();
    const timer = window.setInterval(refreshIncomingCalls, 3_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const selectedConversation = conversations.find((conversation) => conversation.id === selectedId);
  const incomingConversations = conversations.filter((conversation) =>
    incomingConversationIds.includes(conversation.id) && conversation.id !== selectedId,
  );

  return (
    <main className="min-h-full bg-[#090909] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-400">Voice</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Calls</h1>
        <p className="mt-2 text-sm text-zinc-400">Start or join a voice call from a direct conversation or group.</p>
        {error && <p role="alert" className="mt-5 rounded-xl border border-red-500/30 bg-red-950/50 p-3 text-sm text-red-200">{error}</p>}

        {incomingConversations.length > 0 && (
          <section aria-labelledby="incoming-calls-heading" className="mt-6 space-y-3">
            <h2 id="incoming-calls-heading" className="text-sm font-semibold text-emerald-200">Active incoming calls</h2>
            {incomingConversations.map((conversation) => (
              <article key={conversation.id} className="overflow-hidden rounded-2xl border border-emerald-500/20 bg-[#111111]">
                <header className="border-b border-white/10 px-5 py-3">
                  <h3 className="font-medium">{conversation.title || "Direct conversation"}</h3>
                </header>
                {conversation.type === "DIRECT" ? (
                  <DirectCall key={`incoming-${conversation.id}`} conversationId={conversation.id} />
                ) : (
                  <GroupCall key={`incoming-${conversation.id}`} conversationId={conversation.id} />
                )}
              </article>
            ))}
          </section>
        )}

        {conversations.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-white/10 bg-[#111111] p-5 text-sm text-zinc-400">
            You do not have a conversation to call yet. Start one from Chats or create a group.
          </p>
        ) : (
          <div className="mt-6 space-y-4">
            <label htmlFor="call-conversation" className="block text-sm font-medium text-zinc-200">Choose a conversation</label>
            <select
              id="call-conversation"
              value={selectedId}
              onChange={(event) => {
                setSelectedId(event.target.value);
                router.replace(event.target.value ? `/calls?conversationId=${encodeURIComponent(event.target.value)}` : "/calls", { scroll: false });
              }}
              className="w-full rounded-xl border border-white/10 bg-[#111111] px-4 py-3 text-sm text-white"
            >
              <option value="">Select a conversation</option>
              {conversations.map((conversation) => (
                <option key={conversation.id} value={conversation.id}>
                  {conversation.title || (conversation.type === "DIRECT" ? "Direct conversation" : "Group conversation")}
                </option>
              ))}
            </select>
            {selectedConversation && (
              <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#111111]">
                <header className="border-b border-white/10 px-5 py-4">
                  <h2 className="font-semibold">
                    {selectedConversation.title || (selectedConversation.type === "DIRECT" ? "Direct conversation" : "Group conversation")}
                  </h2>
                  <p className="mt-1 text-xs text-zinc-500">Voice call controls</p>
                </header>
                {selectedConversation.type === "DIRECT" ? (
                  <DirectCall key={selectedConversation.id} conversationId={selectedConversation.id} />
                ) : (
                  <GroupCall key={selectedConversation.id} conversationId={selectedConversation.id} />
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

export default function CallsPage() {
  return (
    <Suspense fallback={<div className="min-h-full bg-[#090909]" />}>
      <CallsPageContent />
    </Suspense>
  );
}
