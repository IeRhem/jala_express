export type AuthErrorInput = {
  code?: string;
  message?: string;
  status?: number;
} | null | undefined;

/**
 * Maps Better Auth error responses into clear, user-friendly messages.
 * Specifically distinguishes non-existent accounts, credential mismatches,
 * and unverified email statuses.
 */
export function getAuthErrorMessage(error: AuthErrorInput): string {
  if (!error) return "Failed to sign in. Please verify your credentials.";

  const code = error.code?.toUpperCase() || "";
  const message = error.message?.toLowerCase() || "";

  if (code === "USER_NOT_FOUND" || message.includes("user not found")) {
    return "No account exists with this email address. Please check your email or create a new account.";
  }

  if (
    code === "ACCOUNT_NOT_FOUND" ||
    code === "CREDENTIAL_ACCOUNT_NOT_FOUND" ||
    message.includes("credential account not found")
  ) {
    return "No password-based account found for this email. If you registered using another method, please sign in with that.";
  }

  if (
    code === "INVALID_EMAIL_OR_PASSWORD" ||
    error.status === 401 ||
    message.includes("invalid email or password") ||
    message.includes("invalid password")
  ) {
    return "This account does not exist or the password entered is incorrect. Please check your credentials or create an account.";
  }

  if (code === "EMAIL_NOT_VERIFIED" || message.includes("email not verified")) {
    return "Your email address has not been verified yet. Please check your inbox for the verification link.";
  }

  if (code === "INVALID_EMAIL" || message.includes("invalid email")) {
    return "Please enter a valid email address.";
  }

  return error.message || "Failed to sign in. Please verify your credentials and try again.";
}
