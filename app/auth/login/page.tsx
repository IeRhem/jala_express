import { Suspense } from "react";
import { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { LoginForm } from "@/components/login/login-form";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

export const metadata: Metadata = {
  title: "Login | Jala Express",
  description: "Login to your Jala Express account",
};

export default async function LoginPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session) {
    redirect("/");
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Card className="bg-foreground p-2">
          <CardContent className="p-0">
            <div className="text-center mt-2 mb-1 px-10">
              <h1 className="text-2xl font-bold text-background">
                Login to your account
              </h1>
              <p className="text-sm text-muted-foreground">
                Enter your credentials below to login to your account
              </p>
            </div>
            <Suspense
              fallback={
                <div className="flex h-48 items-center justify-center">
                  <Spinner className="size-6 text-background" />
                </div>
              }
            >
              <LoginForm />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
