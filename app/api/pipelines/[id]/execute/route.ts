import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "../../../../../lib/supabase";

// Executes a pipeline in demo mode and materializes step-by-step task activity.

type ExecuteRequestBody = {
  mode?: "demo";
};

type PipelineRow = {
  id: string;
  name: string;
  status: string;
  total_sats: number | null;
  steps: unknown;
};

type PipelineStep = {
  title: string;
  description: string;
  category: string;
  budget_sats: number;
  agent_specialty: string;
};

type AgentRow = {
  id: string;
  specialty: string | null;
  reputation: number | null;
  wallet_address: string | null;
  total_earned: number | null;
  tasks_completed: number | null;
  tasks_failed: number | null;
};

type ExecutedStepResult = {
  step_index: number;
  title: string;
  category: string;
  agent_id: string | null;
  task_id: string;
  verification_passed: boolean;
  status: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toPositiveBudget(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 500;
  }
  return Math.floor(value);
}

function parsePipelineSteps(steps: unknown): PipelineStep[] {
  if (!Array.isArray(steps)) {
    return [];
  }

  const parsed: PipelineStep[] = [];
  for (const rawStep of steps) {
    if (!isObject(rawStep)) {
      continue;
    }

    const title = typeof rawStep.title === "string" && rawStep.title.trim() ? rawStep.title.trim() : "Untitled Step";
    const description =
      typeof rawStep.description === "string" && rawStep.description.trim()
        ? rawStep.description.trim()
        : "Demo pipeline step execution task.";
    const category =
      typeof rawStep.category === "string" && rawStep.category.trim()
        ? rawStep.category.trim().toLowerCase()
        : "verification";
    const budgetSats = toPositiveBudget(rawStep.budget_sats);
    const specialty =
      typeof rawStep.agent_specialty === "string" && rawStep.agent_specialty.trim()
        ? rawStep.agent_specialty.trim().toLowerCase()
        : "general";

    parsed.push({
      title,
      description,
      category,
      budget_sats: budgetSats,
      agent_specialty: specialty,
    });
  }

  return parsed;
}

function getWordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function getDemoOutputForCategory(category: string): unknown {
  if (category === "classification") {
    return {
      labels: ["priority-high", "customer-reported", "investigate"],
      confidence: 0.9,
    };
  }

  if (category === "research") {
    return {
      summary: "Research completed with consolidated references and implementation notes.",
      sources: [
        "https://example.org/spec-a",
        "https://example.org/spec-b",
        "https://example.org/spec-c",
      ],
    };
  }

  if (category === "summarization") {
    return {
      text: "The pipeline step processed available artifacts and generated a concise operational summary. "
        + "It highlights the key actions taken, the data considered, and the rationale behind each decision. "
        + "The result balances detail with readability so stakeholders can review status quickly and move on "
        + "to the next execution phase. Quality checks indicate coherent structure, complete coverage of inputs, "
        + "and a practical recommendation for downstream execution without introducing blockers.",
    };
  }

  if (category === "verification") {
    return {
      result: true,
      note: "Verification checks passed for demo execution.",
    };
  }

  return { result: false, reason: `Unsupported category: ${category}` };
}

function verifyOutputByCategory(category: string, output: unknown): { passed: boolean; reason: string } {
  if (category === "classification") {
    if (!Array.isArray(output) && !isObject(output)) {
      return { passed: false, reason: "Classification output must be an object or array." };
    }
    if (isObject(output) && "confidence" in output) {
      const confidence = output.confidence;
      if (typeof confidence !== "number" || confidence < 0.85) {
        return { passed: false, reason: "Classification confidence must be >= 0.85." };
      }
    }
    return { passed: true, reason: "Classification output verified." };
  }

  if (category === "research") {
    if (isObject(output) && Array.isArray(output.sources) && output.sources.length >= 3) {
      return { passed: true, reason: "Research output verified." };
    }
    if (Array.isArray(output) && output.length >= 3) {
      return { passed: true, reason: "Research output verified." };
    }
    return { passed: false, reason: "Research output must include at least 3 sources." };
  }

  if (category === "summarization") {
    const text =
      typeof output === "string"
        ? output
        : isObject(output) && typeof output.text === "string"
          ? output.text
          : "";
    const words = getWordCount(text);
    if (words < 50 || words > 500) {
      return { passed: false, reason: "Summarization output must be between 50 and 500 words." };
    }
    return { passed: true, reason: "Summarization output verified." };
  }

  if (category === "verification") {
    if (typeof output === "boolean") {
      return { passed: true, reason: "Verification output verified." };
    }
    if (isObject(output)) {
      const candidates = [output.result, output.verified, output.valid];
      const hasBoolean = candidates.some((value) => typeof value === "boolean");
      if (hasBoolean) {
        return { passed: true, reason: "Verification output verified." };
      }
    }
    return { passed: false, reason: "Verification output must contain a boolean-style result." };
  }

  return { passed: false, reason: `Unsupported category "${category}" for automatic verification.` };
}

async function matchBestAgent(agentSpecialty: string): Promise<AgentRow | null> {
  const supabase = getSupabaseAdminClient();

  const { data: specialtyAgents, error: specialtyError } = await supabase
    .from("agents")
    .select("id, specialty, reputation, wallet_address, total_earned, tasks_completed, tasks_failed")
    .eq("is_online", true)
    .eq("specialty", agentSpecialty)
    .order("reputation", { ascending: false, nullsFirst: false })
    .limit(1)
    .returns<AgentRow[]>();

  if (specialtyError) {
    throw new Error(`Failed to query specialty agents: ${specialtyError.message}`);
  }

  if (specialtyAgents && specialtyAgents.length > 0) {
    return specialtyAgents[0];
  }

  const { data: fallbackAgents, error: fallbackError } = await supabase
    .from("agents")
    .select("id, specialty, reputation, wallet_address, total_earned, tasks_completed, tasks_failed")
    .eq("is_online", true)
    .order("reputation", { ascending: false, nullsFirst: false })
    .limit(1)
    .returns<AgentRow[]>();

  if (fallbackError) {
    throw new Error(`Failed to query fallback agents: ${fallbackError.message}`);
  }

  return fallbackAgents && fallbackAgents.length > 0 ? fallbackAgents[0] : null;
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const pipelineId = params?.id;
    if (!pipelineId || typeof pipelineId !== "string" || pipelineId.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: "Invalid pipeline id in route parameter." },
        { status: 400 }
      );
    }

    let body: ExecuteRequestBody;
    try {
      body = (await request.json()) as ExecuteRequestBody;
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body. Expected { mode: 'demo' }." },
        { status: 400 }
      );
    }

    if (body.mode !== "demo") {
      return NextResponse.json(
        { ok: false, error: "Only mode='demo' is supported." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();

    const { data: pipeline, error: pipelineError } = await supabase
      .from("pipelines")
      .select("id, name, status, total_sats, steps")
      .eq("id", pipelineId)
      .maybeSingle<PipelineRow>();

    if (pipelineError) {
      return NextResponse.json(
        { ok: false, error: "Failed to fetch pipeline.", details: pipelineError.message },
        { status: 500 }
      );
    }

    if (!pipeline) {
      return NextResponse.json(
        { ok: false, error: "Pipeline not found." },
        { status: 404 }
      );
    }

    if (pipeline.status === "completed" || pipeline.status === "running") {
      return NextResponse.json(
        { ok: false, error: `Pipeline is already ${pipeline.status}.` },
        { status: 409 }
      );
    }

    const steps = parsePipelineSteps(pipeline.steps);
    if (steps.length < 2) {
      return NextResponse.json(
        { ok: false, error: "Pipeline steps must be an array with at least 2 executable steps." },
        { status: 400 }
      );
    }

    const { error: markRunningError } = await supabase
      .from("pipelines")
      .update({ status: "running" })
      .eq("id", pipelineId);

    if (markRunningError) {
      return NextResponse.json(
        { ok: false, error: "Failed to mark pipeline as running.", details: markRunningError.message },
        { status: 500 }
      );
    }

    const executedSteps: ExecutedStepResult[] = [];
    let totalSats = 0;

    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];
      const selectedAgent = await matchBestAgent(step.agent_specialty);

      const taskInsertPayload = {
        title: `${pipeline.name}: ${step.title}`,
        description: step.description,
        category: step.category,
        budget_sats: step.budget_sats,
        status: "assigned",
        posted_by: "pipeline-executor",
        winning_agent_id: selectedAgent?.id ?? null,
      };

      const { data: createdTask, error: createTaskError } = await supabase
        .from("tasks")
        .insert(taskInsertPayload)
        .select("id, category, budget_sats, status, winning_agent_id")
        .single<Pick<TaskRow, "id" | "category" | "budget_sats" | "status" | "winning_agent_id">>();

      if (createTaskError || !createdTask) {
        const { error: markFailedError } = await supabase
          .from("pipelines")
          .update({ status: "failed" })
          .eq("id", pipelineId);

        return NextResponse.json(
          {
            ok: false,
            pipeline_id: pipelineId,
            status: "failed",
            total_sats: totalSats,
            executed_steps: executedSteps,
            message: `Failed to create task for step ${index}: ${createTaskError?.message ?? "Unknown error"}`,
            details: markFailedError ? { pipeline_update_error: markFailedError.message } : undefined,
          },
          { status: 500 }
        );
      }

      const demoOutput = getDemoOutputForCategory(step.category);
      const verification = verifyOutputByCategory(step.category, demoOutput);
      const taskStatus = verification.passed ? "completed" : "disputed";
      const completedAt = new Date().toISOString();

      const { error: updateTaskError } = await supabase
        .from("tasks")
        .update({
          output: demoOutput,
          verification_passed: verification.passed,
          completed_at: completedAt,
          status: taskStatus,
        })
        .eq("id", createdTask.id);

      if (updateTaskError) {
        await supabase.from("pipelines").update({ status: "failed" }).eq("id", pipelineId);
        return NextResponse.json(
          {
            ok: false,
            pipeline_id: pipelineId,
            status: "failed",
            total_sats: totalSats,
            executed_steps,
            message: `Failed to finalize task ${createdTask.id}: ${updateTaskError.message}`,
          },
          { status: 500 }
        );
      }

      if (verification.passed) {
        totalSats += step.budget_sats;

        if (selectedAgent) {
          const { error: updateAgentError } = await supabase
            .from("agents")
            .update({
              tasks_completed: (selectedAgent.tasks_completed ?? 0) + 1,
              total_earned: (selectedAgent.total_earned ?? 0) + step.budget_sats,
            })
            .eq("id", selectedAgent.id);

          if (updateAgentError) {
            await supabase.from("pipelines").update({ status: "failed" }).eq("id", pipelineId);
            return NextResponse.json(
              {
                ok: false,
                pipeline_id: pipelineId,
                status: "failed",
                total_sats: totalSats,
                executed_steps,
                message: `Failed to update agent success stats: ${updateAgentError.message}`,
              },
              { status: 500 }
            );
          }

          const { error: transactionError } = await supabase.from("transactions").insert({
            task_id: createdTask.id,
            from_wallet: null,
            to_wallet: selectedAgent.wallet_address,
            amount_sats: step.budget_sats,
            type: "release",
            payment_hash: null,
            status: "completed",
          });

          if (transactionError) {
            await supabase.from("pipelines").update({ status: "failed" }).eq("id", pipelineId);
            return NextResponse.json(
              {
                ok: false,
                pipeline_id: pipelineId,
                status: "failed",
                total_sats: totalSats,
                executed_steps,
                message: `Failed to insert transaction for task ${createdTask.id}: ${transactionError.message}`,
              },
              { status: 500 }
            );
          }
        }
      } else {
        if (selectedAgent) {
          const { error: updateAgentFailureError } = await supabase
            .from("agents")
            .update({
              tasks_failed: (selectedAgent.tasks_failed ?? 0) + 1,
            })
            .eq("id", selectedAgent.id);

          if (updateAgentFailureError) {
            await supabase.from("pipelines").update({ status: "failed" }).eq("id", pipelineId);
            return NextResponse.json(
              {
                ok: false,
                pipeline_id: pipelineId,
                status: "failed",
                total_sats: totalSats,
                executed_steps,
                message: `Failed to update agent failure stats: ${updateAgentFailureError.message}`,
              },
              { status: 500 }
            );
          }
        }
      }

      executedSteps.push({
        step_index: index,
        title: step.title,
        category: step.category,
        agent_id: selectedAgent?.id ?? null,
        task_id: createdTask.id,
        verification_passed: verification.passed,
        status: taskStatus,
      });

      if (!verification.passed) {
        const { error: markFailedError } = await supabase
          .from("pipelines")
          .update({
            status: "failed",
            total_sats: totalSats,
          })
          .eq("id", pipelineId);

        if (markFailedError) {
          return NextResponse.json(
            {
              ok: false,
              pipeline_id: pipelineId,
              status: "failed",
              total_sats: totalSats,
              executed_steps: executedSteps,
              message: `Step ${index} failed verification and pipeline status update failed: ${markFailedError.message}`,
            },
            { status: 500 }
          );
        }

        return NextResponse.json(
          {
            ok: true,
            pipeline_id: pipelineId,
            status: "failed",
            total_sats: totalSats,
            executed_steps: executedSteps,
            message: `Execution stopped at step ${index} due to verification failure.`,
          },
          { status: 200 }
        );
      }
    }

    const { error: markCompletedError } = await supabase
      .from("pipelines")
      .update({
        status: "completed",
        total_sats: totalSats,
      })
      .eq("id", pipelineId);

    if (markCompletedError) {
      return NextResponse.json(
        {
          ok: false,
          pipeline_id: pipelineId,
          status: "running",
          total_sats: totalSats,
          executed_steps: executedSteps,
          message: `All steps executed, but final pipeline update failed: ${markCompletedError.message}`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        pipeline_id: pipelineId,
        status: "completed",
        total_sats: totalSats,
        executed_steps: executedSteps,
        message: "Pipeline executed successfully in demo mode.",
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
