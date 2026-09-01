"use client";

import { Code2Icon, EyeIcon, LoaderIcon } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CodeEditor } from "@/components/workspace/code-editor";
import { ArtifactFilePreview } from "@/components/workspace/artifacts/artifact-file-preview";
import { ThreadContext, type ThreadContextType } from "@/components/workspace/messages/context";
import { getBackendBaseURL } from "@/core/config";
import { checkCodeFile } from "@/core/utils/files";

export const dynamic = "force-dynamic";

// CodeEditor 内部读取 thread.isLoading；分享页面无真实 thread，
// 提供静态值即可复用查看抽屉的代码渲染（CodeMirror 高亮）。
const STATIC_THREAD_CONTEXT = {
  thread: { isLoading: false },
  isMock: false,
} as unknown as ThreadContextType;

type Status = "loading" | "ok" | "error";

export default function ShareViewPage() {
  const { token } = useParams<{ token: string }>();
  const [filename, setFilename] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [viewMode, setViewMode] = useState<"code" | "preview">("code");

  useEffect(() => {
    if (!token) return;
    const base = getBackendBaseURL();
    let aborted = false;
    (async () => {
      try {
        const [infoRes, contentRes] = await Promise.all([
          fetch(`${base}/api/share/${token}/info`),
          fetch(`${base}/api/share/${token}`),
        ]);
        if (aborted) return;
        if (infoRes.status === 404 || contentRes.status === 404) {
          setErrorMsg("分享链接不存在或已被撤销");
          setStatus("error");
          return;
        }
        if (infoRes.status === 410 || contentRes.status === 410) {
          setErrorMsg("分享链接已过期");
          setStatus("error");
          return;
        }
        if (!infoRes.ok || !contentRes.ok) throw new Error("fetch failed");
        const info = await infoRes.json();
        setFilename(info.filename ?? "");
        const text = await contentRes.text();
        setContent(text);
        setStatus("ok");
      } catch {
        if (!aborted) {
          setErrorMsg("加载失败，请稍后重试");
          setStatus("error");
        }
      }
    })();
    return () => {
      aborted = true;
    };
  }, [token]);

  const { isCodeFile, language } = checkCodeFile(filename);
  const isSupportPreview = language === "html" || language === "markdown";

  useEffect(() => {
    if (status === "ok") {
      setViewMode(isSupportPreview ? "preview" : "code");
    }
  }, [status, isSupportPreview]);

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoaderIcon className="text-muted-foreground size-6 animate-spin" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="text-muted-foreground flex h-screen flex-col items-center justify-center gap-2">
        <p>{errorMsg}</p>
      </div>
    );
  }

  return (
    <ThreadContext.Provider value={STATIC_THREAD_CONTEXT}>
      <div className="flex h-screen flex-col">
        <header className="flex items-center justify-between gap-3 border-b px-4 py-2">
          <span className="text-sm font-medium truncate">
            {filename || "分享文件"}
          </span>
          {isSupportPreview && (
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={viewMode}
              onValueChange={(v) => {
                if (v) setViewMode(v as "code" | "preview");
              }}
            >
              <ToggleGroupItem value="code">
                <Code2Icon />
              </ToggleGroupItem>
              <ToggleGroupItem value="preview">
                <EyeIcon />
              </ToggleGroupItem>
            </ToggleGroup>
          )}
        </header>
        <div className="min-h-0 flex-1">
          {isSupportPreview && viewMode === "preview" && language ? (
            <ArtifactFilePreview
              content={content}
              language={language}
              scrollKey={token ?? "share"}
            />
          ) : isCodeFile ? (
            <CodeEditor
              className="size-full resize-none rounded-none border-none"
              value={content}
              readonly
            />
          ) : (
            <div className="text-muted-foreground flex h-full items-center justify-center">
              <a
                href={`${getBackendBaseURL()}/api/share/${token}`}
                className="text-primary underline underline-offset-2 hover:no-underline"
              >
                该文件类型无法在线预览，点击下载
              </a>
            </div>
          )}
        </div>
      </div>
    </ThreadContext.Provider>
  );
}
