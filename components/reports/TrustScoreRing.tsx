"use client";

import { cn } from "@/lib/utils";

interface TrustScoreRingProps {
  score: number | null;
  size?: "sm" | "md" | "lg";
}

function getScoreColor(score: number) {
  if (score >= 70) return { stroke: "#10b981", text: "text-emerald-400" }; // emerald
  if (score >= 40) return { stroke: "#f59e0b", text: "text-amber-400" };  // amber
  return { stroke: "#ef4444", text: "text-red-400" };                      // red
}

const SIZES = {
  sm: { wh: 48, r: 18, sw: 3, fontSize: "text-xs" },
  md: { wh: 72, r: 28, sw: 4, fontSize: "text-sm" },
  lg: { wh: 96, r: 38, sw: 5, fontSize: "text-lg" },
};

export function TrustScoreRing({ score, size = "md" }: TrustScoreRingProps) {
  const { wh, r, sw, fontSize } = SIZES[size];
  const circumference = 2 * Math.PI * r;
  const displayScore = score ?? 0;
  const color = getScoreColor(displayScore);
  const dashOffset = circumference - (displayScore / 100) * circumference;
  const cx = wh / 2;

  return (
    <div className="relative flex items-center justify-center" style={{ width: wh, height: wh }}>
      <svg width={wh} height={wh} className="-rotate-90">
        <circle
          cx={cx} cy={cx} r={r}
          fill="none"
          stroke="hsl(217.2 32.6% 17.5%)"
          strokeWidth={sw}
        />
        <circle
          cx={cx} cy={cx} r={r}
          fill="none"
          stroke={color.stroke}
          strokeWidth={sw}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <div className={cn("absolute inset-0 flex items-center justify-center", fontSize)}>
        <span className={cn("font-bold tabular-nums", color.text)}>
          {score === null ? "–" : displayScore}
        </span>
      </div>
    </div>
  );
}
