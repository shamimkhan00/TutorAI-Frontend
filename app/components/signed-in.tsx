"use client";

import { ReactNode } from "react";

import { AuthStatus } from "@/app/components/auth-status";

type Props = {
  children: ReactNode;
};

export const SignedIn = ({ children }: Props) => {
  return <AuthStatus when="authenticated">{children}</AuthStatus>;
};
