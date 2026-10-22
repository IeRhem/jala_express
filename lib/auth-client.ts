import { createAuthClient } from "better-auth/react";
import { getAuthErrorMessage, type AuthErrorInput } from "./auth-errors";

export const authClient = createAuthClient();

export { getAuthErrorMessage, type AuthErrorInput };

export interface SignInCredentials {
  email: string;
  password: string;
  callbackURL?: string;
  rememberMe?: boolean;
}

export interface SignInResult {
  data: unknown | null;
  error: string | null;
}

/**
 * Signs in a user with email and password, returning formatted errors
 * and handling callback redirection.
 */
export async function signInWithEmail({
  email,
  password,
  callbackURL = "/",
  rememberMe = true,
}: SignInCredentials): Promise<SignInResult> {
  try {
    const res = await authClient.signIn.email({
      email,
      password,
      callbackURL,
      rememberMe,
    });

    if (res.error) {
      return {
        data: null,
        error: getAuthErrorMessage(res.error),
      };
    }

    return {
      data: res.data,
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error:
        err instanceof Error
          ? err.message
          : "An unexpected error occurred. Please try again.",
    };
  }
}
