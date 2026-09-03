"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { signupAction, type SignupState } from "./actions";
import { brand } from "@/lib/config/brand";

const initialState: SignupState = {};

export default function SignupPage() {
  const [role, setRole] = useState<"select" | "client" | "expert">("select");
  const [state, formAction, pending] = useActionState(signupAction, initialState);

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
        <h2 className="text-white text-2xl font-semibold leading-tight">
          Two kinds of people build here — which are you?
        </h2>
        <p className="text-[12px]" style={{ color: "#6A6F80" }}>{brand.tagline}</p>
      </div>

      <div className="flex-1 flex items-center justify-center px-8 py-12">
        {role === "select" && (
          <div className="w-full max-w-[420px]">
            <h1 className="text-[22px] font-semibold mb-1" style={{ color: "var(--color-ink)" }}>Create your account</h1>
            <p className="text-[13px] mb-6" style={{ color: "var(--color-ink-soft)" }}>
              Already have one? <Link href="/login" className="font-medium" style={{ color: "var(--color-signal)" }}>Sign in</Link>
            </p>
            <div className="space-y-3">
              <button
                onClick={() => setRole("client")}
                className="w-full flex items-center gap-4 rounded-2xl p-5 text-left"
                style={{ border: "1px solid var(--color-line)", backgroundColor: "var(--color-surface)" }}
              >
                <div className="flex-1">
                  <div className="font-semibold text-[15px]" style={{ color: "var(--color-ink)" }}>I&apos;m hiring a team</div>
                  <div className="text-[12.5px]" style={{ color: "var(--color-ink-soft)" }}>Post a project and assemble specialists</div>
                </div>
              </button>
              <button
                onClick={() => setRole("expert")}
                className="w-full flex items-center gap-4 rounded-2xl p-5 text-left"
                style={{ border: "1px solid var(--color-line)", backgroundColor: "var(--color-surface)" }}
              >
                <div className="flex-1">
                  <div className="font-semibold text-[15px]" style={{ color: "var(--color-ink)" }}>I&apos;m an expert</div>
                  <div className="text-[12.5px]" style={{ color: "var(--color-ink-soft)" }}>Apply for roles across multiple projects</div>
                </div>
              </button>
            </div>
          </div>
        )}

        {role !== "select" && (
          <form action={formAction} className="w-full max-w-[380px]">
            <button type="button" onClick={() => setRole("select")} className="text-[12.5px] mb-4" style={{ color: "var(--color-ink-faint)" }}>
              ← Back
            </button>
            <h1 className="text-[22px] font-semibold mb-1" style={{ color: "var(--color-ink)" }}>
              {role === "client" ? "Set up your client account" : "Set up your expert profile"}
            </h1>
            <p className="text-[13px] mb-6" style={{ color: "var(--color-ink-soft)" }}>
              {role === "client" ? "Post your first project right after this." : "You can add portfolio and rates after this."}
            </p>

            {state.error && (
              <div className="rounded-lg px-3 py-2.5 text-[13px] mb-4" style={{ backgroundColor: "var(--color-red-soft)", color: "var(--color-red)" }}>
                {state.error}
              </div>
            )}

            <input type="hidden" name="userType" value={role} />

            {role === "client" ? (
              <input
                name="companyName"
                placeholder="Company name"
                required
                className="w-full rounded-lg px-3 py-2.5 text-[14px] outline-none mb-3"
                style={{ border: "1px solid var(--color-line)", color: "var(--color-ink)" }}
              />
            ) : (
              <input
                name="fullName"
                placeholder="Full name"
                required
                className="w-full rounded-lg px-3 py-2.5 text-[14px] outline-none mb-3"
                style={{ border: "1px solid var(--color-line)", color: "var(--color-ink)" }}
              />
            )}
            <input
              name="email"
              type="email"
              placeholder="Email"
              required
              className="w-full rounded-lg px-3 py-2.5 text-[14px] outline-none mb-3"
              style={{ border: "1px solid var(--color-line)", color: "var(--color-ink)" }}
            />
            <input
              name="password"
              type="password"
              placeholder="At least 8 characters"
              required
              minLength={8}
              className="w-full rounded-lg px-3 py-2.5 text-[14px] outline-none mb-5"
              style={{ border: "1px solid var(--color-line)", color: "var(--color-ink)" }}
            />

            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-lg py-3 text-[14px] font-medium text-white disabled:opacity-60"
              style={{ backgroundColor: "var(--color-signal)" }}
            >
              {pending ? "Creating account..." : `Create ${role} account`}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
