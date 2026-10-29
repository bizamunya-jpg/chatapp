"use client";

import { Client, type IMessage, type StompSubscription } from "@stomp/stompjs";
import { Phone, PhoneOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { backendApi } from "@/lib/backend-api";
import type { Call, CallParticipant } from "@/lib/backend-types";

const GroupCallSignalSchema = z.object({
  callId: z.string(),
  fromUserId: z.string(),
  toUserId: z.string().nullable(),
  type: z.enum(["OFFER", "ANSWER", "ICE_CANDIDATE"]),
  payload: z.string().max(64_000),
});

type Props = {
  conversationId: string;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The group call could not be completed.";
}

export function GroupCall({ conversationId }: Props) {
  const [userId, setUserId] = useState("");
  const [call, setCall] = useState<Call | null>(null);
  const [participants, setParticipants] = useState<CallParticipant[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const clientRef = useRef<Client | null>(null);
  const eventsSubscriptionRef = useRef<StompSubscription | null>(null);
  const signalSubscriptionRef = useRef<StompSubscription | null>(null);
  const peersRef = useRef(new Map<string, RTCPeerConnection>());
  const localStreamRef = useRef<MediaStream | null>(null);
  const currentUserIdRef = useRef("");
  const callRef = useRef<Call | null>(null);
  const pendingSignalsRef = useRef(new Map<string, z.infer<typeof GroupCallSignalSchema>[]>());
  const pendingCandidatesRef = useRef(new Map<string, RTCIceCandidateInit[]>());
  const offeredPeerIdsRef = useRef(new Set<string>());
  const signalQueueRef = useRef<Promise<void>>(Promise.resolve());

  const refreshCall = useCallback(async () => {
    const activeCalls = await backendApi.calls.list(conversationId);
    const activeCall = activeCalls[0] ?? null;
    callRef.current = activeCall;
    setCall((current) =>
      current?.id === activeCall?.id && current?.status === activeCall?.status
        ? current
        : activeCall,
    );
    if (!activeCall) {
      setParticipants([]);
      return;
    }
    const nextParticipants = await backendApi.calls.listParticipants(conversationId, activeCall.id);
    setParticipants((current) => {
      const unchanged = current.length === nextParticipants.length
        && nextParticipants.every((participant) => current.some(
          (existing) => existing.userId === participant.userId && existing.status === participant.status,
        ));
      return unchanged ? current : nextParticipants;
    });
  }, [conversationId]);

  const publishSignal = useCallback((
    toUserId: string,
    type: "OFFER" | "ANSWER" | "ICE_CANDIDATE",
    payload: string,
  ) => {
    const client = clientRef.current;
    const activeCall = callRef.current;
    if (!client?.connected || !activeCall) {
      setError("Group call signaling is not connected yet.");
      return;
    }
    client.publish({
      destination: backendApi.realtime.callSignalDestination(conversationId),
      body: JSON.stringify({ callId: activeCall.id, toUserId, type, payload }),
    });
  }, [conversationId]);

  const createPeer = useCallback((remoteUserId: string): RTCPeerConnection | null => {
    const existing = peersRef.current.get(remoteUserId);
    if (existing) return existing;
    const stream = localStreamRef.current;
    if (!stream) return null;

    const peer = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    peersRef.current.set(remoteUserId, peer);
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));
    peer.ontrack = (event) => {
      setRemoteStreams((current) => ({
        ...current,
        [remoteUserId]: event.streams[0] ?? new MediaStream([event.track]),
      }));
    };
    peer.onicecandidate = (event) => {
      if (event.candidate) {
        publishSignal(remoteUserId, "ICE_CANDIDATE", JSON.stringify(event.candidate.toJSON()));
      }
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "failed") {
        setError("A group voice connection failed. Your network may require a TURN relay.");
      } else if (peer.connectionState === "connected") {
        setError("");
      } else if (peer.connectionState === "closed") {
        setRemoteStreams((current) => {
          const next = { ...current };
          delete next[remoteUserId];
          return next;
        });
      }
    };
    return peer;
  }, [publishSignal]);

  const processSignal = useCallback(async (signal: z.infer<typeof GroupCallSignalSchema>) => {
    if (signal.toUserId !== currentUserIdRef.current || signal.fromUserId === currentUserIdRef.current) return;
    let peer = peersRef.current.get(signal.fromUserId);
    if (!peer && signal.type === "OFFER") peer = createPeer(signal.fromUserId) ?? undefined;
    if (!peer) {
      if (signal.type === "ICE_CANDIDATE") {
        const candidates = pendingCandidatesRef.current.get(signal.fromUserId) ?? [];
        candidates.push(JSON.parse(signal.payload) as RTCIceCandidateInit);
        pendingCandidatesRef.current.set(signal.fromUserId, candidates);
        return;
      }
      const queued = pendingSignalsRef.current.get(signal.fromUserId) ?? [];
      queued.push(signal);
      pendingSignalsRef.current.set(signal.fromUserId, queued);
      return;
    }

    const payload: unknown = JSON.parse(signal.payload);
    if (signal.type === "OFFER") {
      await peer.setRemoteDescription(payload as RTCSessionDescriptionInit);
      for (const candidate of pendingCandidatesRef.current.get(signal.fromUserId) ?? []) {
        await peer.addIceCandidate(candidate);
      }
      pendingCandidatesRef.current.delete(signal.fromUserId);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      publishSignal(signal.fromUserId, "ANSWER", JSON.stringify(peer.localDescription));
    } else if (signal.type === "ANSWER") {
      await peer.setRemoteDescription(payload as RTCSessionDescriptionInit);
      for (const candidate of pendingCandidatesRef.current.get(signal.fromUserId) ?? []) {
        await peer.addIceCandidate(candidate);
      }
      pendingCandidatesRef.current.delete(signal.fromUserId);
    } else {
      const candidate = payload as RTCIceCandidateInit;
      if (peer.remoteDescription) {
        await peer.addIceCandidate(candidate);
      } else {
        const queued = pendingCandidatesRef.current.get(signal.fromUserId) ?? [];
        queued.push(candidate);
        pendingCandidatesRef.current.set(signal.fromUserId, queued);
      }
    }
  }, [createPeer, publishSignal]);

  const enqueueSignal = useCallback((signal: z.infer<typeof GroupCallSignalSchema>) => {
    signalQueueRef.current = signalQueueRef.current
      .then(() => processSignal(signal))
      .catch((signalError: unknown) => setError(errorMessage(signalError)));
  }, [processSignal]);

  useEffect(() => {
    let active = true;
    void backendApi.users.me()
      .then((profile) => {
        if (!active) return;
        currentUserIdRef.current = profile.id;
        setUserId(profile.id);
      })
      .catch((loadError: unknown) => {
        if (active) setError(errorMessage(loadError));
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void refreshCall()
        .catch((loadError: unknown) => setError(errorMessage(loadError)))
        .finally(() => {
          if (active) setIsLoading(false);
        });
    };
    refresh();
    const timer = window.setInterval(refresh, 2_500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [refreshCall]);

  useEffect(() => {
    let active = true;
    let client: Client | null = null;
    const peers = peersRef.current;
    void backendApi.realtime.connectionOptions()
      .then((options) => {
        if (!active) return;
        client = new Client({
          brokerURL: options.brokerURL,
          connectHeaders: options.connectHeaders,
          reconnectDelay: options.reconnectDelay,
          onConnect: () => {
            setIsConnected(true);
            eventsSubscriptionRef.current = client?.subscribe(
              backendApi.realtime.callEventsDestination(conversationId),
              () => {
                void refreshCall().catch((loadError: unknown) => setError(errorMessage(loadError)));
              },
            ) ?? null;
          },
          onWebSocketClose: () => setIsConnected(false),
          onStompError: () => setError("Group call signaling disconnected. Reconnecting…"),
        });
        client.activate();
        clientRef.current = client;
      })
      .catch((connectionError: unknown) => {
        if (active) setError(errorMessage(connectionError));
      });
    return () => {
      active = false;
      setIsConnected(false);
      eventsSubscriptionRef.current?.unsubscribe();
      signalSubscriptionRef.current?.unsubscribe();
      clientRef.current = null;
      peers.forEach((peer) => peer.close());
      peers.clear();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      if (client?.active) void client.deactivate();
    };
  }, [conversationId, refreshCall]);

  useEffect(() => {
    if (!call || !isConnected || !clientRef.current) return;
    signalSubscriptionRef.current?.unsubscribe();
    signalSubscriptionRef.current = clientRef.current.subscribe(
      backendApi.realtime.callSignalTopic(call.id),
      (message: IMessage) => {
        try {
          const parsed = GroupCallSignalSchema.safeParse(JSON.parse(message.body));
          if (!parsed.success || parsed.data.callId !== call.id) {
            setError("Received an invalid group call signal.");
            return;
          }
          if (parsed.data.toUserId === userId) enqueueSignal(parsed.data);
        } catch (signalError) {
          setError(errorMessage(signalError));
        }
      },
    );
    return () => {
      signalSubscriptionRef.current?.unsubscribe();
      signalSubscriptionRef.current = null;
    };
  }, [call, enqueueSignal, isConnected, userId]);

  useEffect(() => {
    if (!call || !isConnected || !userId) return;
    const ownParticipant = participants.find((participant) => participant.userId === userId);
    if (ownParticipant?.status === "LEFT" || ownParticipant?.status === "DECLINED") {
      peersRef.current.forEach((peer) => peer.close());
      peersRef.current.clear();
      offeredPeerIdsRef.current.clear();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      return;
    }
    if (call.status !== "ACCEPTED" || ownParticipant?.status !== "ACCEPTED") return;
    let active = true;
    void (async () => {
      try {
        if (!localStreamRef.current) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          if (!active) {
            stream.getTracks().forEach((track) => track.stop());
            return;
          }
          localStreamRef.current = stream;
        }
        const joinedUsers = participants
          .filter((participant) => participant.status === "ACCEPTED" && participant.userId !== userId)
          .map((participant) => participant.userId);

        for (const [remoteUserId, peer] of peersRef.current) {
          if (!joinedUsers.includes(remoteUserId)) {
            peer.close();
            peersRef.current.delete(remoteUserId);
            offeredPeerIdsRef.current.delete(remoteUserId);
            setRemoteStreams((current) => {
              const next = { ...current };
              delete next[remoteUserId];
              return next;
            });
          }
        }

        for (const remoteUserId of joinedUsers) {
          const peer = createPeer(remoteUserId);
          if (!peer || userId.localeCompare(remoteUserId) >= 0
              || peer.signalingState !== "stable" || offeredPeerIdsRef.current.has(remoteUserId)) continue;
          offeredPeerIdsRef.current.add(remoteUserId);
          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          publishSignal(remoteUserId, "OFFER", JSON.stringify(peer.localDescription));
          for (const signal of pendingSignalsRef.current.get(remoteUserId) ?? []) {
            enqueueSignal(signal);
          }
          pendingSignalsRef.current.delete(remoteUserId);
        }
      } catch (mediaError) {
        if (active) setError(errorMessage(mediaError));
      }
    })();
    return () => {
      active = false;
    };
  }, [call, createPeer, enqueueSignal, isConnected, participants, publishSignal, userId]);

  useEffect(() => {
    if (call) return;
    peersRef.current.forEach((peer) => peer.close());
    peersRef.current.clear();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
  }, [call]);

  async function startCall() {
    setError("");
    setIsUpdating(true);
    setRemoteStreams({});
    try {
      const startedCall = await backendApi.calls.start(conversationId);
      callRef.current = startedCall;
      setCall(startedCall);
      await refreshCall();
    } catch (startError) {
      setError(errorMessage(startError));
    } finally {
      setIsUpdating(false);
    }
  }

  async function updateCall(status: "ACCEPTED" | "DECLINED" | "ENDED") {
    if (!call) return;
    setError("");
    setIsUpdating(true);
    try {
      await backendApi.calls.update(conversationId, call.id, status);
      await refreshCall();
    } catch (updateError) {
      setError(errorMessage(updateError));
    } finally {
      setIsUpdating(false);
    }
  }

  const ownStatus = participants.find((participant) => participant.userId === userId)?.status;
  const isInitiator = call?.initiatorId === userId;
  const activeRemoteStreams = ownStatus === "ACCEPTED" ? Object.entries(remoteStreams) : [];
  const connectedCount = activeRemoteStreams.length;
  const audioRef = (stream: MediaStream) => (element: HTMLAudioElement | null) => {
    if (element && element.srcObject !== stream) {
      element.srcObject = stream;
      void element.play().catch(() => setError("Your browser blocked call audio playback."));
    }
  };

  return (
    <section className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3">
      {activeRemoteStreams.map(([remoteUserId, stream]) => (
        <audio key={remoteUserId} ref={audioRef(stream)} autoPlay />
      ))}
      {isLoading ? (
        <span className="text-xs text-zinc-500">Checking group call…</span>
      ) : !call ? (
        <Button
          type="button"
          disabled={isUpdating || !isConnected}
          onClick={() => void startCall()}
          className="h-9 bg-red-600 text-white hover:bg-red-500"
        >
          <Phone className="mr-2 size-4" />
          {isUpdating ? "Starting…" : isConnected ? "Start group voice call" : "Connecting call…"}
        </Button>
      ) : (
        <>
          <span role="status" className="mr-auto text-sm text-zinc-300">
            {ownStatus === "RINGING"
              ? "Incoming group voice call"
              : ownStatus === "LEFT" || ownStatus === "DECLINED"
                ? "You are not in this call"
                : call.status === "RINGING"
                  ? "Waiting for members to join…"
                  : connectedCount
                    ? `Group voice call · ${connectedCount + 1} connected`
                    : "Connecting group voice call…"}
          </span>
          {ownStatus === "RINGING" && (
            <>
              <Button type="button" disabled={isUpdating} onClick={() => void updateCall("ACCEPTED")} className="h-9 bg-emerald-700 text-white hover:bg-emerald-600">
                <Phone className="mr-2 size-4" /> Join
              </Button>
              <Button type="button" disabled={isUpdating} onClick={() => void updateCall("DECLINED")} variant="outline" className="h-9 border-white/15 text-white hover:bg-white/10 hover:text-white">
                Decline
              </Button>
            </>
          )}
          {ownStatus === "ACCEPTED" && (
            <Button
              type="button"
              disabled={isUpdating}
              onClick={() => void updateCall("ENDED")}
              variant="outline"
              className="h-9 border-red-500/30 text-red-200 hover:bg-red-950/50 hover:text-white"
            >
              <PhoneOff className="mr-2 size-4" />
              {isInitiator ? "End group call" : "Leave call"}
            </Button>
          )}
        </>
      )}
      {error && <p role="alert" className="w-full text-xs text-red-300">{error}</p>}
    </section>
  );
}
