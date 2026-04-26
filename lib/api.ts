import type {
  AgentsResponse,
  ApiErrorShape,
  CreateSalaryStreamPayload,
  DashboardResponse,
  DemoRunResponse,
  PipelineExecuteResponse,
  SalaryStreamResponse,
  SalaryStreamsResponse,
  StatsResponse,
  UpdateSalaryStreamPayload,
} from "../types/api";

const API_BASE = "";

function getErrorMessageFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const errorPayload = payload as ApiErrorShape;
  if (typeof errorPayload.error === "string" && errorPayload.error.trim()) {
    return errorPayload.error;
  }
  if (typeof errorPayload.message === "string" && errorPayload.message.trim()) {
    return errorPayload.message;
  }
  return null;
}

async function parseJsonSafely(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return null;
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const payload = await parseJsonSafely(response);

  if (!response.ok) {
    const messageFromPayload = getErrorMessageFromPayload(payload);
    const fallback = `${response.status} ${response.statusText}`.trim();
    throw new Error(messageFromPayload ?? `Request failed: ${fallback}`);
  }

  if (!payload) {
    throw new Error(`Empty or invalid JSON response from ${path}`);
  }

  return payload as T;
}

export async function getDashboard(): Promise<DashboardResponse> {
  return requestJson<DashboardResponse>("/api/dashboard", { method: "GET" });
}

export async function getAgents(): Promise<AgentsResponse> {
  return requestJson<AgentsResponse>("/api/agents", { method: "GET" });
}

export async function getStats(): Promise<StatsResponse> {
  return requestJson<StatsResponse>("/api/stats", { method: "GET" });
}

export async function getSalaryStreams(): Promise<SalaryStreamsResponse> {
  return requestJson<SalaryStreamsResponse>("/api/salary-streams", { method: "GET" });
}

export async function getSalaryStream(id: string): Promise<SalaryStreamResponse> {
  if (!id || !id.trim()) {
    throw new Error("Salary stream id is required.");
  }
  return requestJson<SalaryStreamResponse>(`/api/salary-streams/${encodeURIComponent(id)}`, {
    method: "GET",
  });
}

export async function createSalaryStream(
  payload: CreateSalaryStreamPayload
): Promise<SalaryStreamResponse> {
  return requestJson<SalaryStreamResponse>("/api/salary-streams", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateSalaryStream(
  id: string,
  payload: UpdateSalaryStreamPayload
): Promise<SalaryStreamResponse> {
  if (!id || !id.trim()) {
    throw new Error("Salary stream id is required.");
  }

  return requestJson<SalaryStreamResponse>(`/api/salary-streams/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function runDemo(mode: "seed" | "task_flow" | "full_demo"): Promise<DemoRunResponse> {
  return requestJson<DemoRunResponse>("/api/demo/run", {
    method: "POST",
    body: JSON.stringify({ mode }),
  });
}

export async function executePipeline(id: string): Promise<PipelineExecuteResponse> {
  if (!id || !id.trim()) {
    throw new Error("Pipeline id is required.");
  }

  return requestJson<PipelineExecuteResponse>(`/api/pipelines/${encodeURIComponent(id)}/execute`, {
    method: "POST",
    body: JSON.stringify({ mode: "demo" }),
  });
}
