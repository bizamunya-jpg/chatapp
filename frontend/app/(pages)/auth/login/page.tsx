"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OAuthProviderButtons } from "@/components/auth/oauth-provider-buttons";
import { BackendApiError } from "@/lib/api-client";
import { LoginSchema } from "@/lib/auth-schemas";
import { backendApi } from "@/lib/backend-api";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const parsedInput = LoginSchema.safeParse({ username, password });
    if (!parsedInput.success) {
      setError(parsedInput.error.issues[0]?.message ?? "Enter your username and password.");
      return;
    }
    setIsSubmitting(true);

    try {
      await backendApi.auth.login(parsedInput.data);
      router.replace("/");
    } catch (submitError) {
      setError(
        submitError instanceof BackendApiError
          ? submitError.message
          : submitError instanceof Error
            ? submitError.message
            : "We could not log you in. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#090909] px-4 py-10 text-white">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -right-40 top-10 h-96 w-96 rounded-full bg-red-700/20 blur-[120px]" />
        <div className="absolute -left-40 bottom-0 h-96 w-96 rounded-full bg-red-950/50 blur-[120px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.06),transparent_42%)]" />
      </div>

      <section className="relative grid w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-[#111111]/95 shadow-[0_32px_120px_rgba(0,0,0,0.6)] md:grid-cols-[1.1fr_0.9fr]">
        <div className="px-6 py-10 sm:px-10 sm:py-14 md:py-16">
          <div className="mx-auto max-w-md">
            <div className="mb-10 flex items-center justify-between">
              <Link href="/" className="text-xs font-bold tracking-[0.25em]">
                CHAT<span className="text-red-500">APP</span>
              </Link>
              <Link href="/auth/register" className="text-sm text-zinc-400 transition hover:text-white">
                Create account
              </Link>
            </div>

            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-red-400">
              Welcome back
            </p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Log in to ChatApp
            </h1>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              Pick up right where your conversations left off.
            </p>

            <OAuthProviderButtons />

            <form className="mt-9 space-y-5" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="username" className="text-zinc-200">Username</Label>
                <Input
                  id="username"
                  name="username"
                  autoComplete="username"
                  autoCapitalize="none"
                  required
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="your_username"
                  className="h-12 rounded-xl border-white/10 bg-black/50 px-4 text-white placeholder:text-zinc-600 focus-visible:border-red-500 focus-visible:ring-red-500/30"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-zinc-200">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
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
                {isSubmitting ? "Logging in…" : "Log in"}
              </Button>
            </form>

            <p className="mt-7 text-center text-sm text-zinc-400">
              New to ChatApp?{" "}
              <Link href="/auth/register" className="font-semibold text-red-400 underline-offset-4 hover:text-red-300 hover:underline">
                Create an account
              </Link>
            </p>
          </div>
        </div>

        <aside className="relative hidden min-h-[620px] flex-col justify-between overflow-hidden bg-[#b91c1c] p-10 md:flex">
          <div aria-hidden="true" className="absolute inset-0 opacity-30">
            <div className="absolute -left-24 top-20 h-80 w-80 rounded-full border border-white/50" />
            <div className="absolute left-5 top-36 h-52 w-52 rounded-full border border-white/40" />
            <div className="absolute -bottom-24 right-[-5rem] h-72 w-72 rounded-full border border-white/30" />
          </div>
          <p className="relative text-sm font-bold tracking-[0.28em]">
            CHAT<span className="text-black">APP</span>
          </p>
          <div className="relative max-w-sm">
            <p className="mb-5 text-xs font-semibold uppercase tracking-[0.3em] text-white/70">
              One place for your people
            </p>
            <h2 className="text-5xl font-semibold leading-[1.05] tracking-tight">
              Good to
              <br />
              have you
              <br />
              back.
            </h2>
            <p className="mt-6 max-w-xs text-base leading-7 text-white/75">
              Your rooms, messages, and people are just a sign-in away.
            </p>
          </div>
          <p className="relative text-xs text-white/60">Connect. Catch up. Carry on.</p>
        </aside>
      </section>
    </main>
  );
}
