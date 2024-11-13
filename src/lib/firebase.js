import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc } from 'firebase/firestore';

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
    // Get all embeddings for the user
    const embeddingsRef = collection(db, "users", userId, "embeddings");
    const embeddingsSnapshot = await getDocs(embeddingsRef);
    
    const embeddings = embeddingsSnapshot.docs.map(doc => doc.data().embedding);
    
    if (embeddings.length === 0) return;
    
    const averageEmbedding = await calculateAverageEmbedding(embeddings);
    
    // Update the user document with the main embedding
    const userRef = doc(db, "users", userId);
    await updateDoc(userRef, {
      mainEmbedding: averageEmbedding,
      lastEmbeddingUpdate: new Date().toISOString()
    });
    
    return averageEmbedding;
  } catch (error) {
    console.error("Error updating main embedding:", error);
    throw error;
  }
}
