"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"
import {
  IconAlertCircle,
  IconEye,
  IconEyeOff,
  IconLock,
  IconMail,
  IconX,
} from "@tabler/icons-react"
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { signInWithEmail } from "@/lib/auth-client"
import { loginSchema, type LoginFormValues } from "@/lib/schema/login"

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<typeof Card>) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [showPassword, setShowPassword] = React.useState(false)

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
      rememberMe: false,
    },
  })

  const { isSubmitting } = form.formState
  const rootError = form.formState.errors.root?.message

  // Automatically dismiss the root error after 5 seconds
  React.useEffect(() => {
    if (!rootError) return

    const timer = setTimeout(() => {
      form.clearErrors("root")
    }, 5000)

    return () => clearTimeout(timer)
  }, [rootError, form])

  async function onSubmit(data: LoginFormValues) {
    form.clearErrors("root")

    const callbackUrl =
      searchParams.get("callbackURL") ||
      searchParams.get("callbackUrl") ||
      searchParams.get("redirect") ||
      "/"

    const result = await signInWithEmail({
      email: data.email,
      password: data.password,
      callbackURL: callbackUrl,
      rememberMe: data.rememberMe,
    })

    if (result.error) {
      form.setError("root", {
        message: result.error,
      })
      return
    }

    if (
      !result.data ||
      typeof result.data !== "object" ||
      !("url" in result.data) ||
      !result.data.url
    ) {
      router.push(callbackUrl)
      router.refresh()
    }
  }

  return (
    <Card className={cn("w-full max-w-sm", className)} {...props}>
      <CardContent>
        <form id="login-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {rootError && (
            <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-1">
              <IconAlertCircle className="size-4" />
              <AlertDescription className="leading-snug">{rootError}</AlertDescription>
              <AlertAction>
                <button
                  type="button"
                  onClick={() => form.clearErrors("root")}
                  aria-label="Dismiss error"
                  className="shrink-0 text-destructive/70 hover:text-destructive transition-colors cursor-pointer"
                >
                  <IconX className="size-4" />
                </button>
              </AlertAction>
            </Alert>
          )}

          <FieldGroup>
            <Controller
              name="email"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Email Address</FieldLabel>
                  <div className="relative">
                    <Input
                      {...field}
                      id={field.name}
                      type="email"
                      placeholder="name@example.com"
                      autoComplete="email"
                      disabled={isSubmitting}
                      aria-invalid={fieldState.invalid}
                      className="pl-9"
                    />
                    <IconMail className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                  </div>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            <Controller
              name="password"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <div className="flex items-center">
                    <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                    <a
                      href="#"
                      tabIndex={-1}
                      className="ml-auto inline-block text-xs text-muted-foreground underline-offset-4 hover:underline"
                    >
                      Forgot password?
                    </a>
                  </div>
                  <div className="relative">
                    <Input
                      {...field}
                      id={field.name}
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      disabled={isSubmitting}
                      aria-invalid={fieldState.invalid}
                      className="pl-9 pr-9"
                    />
                    <IconLock className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      {showPassword ? (
                        <IconEyeOff className="size-4" />
                      ) : (
                        <IconEye className="size-4" />
                      )}
                    </button>
                  </div>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            <Controller
              name="rememberMe"
              control={form.control}
              render={({ field }) => (
                <div className="flex items-center gap-2 pt-0.5">
                  <Checkbox
                    id="remember-me"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={isSubmitting}
                  />
                  <label
                    htmlFor="remember-me"
                    className="text-xs font-medium text-muted-foreground select-none cursor-pointer hover:text-foreground transition-colors"
                  >
                    Remember me
                  </label>
                </div>
              )}
            />
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter className="flex flex-col gap-3">
        <Button
          type="submit"
          form="login-form"
          className="w-full font-medium"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <Spinner className="size-4" />
              <span>Verifying credentials...</span>
            </span>
          ) : (
            "Sign In"
          )}
        </Button>
      </CardFooter>
    </Card>
  )
}
