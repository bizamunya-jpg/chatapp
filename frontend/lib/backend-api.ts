import {
  authenticatedFetch,
  backendFetch,
  expectBackendJson,
  expectBackendSuccess,
  getAuthenticatedAccessToken,
  getBackendWebSocketUrl,
  refreshBackendSession,
} from "@/lib/api-client";
import {
  clearAuthTokens,
  storeAuthTokens,
} from "@/lib/auth-token";
import {
  AuthResponseSchema,
  LoginSchema,
  RegisterSchema,
} from "@/lib/auth-schemas";
import type {
  Attachment,
  AuthResponse,
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
  authenticated?: boolean;
};

async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers();
  const init: RequestInit = { method: options.method ?? "GET", headers };
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    init.body = JSON.stringify(options.body);
  }

  const fetcher = options.authenticated === false ? backendFetch : authenticatedFetch;
  return expectBackendJson<T>(await fetcher(path, init));
}

async function requestVoid(path: string, options: RequestOptions = {}): Promise<void> {
  const headers = new Headers();
  const init: RequestInit = { method: options.method ?? "GET", headers };
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    init.body = JSON.stringify(options.body);
  }

  const fetcher = options.authenticated === false ? backendFetch : authenticatedFetch;
  await expectBackendSuccess(await fetcher(path, init));
}

function installAuthentication(response: AuthResponse): AuthResponse {
  storeAuthTokens(response);
  return response;
}

export const backendApi = {
  auth: {
    async register(input: {
      username: string;
      email: string;
      password: string;
      displayName?: string;
    }): Promise<AuthResponse> {
      const validatedInput = RegisterSchema.omit({ confirmPassword: true }).parse(input);
      const response = await requestJson<unknown>("/api/v1/auth/register", {
        method: "POST",
        body: validatedInput,
        authenticated: false,
      });
      return installAuthentication(AuthResponseSchema.parse(response));
    },

    async login(input: { username: string; password: string }): Promise<AuthResponse> {
      const validatedInput = LoginSchema.parse(input);
      const response = await requestJson<unknown>("/api/v1/auth/login", {
        method: "POST",
        body: validatedInput,
        authenticated: false,
      });
      return installAuthentication(AuthResponseSchema.parse(response));
    },

    refresh: refreshBackendSession,

    async logout(): Promise<void> {
      try {
        await requestVoid("/api/v1/auth/logout", {
          method: "POST",
          body: { refreshToken: getStoredRefreshToken() },
        });
      } finally {
        clearAuthTokens();
      }
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
      connectHeaders: { Authorization: string };
      reconnectDelay: number;
    }> {
      const token = await getAuthenticatedAccessToken();
      return {
        brokerURL: getBackendWebSocketUrl(),
        connectHeaders: { Authorization: `Bearer ${token}` },
        reconnectDelay: 5000,
      };
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

function getStoredRefreshToken(): string {
  if (typeof window === "undefined") {
    throw new Error("Authentication is only available in the browser.");
  }
  const token = window.sessionStorage.getItem("chatapp.refreshToken");
  if (!token) throw new Error("No refresh token is stored. Please log in first.");
  return token;
}
