"use client";

import { signIn } from "next-auth/react";

export function SignInButton({ className, children }) {
  return (
    <button
      onClick={() => signIn("google", { callbackUrl: "/welcome" })}
      className={className}
    >
      {children || "Sign in"}
    </button>
  );
} 