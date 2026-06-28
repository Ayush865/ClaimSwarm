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
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center max-w-4xl mx-auto">
        {/* Swarm visualization dots */}
        <div className="mb-10 relative w-64 h-32 flex items-center justify-center">
          <div className="absolute inset-0 grid grid-cols-8 gap-1.5 p-2">
            {Array.from({ length: 48 }).map((_, i) => (
              <div
                key={i}
                className="w-full aspect-square rounded-sm"
                style={{
                  backgroundColor:
                    i % 7 === 0
                      ? "hsl(0 72% 51% / 0.8)"
                      : i % 5 === 0
                      ? "hsl(48 96% 53% / 0.8)"
                      : i % 3 === 0
                      ? "hsl(160 84% 39% / 0.8)"
                      : "hsl(215 20.2% 25% / 0.5)",
                  animationDelay: `${i * 0.05}s`,
                }}
              />
            ))}
          </div>
        </div>

        <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-1.5 mb-6">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-xs text-primary font-medium">
            Powered by llama-3.1-8b-instant · ~$0.05 per batch
          </span>
        </div>

        <h1 className="text-5xl font-bold mb-6 leading-tight">
          Every resume claim.
          <br />
          <span className="text-primary">Verified in parallel.</span>
        </h1>

        <p className="text-xl text-muted-foreground mb-4 max-w-2xl">
          AI-fabricated resumes pass screeners. ClaimSwarm fans out one cheap
          agent per atomic claim — hundreds in parallel — to verify, refute, or
          flag every statement with evidence.
        </p>

        <p className="text-sm text-muted-foreground/70 mb-10">
          PUBLIC claims verified via web search · INTERNAL claims checked for
          timeline conflicts · Full Trust Report with clickable evidence
        </p>

        <div className="flex items-center gap-4">
          <SignedOut>
            <Link
              href="/sign-up"
              className="bg-primary text-primary-foreground px-6 py-3 rounded-lg font-semibold hover:bg-primary/90 transition-colors text-lg"
            >
              Start verifying free →
            </Link>
            <Link
              href="/sign-in"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Already have an account
            </Link>
          </SignedOut>
          <SignedIn>
            <Link
              href="/dashboard"
              className="bg-primary text-primary-foreground px-6 py-3 rounded-lg font-semibold hover:bg-primary/90 transition-colors text-lg"
            >
              Go to Dashboard →
            </Link>
          </SignedIn>
        </div>

        {/* Stats */}
        <div className="mt-20 grid grid-cols-3 gap-8 border-t border-border pt-10 w-full max-w-lg">
          <div className="text-center">
            <div className="text-3xl font-bold text-primary">400+</div>
            <div className="text-sm text-muted-foreground mt-1">
              Claims per batch
            </div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-primary">$0.03</div>
            <div className="text-sm text-muted-foreground mt-1">
              Avg batch cost
            </div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-primary">&lt;2min</div>
            <div className="text-sm text-muted-foreground mt-1">
              Full batch runtime
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-4 text-center text-xs text-muted-foreground">
        ClaimSwarm · Flags for humans · Never auto-rejects ·{" "}
        <span className="text-primary">llama-3.1-8b-instant</span> on Groq
      </footer>
    </div>
  );
}
