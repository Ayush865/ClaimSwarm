import { Badge } from "@/components/ui/badge";
import type { Verdict, ClaimStatus } from "@/lib/types";
import { CheckCircle, XCircle, AlertTriangle, HelpCircle, Loader2, Clock } from "lucide-react";

interface VerdictChipProps {
  verdict: Verdict | null;
  status?: ClaimStatus;
  showIcon?: boolean;
}

const CONFIG = {
  SUPPORTED: { variant: "supported", icon: CheckCircle, label: "Supported" },
  REFUTED: { variant: "refuted", icon: XCircle, label: "Refuted" },
  SUSPICIOUS: { variant: "suspicious", icon: AlertTriangle, label: "Suspicious" },
  UNVERIFIABLE: { variant: "unverifiable", icon: HelpCircle, label: "Unverifiable" },
} as const;

export function VerdictChip({ verdict, status, showIcon = true }: VerdictChipProps) {
  if (status === "running") {
    return (
      <Badge variant="running" className="gap-1">
        <Loader2 className="w-3 h-3 animate-spin" />
        Running
      </Badge>
    );
  }
  if (status === "pending" || !verdict) {
    return (
      <Badge variant="pending" className="gap-1">
        <Clock className="w-3 h-3" />
        Pending
      </Badge>
    );
  }

  const config = CONFIG[verdict];
  const Icon = config.icon;

  return (
    <Badge variant={config.variant as any} className="gap-1">
      {showIcon && <Icon className="w-3 h-3" />}
      {config.label}
    </Badge>
  );
}
