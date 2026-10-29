import { z } from "zod";

const utf8Length = (value: string) => new TextEncoder().encode(value).length;

export const LoginSchema = z.object({
  username: z.string().trim().min(1, "Enter your username.").max(32),
  password: z.string().min(1, "Enter your password."),
});

export const RegisterSchema = z.object({
  username: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_.-]{3,32}$/, "Username must be 3–32 characters: letters, numbers, _, . or -."),
  email: z.string().trim().email("Enter a valid email address.").max(254),
  password: z
    .string()
    .refine((value) => utf8Length(value) >= 8, "Password must contain at least 8 UTF-8 bytes.")
    .refine((value) => utf8Length(value) <= 72, "Password cannot exceed 72 UTF-8 bytes."),
  displayName: z.string().trim().max(80).optional(),
  confirmPassword: z.string(),
}).refine((value) => value.password === value.confirmPassword, {
  path: ["confirmPassword"],
  message: "Your passwords do not match.",
});

export const AuthResponseSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  tokenType: z.string().min(1),
  accessTokenExpiresAt: z.string().datetime({ offset: true }),
  user: z.object({
    id: z.string().min(1),
    username: z.string().nullable(),
    email: z.string().email(),
    displayName: z.string().nullable(),
    avatarUrl: z.string().nullable(),
  }),
});

export type LoginFormValues = z.infer<typeof LoginSchema>;
export type RegisterFormValues = z.infer<typeof RegisterSchema>;
