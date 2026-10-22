import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter, DM_Sans } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";

const dmSansHeading = DM_Sans({
  subsets: ["latin"],
  variable: "--font-heading",
});

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Jala Express | SafeDrop Taraba",
    template: "%s | Jala Express",
  },
  description:
    "Escrow-backed delivery platform for Taraba State, Nigeria. Safe, verified deliveries with buyer and vendor protection.",
  applicationName: "Jala Express",
  keywords: [
    "Jala Express",
    "SafeDrop",
    "Taraba State",
    "Jalingo Logistics",
    "Escrow Delivery",
    "Verified Deliveries Nigeria",
  ],
  authors: [{ name: "Jala Express" }],
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    title: "Jala Express | SafeDrop Taraba",
    description:
      "Escrow-backed delivery platform for Taraba State, Nigeria. Safe, verified deliveries with buyer and vendor protection.",
    siteName: "Jala Express",
    locale: "en_NG",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn(
        "h-full",
        "antialiased",
        geistSans.variable,
        geistMono.variable,
        "font-sans",
        inter.variable,
        dmSansHeading.variable,
      )}
    >
      <body className="min-h-full flex flex-col">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
