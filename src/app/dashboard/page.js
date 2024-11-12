"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
    }
  }, [status, router]);

  const handleSignOut = async () => {
    await signOut({ redirect: false });
    router.push("/");
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[--background]">
        <div className="text-2xl text-[--foreground]">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[--chat-background]">
      <div className="max-w-4xl mx-auto p-8">
        <div className="bg-[--message-bg] rounded-lg shadow-xl p-8">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center space-x-4">
              <img
                src={session.user.image}
                alt="Profile"
                className="w-16 h-16 rounded-full"
              />
              <div>
                <h1 className="text-2xl font-bold text-[--foreground]">
                  Welcome to VibeGPT Dashboard
                </h1>
                <p className="text-[--foreground]">
                  {session.user.name} ({session.user.email})
                </p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="px-4 py-2 bg-[--accent-purple] text-[--foreground] rounded-full hover:bg-[--accent-purple] transition duration-300 shadow-lg"
            >
              Sign Out
            </button>
          </div>
          
          <div className="bg-[--message-bg] rounded-lg p-6 mt-6">
            <h2 className="text-xl font-semibold text-[--foreground] mb-4">
              Authentication Status
            </h2>
            <div className="space-y-2">
              <p className="text-[--foreground]">
                ✓ Successfully authenticated
              </p>
              <p className="text-[--foreground]">
                User ID: {session.user.id}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 