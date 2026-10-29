"use client";

import { Phone, PhoneOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { backendApi } from "@/lib/backend-api";
import { getAccessToken } from "@/lib/auth-token";
import type { Call } from "@/lib/backend-types";

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : "The call action could not be completed.";
}

export function IncomingCallNotifications() {
  const router = useRouter();
  const [incomingCalls, setIncomingCalls] = useState<Call[]>([]);
  const [error, setError] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">(
    () => typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );
  const notifiedCallIdsRef = useRef(new Set<string>());

  const refreshIncomingCalls = useCallback(async () => {
    if (!getAccessToken()) return;
    const calls = await backendApi.calls.listIncoming();
    setIncomingCalls(calls);
    for (const call of calls) {
      const isGroupCall = call.initiatorId === call.recipientId;
      if ((!isGroupCall && call.status !== "RINGING") || notifiedCallIdsRef.current.has(call.id)) continue;
      notifiedCallIdsRef.current.add(call.id);
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        const notification = new Notification(isGroupCall ? "Incoming group voice call" : "Incoming voice call", {
          body: "Open ChatApp to answer the call.",
          tag: `chatapp-call-${call.id}`,
        });
        notification.onclick = () => {
          window.focus();
          router.push(`/calls?conversationId=${encodeURIComponent(call.conversationId)}`);
          notification.close();
        };
      }
    }
  }, [router]);

  useEffect(() => {
    if (!getAccessToken()) return;
    let active = true;
    const refresh = () => {
      void refreshIncomingCalls().catch((loadError: unknown) => {
        if (active) setError(messageFrom(loadError));
      });
    };
    refresh();
    const timer = window.setInterval(refresh, 3_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [refreshIncomingCalls]);

  async function answer(call: Call) {
    setError("");
    setIsUpdating(true);
    try {
      await backendApi.calls.update(call.conversationId, call.id, "ACCEPTED");
      router.push(`/calls?conversationId=${encodeURIComponent(call.conversationId)}`);
    } catch (answerError) {
      setError(messageFrom(answerError));
      void refreshIncomingCalls().catch((loadError: unknown) => setError(messageFrom(loadError)));
    } finally {
      setIsUpdating(false);
    }
  }

  async function decline(call: Call) {
    setError("");
    setIsUpdating(true);
    try {
      await backendApi.calls.update(call.conversationId, call.id, "DECLINED");
      setIncomingCalls((current) => current.filter((item) => item.id !== call.id));
    } catch (declineError) {
      setError(messageFrom(declineError));
    } finally {
      setIsUpdating(false);
    }
  }

  async function enableBrowserNotifications() {
    if (typeof Notification === "undefined") return;
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission === "granted") {
      void refreshIncomingCalls().catch((loadError: unknown) => setError(messageFrom(loadError)));
    }
  }

  const ringingCall = incomingCalls.find((call) =>
    call.status === "RINGING" || call.initiatorId === call.recipientId,
  );
  if (!ringingCall) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="incoming-call-title"
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#151515] p-6 text-white shadow-2xl"
      >
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-500/15 text-emerald-300">
          <Phone className="size-6" />
        </div>
        <p className="mt-4 text-center text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">Incoming call</p>
        <h2 id="incoming-call-title" className="mt-2 text-center text-xl font-semibold">
          {ringingCall.initiatorId === ringingCall.recipientId
            ? "A group is calling you"
            : "Someone is calling you"}
        </h2>
        <p className="mt-2 text-center text-sm text-zinc-400">Answer to open the call and connect your microphone.</p>
        {error && <p role="alert" className="mt-4 rounded-lg bg-red-950/60 p-3 text-xs text-red-200">{error}</p>}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={isUpdating}
            onClick={() => void decline(ringingCall)}
            className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm text-zinc-200 hover:bg-white/5 disabled:opacity-50"
          >
            <PhoneOff className="size-4" /> Decline
          </button>
          <button
            type="button"
            disabled={isUpdating}
            onClick={() => void answer(ringingCall)}
            className="flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            <Phone className="size-4" /> {isUpdating ? "Connecting…" : "Answer"}
          </button>
        </div>
        {notificationPermission === "default" && (
          <button
            type="button"
            onClick={() => void enableBrowserNotifications()}
            className="mt-4 w-full text-center text-xs text-zinc-500 underline underline-offset-4 hover:text-zinc-300"
          >
            Enable browser call notifications
          </button>
        )}
      </section>
    </div>
  );
}
