"use client";

import { Client, type IMessage, type StompSubscription } from "@stomp/stompjs";
import { Phone, PhoneOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { backendApi } from "@/lib/backend-api";
import type { Call } from "@/lib/backend-types";

const CallSignalSchema = z.object({
  callId: z.string(),
  fromUserId: z.string(),
  type: z.enum(["OFFER", "ANSWER", "ICE_CANDIDATE"]),
  payload: z.string().max(64_000),
});

const CallNotificationSchema = z.object({
  callId: z.string(),
  conversationId: z.string(),
  initiatorId: z.string(),
  recipientId: z.string(),
  status: z.string(),
});

type Props = {
  conversationId: string;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The call could not be completed.";
}

export function DirectCall({ conversationId }: Props) {
  const [userId, setUserId] = useState("");
  const [call, setCall] = useState<Call | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isCallConnected, setIsCallConnected] = useState(false);
  const clientRef = useRef<Client | null>(null);
  const signalSubscriptionRef = useRef<StompSubscription | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const callRef = useRef<Call | null>(null);
  const currentUserIdRef = useRef("");
  const pendingSignalsRef = useRef<z.infer<typeof CallSignalSchema>[]>([]);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const signalQueueRef = useRef<Promise<void>>(Promise.resolve());

  const refreshCall = useCallback(async () => {
    const activeCalls = await backendApi.calls.list(conversationId);
    const nextCall = activeCalls[0] ?? null;
    callRef.current = nextCall;
    setCall((currentCall) =>
      currentCall?.id === nextCall?.id && currentCall?.status === nextCall?.status
        ? currentCall
        : nextCall,
    );
    if (!activeCalls.length) {
      setIsCallConnected(false);
    }
  }, [conversationId]);

  const publishSignal = useCallback((
    type: "OFFER" | "ANSWER" | "ICE_CANDIDATE",
    payload: string,
  ) => {
    const client = clientRef.current;
    const currentCall = callRef.current;
    if (!client?.connected || !currentCall) {
      setError("Call signaling is not connected yet.");
      return;
    }
    client.publish({
      destination: backendApi.realtime.callSignalDestination(conversationId),
      body: JSON.stringify({ callId: currentCall.id, type, payload }),
    });
  }, [conversationId]);

  const processSignal = useCallback(async (signal: z.infer<typeof CallSignalSchema>) => {
    const activeCall = callRef.current;
    const peer = peerRef.current;
    if (!activeCall || activeCall.id !== signal.callId || !peer) return;
    if (signal.fromUserId === currentUserIdRef.current) return;

    const payload: unknown = JSON.parse(signal.payload);
    if (signal.type === "OFFER") {
      await peer.setRemoteDescription(payload as RTCSessionDescriptionInit);
      for (const candidate of pendingCandidatesRef.current.splice(0)) {
        await peer.addIceCandidate(candidate);
      }
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      publishSignal("ANSWER", JSON.stringify(peer.localDescription));
    } else if (signal.type === "ANSWER") {
      await peer.setRemoteDescription(payload as RTCSessionDescriptionInit);
      for (const candidate of pendingCandidatesRef.current.splice(0)) {
        await peer.addIceCandidate(candidate);
      }
    } else {
      const candidate = payload as RTCIceCandidateInit;
      if (peer.remoteDescription) {
        await peer.addIceCandidate(candidate);
      } else {
        pendingCandidatesRef.current.push(candidate);
      }
    }
  }, [publishSignal]);

  const enqueueSignal = useCallback((signal: z.infer<typeof CallSignalSchema>) => {
    signalQueueRef.current = signalQueueRef.current
      .then(() => processSignal(signal))
      .catch((signalError: unknown) => setError(errorMessage(signalError)));
  }, [processSignal]);

  useEffect(() => {
    let active = true;
    const loadCallState = async () => {
      try {
        const [profile, activeCalls] = await Promise.all([
          backendApi.users.me(),
          backendApi.calls.list(conversationId),
        ]);
        if (!active) return;
        currentUserIdRef.current = profile.id;
        setUserId(profile.id);
        setCall(activeCalls[0] ?? null);
      } catch (loadError) {
        if (active) setError(errorMessage(loadError));
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void loadCallState();
    const timer = window.setInterval(() => {
      void refreshCall().catch((loadError: unknown) => setError(errorMessage(loadError)));
    }, 3_000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [conversationId, refreshCall]);

  useEffect(() => {
    let active = true;
    let client: Client | null = null;
    void backendApi.realtime.connectionOptions()
      .then((options) => {
        if (!active) return;
        client = new Client({
          brokerURL: options.brokerURL,
          connectHeaders: options.connectHeaders,
          reconnectDelay: options.reconnectDelay,
          onConnect: () => {
            setIsConnected(true);
            client?.subscribe(
              backendApi.realtime.callEventsDestination(conversationId),
              (message) => {
                try {
                  const notification = CallNotificationSchema.safeParse(JSON.parse(message.body));
                  if (!notification.success || notification.data.conversationId !== conversationId) {
                    setError("Received an invalid call notification.");
                    return;
                  }
                  void refreshCall().catch((loadError: unknown) => setError(errorMessage(loadError)));
                } catch (notificationError) {
                  setError(errorMessage(notificationError));
                }
              },
            );
          },
          onWebSocketClose: () => setIsConnected(false),
          onStompError: () => setError("Call signaling disconnected. Reconnecting…"),
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
      signalSubscriptionRef.current?.unsubscribe();
      signalSubscriptionRef.current = null;
      clientRef.current = null;
      if (client?.active) void client.deactivate();
    };
  }, [conversationId, refreshCall]);

  useEffect(() => {
    if (!isConnected || !call || !clientRef.current) return;
    signalSubscriptionRef.current?.unsubscribe();
    signalSubscriptionRef.current = clientRef.current.subscribe(
      backendApi.realtime.callSignalTopic(call.id),
      (message: IMessage) => {
        void handleSignal(message).catch((signalError: unknown) => setError(errorMessage(signalError)));
      },
    );

    async function handleSignal(message: IMessage) {
      const body: unknown = JSON.parse(message.body);
      const parsedSignal = CallSignalSchema.safeParse(body);
      if (!parsedSignal.success || parsedSignal.data.callId !== call?.id) {
        setError("Received an invalid call signal.");
        return;
      }
      if (!peerRef.current) {
        pendingSignalsRef.current.push(parsedSignal.data);
        return;
      }
      enqueueSignal(parsedSignal.data);
    }

    return () => {
      signalSubscriptionRef.current?.unsubscribe();
      signalSubscriptionRef.current = null;
    };
  }, [call, enqueueSignal, isConnected]);

  useEffect(() => {
    if (!call || call.status !== "ACCEPTED" || !isConnected || !userId) return;
    let active = true;
    let activePeer: RTCPeerConnection | null = null;
    let activeStream: MediaStream | null = null;
    pendingCandidatesRef.current = [];
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        activeStream = stream;
        localStreamRef.current = stream;
        const peer = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });
        activePeer = peer;
        peerRef.current = peer;
        stream.getTracks().forEach((track) => peer.addTrack(track, stream));
        peer.ontrack = (event) => {
          setRemoteStream(event.streams[0] ?? new MediaStream([event.track]));
        };
        peer.onconnectionstatechange = () => {
          setIsCallConnected(peer.connectionState === "connected");
          if (peer.connectionState === "failed") {
            setError("Voice connection failed. Your network may require a TURN relay.");
          } else if (peer.connectionState === "disconnected") {
            setError("Voice connection interrupted. Trying to reconnect…");
          } else if (peer.connectionState === "connected") {
            setError("");
          }
        };
        peer.onicecandidate = (event) => {
          if (event.candidate) {
            publishSignal("ICE_CANDIDATE", JSON.stringify(event.candidate.toJSON()));
          }
        };
        for (const signal of pendingSignalsRef.current.splice(0)) {
          enqueueSignal(signal);
        }
        if (call.initiatorId === userId) {
          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          publishSignal("OFFER", JSON.stringify(peer.localDescription));
        }
      } catch (mediaError) {
        if (active) setError(errorMessage(mediaError));
      }
    })();

    return () => {
      active = false;
      if (activePeer) {
        activePeer.close();
        if (peerRef.current === activePeer) peerRef.current = null;
      }
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
        if (localStreamRef.current === activeStream) localStreamRef.current = null;
      }
      if (callRef.current?.id !== call.id) {
        pendingSignalsRef.current = [];
        pendingCandidatesRef.current = [];
      }
      setRemoteStream(null);
      setIsCallConnected(false);
    };
  }, [call, enqueueSignal, isConnected, publishSignal, userId]);

  useEffect(() => {
    callRef.current = call;
  }, [call]);

  async function startCall() {
    setError("");
    setIsUpdating(true);
    try {
      const newCall = await backendApi.calls.start(conversationId);
      callRef.current = newCall;
      pendingSignalsRef.current = [];
      pendingCandidatesRef.current = [];
      setCall(newCall);
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
      const updatedCall = await backendApi.calls.update(conversationId, call.id, status);
      const activeCall = status === "ENDED" || status === "DECLINED" ? null : updatedCall;
      callRef.current = activeCall;
      if (!activeCall) {
        pendingSignalsRef.current = [];
        pendingCandidatesRef.current = [];
      }
      setCall(activeCall);
    } catch (updateError) {
      setError(errorMessage(updateError));
    } finally {
      setIsUpdating(false);
    }
  }

  const isRecipient = call?.recipientId === userId;
  const audioRef = (element: HTMLAudioElement | null) => {
    if (element && remoteStream && element.srcObject !== remoteStream) {
      element.srcObject = remoteStream;
      void element.play().catch(() => {
        setError("Your browser blocked call audio. Tap the page and enable audio playback.");
      });
    }
  };

  return (
    <section className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3">
      {remoteStream && <audio ref={audioRef} autoPlay />}
      {isLoading ? (
        <span className="text-xs text-zinc-500">Checking call status…</span>
      ) : !call ? (
        <Button
          type="button"
          disabled={isUpdating || !isConnected}
          onClick={() => void startCall()}
          className="h-9 bg-red-600 text-white hover:bg-red-500"
        >
          <Phone className="mr-2 size-4" />
          {isUpdating ? "Starting…" : isConnected ? "Voice call" : "Connecting call…"}
        </Button>
      ) : (
        <>
          <span role="status" className="mr-auto text-sm text-zinc-300">
            {call.status === "RINGING"
              ? isRecipient ? "Incoming voice call" : "Calling…"
              : isCallConnected ? "Voice call connected" : "Connecting voice call…"}
          </span>
          {call.status === "RINGING" && isRecipient && (
            <>
              <Button type="button" disabled={isUpdating} onClick={() => void updateCall("ACCEPTED")} className="h-9 bg-emerald-700 text-white hover:bg-emerald-600">
                <Phone className="mr-2 size-4" /> Accept
              </Button>
              <Button type="button" disabled={isUpdating} onClick={() => void updateCall("DECLINED")} variant="outline" className="h-9 border-white/15 text-white hover:bg-white/10 hover:text-white">
                Decline
              </Button>
            </>
          )}
          <Button
            type="button"
            disabled={isUpdating}
            onClick={() => void updateCall("ENDED")}
            variant="outline"
            className="h-9 border-red-500/30 text-red-200 hover:bg-red-950/50 hover:text-white"
          >
            <PhoneOff className="mr-2 size-4" />
            {call.status === "RINGING" && !isRecipient ? "Cancel call" : "End call"}
          </Button>
        </>
      )}
      {error && <p role="alert" className="w-full text-xs text-red-300">{error}</p>}
    </section>
  );
}
