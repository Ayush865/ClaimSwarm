interface MatrixProps {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
}

interface Cell {
  value: number;
  label: string;
  sublabel: string;
  bg: string;
  text: string;
}

export function ConfusionMatrix({ tp, fp, fn, tn }: MatrixProps) {
  const total = tp + fp + fn + tn;

  const cells: Cell[][] = [
    [
      {
        value: tp,
        label: "True Positive",
        sublabel: "Caught fabrication",
        bg: "bg-emerald-500/15 border-emerald-500/30",
        text: "text-emerald-400",
      },
      {
        value: fp,
        label: "False Positive",
        sublabel: "Wrongly flagged",
        bg: "bg-amber-500/15 border-amber-500/30",
        text: "text-amber-400",
      },
    ],
    [
      {
        value: fn,
        label: "False Negative",
        sublabel: "Missed fabrication",
        bg: "bg-red-500/15 border-red-500/30",
        text: "text-red-400",
      },
      {
        value: tn,
        label: "True Negative",
        sublabel: "Correctly passed",
        bg: "bg-slate-700/30 border-slate-600/30",
        text: "text-slate-400",
      },
    ],
  ];

  return (
    <div className="space-y-2">
      {/* Axis labels */}
      <div className="grid grid-cols-[64px_1fr_1fr] gap-2 text-xs text-muted-foreground">
        <div />
        <div className="text-center font-medium text-foreground/70">Predicted: FLAGGED</div>
        <div className="text-center font-medium text-foreground/70">Predicted: PASSED</div>
      </div>
      {cells.map((row, ri) => (
        <div key={ri} className="grid grid-cols-[64px_1fr_1fr] gap-2">
          <div className="flex items-center justify-end pr-2 text-xs text-muted-foreground text-right leading-tight">
            <span>Actual:<br />{ri === 0 ? "FLAGGED" : "PASSED"}</span>
          </div>
          {row.map((cell, ci) => (
            <div
              key={ci}
              className={`border rounded-lg p-4 flex flex-col items-center gap-1 ${cell.bg}`}
            >
              <span className={`text-3xl font-bold tabular-nums ${cell.text}`}>{cell.value}</span>
              <span className="text-xs font-medium text-foreground/80">{cell.label}</span>
              <span className="text-xs text-muted-foreground">{cell.sublabel}</span>
              {total > 0 && (
                <span className="text-xs text-muted-foreground/50 tabular-nums">
                  {Math.round((cell.value / total) * 100)}%
                </span>
              )}
            </div>
          ))}
        </div>
      ))}
      <p className="text-xs text-muted-foreground/50 text-center pt-1">
        Positive class = REFUTED or SUSPICIOUS (fabrication detected)
      </p>
    </div>
  );
}
