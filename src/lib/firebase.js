import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc, getDoc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export async function calculateAverageEmbedding(embeddings) {
  if (!embeddings || embeddings.length === 0) return null;
  
  const embeddingLength = embeddings[0].length;
  const sumArray = new Array(embeddingLength).fill(0);
  
  embeddings.forEach(embedding => {
    embedding.forEach((value, index) => {
      sumArray[index] += value;
    });
  });
  
  return sumArray.map(sum => sum / embeddings.length);
}

export async function updateUserMainEmbedding(userId) {
  try {
    // First check if user already has a mainEmbedding
    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) return;
    
    const userData = userDoc.data();
    // If mainEmbedding exists, ensure we have new embeddings before updating
    if (userData.mainEmbedding) {
      const embeddingsRef = collection(db, "users", userId, "embeddings");
      const embeddingsSnapshot = await getDocs(embeddingsRef);
      
      if (embeddingsSnapshot.empty) {
        console.warn("No embeddings found, preserving existing mainEmbedding");
        return userData.mainEmbedding;
      }
      
      const embeddings = embeddingsSnapshot.docs.map(doc => doc.data().embedding);
      const averageEmbedding = await calculateAverageEmbedding(embeddings);
      
      if (!averageEmbedding) {
        console.warn("Failed to calculate new embedding, preserving existing mainEmbedding");
        return userData.mainEmbedding;
      }
      
      await updateDoc(userRef, {
        mainEmbedding: averageEmbedding,
        lastEmbeddingUpdate: new Date().toISOString()
      });
      
      return averageEmbedding;
    } else {
      // For first-time initialization
      const embeddingsRef = collection(db, "users", userId, "embeddings");
      const embeddingsSnapshot = await getDocs(embeddingsRef);
      
      if (embeddingsSnapshot.empty) {
        console.log("No embeddings yet for new user");
        return null;
      }
      
      const embeddings = embeddingsSnapshot.docs.map(doc => doc.data().embedding);
      const averageEmbedding = await calculateAverageEmbedding(embeddings);
      
      await updateDoc(userRef, {
        mainEmbedding: averageEmbedding || null,
        lastEmbeddingUpdate: new Date().toISOString()
      });
      
      return averageEmbedding;
    }
  } catch (error) {
    console.error("Error updating main embedding:", error);
    throw error;
  }
}
