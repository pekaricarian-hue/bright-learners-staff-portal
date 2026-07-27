import type { Metadata } from "next";
import { Nunito, Patrick_Hand } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin"] });
const patrick = Patrick_Hand({ variable: "--font-hand", weight: "400", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "bright-learners-academy-app.web.app";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";

  return {
    metadataBase: new URL(`${protocol}://${host}`),
    title: "Bright Learners Staff Learning",
    description: "Training, inspections and compliance records for Bright Learners Academy.",
    icons: { icon: "/favicon.svg" },
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
  return <html lang="en"><body className={`${nunito.variable} ${patrick.variable}`}>{children}</body></html>;
}
