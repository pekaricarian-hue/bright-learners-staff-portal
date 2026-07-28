import type { Metadata } from "next";
import { Didact_Gothic, Mulish, Sniglet } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const mulish = Mulish({ variable: "--font-body", subsets: ["latin"] });
const sniglet = Sniglet({ variable: "--font-heading", weight: ["400", "800"], subsets: ["latin"] });
const didact = Didact_Gothic({ variable: "--font-support", weight: "400", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "bright-learners-academy-app.web.app";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";

  return {
    metadataBase: new URL(`${protocol}://${host}`),
    title: "Bright Learners Staff Learning",
    description: "Training, inspections and compliance records for Bright Learners Academy.",
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "any" },
        { url: "/favicon.svg", type: "image/svg+xml" },
      ],
      shortcut: "/favicon.ico",
    },
    openGraph: {
      title: "Bright Learners Staff Learning",
      description: "Training, inspections & compliance — all in one place.",
      images: [{ url: "/og.png", width: 1734, height: 907 }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Bright Learners Staff Learning",
      description: "Training, inspections & compliance — all in one place.",
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${mulish.variable} ${sniglet.variable} ${didact.variable}`}>{children}</body></html>;
}
