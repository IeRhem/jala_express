import type { Metadata } from "next";
import AccountSettings from "./account-settings";

export const metadata: Metadata = {
  title: "Account Settings",
  description:
    "Manage your personal profile, credentials, and active sessions on Jala Express.",
};

export default function AccountPage() {
  return <AccountSettings />;
}
