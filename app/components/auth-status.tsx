"use client";

import { ReactNode } from "react";

import { useAuthUser } from "@/app/hooks/use-auth-user";

type AuthStatusProps = {
  children: ReactNode;
  when: "authenticated" | "unauthenticated";
};

export function AuthStatus({ children, when }: AuthStatusProps) {
  const { loading, user } = useAuthUser();

  if (loading) {
    return null;
  }

  if (when === "authenticated" && !user) {
    return null;
  }

  if (when === "unauthenticated" && user) {
    return null;
  }

  return <>{children}</>;
}
