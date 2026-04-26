import { createSalaryStream, getSalaryStreams, updateSalaryStream } from "./api";
import type {
  CreateSalaryStreamPayload,
  SalaryStreamResponse,
  SalaryStreamsResponse,
} from "../types/api";

export type SalaryModeData = {
  streams: SalaryStreamsResponse["streams"];
  summary: SalaryStreamsResponse["summary"];
};

export async function getSalaryModeData(): Promise<SalaryModeData> {
  const response = await getSalaryStreams();
  return {
    streams: response.streams,
    summary: response.summary,
  };
}

export async function startSalaryStream(
  payload: CreateSalaryStreamPayload
): Promise<SalaryStreamResponse> {
  return createSalaryStream(payload);
}

export async function tickSalaryStream(
  id: string,
  amount: number
): Promise<SalaryStreamResponse> {
  if (!id || !id.trim()) {
    throw new Error("Salary stream id is required.");
  }

  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    throw new Error("Tick amount must be a positive number.");
  }

  return updateSalaryStream(id, {
    action: "tick",
    amount,
  });
}

export async function stopSalaryStream(id: string): Promise<SalaryStreamResponse> {
  if (!id || !id.trim()) {
    throw new Error("Salary stream id is required.");
  }

  return updateSalaryStream(id, {
    action: "stop",
  });
}

export async function updateSalaryRate(
  id: string,
  sats_per_second: number
): Promise<SalaryStreamResponse> {
  if (!id || !id.trim()) {
    throw new Error("Salary stream id is required.");
  }

  if (
    typeof sats_per_second !== "number" ||
    !Number.isFinite(sats_per_second) ||
    sats_per_second <= 0
  ) {
    throw new Error("sats_per_second must be a positive finite number.");
  }

  return updateSalaryStream(id, {
    action: "update_rate",
    sats_per_second,
  });
}
