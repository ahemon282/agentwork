import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "../../../../../lib/supabase";

// Completes an assigned task, verifies output, and settles agent outcomes.

type CompleteRequestBody = {
  agent_id: string;
  output: unknown;
};

type TaskRow = {
  id: string;
  category: string;
  budget_sats: number;
  status: string;
  winning_agent_id: string | null;
};

type AgentRow = {
  id: string;
  wallet_address: string | null;
  total_earned: number | null;
  tasks_completed: number | null;
  tasks_failed: number | null;
};

type VerificationResult = {
  passed: boolean;
  reason: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getWordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function isBooleanStyleResult(value: unknown): boolean {
  if (typeof value === "boolean") {
    return true;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return ["true", "false", "pass", "fail", "passed", "failed", "yes", "no"].includes(
      normalized
    );
  }

  if (typeof value === "number") {
    return value === 0 || value === 1;
  }

  return false;
}

function verifyClassification(output: unknown): VerificationResult {
  if (!Array.isArray(output) && !isObject(output)) {
    return {
      passed: false,
      reason: "Classification output must be an object or array with usable structure.",
    };
  }

  if (isObject(output) && "confidence" in output) {
    const confidence = output.confidence;
    if (typeof confidence !== "number" || confidence < 0.85) {
      return {
        passed: false,
        reason: "Classification confidence must be a number >= 0.85 when provided.",
      };
    }
  }

  return { passed: true, reason: "Classification output passed verification." };
}

function verifyResearch(output: unknown): VerificationResult {
  let sources: unknown[] = [];

  if (isObject(output) && Array.isArray(output.sources)) {
    sources = output.sources;
  } else if (Array.isArray(output)) {
    sources = output;
  }

  if (sources.length < 3) {
    return {
      passed: false,
      reason: "Research output must include at least 3 sources.",
    };
  }

  return { passed: true, reason: "Research output passed verification." };
}

function verifySummarization(output: unknown): VerificationResult {
  let text = "";

  if (typeof output === "string") {
    text = output;
  } else if (isObject(output) && typeof output.text === "string") {
    text = output.text;
  }

  if (!text.trim()) {
    return {
      passed: false,
      reason: "Summarization output must contain text.",
    };
  }

  const words = getWordCount(text);
  if (words < 50 || words > 500) {
    return {
      passed: false,
      reason: "Summarization output must be between 50 and 500 words.",
    };
  }

  return { passed: true, reason: "Summarization output passed verification." };
}

function verifyVerificationCategory(output: unknown): VerificationResult {
  if (isBooleanStyleResult(output)) {
    return { passed: true, reason: "Verification output passed verification." };
  }

  if (isObject(output)) {
    const candidates = [output.result, output.verified, output.is_valid, output.valid];
    if (candidates.some((candidate) => isBooleanStyleResult(candidate))) {
      return { passed: true, reason: "Verification output passed verification." };
    }
  }

  return {
    passed: false,
    reason: "Verification output must contain a boolean-style result.",
  };
}

function verifyByCategory(category: string, output: unknown): VerificationResult {
  switch (category) {
    case "classification":
      return verifyClassification(output);
    case "research":
      return verifyResearch(output);
    case "summarization":
      return verifySummarization(output);
    case "verification":
      return verifyVerificationCategory(output);
    default:
      return {
        passed: false,
        reason: `Unsupported category "${category}" for automatic verification.`,
      };
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const taskId = params?.id;

    if (!taskId || typeof taskId !== "string" || taskId.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: "Invalid task id in route parameter." },
        { status: 400 }
      );
    }

    let body: CompleteRequestBody;
    try {
      body = (await request.json()) as CompleteRequestBody;
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body." },
        { status: 400 }
      );
    }

    const { agent_id, output } = body;

    if (!agent_id || typeof agent_id !== "string" || agent_id.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: "agent_id is required and must be a non-empty string." },
        { status: 400 }
      );
    }

    if (typeof output === "undefined") {
      return NextResponse.json(
        { ok: false, error: "output is required." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();

    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .select("id, category, budget_sats, status, winning_agent_id")
      .eq("id", taskId)
      .maybeSingle<TaskRow>();

    if (taskError) {
      return NextResponse.json(
        { ok: false, error: "Failed to fetch task.", details: taskError.message },
        { status: 500 }
      );
    }

    if (!task) {
      return NextResponse.json(
        { ok: false, error: "Task not found." },
        { status: 404 }
      );
    }

    if (task.status !== "assigned") {
      return NextResponse.json(
        { ok: false, error: "Task is not in assigned state." },
        { status: 409 }
      );
    }

    if (!task.winning_agent_id || task.winning_agent_id !== agent_id) {
      return NextResponse.json(
        { ok: false, error: "Only the winning agent can complete this task." },
        { status: 409 }
      );
    }

    const verification = verifyByCategory(task.category, output);
    const nextStatus = verification.passed ? "completed" : "disputed";
    const completedAt = new Date().toISOString();

    const { data: updatedTask, error: updateTaskError } = await supabase
      .from("tasks")
      .update({
        output,
        verification_passed: verification.passed,
        completed_at: completedAt,
        status: nextStatus,
      })
      .eq("id", taskId)
      .select(
        "id, title, description, category, budget_sats, status, posted_by, winning_agent_id, output, verification_passed, payment_hash, created_at, completed_at"
      )
      .single();

    if (updateTaskError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to update task completion state.",
          details: updateTaskError.message,
        },
        { status: 500 }
      );
    }

    const { data: winningAgent, error: winningAgentError } = await supabase
      .from("agents")
      .select("id, wallet_address, total_earned, tasks_completed, tasks_failed")
      .eq("id", agent_id)
      .maybeSingle<AgentRow>();

    if (winningAgentError) {
      return NextResponse.json(
        { ok: false, error: "Failed to fetch winning agent.", details: winningAgentError.message },
        { status: 500 }
      );
    }

    if (!winningAgent) {
      return NextResponse.json(
        { ok: false, error: "Winning agent not found." },
        { status: 404 }
      );
    }

    let transaction: Record<string, unknown> | null = null;

    if (verification.passed) {
      const updatedCompletedCount = (winningAgent.tasks_completed ?? 0) + 1;
      const updatedTotalEarned = (winningAgent.total_earned ?? 0) + task.budget_sats;

      const { error: updateAgentError } = await supabase
        .from("agents")
        .update({
          tasks_completed: updatedCompletedCount,
          total_earned: updatedTotalEarned,
        })
        .eq("id", agent_id);

      if (updateAgentError) {
        return NextResponse.json(
          {
            ok: false,
            error: "Failed to update agent completion stats.",
            details: updateAgentError.message,
          },
          { status: 500 }
        );
      }

      const { data: insertedTransaction, error: transactionError } = await supabase
        .from("transactions")
        .insert({
          task_id: task.id,
          from_wallet: null,
          to_wallet: winningAgent.wallet_address,
          amount_sats: task.budget_sats,
          type: "release",
          payment_hash: null,
          status: "completed",
        })
        .select(
          "id, task_id, from_wallet, to_wallet, amount_sats, type, payment_hash, status, created_at"
        )
        .single();

      if (transactionError) {
        return NextResponse.json(
          {
            ok: false,
            error: "Failed to insert release transaction.",
            details: transactionError.message,
          },
          { status: 500 }
        );
      }

      transaction = insertedTransaction;
    } else {
      const updatedFailedCount = (winningAgent.tasks_failed ?? 0) + 1;

      const { error: updateAgentError } = await supabase
        .from("agents")
        .update({
          tasks_failed: updatedFailedCount,
        })
        .eq("id", agent_id);

      if (updateAgentError) {
        return NextResponse.json(
          {
            ok: false,
            error: "Failed to update agent failure stats.",
            details: updateAgentError.message,
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      {
        ok: true,
        verification_passed: verification.passed,
        status: nextStatus,
        task: updatedTask,
        transaction,
        message: verification.reason,
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error.";
    return NextResponse.json(
      { ok: false, error: "Unexpected server error.", details: message },
      { status: 500 }
    );
  }
}
