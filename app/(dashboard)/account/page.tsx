"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  IconAlertCircle,
  IconCheck,
  IconClock,
  IconDeviceLaptop,
  IconFingerprint,
  IconKey,
  IconLock,
  IconLogout,
  IconMail,
  IconShieldCheck,
  IconUser,
} from "@tabler/icons-react"
import { authClient } from "@/lib/auth-client"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function AccountPage() {
  const router = useRouter()
  const { data: session, isPending } = authClient.useSession()

  // Profile Form state
  const user = session?.user
  const activeSession = session?.session
  const [customName, setCustomName] = React.useState<string | null>(null)
  const name = customName !== null ? customName : (user?.name || "")
  const [profileSaving, setProfileSaving] = React.useState(false)
  const [profileMessage, setProfileMessage] = React.useState<{
    type: "success" | "error"
    text: string
  } | null>(null)

  // Security Form state
  const [currentPassword, setCurrentPassword] = React.useState("")
  const [newPassword, setNewPassword] = React.useState("")
  const [confirmPassword, setConfirmPassword] = React.useState("")
  const [passwordSaving, setPasswordSaving] = React.useState(false)
  const [passwordMessage, setPasswordMessage] = React.useState<{
    type: "success" | "error"
    text: string
  } | null>(null)

  // Sign out state
  const [isLoggingOut, setIsLoggingOut] = React.useState(false)
  const [logoutError, setLogoutError] = React.useState<string | null>(null)

  const initials = React.useMemo(() => {
    const rawName = user?.name || "User"
    const parts = rawName.trim().split(/\s+/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase()
    }
    return rawName.slice(0, 2).toUpperCase()
  }, [user?.name])

  async function handleProfileUpdate(e: React.FormEvent) {
    e.preventDefault()
    setProfileMessage(null)

    if (!name.trim()) {
      setProfileMessage({ type: "error", text: "Name cannot be empty." })
      return
    }

    try {
      setProfileSaving(true)
      const res = await authClient.updateUser({
        name: name.trim(),
      })

      if (res.error) {
        setProfileMessage({
          type: "error",
          text: res.error.message || "Failed to update profile.",
        })
      } else {
        setProfileMessage({
          type: "success",
          text: "Profile updated successfully.",
        })
        router.refresh()
      }
    } catch (err) {
      setProfileMessage({
        type: "error",
        text: err instanceof Error ? err.message : "An error occurred.",
      })
    } finally {
      setProfileSaving(false)
    }
  }

  async function handlePasswordUpdate(e: React.FormEvent) {
    e.preventDefault()
    setPasswordMessage(null)

    if (!currentPassword) {
      setPasswordMessage({
        type: "error",
        text: "Please enter your current password.",
      })
      return
    }

    if (newPassword.length < 8) {
      setPasswordMessage({
        type: "error",
        text: "New password must be at least 8 characters long.",
      })
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordMessage({
        type: "error",
        text: "New passwords do not match.",
      })
      return
    }

    try {
      setPasswordSaving(true)
      const res = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      })

      if (res.error) {
        setPasswordMessage({
          type: "error",
          text: res.error.message || "Failed to change password.",
        })
      } else {
        setPasswordMessage({
          type: "success",
          text: "Password changed successfully.",
        })
        setCurrentPassword("")
        setNewPassword("")
        setConfirmPassword("")
      }
    } catch (err) {
      setPasswordMessage({
        type: "error",
        text: err instanceof Error ? err.message : "An error occurred.",
      })
    } finally {
      setPasswordSaving(false)
    }
  }

  async function handleLogout() {
    setLogoutError(null)
    try {
      setIsLoggingOut(true)
      const res = await authClient.signOut({
        fetchOptions: {
          onSuccess: () => {
            router.push("/auth/login")
            router.refresh()
          },
        },
      })
      if (res?.error) {
        setLogoutError(res.error.message || "Failed to log out. Please try again.")
        return
      }
    } catch (err) {
      console.error("Sign out error", err)
      setLogoutError(
        err instanceof Error ? err.message : "Failed to log out. Please try again."
      )
    } finally {
      setIsLoggingOut(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8 max-w-5xl mx-auto w-full">
      {/* Page Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          Account Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage your personal details, credentials, and active session preferences.
        </p>
      </div>

      {/* Account Overview Card */}
      <Card className="overflow-hidden border-border/60 shadow-sm bg-linear-to-br from-card via-card to-muted/20">
        <CardContent className="p-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <Avatar className="size-16 rounded-2xl border-2 border-border/80 shadow-xs">
                {user?.image && <AvatarImage src={user.image} alt={user.name || "User"} />}
                <AvatarFallback className="rounded-2xl text-lg font-semibold bg-primary/10 text-primary">
                  {isPending ? "..." : initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold tracking-tight">
                    {user?.name || "Jala User"}
                  </h2>
                  <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                    <span className="size-1.5 rounded-full bg-emerald-500 mr-1.5" />
                    Active
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <IconMail className="size-3.5" />
                  <span>{user?.email || "No email available"}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="gap-2 cursor-pointer"
              >
                {isLoggingOut ? (
                  <Spinner className="size-3.5" />
                ) : (
                  <IconLogout className="size-3.5" />
                )}
                <span>{isLoggingOut ? "Logging out..." : "Log Out"}</span>
              </Button>
            </div>
          </div>
          {logoutError && (
            <div
              role="alert"
              className="mt-4 flex items-center gap-2.5 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
            >
              <IconAlertCircle className="size-4 shrink-0" />
              <span>{logoutError}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Settings Tabs */}
      <Tabs defaultValue="profile" className="w-full space-y-6">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="profile" className="gap-2">
            <IconUser className="size-4" />
            <span>Profile</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2">
            <IconKey className="size-4" />
            <span>Security</span>
          </TabsTrigger>
          <TabsTrigger value="session" className="gap-2">
            <IconDeviceLaptop className="size-4" />
            <span>Session</span>
          </TabsTrigger>
        </TabsList>

        {/* PROFILE TAB */}
        <TabsContent value="profile" className="space-y-4">
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-lg">Profile Information</CardTitle>
              <CardDescription>
                Update your display name and view your primary account email.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleProfileUpdate}>
              <CardContent className="space-y-4">
                {profileMessage && (
                  <div
                    className={`flex items-center gap-2.5 rounded-lg p-3 text-sm ${
                      profileMessage.type === "success"
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                        : "bg-destructive/10 text-destructive border border-destructive/20"
                    }`}
                  >
                    {profileMessage.type === "success" ? (
                      <IconCheck className="size-4 shrink-0" />
                    ) : (
                      <IconAlertCircle className="size-4 shrink-0" />
                    )}
                    <span>{profileMessage.text}</span>
                  </div>
                )}

                <Field>
                  <FieldLabel htmlFor="account-name">Full Name</FieldLabel>
                  <div className="relative">
                    <Input
                      id="account-name"
                      type="text"
                      value={name}
                      onChange={(e) => setCustomName(e.target.value)}
                      placeholder="Your full name"
                      className="pl-9"
                    />
                    <IconUser className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                  </div>
                </Field>

                <Field>
                  <FieldLabel htmlFor="account-email">Email Address</FieldLabel>
                  <div className="relative">
                    <Input
                      id="account-email"
                      type="email"
                      value={user?.email || ""}
                      disabled
                      className="pl-9 bg-muted/50 cursor-not-allowed"
                    />
                    <IconMail className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Your email is managed by your account credentials and cannot be edited directly here.
                  </p>
                </Field>

                {user?.id && (
                  <Field>
                    <FieldLabel htmlFor="account-id">Account Identifier</FieldLabel>
                    <div className="relative">
                      <Input
                        id="account-id"
                        type="text"
                        value={user.id}
                        disabled
                        className="pl-9 font-mono text-xs bg-muted/50 cursor-not-allowed"
                      />
                      <IconFingerprint className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                    </div>
                  </Field>
                )}
              </CardContent>
              <CardFooter className="flex justify-end border-t border-border/40 py-3">
                <Button type="submit" disabled={profileSaving} className="gap-2">
                  {profileSaving ? (
                    <>
                      <Spinner className="size-4" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Changes</span>
                  )}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </TabsContent>

        {/* SECURITY TAB */}
        <TabsContent value="security" className="space-y-4">
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-lg">Change Password</CardTitle>
              <CardDescription>
                Ensure your account is using a secure, long password to stay protected.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handlePasswordUpdate}>
              <CardContent className="space-y-4">
                {passwordMessage && (
                  <div
                    className={`flex items-center gap-2.5 rounded-lg p-3 text-sm ${
                      passwordMessage.type === "success"
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                        : "bg-destructive/10 text-destructive border border-destructive/20"
                    }`}
                  >
                    {passwordMessage.type === "success" ? (
                      <IconCheck className="size-4 shrink-0" />
                    ) : (
                      <IconAlertCircle className="size-4 shrink-0" />
                    )}
                    <span>{passwordMessage.text}</span>
                  </div>
                )}

                <Field>
                  <FieldLabel htmlFor="current-password">Current Password</FieldLabel>
                  <div className="relative">
                    <Input
                      id="current-password"
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="••••••••"
                      className="pl-9"
                    />
                    <IconKey className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                  </div>
                </Field>

                <Separator className="my-2" />

                <Field>
                  <FieldLabel htmlFor="new-password">New Password</FieldLabel>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="pl-9"
                    />
                    <IconLock className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Must be at least 8 characters long.
                  </p>
                </Field>

                <Field>
                  <FieldLabel htmlFor="confirm-password">Confirm New Password</FieldLabel>
                  <div className="relative">
                    <Input
                      id="confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="pl-9"
                    />
                    <IconLock className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                  </div>
                </Field>
              </CardContent>
              <CardFooter className="flex justify-end border-t border-border/40 py-3">
                <Button type="submit" disabled={passwordSaving} className="gap-2">
                  {passwordSaving ? (
                    <>
                      <Spinner className="size-4" />
                      <span>Updating...</span>
                    </>
                  ) : (
                    <span>Update Password</span>
                  )}
                </Button>
              </CardFooter>
            </form>
          </Card>

          <Card className="border-border/60 bg-muted/20">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <IconShieldCheck className="size-5 text-primary" />
                <CardTitle className="text-base">Security Recommendation</CardTitle>
              </div>
              <CardDescription>
                Changing your password will automatically sign out all other devices and active sessions for safety.
              </CardDescription>
            </CardHeader>
          </Card>
        </TabsContent>

        {/* SESSION TAB */}
        <TabsContent value="session" className="space-y-4">
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-lg">Active Session</CardTitle>
              <CardDescription>
                Information about your current logged-in browser session.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start justify-between rounded-lg border border-border/60 p-4 bg-muted/10">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-md bg-primary/10 text-primary">
                    <IconDeviceLaptop className="size-5" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">Current Device</span>
                      <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                        This session
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Session Token ID:{" "}
                      <span className="font-mono">
                        {activeSession?.id?.slice(0, 16) || "session-token"}...
                      </span>
                    </p>
                    {activeSession?.expiresAt && (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2">
                        <IconClock className="size-3.5" />
                        <span>
                          Expires:{" "}
                          {new Date(activeSession.expiresAt).toLocaleString()}
                        </span>
                      </p>
                    )}
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="gap-2 cursor-pointer"
                >
                  <IconLogout className="size-3.5" />
                  <span>Sign Out</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
