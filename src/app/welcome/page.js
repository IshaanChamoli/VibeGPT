"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db, updateUserMainEmbedding } from "@/lib/firebase";
import LoadingScreen from '@/components/LoadingScreen';

async function checkAndInitializeUser(userId) {
  try {
    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      if (!userData.mainEmbedding) {
        await updateUserMainEmbedding(userId);
      }
    }
  } catch (error) {
    console.error("Error checking/initializing user:", error);
  }
}

export default function Welcome() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
    }
  }, [status, router]);

  useEffect(() => {
    if (session) {
      checkAndInitializeUser(session.user.id);
    }
  }, [session]);

  if (status === "loading") {
    return <LoadingScreen />;
  }

  if (!session) {
    return null;
  }

  const firstName = session.user.name.split(' ')[0];

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#0D0D0E] px-6">
      <div className="max-w-2xl w-full space-y-12 text-center">
        <div className="space-y-4">
          <h1 className="text-4xl font-bold text-white">
            Welcome, {firstName}! 👋
          </h1>
          <p className="text-xl text-[#8E8EA0]">
            Let's get to know each other
          </p>
        </div>

        <div className="bg-[#151515] p-8 rounded-xl border border-[#262626] space-y-6">
          <p className="text-lg text-[#8E8EA0] leading-relaxed">
            As you chat with VibeGPT, it gets to know you on a deeper level—helping you discover 
            people who truly match your vibe!
          </p>
          
          <div className="pt-4">
            <button
              onClick={() => router.push('/chat')}
              className="group relative overflow-hidden bg-gradient-to-r from-[#4F46E5] via-[#6366F1] to-[#818CF8] text-white font-semibold py-4 px-12 rounded-lg text-xl transition-all duration-300 
              hover:shadow-[0_0_40px_rgba(99,102,241,0.4)] 
              hover:scale-[1.03] 
              shadow-[0_0_20px_rgba(99,102,241,0.2)]
              active:scale-[0.98]"
            >
              <span className="relative z-10">Enter Chat</span>
              <div className="absolute inset-0 bg-gradient-to-r from-[#818CF8] via-[#6366F1] to-[#4F46E5] opacity-0 transition-opacity duration-500 group-hover:opacity-100"></div>
              <div className="absolute inset-0 bg-white/[0.02] opacity-0 transition-opacity duration-500 group-hover:opacity-100"></div>
            </button>
          </div>
        </div>
      </div>
    </main>
  );
} 