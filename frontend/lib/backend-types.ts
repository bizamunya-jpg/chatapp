export type UserProfile = {
  id: string;
  username: string | null;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export type PublicUserProfile = {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
};

export type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer" | string;
  accessTokenExpiresAt: string;
  user: UserProfile;
};

export type Conversation = {
  id: string;
  title: string | null;
  type: "GROUP" | "DIRECT" | string;
  ownerId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Message = {
  id: string;
  content: string | null;
  clientMessageId: string | null;
  type: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  conversationId: string;
  senderId: string;
};

export type RoomSummary = {
  id: string;
  roomname: string;
  createdAt: string;
};

export type RoomRole = "ADMIN" | "PARTICIPANT";

export type RoomParticipant = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: RoomRole;
};

export type RoomJoinRequest = {
  id: string;
  roomId: string;
  userId: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | string;
  createdAt: string;
  resolvedAt: string | null;
};

export type RoomInvitation = {
  id: string;
  roomId: string;
  inviterId: string;
  inviteeId: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | string;
  createdAt: string;
  resolvedAt: string | null;
};

export type Attachment = {
  id: string;
  messageId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  downloadUrl: string;
};

export type Call = {
  id: string;
  conversationId: string;
  initiatorId: string;
  recipientId: string;
  status: "RINGING" | "ACCEPTED" | "DECLINED" | "ENDED" | string;
  startedAt: string;
  endedAt: string | null;
};

export type CallParticipant = {
  userId: string;
  status: "RINGING" | "ACCEPTED" | "DECLINED" | "LEFT" | string;
};

export type CallSignal = {
  callId: string;
  type: "OFFER" | "ANSWER" | "ICE_CANDIDATE";
  payload: string;
};
