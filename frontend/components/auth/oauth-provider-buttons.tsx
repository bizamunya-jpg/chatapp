"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function OAuthProviderButtons() {
  const [error, setError] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);

  async function startSignIn(provider: "google" | "github") {
    setError("");
    setIsSigningIn(true);
    try {
      const result = await signIn(provider, {
        callbackUrl: "/auth/oauth-complete",
        redirect: false,
      });
      if (result?.error) {
        setError("Provider sign-in is unavailable. Check the OAuth app configuration and try again.");
        setIsSigningIn(false);
        return;
      }
      if (result?.url) window.location.assign(result.url);
    } catch {
      setError("Could not start provider sign-in. Please try again.");
      setIsSigningIn(false);
    }
  }

  return (
    <div className="mt-7 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Button
          type="button"
          variant="outline"
          disabled={isSigningIn}
          onClick={() => void startSignIn("google")}
          className="h-11 border-white/15 bg-black/40 text-white hover:bg-white/10 hover:text-white"
        >
          Continue with Google
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isSigningIn}
          onClick={() => void startSignIn("github")}
          className="h-11 border-white/15 bg-black/40 text-white hover:bg-white/10 hover:text-white"
        >
          Continue with GitHub
        </Button>
      </div>
      {error && (
        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-950/50 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3 py-1 text-[11px] uppercase tracking-[0.18em] text-zinc-600">
        <span className="h-px flex-1 bg-white/10" />
        or use your username
        <span className="h-px flex-1 bg-white/10" />
      </div>
    </div>
  );
}
