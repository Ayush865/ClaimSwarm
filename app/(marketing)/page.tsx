import Link from "next/link";
import { SignedIn, SignedOut } from "@clerk/nextjs";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Nav */}
      <nav className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
            <span className="text-primary text-sm font-bold">CS</span>
          </div>
          <span className="font-semibold text-lg">ClaimSwarm</span>
        </div>
        <div className="flex items-center gap-4">
          <SignedOut>
            <Link
              href="/sign-in"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="text-sm bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors"
            >
              Get started
            </Link>
          </SignedOut>
          <SignedIn>
            <Link
              href="/dashboard"
              className="text-sm bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors"
            >
              Dashboard →
            </Link>
          </SignedIn>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">

        {/* Swarm dot grid */}
        <div className="mb-8 grid grid-cols-10 gap-1.5">
          {Array.from({ length: 40 }).map((_, i) => (
            <div
              key={i}
              className="w-4 h-4 rounded-sm"
              style={{
                backgroundColor:
                  i % 7 === 0 ? "hsl(0 72% 51% / 0.75)"
                  : i % 5 === 0 ? "hsl(48 96% 53% / 0.75)"
                  : i % 3 === 0 ? "hsl(160 84% 39% / 0.75)"
                  : "hsl(215 20.2% 22% / 0.6)",
              }}
            />
          ))}
        </div>

        {/* Badge */}
        <div className="flex items-center justify-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-1.5 mb-6 w-fit">
          <div className="w-2 h-2 shrink-0 rounded-full bg-primary animate-pulse" />
          <span className="text-xs text-primary font-medium">
            Multi-agent · Web search · ~$0.03 per batch
          </span>
        </div>

        <h1 className="text-5xl font-bold mb-5 leading-tight max-w-2xl">
          Every resume claim.
          <br />
          <span className="text-primary">Verified in parallel.</span>
        </h1>

        <p className="text-lg text-muted-foreground mb-10 max-w-xl">
          AI-fabricated resumes pass screeners. ClaimSwarm fans out one agent per
          claim — verified via web search, flagged with evidence, never auto-rejected.
        </p>

        <div className="flex items-center gap-4">
          <SignedOut>
            <Link
              href="/sign-up"
              className="bg-primary text-primary-foreground px-6 py-3 rounded-lg font-semibold hover:bg-primary/90 transition-colors text-base"
            >
              Start verifying free →
            </Link>
            <Link
              href="/sign-in"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign in
            </Link>
          </SignedOut>
          <SignedIn>
            <Link
              href="/dashboard"
              className="bg-primary text-primary-foreground px-6 py-3 rounded-lg font-semibold hover:bg-primary/90 transition-colors text-base"
            >
              Go to Dashboard →
            </Link>
          </SignedIn>
        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-4 text-center text-xs text-muted-foreground">
        ClaimSwarm · Flags for humans · Never auto-rejects
      </footer>
    </div>
  );
}
