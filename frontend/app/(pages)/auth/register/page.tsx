"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { OAuthProviderButtons } from "@/components/auth/oauth-provider-buttons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BackendApiError } from "@/lib/api-client";
import { RegisterSchema } from "@/lib/auth-schemas";
import { backendApi } from "@/lib/backend-api";

export default function RegisterPage() {
    const router = useRouter();
    const [username, setUsername] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError("");
        const parsedInput = RegisterSchema.safeParse({
            username,
            displayName,
            email,
            password,
            confirmPassword,
        });
        if (!parsedInput.success) {
            setError(parsedInput.error.issues[0]?.message ?? "Check your registration details.");
            return;
        }

        setIsSubmitting(true);
        try {
            const { username, email, password, displayName } = parsedInput.data;
            await backendApi.auth.register({
                username,
                email,
                password,
                ...(displayName ? { displayName } : {}),
            });
            router.replace("/");
        } catch (submitError) {
            setError(
                submitError instanceof BackendApiError
                    ? submitError.message
                    : submitError instanceof Error
                        ? submitError.message
                        : "We could not create your account. Please try again.",
            );
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#090909] px-4 py-10 text-white">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0">
                <div className="absolute -left-40 top-1/4 h-96 w-96 rounded-full bg-red-700/15 blur-[120px]" />
                <div className="absolute -right-32 bottom-0 h-96 w-96 rounded-full bg-red-950/40 blur-[120px]" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.06),transparent_42%)]" />
            </div>

            <section className="relative grid w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-[#111111]/95 shadow-[0_32px_120px_rgba(0,0,0,0.6)] md:grid-cols-[0.9fr_1.1fr]">
                <aside className="relative hidden min-h-[720px] flex-col justify-between overflow-hidden bg-[#b91c1c] p-10 md:flex">
                    <div aria-hidden="true" className="absolute inset-0 opacity-30">
                        <div className="absolute -right-20 top-24 h-80 w-80 rounded-full border border-white/50" />
                        <div className="absolute -right-6 top-40 h-52 w-52 rounded-full border border-white/40" />
                        <div className="absolute bottom-24 left-[-6rem] h-72 w-72 rounded-full border border-white/30" />
                    </div>
                    <Link href="/" className="relative text-sm font-bold tracking-[0.28em]">
                        CHAT<span className="text-black">APP</span>
                    </Link>
                    <div className="relative max-w-sm">
                        <p className="mb-5 text-xs font-semibold uppercase tracking-[0.3em] text-white/70">
                            Make a room for conversations
                        </p>
                        <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight">
                            Better chats
                            <br />
                            start here.
                        </h1>
                        <p className="mt-6 max-w-xs text-base leading-7 text-white/75">
                            Create your account, find your people, and keep every conversation
                            together.
                        </p>
                    </div>
                    <p className="relative text-xs text-white/60">Your next conversation is waiting.</p>
                </aside>

                <div className="px-6 py-9 sm:px-10 sm:py-12">
                    <div className="mb-8 flex items-center justify-between md:hidden">
                        <Link href="/" className="text-xs font-bold tracking-[0.25em]">
                            CHAT<span className="text-red-500">APP</span>
                        </Link>
                        <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs text-red-300">
                            Join the conversation
                        </span>
                    </div>

                    <div className="mx-auto max-w-md">
                        <p className="mb-3 hidden text-xs font-semibold uppercase tracking-[0.25em] text-red-400 md:block">
                            Get started
                        </p>
                        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                            Create your account
                        </h2>
                        <p className="mt-3 text-sm leading-6 text-zinc-400">
                            A few details and you’re ready to chat.
                        </p>

                        <OAuthProviderButtons />

                        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
                            <div className="space-y-2">
                                <Label htmlFor="displayName" className="text-zinc-200">Display name <span className="text-zinc-500">(optional)</span></Label>
                                <Input
                                    id="displayName"
                                    name="displayName"
                                    autoComplete="name"
                                    maxLength={80}
                                    value={displayName}
                                    onChange={(event) => setDisplayName(event.target.value)}
                                    placeholder="How should we call you?"
                                    className="h-12 rounded-xl border-white/10 bg-black/50 px-4 text-white placeholder:text-zinc-600 focus-visible:border-red-500 focus-visible:ring-red-500/30"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="username" className="text-zinc-200">Username</Label>
                                <Input
                                    id="username"
                                    name="username"
                                    autoComplete="username"
                                    autoCapitalize="none"
                                    minLength={3}
                                    maxLength={32}
                                    required
                                    value={username}
                                    onChange={(event) => setUsername(event.target.value)}
                                    placeholder="your_username"
                                    className="h-12 rounded-xl border-white/10 bg-black/50 px-4 text-white placeholder:text-zinc-600 focus-visible:border-red-500 focus-visible:ring-red-500/30"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="email" className="text-zinc-200">Email address</Label>
                                <Input
                                    id="email"
                                    name="email"
                                    type="email"
                                    autoComplete="email"
                                    maxLength={254}
                                    required
                                    value={email}
                                    onChange={(event) => setEmail(event.target.value)}
                                    placeholder="you@example.com"
                                    className="h-12 rounded-xl border-white/10 bg-black/50 px-4 text-white placeholder:text-zinc-600 focus-visible:border-red-500 focus-visible:ring-red-500/30"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="password" className="text-zinc-200">Password</Label>
                                <Input
                                    id="password"
                                    name="password"
                                    type="password"
                                    autoComplete="new-password"
                                    minLength={8}
                                    maxLength={72}
                                    required
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    placeholder="At least 8 characters"
                                    className="h-12 rounded-xl border-white/10 bg-black/50 px-4 text-white placeholder:text-zinc-600 focus-visible:border-red-500 focus-visible:ring-red-500/30"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="confirmPassword" className="text-zinc-200">Confirm password</Label>
                                <Input
                                    id="confirmPassword"
                                    name="confirmPassword"
                                    type="password"
                                    autoComplete="new-password"
                                    required
                                    value={confirmPassword}
                                    onChange={(event) => setConfirmPassword(event.target.value)}
                                    placeholder="Enter your password again"
                                    className="h-12 rounded-xl border-white/10 bg-black/50 px-4 text-white placeholder:text-zinc-600 focus-visible:border-red-500 focus-visible:ring-red-500/30"
                                />
                            </div>

                            {error && (
                                <p role="alert" className="rounded-xl border border-red-500/30 bg-red-950/50 px-4 py-3 text-sm text-red-200">
                                    {error}
                                </p>
                            )}

                            <Button
                                type="submit"
                                disabled={isSubmitting}
                                className="h-12 w-full rounded-xl bg-red-600 text-sm font-semibold text-white shadow-lg shadow-red-950/40 hover:bg-red-500"
                            >
                                {isSubmitting ? "Creating your account…" : "Create account"}
                            </Button>
                        </form>

                        <p className="mt-7 text-center text-sm text-zinc-400">
                            Already have an account?{" "}
                            <Link href="/auth/login" className="font-semibold text-red-400 underline-offset-4 hover:text-red-300 hover:underline">
                                Log in
                            </Link>
                        </p>
                        <p className="mt-7 text-center text-xs leading-5 text-zinc-600">
                            By creating an account, you agree to use ChatApp respectfully.
                        </p>
                    </div>
                </div>
            </section>
        </main>
    );
}
