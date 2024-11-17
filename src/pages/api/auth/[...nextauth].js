import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { doc, setDoc, getFirestore, update, getDoc, collection, addDoc, getDocs } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';
import { updateUserMainEmbedding, incrementTotalUsers } from "@/lib/firebase";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const INITIAL_BOT_MESSAGE = {
  role: "assistant",
  content: "Hi there! 👋 I'm excited to get to know you better! Tell me about your interests, hobbies, and what you're passionate about. I'm here to chat and help connect you with people who share similar vibes. What's on your mind?",
  timestamp: new Date().toISOString()
};

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async signIn({ user, account, profile }) {
      try {
        // Get existing user doc first
        const userRef = doc(db, "users", profile.sub);
        const userDoc = await getDoc(userRef);
        
        if (!userDoc.exists()) {
          // For new users, increment total users count
          await incrementTotalUsers();
          
          // Create new user document
          await setDoc(userRef, {
            name: user.name,
            email: user.email,
            image: user.image,
            lastSignIn: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            provider: account.provider,
            googleId: profile.sub,
            mainEmbedding: null,
            normalizedEmbedding: null,
            lastEmbeddingUpdate: null
          });
          
          // Then check if they have any messages
          const messagesRef = collection(db, "users", profile.sub, "messages");
          const messagesSnapshot = await getDocs(messagesRef);

          // Only add initial message if they have no messages
          if (messagesSnapshot.empty) {
            await addDoc(messagesRef, INITIAL_BOT_MESSAGE);
          }
        } else {
          // If user exists, only update non-embedding fields
          const updateData = {
            name: user.name,
            email: user.email,
            image: user.image,
            lastSignIn: new Date().toISOString(),
            provider: account.provider,
            googleId: profile.sub,
          };
          
          await setDoc(userRef, updateData, { merge: true });
        }
        
        return true;
      } catch (error) {
        console.error("Error in signIn:", error);
        return true;
      }
    },
    async session({ session, token }) {
      // Ensure the ID is properly passed to the session
      session.user.id = token.sub;
      return session;
    },
    async jwt({ token, account, profile }) {
      // Pass the provider's user ID to the token
      if (account) {
        token.sub = profile.sub;
      }
      return token;
    }
  },
  debug: true, // Enable debug messages
};

export default NextAuth(authOptions); 