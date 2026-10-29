"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";

import { AuthResponseSchema } from "@/lib/auth-schemas";
import { storeAuthTokens } from "@/lib/auth-token";

export default function OAuthCompletePage() {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    async function exchangeProviderSession() {
      try {
        const response = await fetch("/api/auth/backend-session", {
          method: "POST",
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        const body: unknown = await response.json();
        if (!response.ok) {
          const errorMessage =
            typeof body === "object" &&
            body !== null &&
            "error" in body &&
            typeof body.error === "string"
              ? body.error
              : "Could not complete provider sign-in.";
          throw new Error(errorMessage);
        }

        const parsedResponse = AuthResponseSchema.safeParse(body);
        if (!parsedResponse.success) {
          throw new Error("The backend returned an invalid sign-in response.");
        }
        await signOut({ redirect: false });
        storeAuthTokens(parsedResponse.data);
        router.replace("/");
      } catch (exchangeError) {
        setError(
          exchangeError instanceof Error
            ? exchangeError.message
            : "Could not complete provider sign-in.",
        );
      }
    }

    void exchangeProviderSession();
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#090909] px-4 text-white">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-[#111111] p-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-400">
          ChatApp
        </p>
        <h1 className="mt-4 text-2xl font-semibold">
          {error ? "Sign-in could not be completed" : "Finishing sign-in…"}
        </h1>
        {error ? (
          <>
            <p role="alert" className="mt-4 text-sm leading-6 text-red-200">
              {error}
            </p>
            <Link
              href="/auth/login"
              className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-500"
            >
              Return to login
            </Link>
          </>
        ) : (
          <p className="mt-3 text-sm text-zinc-400">
            Connecting your provider account to ChatApp.
          </p>
        )}
      </section>
    </main>
  );
}
