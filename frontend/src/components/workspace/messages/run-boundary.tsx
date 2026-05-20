import type { Run } from "@langchain/langgraph-sdk";

import { cn } from "@/lib/utils";

interface RunBoundaryProps {
  run: Run;
  runIndex: number;
  className?: string;
}

export function RunBoundary({ run, runIndex, className }: RunBoundaryProps) {
  const runNumber = runIndex + 1;
  const status = (run as any).status || "unknown";
  const isSuccess = status === "success";
  const isError = status === "error";

  const createdAt = (run as any).created_at;
  const timeText = createdAt
    ? new Date(createdAt).toLocaleString("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <div className={cn("flex items-center justify-center gap-3 py-5", className)}>
      <div className="h-px flex-1 bg-border" />
      <div className="flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
        <span>第 {runNumber} 次运行</span>
        {isSuccess && (
          <span className="text-green-600">成功</span>
        )}
        {isError && (
          <span className="text-red-500">失败</span>
        )}
        {!isSuccess && !isError && (
          <span className="capitalize">{status}</span>
        )}
        {timeText && <span className="text-muted-foreground/70">· {timeText}</span>}
      </div>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
