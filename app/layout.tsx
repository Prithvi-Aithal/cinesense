import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import { UserProvider } from "@/components/UserProvider";

export const metadata: Metadata = {
  title: "CineSense",
  description: "A hybrid movie recommender: PostgreSQL for the facts, pgvector for what's similar.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <UserProvider>
          <Nav />
          <main className="mx-auto max-w-6xl px-4 pb-20 pt-6">{children}</main>
          <footer className="border-t border-line py-6 text-center text-xs text-muted">
            CineSense · Next.js + PostgreSQL + pgvector · DBMS project
          </footer>
        </UserProvider>
      </body>
    </html>
  );
}
