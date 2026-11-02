import type { Client } from "@stomp/stompjs";

import {
  authenticatedFetch,
  expectBackendJson,
  expectBackendSuccess,
  requestRealtimeTicket,
  sessionRequest,
} from "@/lib/api-client";
import {
  LoginSchema,
  RegisterSchema,
} from "@/lib/auth-schemas";
import type {
  Attachment,
  Call,
  CallParticipant,
  Conversation,
  Message,
  PublicUserProfile,
  RoomInvitation,
  RoomJoinRequest,
  RoomParticipant,
  RoomRole,
  RoomSummary,
  UserProfile,
} from "@/lib/backend-types";

type RequestOptions = {
  method?: string;
  body?: unknown;
};

async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers();
  const init: RequestInit = { method: options.method ?? "GET", headers };
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    init.body = JSON.stringify(options.body);
  }

  return expectBackendJson<T>(await authenticatedFetch(path, init));
}

async function requestVoid(path: string, options: RequestOptions = {}): Promise<void> {
  const headers = new Headers();
  const init: RequestInit = { method: options.method ?? "GET", headers };
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    init.body = JSON.stringify(options.body);
  }

  await expectBackendSuccess(await authenticatedFetch(path, init));
}

export const backendApi = {
  auth: {
    async register(input: {
      username: string;
      email: string;
      password: string;
      displayName?: string;
    }): Promise<void> {
      const validatedInput = RegisterSchema.omit({ confirmPassword: true }).parse(input);
      await expectBackendSuccess(await sessionRequest("/api/session/register", validatedInput));
    },

    async login(input: { username: string; password: string }): Promise<void> {
      const validatedInput = LoginSchema.parse(input);
      await expectBackendSuccess(await sessionRequest("/api/session/login", validatedInput));
    },

    async logout(): Promise<void> {
      await expectBackendSuccess(await sessionRequest("/api/session/logout"));
    },
  },

  users: {
    me(): Promise<UserProfile> {
      return requestJson("/api/v1/users/me");
    },

    uploadAvatar(file: File): Promise<UserProfile> {
      const formData = new FormData();
      formData.append("file", file);
      return authenticatedFetch("/api/v1/users/me/avatar", {
        method: "POST",
        body: formData,
      }).then(expectBackendJson<UserProfile>);
    },

    removeAvatar(): Promise<void> {
      return requestVoid("/api/v1/users/me/avatar", { method: "DELETE" });
    },

    async getAvatar(avatarUrl: string): Promise<Blob> {
      const response = await authenticatedFetch(avatarUrl);
      await expectBackendSuccess(response);
      return response.blob();
    },

    updateMe(displayName: string): Promise<UserProfile> {
      return requestJson("/api/v1/users/me", {
        method: "PATCH",
        body: { displayName },
      });
    },

    search(query: string): Promise<PublicUserProfile[]> {
      const params = new URLSearchParams({ query });
      return requestJson(`/api/v1/users?${params.toString()}`);
    },
  },

  conversations: {
    list(): Promise<Conversation[]> {
      return requestJson("/api/v1/conversations");
    },

    listParticipants(conversationId: string): Promise<RoomParticipant[]> {
      return requestJson(
        `/api/v1/conversations/${encodeURIComponent(conversationId)}/participants`,
      );
    },

    createDirect(userId: string): Promise<Conversation> {
      return requestJson("/api/v1/conversations/direct", {
        method: "POST",
        body: { userId },
      });
    },

    addParticipant(conversationId: string, userId: string): Promise<void> {
      return requestVoid(
        `/api/v1/conversations/${encodeURIComponent(conversationId)}/participants`,
        { method: "POST", body: { userId } },
      );
    },

    listMessages(
      conversationId: string,
      options: { page?: number; size?: number } = {},
    ): Promise<Message[]> {
      const params = new URLSearchParams();
      if (options.page !== undefined) params.set("page", String(options.page));
      if (options.size !== undefined) params.set("size", String(options.size));
      const query = params.size ? `?${params.toString()}` : "";
      return requestJson(
        `/api/v1/conversations/${encodeURIComponent(conversationId)}/messages${query}`,
      );
    },

    sendMessage(
      conversationId: string,
      input: { content: string; clientMessageId?: string },
    ): Promise<Message> {
      return requestJson(
        `/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`,
        { method: "POST", body: input },
      );
    },

    editMessage(
      conversationId: string,
      messageId: string,
      content: string,
    ): Promise<Message> {
      return requestJson(
        `/api/v1/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`,
        { method: "PATCH", body: { content } },
      );
    },

    deleteMessage(conversationId: string, messageId: string): Promise<void> {
      return requestVoid(
        `/api/v1/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`,
        { method: "DELETE" },
      );
    },

    markRead(conversationId: string, messageId: string): Promise<void> {
      return requestVoid(
        `/api/v1/conversations/${encodeURIComponent(conversationId)}/read`,
        { method: "PATCH", body: { messageId } },
      );
    },
  },

  rooms: {
    create(roomname: string): Promise<Conversation> {
      return requestJson("/api/v1/room", {
        method: "POST",
        body: { roomname },
      });
    },

    list(): Promise<RoomSummary[]> {
      return requestJson("/api/v1/rooms");
    },

    delete(roomId: string): Promise<void> {
      return requestVoid(`/api/v1/room/${encodeURIComponent(roomId)}`, {
        method: "DELETE",
      });
    },

    listParticipants(roomId: string): Promise<RoomParticipant[]> {
      return requestJson(
        `/api/v1/room/${encodeURIComponent(roomId)}/participants`,
      );
    },

    updateRole(roomId: string, userId: string, role: RoomRole): Promise<RoomParticipant> {
      return requestJson(
        `/api/v1/room/${encodeURIComponent(roomId)}/participants/${encodeURIComponent(userId)}/role`,
        { method: "PATCH", body: { role } },
      );
    },

    requestToJoin(roomId: string): Promise<RoomJoinRequest> {
      return requestJson(
        `/api/v1/rooms/${encodeURIComponent(roomId)}/join-requests`,
        { method: "POST" },
      );
    },

    getMyJoinRequest(roomId: string): Promise<RoomJoinRequest> {
      return requestJson(
        `/api/v1/rooms/${encodeURIComponent(roomId)}/join-request`,
      );
    },

    listJoinRequests(roomId: string): Promise<RoomJoinRequest[]> {
      return requestJson(
        `/api/v1/room/${encodeURIComponent(roomId)}/join-requests`,
      );
    },

    decideJoinRequest(
      roomId: string,
      requestId: string,
      approved: boolean,
    ): Promise<RoomJoinRequest> {
      return requestJson(
        `/api/v1/room/${encodeURIComponent(roomId)}/join-requests/${encodeURIComponent(requestId)}`,
        { method: "PATCH", body: { approved } },
      );
    },

    invite(roomId: string, userId: string): Promise<RoomInvitation> {
      return requestJson(
        `/api/v1/room/${encodeURIComponent(roomId)}/invitations`,
        { method: "POST", body: { userId } },
      );
    },

    listMyInvitations(): Promise<RoomInvitation[]> {
      return requestJson("/api/v1/room/invitations");
    },

    decideInvitation(
      invitationId: string,
      accepted: boolean,
    ): Promise<RoomInvitation> {
      return requestJson(
        `/api/v1/room/invitations/${encodeURIComponent(invitationId)}`,
        { method: "PATCH", body: { accepted } },
      );
    },
  },

  attachments: {
    getForMessage(conversationId: string, messageId: string): Promise<Attachment> {
      return requestJson(
        `/api/v1/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/attachment`,
      );
    },

    async upload(conversationId: string, file: File): Promise<Attachment> {
      const formData = new FormData();
      formData.append("file", file);
      return expectBackendJson<Attachment>(
        await authenticatedFetch(
          `/api/v1/conversations/${encodeURIComponent(conversationId)}/attachments`,
          { method: "POST", body: formData },
        ),
      );
    },

    async download(attachmentId: string): Promise<Blob> {
      const response = await authenticatedFetch(
        `/api/v1/attachments/${encodeURIComponent(attachmentId)}`,
      );
      await expectBackendSuccess(response);
      return response.blob();
    },
  },

  calls: {
    listIncoming(): Promise<Call[]> {
      return requestJson("/api/v1/calls/incoming");
    },

    list(conversationId: string): Promise<Call[]> {
      return requestJson(
        `/api/v1/conversations/${encodeURIComponent(conversationId)}/calls`,
      );
    },

    start(conversationId: string): Promise<Call> {
      return requestJson(
        `/api/v1/conversations/${encodeURIComponent(conversationId)}/calls`,
        { method: "POST" },
      );
    },

    listParticipants(conversationId: string, callId: string): Promise<CallParticipant[]> {
      return requestJson(
        `/api/v1/conversations/${encodeURIComponent(conversationId)}/calls/${encodeURIComponent(callId)}/participants`,
      );
    },

    update(
      conversationId: string,
      callId: string,
      status: "ACCEPTED" | "DECLINED" | "ENDED",
    ): Promise<Call> {
      return requestJson(
        `/api/v1/conversations/${encodeURIComponent(conversationId)}/calls/${encodeURIComponent(callId)}`,
        { method: "PATCH", body: { status } },
      );
    },
  },

  realtime: {
    async connectionOptions(): Promise<{
      brokerURL: string;
      beforeConnect: (client: Client) => Promise<void>;
      reconnectDelay: number;
    }> {
      const { brokerURL, ticket } = await requestRealtimeTicket();
      let unusedTicket: string | null = ticket;
      return {
        brokerURL,
        // Tickets are single-use, so each reconnect needs a new one.
        beforeConnect: async (client) => {
          let nextTicket = unusedTicket;
          unusedTicket = null;
          if (!nextTicket) {
            nextTicket = await requestRealtimeTicket()
              .then((response) => response.ticket)
              .catch(() => null);
          }
          // Without a ticket the broker rejects this attempt and the client retries.
          client.connectHeaders = nextTicket ? { "ws-ticket": nextTicket } : {};
        },
        reconnectDelay: 5000,
      };
    },

    async iceServers(): Promise<RTCIceServer[]> {
      try {
        const response = await sessionRequest("/api/session/ice-servers");
        return (await expectBackendJson<{ iceServers: RTCIceServer[] }>(response)).iceServers;
      } catch {
        // Many calls connect without a relay, so a failed lookup should not stop the call.
        return [{ urls: "stun:stun.l.google.com:19302" }];
      }
    },

    roomMessagesDestination(conversationId: string): string {
      return `/topic/room/${conversationId}`;
    },

    callEventsDestination(conversationId: string): string {
      return `/topic/call-events/${conversationId}`;
    },

    callSignalDestination(conversationId: string): string {
      return `/app/call/${conversationId}`;
    },

    callSignalTopic(callId: string): string {
      return `/topic/call/${callId}`;
    },
  },
};
