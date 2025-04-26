import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import SessionProvider from "./components/SessionProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ドリンクオーダーシステム",
  description: "ドリンクのオーダー管理システム",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
        />
      </head>
      <body className={`${inter.className} min-h-screen bg-gray-50`}>
        <SessionProvider>
          <div className="min-h-screen flex flex-col">{children}</div>
        </SessionProvider>
      </body>
    </html>
  );
}
