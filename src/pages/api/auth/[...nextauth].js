import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { doc, setDoc, getFirestore, update, getDoc } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';
import { updateUserMainEmbedding } from "@/lib/firebase";

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

export default NextAuth({
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
        
        if (userDoc.exists()) {
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
        } else {
          // Only for new users, initialize with null embeddings
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
}); 