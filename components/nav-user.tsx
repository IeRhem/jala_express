"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  IconDotsVertical,
  IconUserCircle,
  IconLogout,
} from "@tabler/icons-react"
import { authClient } from "@/lib/auth-client"

export function NavUser({
  user: fallbackUser,
}: {
  user?: {
    name?: string
    email?: string
    avatar?: string
  }
} = {}) {
  const router = useRouter()
  const { isMobile } = useSidebar()
  const { data: session, isPending } = authClient.useSession()
  const [isLoggingOut, setIsLoggingOut] = React.useState(false)

  const currentUser = {
    name: session?.user?.name || fallbackUser?.name || "User",
    email: session?.user?.email || fallbackUser?.email || "",
    avatar: session?.user?.image || fallbackUser?.avatar || "",
  }

  const initials = React.useMemo(() => {
    const name = currentUser.name?.trim()
    if (!name) return "U"
    const parts = name.split(/\s+/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase()
    }
    return name.slice(0, 2).toUpperCase()
  }, [currentUser.name])

  async function handleLogout() {
    try {
      setIsLoggingOut(true)
      await authClient.signOut({
        fetchOptions: {
          onSuccess: () => {
            router.push("/auth/login")
            router.refresh()
          },
        },
      })
    } catch (err) {
      console.error("Logout error", err)
      router.push("/auth/login")
    } finally {
      setIsLoggingOut(false)
    }
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton size="lg" className="aria-expanded:bg-muted" />
            }
          >
            <Avatar className="size-8 rounded-lg grayscale">
              {currentUser.avatar && (
                <AvatarImage src={currentUser.avatar} alt={currentUser.name} />
              )}
              <AvatarFallback className="rounded-lg font-medium text-xs">
                {isPending && !session?.user ? "..." : initials}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{currentUser.name}</span>
              <span className="truncate text-xs text-foreground/70">
                {currentUser.email}
              </span>
            </div>
            <IconDotsVertical className="ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar className="size-8">
                    {currentUser.avatar && (
                      <AvatarImage src={currentUser.avatar} alt={currentUser.name} />
                    )}
                    <AvatarFallback className="rounded-lg font-medium text-xs">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{currentUser.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {currentUser.email}
                    </span>
                  </div>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                render={<Link href="/account" />}
                className="cursor-pointer"
              >
                <IconUserCircle className="size-4" />
                <span>Account</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleLogout}
              disabled={isLoggingOut}
              variant="destructive"
              className="cursor-pointer"
            >
              <IconLogout className="size-4" />
              <span>{isLoggingOut ? "Logging out..." : "Log out"}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
