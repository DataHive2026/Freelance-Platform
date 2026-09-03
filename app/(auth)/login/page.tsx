"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction, type LoginState } from "./actions";
import { brand } from "@/lib/config/brand";

const initialState: LoginState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: "var(--color-paper)" }}>
      <div
        className="hidden md:flex flex-col justify-between px-12 py-10 w-[420px] flex-shrink-0"
        style={{ backgroundColor: "var(--color-ink)" }}
      >
        <div className="flex items-center gap-2">
          <div className="rounded-md flex items-center justify-center w-[26px] h-[26px] bg-white">
            <div className="rounded-full w-2 h-2" style={{ backgroundColor: "var(--color-signal)" }} />
          </div>
          <span className="font-semibold text-white text-[15px]">{brand.name}</span>
        </div>
        <h2 className="text-white text-2xl font-semibold leading-tight">Welcome back.</h2>
        <p className="text-[12px]" style={{ color: "#6A6F80" }}>{brand.tagline}</p>
      </div>

      <div className="flex-1 flex items-center justify-center px-8 py-12">
        <form action={formAction} className="w-full max-w-[360px]">
          <h1 className="text-[22px] font-semibold mb-1" style={{ color: "var(--color-ink)" }}>Sign in</h1>
          <p className="text-[13px] mb-6" style={{ color: "var(--color-ink-soft)" }}>
            New here? <Link href="/signup" className="font-medium" style={{ color: "var(--color-signal)" }}>Create an account</Link>
          </p>

          {state.error && (
            <div className="rounded-lg px-3 py-2.5 text-[13px] mb-4" style={{ backgroundColor: "var(--color-red-soft)", color: "var(--color-red)" }}>
              {state.error}
            </div>
          )}

          <label className="block mb-3">
            <input
              name="email"
              type="email"
              placeholder="you@company.com"
              required
              className="w-full rounded-lg px-3 py-2.5 text-[14px] outline-none"
              style={{ border: "1px solid var(--color-line)", color: "var(--color-ink)" }}
            />
          </label>
          <label className="block mb-5">
            <input
              name="password"
              type="password"
              placeholder="••••••••"
              required
              className="w-full rounded-lg px-3 py-2.5 text-[14px] outline-none"
              style={{ border: "1px solid var(--color-line)", color: "var(--color-ink)" }}
            />
          </label>

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg py-3 text-[14px] font-medium text-white disabled:opacity-60"
            style={{ backgroundColor: "var(--color-signal)" }}
          >
            {pending ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
