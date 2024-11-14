"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { collection, deleteDoc, getDocs, query, where, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase"; // Ensure this import is correct
import LoadingScreen from '@/components/LoadingScreen';

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

  const handleClearChat = async () => {
    if (!session) return;

    try {
      // Query to get all messages for the current user
      const messagesQuery = query(
        collection(db, "users", session.user.id, "messages")
      );

      const querySnapshot = await getDocs(messagesQuery);
      const batch = writeBatch(db);

      querySnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      console.log("Chat cleared from Firebase");

      // Update the UI to reflect the cleared chat
      // This could involve setting the messages state to an empty array
      // setMessages([]);
    } catch (error) {
      console.error("Error clearing chat:", error);
    }
  };

  const initializeAllEmbeddings = async () => {
    try {
      const response = await fetch('/api/initialize-embeddings', {
        method: 'POST',
      });
      const data = await response.json();
      if (data.success) {
        console.log("Successfully initialized embeddings:", data.message);
      } else {
        console.error("Error initializing embeddings:", data.error);
      }
    } catch (error) {
      console.error("Error calling initialization endpoint:", error);
    }
  };

  if (status === "loading") {
    return <LoadingScreen />;
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
            <div className="flex space-x-4">
              <button
                onClick={handleClearChat}
                className="px-4 py-2 bg-[--accent-blue] text-[--foreground] rounded-full hover:bg-[--accent-blue] transition duration-300 shadow-lg"
              >
                Clear Chat
              </button>
              <button
                onClick={handleSignOut}
                className="px-4 py-2 bg-[--accent-purple] text-[--foreground] rounded-full hover:bg-[--accent-purple] transition duration-300 shadow-lg"
              >
                Sign Out
              </button>
              <button
                onClick={initializeAllEmbeddings}
                className="px-4 py-2 bg-[--accent-green] text-[--foreground] rounded-full hover:bg-[--accent-green] transition duration-300 shadow-lg"
              >
                Initialize All Embeddings
              </button>
            </div>
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