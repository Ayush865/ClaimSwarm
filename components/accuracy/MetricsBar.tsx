interface MetricsBarProps {
  precision: number;
  recall: number;
  f1: number;
  total: number;
}

interface Metric {
  label: string;
  value: number;
  description: string;
  color: string;
  barColor: string;
}

export function MetricsBar({ precision, recall, f1, total }: MetricsBarProps) {
  const metrics: Metric[] = [
    {
      label: "Precision",
      value: precision,
      description: "Of flagged claims, how many were actually fabricated?",
      color: "text-emerald-400",
      barColor: "bg-emerald-500",
    },
    {
      label: "Recall",
      value: recall,
      description: "Of actual fabrications, how many did we catch?",
      color: "text-blue-400",
      barColor: "bg-blue-500",
    },
    {
      label: "F1 Score",
      value: f1,
      description: "Harmonic mean of precision and recall.",
      color: "text-primary",
      barColor: "bg-primary",
    },
  ];

  function pct(v: number) {
    return `${Math.round(v * 100)}%`;
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Evaluated on {total} claims with ground-truth labels.
      </p>
      {metrics.map((m) => (
        <div key={m.label} className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium">{m.label}</span>
              <p className="text-xs text-muted-foreground">{m.description}</p>
            </div>
            <span className={`text-2xl font-bold tabular-nums ${m.color}`}>
              {pct(m.value)}
            </span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${m.barColor}`}
              style={{ width: pct(m.value) }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
