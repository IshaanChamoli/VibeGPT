"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { collection, addDoc, query, orderBy, limit, getDocs, deleteDoc, where, writeBatch, getDoc, doc, setDoc, onSnapshot } from "firebase/firestore";
import { db, updateUserMainEmbedding, calculateCosineSimilarity } from "@/lib/firebase"; // Ensure this import is correct
import LoadingScreen from '@/components/LoadingScreen';

const sigmoidAmplify = (similarity) => {
  if (similarity === null) return null;
  // Center around 0.5 with increased steepness of 10 for scaled values
  const centered = (similarity - 0.5) * 10;
  return 1 / (1 + Math.exp(-centered));
};

async function checkAndInitializeUser(userId) {
  try {
    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      await setDoc(userRef, {
        createdAt: new Date().toISOString(),
        lastEmbeddingUpdate: new Date().toISOString()
      });
      return;
    }

    const userData = userDoc.data();
    if (!userData.mainEmbedding) {
      await updateUserMainEmbedding(userId);
    }
  } catch (error) {
    console.error("Error checking/initializing user:", error);
  }
}

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
        analysisPath: `users/${userId}/analysis/${analysisRef.id}`,
        timestamp: new Date().toISOString(),
      });

      // Update the user's main embedding
      await updateUserMainEmbedding(userId);
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
  const [users, setUsers] = useState([]);
  const [prevUsers, setPrevUsers] = useState([]);

  // Separate loading states
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isChatLoading, setIsChatLoading] = useState(false);

  const [clickedUserId, setClickedUserId] = useState(null);

  // Add this state to track if we've loaded users
  const [hasLoadedUsers, setHasLoadedUsers] = useState(false);

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
    const initializeChat = async () => {
      if (!session) return;

      try {
        // First, ensure user is properly initialized
        await checkAndInitializeUser(session.user.id);
        
        // Then load messages
        const loadedMessages = await loadMessagesFromFirebase(session.user.id);
        
        if (loadedMessages.length === 0) {
          setIsChatLoading(true);
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
              await saveMessageToFirebase(session.user.id, initialMessage);
            } else {
              throw new Error(data.error || "Failed to get initial message");
            }
          } catch (error) {
            console.error("Error fetching initial message:", error);
          } finally {
            setIsChatLoading(false);
          }
        } else {
          setMessages(loadedMessages);
        }
      } catch (error) {
        console.error("Error initializing chat:", error);
      } finally {
        setIsInitialLoading(false);
      }
    };

    initializeChat();
  }, [session]);

  const loadUsers = async () => {
    if (!session || hasLoadedUsers) return;
    
    try {
      const usersRef = collection(db, "users");
      
      // Listen to current user's document for embedding updates
      const unsubscribeCurrentUser = onSnapshot(doc(db, "users", session.user.id), (currentUserDoc) => {
        const currentUserData = currentUserDoc.data();
        const myMainEmbedding = currentUserData?.mainEmbedding;
        const myNormalizedEmbedding = currentUserData?.normalizedEmbedding;
        
        // Listen to all users' documents for their embedding updates
        const unsubscribeUsers = onSnapshot(usersRef, (usersSnapshot) => {
          const loadedUsers = usersSnapshot.docs
            .filter(doc => doc.id !== session.user.id)
            .map(doc => {
              const userData = doc.data();
              
              // Calculate similarities
              const mainSimilarity = myMainEmbedding && userData.mainEmbedding
                ? calculateCosineSimilarity(myMainEmbedding, userData.mainEmbedding)
                : null;
              
              const normalizedSimilarity = myNormalizedEmbedding && userData.normalizedEmbedding
                ? calculateCosineSimilarity(myNormalizedEmbedding, userData.normalizedEmbedding)
                : null;
              
              const scaledSimilarity = normalizedSimilarity !== null
                ? Math.max(0, (normalizedSimilarity - 0.5) * 2)
                : null;
              
              const amplifiedSimilarity = scaledSimilarity !== null
                ? sigmoidAmplify(scaledSimilarity)
                : null;
              
              return {
                id: doc.id,
                name: userData.name,
                email: userData.email,
                image: userData.image,
                mainSimilarity: mainSimilarity !== null ? -mainSimilarity : null, // Negate for descending order
                normalizedSimilarity: normalizedSimilarity !== null ? -normalizedSimilarity : null, // Negate for descending order
                scaledSimilarity: scaledSimilarity !== null ? -scaledSimilarity : null, // Negate for descending order
                amplifiedSimilarity: amplifiedSimilarity !== null ? -amplifiedSimilarity : null // Negate for descending order
              };
            })
            .sort((a, b) => {
              if (a.amplifiedSimilarity === null && b.amplifiedSimilarity === null) return 0;
              if (a.amplifiedSimilarity === null) return 1;
              if (b.amplifiedSimilarity === null) return -1;
              return a.amplifiedSimilarity - b.amplifiedSimilarity; // Already negated, so smaller is better
            })
            .slice(0, 5)
            .map(user => ({
              ...user,
              // Un-negate the values for display
              mainSimilarity: user.mainSimilarity !== null ? -user.mainSimilarity : null,
              normalizedSimilarity: user.normalizedSimilarity !== null ? -user.normalizedSimilarity : null,
              scaledSimilarity: user.scaledSimilarity !== null ? -user.scaledSimilarity : null,
              amplifiedSimilarity: user.amplifiedSimilarity !== null ? -user.amplifiedSimilarity : null
            }));
          
          setUsers(loadedUsers);
          if (loadedUsers.length > 0) {
            setHasLoadedUsers(true);
          }
        });

        return () => {
          unsubscribeUsers();
        };
      });

      return () => {
        unsubscribeCurrentUser();
      };
    } catch (error) {
      console.error("Error loading users:", error);
    }
  };

  useEffect(() => {
    let unsubscribe;
    
    if (session && !hasLoadedUsers) {
      loadUsers().then(unsubscribeFn => {
        unsubscribe = unsubscribeFn;
      });
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [session, hasLoadedUsers]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || isChatLoading) return;

    const userMessage = {
      role: "user",
      content: inputMessage,
      timestamp: new Date().toISOString(),
    };

    setInputMessage("");
    setMessages((prev) => [...prev, { ...userMessage, isNew: true }]);

    if (session) {
      saveMessageToFirebase(session.user.id, userMessage);
    }

    if (textareaRef.current) {
      textareaRef.current.style.height = "76px";
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    }

    setIsChatLoading(true);

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
        setMessages((prev) => [...prev, { ...assistantMessage, isNew: true }]);

        if (session) {
          saveMessageToFirebase(session.user.id, assistantMessage);
        }
      } else {
        throw new Error(data.error || "Failed to get response");
      }
    } catch (error) {
      console.error("Chat error:", error);
    } finally {
      setIsChatLoading(false);
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

    const confirmed = window.confirm("Are you sure you want to clear the chat? This action cannot be undone.");
    if (!confirmed) return;

    try {
      // Get user document first
      const userRef = doc(db, "users", session.user.id);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        console.error("User document not found");
        return;
      }

      const userData = userDoc.data();
      
      // Only proceed with chat clearing if we have user data
      const messagesQuery = query(
        collection(db, "users", session.user.id, "messages")
      );

      const querySnapshot = await getDocs(messagesQuery);
      const batch = writeBatch(db);

      querySnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });

      await batch.commit();

      // Get initial message
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
        await saveMessageToFirebase(session.user.id, initialMessage);
      }
    } catch (error) {
      console.error("Error clearing chat:", error);
    }
  };

  const handleUserClick = (userId) => {
    setClickedUserId(userId);
    // Remove the click effect after animation completes
    setTimeout(() => setClickedUserId(null), 800);
  };

  if (status === "loading" || isInitialLoading) {
    return <LoadingScreen />;
  }

  if (!session) {
    return null;
  }

  return (
    <div className="flex flex-col h-screen bg-[--chat-background]">
      {/* Full-width Header */}
      <div className="flex justify-between items-center p-4 bg-[--input-bg] border-b border-[--border-color] backdrop-blur-lg">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 rounded-full bg-[--accent-green] animate-pulse"></div>
          <span className="text-lg font-medium bg-gradient-to-r from-[--accent-blue] to-[--accent-purple] text-transparent bg-clip-text">
            Hi, {session.user.email}
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
          <div className="flex-1 p-4 space-y-3 overflow-y-auto overflow-x-hidden scrollbar-none"
               style={{ msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
            {/* Add this CSS rule to hide the scrollbar */}
            <style jsx global>{`
              .scrollbar-none::-webkit-scrollbar {
                display: none;
              }
            `}</style>
            {users.length === 0 ? (
              // Show 5 placeholder cards when no users exist
              Array(5).fill(null).map((_, index) => (
                <div
                  key={index}
                  className="flex items-center space-x-3 p-3 rounded-xl bg-[--message-bg] border border-[--border-color] opacity-40"
                >
                  <div className="w-8 h-8 rounded-full bg-[--border-color] flex items-center justify-center">
                    <span className="text-[--foreground] opacity-50"> </span>
                  </div>
                  <div className="flex-1">
                    <div className="h-4 w-24 bg-[--border-color] rounded mb-1"></div>
                    <div className="h-3 w-32 bg-[--border-color] rounded opacity-50"></div>
                  </div>
                </div>
              ))
            ) : (
              // Show actual users + placeholders to fill up to 5 slots
              [...users, ...Array(Math.max(0, 5 - users.length)).fill(null)].map((user, index) => (
                <div
                  key={user?.id || `placeholder-${index}`}
                  className="relative group"
                >
                  <div
                    onClick={() => user && handleUserClick(user.id)}
                    className={`flex flex-col p-3 rounded-xl bg-[--message-bg] border border-[--border-color] transition-all duration-300 ${
                      user ? 'hover-scale cursor-pointer group-hover:shadow-xl' : 'opacity-40'
                    }`}
                  >
                    {user ? (
                      <>
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-[--accent-blue] to-[--accent-purple] flex items-center justify-center text-white font-medium overflow-hidden">
                            {user.image ? (
                              <>
                                <img
                                  src={user.image.replace('=s96-c', '=s192-c')}
                                  alt={user.name || 'User'}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                  referrerPolicy="no-referrer"
                                  onError={(e) => {
                                    console.log('Image failed to load:', user.image);
                                    e.target.style.display = 'none';
                                    const fallbackDiv = e.target.parentElement.querySelector('.fallback-initial');
                                    if (fallbackDiv) {
                                      fallbackDiv.style.display = 'flex';
                                    }
                                  }}
                                  onLoad={(e) => {
                                    console.log('Image loaded successfully:', user.image);
                                    e.target.style.display = 'block';
                                    const fallbackDiv = e.target.parentElement.querySelector('.fallback-initial');
                                    if (fallbackDiv) {
                                      fallbackDiv.style.display = 'none';
                                    }
                                  }}
                                  style={{ display: 'block' }}
                                />
                                <div 
                                  className="fallback-initial w-full h-full items-center justify-center"
                                  style={{ 
                                    display: 'none',
                                    position: 'absolute',
                                    inset: 0,
                                    backgroundColor: 'transparent'
                                  }}
                                >
                                  {user.name ? user.name[0].toUpperCase() : '?'}
                                </div>
                              </>
                            ) : (
                              <div className="fallback-initial w-full h-full flex items-center justify-center">
                                {user.name ? user.name[0].toUpperCase() : '?'}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 overflow-hidden">
                            <div className="text-sm font-medium text-[--foreground] truncate">
                              {user.name || 'Anonymous'}
                            </div>
                            <div className="text-xs text-[--foreground] opacity-50 truncate">
                              {user.email || 'No email'}
                            </div>
                          </div>
                        </div>

                        <div className="mt-2">
                          <div className="flex items-center">
                            <div className="flex-1 h-1 rounded-full bg-[--border-color] overflow-hidden">
                              <div
                                className="h-full rounded-full transform-gpu bg-gradient-to-r from-[--accent-pink] to-[--accent-purple]"
                                style={{ 
                                  width: `${Math.round(user.amplifiedSimilarity * 100)}%`,
                                  transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
                                }}
                              ></div>
                            </div>
                            <span className="ml-2 text-xs text-[--foreground] opacity-75">
                              {Math.round(user.amplifiedSimilarity * 100)}%
                            </span>
                          </div>
                        </div>

                        <div className="overflow-hidden transition-all duration-300 max-h-0 group-hover:max-h-48 mt-2 space-y-3 opacity-0 group-hover:opacity-100">
                          <div className="text-xs font-medium text-[--foreground] pt-2 border-t border-[--border-color]">
                            <div className="flex justify-between">
                              <span>Detailed Metrics</span>
                              <span className="text-[0.7em]">(Cosine Similarity)</span>
                            </div>
                          </div>
                          
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="text-[--foreground] opacity-75">Raw Embeddings</span>
                              <span className="text-[--foreground]">
                                {user.mainSimilarity >= 0 ? '+' : '-'}{Math.abs(user.mainSimilarity * 100).toFixed(1)}%
                              </span>
                            </div>
                            <div className="h-1 rounded-full bg-[--border-color] overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-[--accent-blue] to-[--accent-purple]"
                                style={{ 
                                  width: `${Math.abs(Math.round(user.mainSimilarity * 100))}%`,
                                  marginLeft: user.mainSimilarity < 0 ? 'auto' : '0'
                                }}
                              ></div>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="text-[--foreground] opacity-75">Norm Embeddings</span>
                              <span className="text-[--foreground]">
                                {user.normalizedSimilarity >= 0 ? '+' : '-'}{Math.abs(user.normalizedSimilarity * 100).toFixed(1)}%
                              </span>
                            </div>
                            <div className="h-1 rounded-full bg-[--border-color] overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-[--accent-green] to-[--accent-blue]"
                                style={{ 
                                  width: `${Math.abs(Math.round(user.normalizedSimilarity * 100))}%`,
                                  marginLeft: user.normalizedSimilarity < 0 ? 'auto' : '0'
                                }}
                              ></div>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="text-[--foreground] opacity-75">Scaled</span>
                              <span className="text-[--foreground]">{(user.scaledSimilarity * 100).toFixed(1)}%</span>
                            </div>
                            <div className="h-1 rounded-full bg-[--border-color] overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-[--accent-blue] to-[--accent-green]"
                                style={{ 
                                  width: `${Math.round(user.scaledSimilarity * 100)}%`
                                }}
                              ></div>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="text-[--foreground] opacity-75">Sigmoid Amplified</span>
                              <span className="text-[--foreground]">{(user.amplifiedSimilarity * 100).toFixed(1)}%</span>
                            </div>
                            <div className="h-1 rounded-full bg-[--border-color] overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-[--accent-pink] to-[--accent-purple]"
                                style={{ 
                                  width: `${Math.round(user.amplifiedSimilarity * 100)}%`
                                }}
                              ></div>
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-8 h-8 rounded-full bg-[--border-color] flex items-center justify-center">
                          <span className="text-[--foreground] opacity-50"> </span>
                        </div>
                        <div className="flex-1">
                          <div className="h-4 w-24 bg-[--border-color] rounded mb-1"></div>
                          <div className="h-3 w-32 bg-[--border-color] rounded opacity-50"></div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
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
                  disabled={isChatLoading}
                  rows={2}
                  style={{ height: "76px" }}
                />
                <button
                  type="submit"
                  disabled={isChatLoading}
                  className="absolute right-2 bottom-[14px] w-10 h-10 flex items-center justify-center bg-gradient-to-r from-[--accent-blue] to-[--accent-purple] text-white rounded-lg transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 hover-scale shadow-lg"
                >
                  {isChatLoading ? (
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