import { betterAuth, APIError } from "better-auth";
import { Pool } from "pg";
import { db } from "@/prisma/db";

export const auth = betterAuth({
  database: new Pool({
    connectionString: process.env.DATABASE_URL,
  }),
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  emailAndPassword: {
    enabled: true,
    // Lock down public sign-ups in production once your pilot admin accounts are created
    disableSignUp: process.env.DISABLE_PUBLIC_SIGNUP === "true",
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          // Enforce PRD Section 5.2: Only active Staff (Admin/Ops) can log into the dashboard
          if (process.env.ENFORCE_STAFF_ONLY === "true") {
            const staff = await db.orm.public.Staff.where({
              userId: session.userId,
              active: true,
            }).first();
            if (!staff) {
              throw new APIError("FORBIDDEN", {
                message: "Access restricted to authorized SafeDrop Staff only.",
              });
            }
          }
          return { data: session };
        },
      },
    },
  },
});
