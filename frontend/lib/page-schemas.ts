import { z } from "zod";

export const CreateRoomSchema = z.object({
  roomname: z.string().trim().min(1, "Enter a room name.").max(100, "Room names must be at most 100 characters."),
});

export const MessageInputSchema = z.object({
  content: z.string().trim().min(1, "Write a message first.").max(4000, "Messages must be at most 4,000 characters."),
});

export const UserSearchSchema = z.object({
  query: z.string().trim().min(2, "Enter at least 2 characters to search.").max(32),
});

export const AttachmentFileSchema = z
  .custom<File>((value) => typeof File !== "undefined" && value instanceof File)
  .refine((file) => file.size > 0 && file.size <= 10 * 1024 * 1024, "Choose a file smaller than 10 MB.")
  .refine(
    (file) =>
      ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf", "text/plain"].includes(file.type),
    "Choose a JPG, PNG, GIF, WebP, PDF, or plain text file.",
  );

export const ProfileImageSchema = z
  .custom<File>((value) => typeof File !== "undefined" && value instanceof File)
  .refine((file) => file.size > 0 && file.size <= 2 * 1024 * 1024, "Profile images must be 2 MB or smaller.")
  .refine(
    (file) => ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(file.type),
    "Choose a JPG, PNG, GIF, or WebP image.",
  );
