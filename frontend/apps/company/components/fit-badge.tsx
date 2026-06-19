import { Badge } from "@ip/ui";

export function fitTone(score: number): "success" | "warning" | "neutral" {
  return score >= 0.8 ? "success" : score >= 0.5 ? "warning" : "neutral";
}

export function FitBadge({ score }: { score: number }) {
  return <Badge tone={fitTone(score)}>{Math.round(score * 100)}% fit</Badge>;
}
