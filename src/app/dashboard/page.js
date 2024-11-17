"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, getDocs, query, writeBatch, addDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import LoadingScreen from '@/components/LoadingScreen';

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isClearing, setIsClearing] = useState(false);

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
    if (!session || isClearing) return;

    // Add confirmation dialog
    if (!window.confirm("Are you sure you want to clear your chat history?")) {
      return;
    }

    try {
      setIsClearing(true);
      
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
      
      // Add initial message - updated to match chat page
      const initialMessage = {
        role: "assistant",
        content: "Hi there! 👋 I'm excited to get to know you better! Tell me about your interests, hobbies, and what you're passionate about. I'm here to chat and help connect you with people who share similar vibes. What's on your mind?",
        timestamp: new Date().toISOString()
      };
      
      await addDoc(collection(db, "users", session.user.id, "messages"), initialMessage);
      
      // Redirect to chat page after clearing
      router.push("/chat");
    } catch (error) {
      console.error("Error clearing chat:", error);
      setIsClearing(false);
    }
  };

  if (status === "loading") return <LoadingScreen />;
  if (!session) return null;

  return (
    <div className="h-screen bg-gradient-to-b from-[--chat-background] to-[--message-bg] p-6">
      <div className="max-w-5xl mx-auto h-full">
        <div className="bg-[--message-bg]/80 backdrop-blur-sm rounded-2xl shadow-2xl p-6 border border-white/10 h-full flex flex-col relative">
          {/* Header Section - reduced vertical spacing */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
            <div className="flex items-center space-x-4">
              <div className="relative">
                <img
                  src={session.user.image}
                  alt="Profile"
                  className="w-16 h-16 rounded-full ring-4 ring-[--accent-purple]/30 shadow-xl transform transition-all duration-300 hover:scale-105"
                />
                <div className="absolute -bottom-2 -right-2 w-5 h-5 bg-green-500 rounded-full border-4 border-[--message-bg]"></div>
              </div>
              <div className="text-center md:text-left">
                <h1 className="text-2xl font-bold text-[--foreground] mb-1 bg-gradient-to-r from-[--accent-blue] to-[--accent-purple] bg-clip-text text-transparent">
                  Welcome to VibeGPT
                </h1>
                <p className="text-[--foreground]/80">
                  {session.user.name} • <span className="text-sm">{session.user.email}</span>
                </p>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => router.push('/chat')}
                className="px-4 py-2 bg-[--accent-green] text-[--foreground] rounded-xl
                  hover:bg-[--accent-green]/80 hover:scale-105 active:scale-95 
                  transition-all duration-300 shadow-lg flex items-center justify-center gap-2"
              >
                <svg 
                  className="w-5 h-5" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M10 19l-7-7m0 0l7-7m-7 7h18" 
                  />
                </svg>
                Back to Chat
              </button>
              <button
                onClick={handleClearChat}
                disabled={isClearing}
                className={`px-4 py-2 bg-[--accent-blue] text-[--foreground] rounded-xl
                  transition-all duration-300 shadow-lg
                  ${isClearing ? 'opacity-70 cursor-not-allowed' : 'hover:bg-[--accent-blue]/80 hover:scale-105 active:scale-95'}
                  flex items-center justify-center min-w-[130px]`}
              >
                {isClearing ? (
                  <span className="inline-block animate-pulse">Clearing...</span>
                ) : (
                  'Clear Chat History'
                )}
              </button>
              <button
                onClick={handleSignOut}
                className="px-4 py-2 bg-[--accent-purple] text-[--foreground] rounded-xl
                  hover:bg-[--accent-purple]/80 hover:scale-105 active:scale-95 
                  transition-all duration-300 shadow-lg"
              >
                Sign Out
              </button>
            </div>
          </div>
          
          {/* Status Card - reduced padding */}
          <div className="bg-[--message-bg] rounded-xl p-4 shadow-inner border border-white/5 mb-4">
            <h2 className="text-lg font-semibold text-[--foreground] mb-3 flex items-center">
              <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
              System Status
            </h2>
            <div className="space-y-2">
              <div className="flex items-center space-x-3 text-[--foreground]/80">
                <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <p>Authentication: Active</p>
              </div>
              <div className="flex items-center space-x-3 text-[--foreground]/80">
                <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <p>User ID: {session.user.id}</p>
              </div>
            </div>
          </div>

          {/* YouTube Section - flex-grow to take remaining space */}
          <div className="bg-[--message-bg] rounded-xl p-4 shadow-inner border border-white/5 flex-grow flex flex-col">
            <h2 className="text-lg font-semibold text-[--foreground] mb-3 flex items-center">
              <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
              Quick Tutorial: Advanced AI Features
            </h2>
            <div className="relative rounded-xl overflow-hidden shadow-2xl flex-grow">
              {/* Play button overlay */}
              <div 
                id="video-overlay"
                onClick={() => {
                  const iframe = document.getElementById('training-video');
                  iframe.src = iframe.src.replace('autoplay=0', 'autoplay=1');
                  document.getElementById('video-overlay').style.display = 'none';
                }}
                className="absolute inset-0 flex items-center justify-center z-10"
                style={{
                  background: `
                    linear-gradient(
                      135deg,
                      rgb(16, 24, 39) 0%,
                      rgb(17, 24, 39) 25%,
                      rgb(13, 23, 45) 50%,
                      rgb(15, 23, 42) 75%,
                      rgb(17, 24, 39) 100%
                    ),
                    linear-gradient(
                      45deg,
                      rgba(59, 130, 246, 0.1),
                      rgba(139, 92, 246, 0.1),
                      rgba(16, 185, 129, 0.1)
                    )
                  `,
                  backgroundBlendMode: 'overlay'
                }}
              >
                <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center backdrop-blur-sm hover:scale-110 hover:bg-white/20 transition-all duration-300">
                  <svg 
                    className="w-8 h-8 text-white" 
                    fill="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </div>
              <iframe
                id="training-video"
                width="100%"
                height="100%"
                style={{ minHeight: '300px' }}
                src="https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=0"
                title="Feature Unlock Tutorial"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="rounded-xl"
              ></iframe>
            </div>
            <div className="mt-3 text-[--foreground]/60 text-sm flex items-center">
              <svg className="w-4 h-4 mr-2 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z"/>
              </svg>
              Watch this 2-minute video to understand our advanced AI capabilities
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 