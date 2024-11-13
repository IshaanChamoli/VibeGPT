import { db } from "@/lib/firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
import { updateUserMainEmbedding } from "@/lib/firebase";

export async function POST(req) {
  try {
    // Get all users
    const usersRef = collection(db, "users");
    const usersSnapshot = await getDocs(usersRef);
    
    const updates = [];
    
    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      
      // If user doesn't have a mainEmbedding, update it
      if (!userData.mainEmbedding) {
        updates.push(updateUserMainEmbedding(userDoc.id));
      }
    }
    
    await Promise.all(updates);
    
    return Response.json({ 
      success: true, 
      message: `Updated ${updates.length} users` 
    });
    
  } catch (error) {
    console.error("Error initializing embeddings:", error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
} 