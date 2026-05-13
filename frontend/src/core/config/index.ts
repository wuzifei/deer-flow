import { env } from "@/env";

function getBaseOrigin() {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  // Fallback for SSR
  return "http://localhost:2026";
}

export function getBackendBaseURL() {
  if (env.NEXT_PUBLIC_BACKEND_BASE_URL) {
    return new URL(env.NEXT_PUBLIC_BACKEND_BASE_URL, getBaseOrigin())
      .toString()
      .replace(/\/+$/, "");
  } else {
    return "";
  }
}

export function getLangGraphBaseURL(isMock?: boolean) {
  console.log(
    "env.NEXT_PUBLIC_LANGGRAPH_BASE_URL",
    env.NEXT_PUBLIC_LANGGRAPH_BASE_URL,
  );
  if (env.NEXT_PUBLIC_LANGGRAPH_BASE_URL) {
    return new URL(
      env.NEXT_PUBLIC_LANGGRAPH_BASE_URL,
      getBaseOrigin(),
    ).toString();
  }

  const base = getBackendBaseURL();

  if (isMock) {
    if (typeof window !== "undefined") {
      return base ? `${base}/mock/api` : `${window.location.origin}/mock/api`;
    }
    return "http://localhost:3000/mock/api";
  }

  // LangGraph SDK requires a full URL
  if (typeof window !== "undefined") {
    return base ? `${base}/api/langgraph` : `${window.location.origin}/api/langgraph`;
  }
  // Fallback for SSR
  return "http://localhost:2026/api/langgraph";
}
