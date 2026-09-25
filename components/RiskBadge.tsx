import React from "react";
import { RiskLevel } from "@/lib/types";
import { AlertTriangle, CheckCircle2, AlertOctagon } from "lucide-react";

interface RiskBadgeProps {
  level: RiskLevel;
  reason?: string;
  showIcon?: boolean;
  size?: "sm" | "md";
}

export const RiskBadge: React.FC<RiskBadgeProps> = ({
  level,
  reason,
  showIcon = true,
  size = "md",
}) => {
  const config = {
    LOW: {
      bg: "bg-emerald-50 text-emerald-950 border-emerald-300",
      dot: "bg-emerald-600",
      icon: CheckCircle2,
      label: "Low Risk",
    },
    MEDIUM: {
      bg: "bg-amber-50 text-amber-950 border-amber-300",
      dot: "bg-amber-600",
      icon: AlertTriangle,
      label: "Medium Risk",
    },
    HIGH: {
      bg: "bg-rose-50 text-rose-950 border-rose-300",
      dot: "bg-rose-600",
      icon: AlertOctagon,
      label: "High Risk",
    },
  }[level] || {
    bg: "bg-slate-50 text-slate-900 border-slate-300",
    dot: "bg-slate-500",
    icon: CheckCircle2,
    label: "Standard",
  };

  const IconComponent = config.icon;
  const sizeClasses =
    size === "sm"
      ? "px-2 py-0.5 text-[11px] gap-1"
      : "px-2.5 py-1 text-xs gap-1.5";

  const accessibleLabel = `Risk level: ${config.label}${reason ? ` — ${reason}` : ""}`;

  return (
    <div
      role="status"
      aria-label={accessibleLabel}
      className="inline-flex items-center group relative cursor-default"
      tabIndex={0}
    >
      <span
        className={`inline-flex items-center font-medium rounded-full border shadow-2xs ${config.bg} ${sizeClasses}`}
      >
        {showIcon && (
          <IconComponent
            aria-hidden="true"
            className={size === "sm" ? "h-3 w-3 shrink-0" : "h-3.5 w-3.5 shrink-0"}
          />
        )}
        <span>{config.label}</span>
      </span>

      {reason && (
        <div
          role="tooltip"
          className="hidden group-hover:block group-focus:block absolute bottom-full left-0 mb-1.5 z-30 w-64 rounded-md bg-slate-900 px-2.5 py-1.5 text-[11px] leading-snug text-slate-100 shadow-lg pointer-events-none"
        >
          {reason}
        </div>
      )}
    </div>
  );
};
