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
      bg: "bg-emerald-50 text-emerald-800 border-emerald-200",
      dot: "bg-emerald-500",
      icon: CheckCircle2,
      label: "Low Risk",
    },
    MEDIUM: {
      bg: "bg-amber-50 text-amber-800 border-amber-200",
      dot: "bg-amber-500",
      icon: AlertTriangle,
      label: "Medium Risk",
    },
    HIGH: {
      bg: "bg-rose-50 text-rose-800 border-rose-200",
      dot: "bg-rose-500",
      icon: AlertOctagon,
      label: "High Risk",
    },
  }[level] || {
    bg: "bg-slate-50 text-slate-700 border-slate-200",
    dot: "bg-slate-400",
    icon: CheckCircle2,
    label: "Standard",
  };

  const IconComponent = config.icon;
  const sizeClasses =
    size === "sm"
      ? "px-2 py-0.5 text-[11px] gap-1"
      : "px-2.5 py-1 text-xs gap-1.5";

  return (
    <div className="inline-flex items-center group relative">
      <span
        className={`inline-flex items-center font-medium rounded-full border shadow-sm ${config.bg} ${sizeClasses}`}
      >
        {showIcon && <IconComponent className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />}
        <span>{config.label}</span>
      </span>

      {reason && (
        <div className="hidden group-hover:block absolute bottom-full left-0 mb-1 z-30 w-64 rounded-md bg-slate-900 px-2.5 py-1.5 text-[11px] leading-snug text-slate-100 shadow-lg pointer-events-none">
          {reason}
        </div>
      )}
    </div>
  );
};
