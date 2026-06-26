"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import { useEffect, useState } from "react";

import { auth } from "@/lib/firebase";

type AuthUserState = {
  loading: boolean;
  user: User | null;
};

export function useAuthUser(): AuthUserState {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);

      if (nextUser) {
        nextUser
          .getIdToken()
          .then((token) => {
            console.log("Firebase ID token for Postman:", token);
          })
          .catch((error) => {
            console.error("Failed to get Firebase ID token:", error);
          });
      }
    });

    return unsubscribe;
  }, []);

  return { loading, user };
}
