"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { collection, addDoc, query, orderBy, limit, getDocs, deleteDoc, where, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase"; // Ensure this import is correct

async function saveMessageToFirebase(userId, message) {
  try {
    await addDoc(collection(db, "users", userId, "messages"), message);

    // Check if there are more than 60 messages and delete the oldest ones
    const messagesRef = collection(db, "users", userId, "messages");
    const q = query(messagesRef, orderBy("timestamp", "asc"));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.size > 60) {
      const excessMessages = querySnapshot.size - 60;
      const batch = writeBatch(db);
      querySnapshot.docs.slice(0, excessMessages).forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();
    }

    // Check if the number of messages is a multiple of 6
    if (querySnapshot.size % 6 === 0) {
      const lastSixMessages = querySnapshot.docs.slice(-6).map(doc => doc.data());
      const response = await analyzeMessagesWithOpenAI(lastSixMessages);
      if (response) {
        await saveAnalysisToFirebase(userId, response.analysis, lastSixMessages, response.embedding);
      }
    }
  } catch (error) {
    console.error("Error saving message to Firebase:", error);
  }
}

async function analyzeMessagesWithOpenAI(messages) {
  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });

    const data = await response.json();
    if (response.ok) {
      return {
        analysis: data.analysis,
        embedding: data.embedding
      };
    } else {
      throw new Error(data.error || "Failed to analyze messages");
    }
  } catch (error) {
    console.error("Error analyzing messages with OpenAI:", error);
    return null;
  }
}

async function saveAnalysisToFirebase(userId, analysis, analyzedMessages, embedding) {
  try {
    if (analysis) {
      // Create a reference for a new analysis document
      const analysisRef = await addDoc(collection(db, "users", userId, "analysis"), {
        analysis,
        messages: analyzedMessages,
        timestamp: new Date().toISOString(),
      });

      // Store the embedding with the full path reference
      await addDoc(collection(db, "users", userId, "embeddings"), {
        embedding,
        analysisId: analysisRef.id,
        analysisPath: `users/${userId}/analysis/${analysisRef.id}`, // Add full path
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("Error saving analysis to Firebase:", error);
  }
}

async function loadMessagesFromFirebase(userId) {
  const messagesRef = collection(db, "users", userId, "messages");
  const q = query(messagesRef, orderBy("timestamp", "desc"), limit(60));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => doc.data()).reverse();
}

export default function Chat() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const textareaRef = useRef(null);
  const messagesEndRef = useRef(null);

  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
    // Ensure the textarea is focused whenever messages change
    textareaRef.current?.focus();
  }, [messages]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
    }
  }, [status, router]);

  // Add initial focus when component mounts
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    if (session) {
      loadMessagesFromFirebase(session.user.id).then(async (loadedMessages) => {
        if (loadedMessages.length === 0) {
          // Fetch the initial message from OpenAI
          try {
            const response = await fetch("/api/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ messages: [] }),
            });

            const data = await response.json();
            if (response.ok) {
              const initialMessage = { 
                role: "assistant", 
                content: data.message,
                timestamp: new Date().toISOString()
              };
              setMessages([initialMessage]);
              saveMessageToFirebase(session.user.id, initialMessage);
            } else {
              throw new Error(data.error || "Failed to get initial message");
            }
          } catch (error) {
            console.error("Error fetching initial message:", error);
          }
        } else {
          setMessages(loadedMessages);
        }
      });
    }
  }, [session]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || isLoading) return;

    const userMessage = {
      role: "user",
      content: inputMessage,
      timestamp: new Date().toISOString(),
    };

    // Clear input first
    setInputMessage("");
    setMessages((prev) => [...prev, { ...userMessage, isNew: true }]); // Add animation

    // Save user message to Firebase
    if (session) {
      saveMessageToFirebase(session.user.id, userMessage);
    }

    // Reset height and focus immediately
    if (textareaRef.current) {
      textareaRef.current.style.height = "76px";
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage],
        }),
      });

      const data = await response.json();
      if (response.ok) {
        const assistantMessage = {
          role: "assistant",
          content: data.message,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, { ...assistantMessage, isNew: true }]); // Add animation

        // Save assistant message to Firebase
        if (session) {
          saveMessageToFirebase(session.user.id, assistantMessage);
        }
      } else {
        throw new Error(data.error || "Failed to get response");
      }
    } catch (error) {
      console.error("Chat error:", error);
    } finally {
      setIsLoading(false);
      // Focus back on the textarea after response
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const adjustTextareaHeight = (e) => {
    const textarea = e.target;
    
    if (textarea.value.includes('\n')) {
      textarea.style.height = 'inherit';
      const computed = window.getComputedStyle(textarea);
      const height = parseInt(computed.getPropertyValue('border-top-width'), 10)
                     + parseInt(computed.getPropertyValue('padding-top'), 10)
                     + textarea.scrollHeight
                     + parseInt(computed.getPropertyValue('padding-bottom'), 10)
                     + parseInt(computed.getPropertyValue('border-bottom-width'), 10);
      
      textarea.style.height = `${Math.min(height, 200)}px`; // Max height of 200px
    } else {
      textarea.style.height = '76px';
    }
  };

  const handleClearChat = async () => {
    if (!session) return;

    // Show a confirmation dialog
    const confirmed = window.confirm("Are you sure you want to clear the chat? This action cannot be undone.");
    if (!confirmed) return;

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

      // Fetch the initial message from OpenAI
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [] }),
      });

      const data = await response.json();
      if (response.ok) {
        const initialMessage = { 
          role: "assistant", 
          content: data.message,
          timestamp: new Date().toISOString()
        };
        setMessages([initialMessage]);
        saveMessageToFirebase(session.user.id, initialMessage);
      } else {
        throw new Error(data.error || "Failed to get initial message");
      }

    } catch (error) {
      console.error("Error clearing chat:", error);
    }
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

  // Get first name only
  const firstName = session.user.name.split(' ')[0];

  return (
    <div className="flex flex-col h-screen bg-[--chat-background]">
      {/* Full-width Header */}
      <div className="flex justify-between items-center p-4 bg-[--input-bg] border-b border-[--border-color] backdrop-blur-lg">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 rounded-full bg-[--accent-green] animate-pulse"></div>
          <span className="text-lg font-medium bg-gradient-to-r from-[--accent-blue] to-[--accent-purple] text-transparent bg-clip-text">
            Hi, {firstName}
          </span>
        </div>
        <div className="flex space-x-4">
          <button
            onClick={handleClearChat}
            className="px-4 py-2 text-sm text-[--foreground] bg-[--message-bg] hover:bg-[--message-bg]/80 rounded-full transition duration-200 hover-scale"
          >
            Clear Chat
          </button>
          <button
            onClick={() => signOut({ redirect: true, callbackUrl: "/" })}
            className="px-4 py-2 text-sm text-[--foreground] bg-[--message-bg] hover:bg-[--message-bg]/80 rounded-full transition duration-200 hover-scale"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 bg-[--sidebar] border-r border-[--border-color] flex flex-col">
          <div className="p-4 border-b border-[--border-color]">
            <h2 className="text-lg font-semibold bg-gradient-to-r from-[--accent-blue] to-[--accent-purple] text-transparent bg-clip-text">
              Similar Users
            </h2>
          </div>
          <div className="flex-1 p-4 space-y-3 overflow-y-auto">
            {/* Placeholder user items */}
            {[1, 2, 3, 4, 5].map((_, index) => (
              <div
                key={index}
                className="flex items-center space-x-3 p-3 rounded-xl bg-[--message-bg] border border-[--border-color] hover-scale cursor-pointer"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-r from-[--accent-blue] to-[--accent-purple] opacity-50"></div>
                <div className="flex-1">
                  <div className="h-3 w-24 bg-[--border-color] rounded animate-pulse"></div>
                  <div className="h-2 w-16 bg-[--border-color] rounded mt-2 opacity-50 animate-pulse"></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                } ${message.isNew ? "message-animation" : ""}`}
              >
                <div
                  className={`max-w-[80%] p-4 ${
                    message.role === "user"
                      ? "bg-gradient-to-r from-[--accent-blue] to-[--accent-purple] text-white"
                      : "bg-[--bot-message-bg] text-[--foreground] border border-[--border-color]"
                  } rounded-2xl ${
                    message.role === "user"
                      ? "rounded-tr-sm"
                      : "rounded-tl-sm"
                  } shadow-lg hover-scale`}
                >
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">
                    {message.content}
                  </p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Form */}
          <form
            onSubmit={handleSubmit}
            className="p-4 bg-[--chat-background] border-t border-[--border-color]"
          >
            <div className="flex space-x-4 max-w-3xl mx-auto relative">
              <div className="flex-1 relative">
                <textarea
                  ref={textareaRef}
                  value={inputMessage}
                  onChange={(e) => {
                    setInputMessage(e.target.value);
                    adjustTextareaHeight(e);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Send a message... ✨"
                  className="w-full p-4 pr-[60px] rounded-lg bg-[--input-bg] text-[--foreground] placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[--accent-purple]/50 resize-none border border-[--border-color] transition-all duration-200 overflow-y-auto"
                  disabled={isLoading}
                  rows={2}
                  style={{ height: "76px" }}
                />
                <button
                  type="submit"
                  disabled={isLoading}
                  className="absolute right-2 bottom-[14px] w-10 h-10 flex items-center justify-center bg-gradient-to-r from-[--accent-blue] to-[--accent-purple] text-white rounded-lg transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 hover-scale shadow-lg"
                >
                  {isLoading ? (
                    <div className="flex items-center space-x-1">
                      <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce"></span>
                      <span
                        className="w-1.5 h-1.5 bg-white rounded-full animate-bounce"
                        style={{ animationDelay: "0.2s" }}
                      ></span>
                      <span
                        className="w-1.5 h-1.5 bg-white rounded-full animate-bounce"
                        style={{ animationDelay: "0.4s" }}
                      ></span>
                    </div>
                  ) : (
                    <svg
                      className="w-4 h-4 transform rotate-45"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
} 