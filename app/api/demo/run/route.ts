import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "../../../../lib/supabase";

// Runs controlled demo orchestration flows for hackathon frontend showcases.

type DemoMode = "seed" | "task_flow" | "full_demo";

type DemoRequestBody = {
  mode?: DemoMode;
};

type AgentRow = {
  id: string;
  name: string;
  specialty: string | null;
  reputation: number | null;
  total_earned: number | null;
  tasks_completed: number | null;
  tasks_failed: number | null;
  wallet_address: string | null;
};

type TaskRow = {
  id: string;
  category: string;
  budget_sats: number;
  status: string;
  winning_agent_id: string | null;
  created_at: string | null;
  completed_at: string | null;
};

type BidRow = {
  id: string;
  task_id: string;
  agent_id: string;
  amount_sats: number;
};

type DemoSummary = {
  agents_created?: number;
  tasks_created?: number;
  bids_created?: number;
  tasks_completed?: number;
  tasks_disputed?: number;
};

type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

function isValidMode(mode: unknown): mode is DemoMode {
  return mode === "seed" || mode === "task_flow" || mode === "full_demo";
}

function calculateBidScore(reputation: number, budgetSats: number, amountSats: number): number {
  const budgetRatio = budgetSats > 0 ? (budgetSats - amountSats) / budgetSats : 0;
  return reputation * 0.6 + budgetRatio * 0.4;
}

function verifyDemoOutput(category: string, output: unknown): boolean {
  if (category === "classification") {
    if (!output || typeof output !== "object" || Array.isArray(output)) {
      return false;
    }
    const confidence = (output as { confidence?: unknown }).confidence;
    return typeof confidence === "number" && confidence >= 0.85;
  }

  if (category === "research") {
    if (!output || typeof output !== "object" || Array.isArray(output)) {
      return false;
    }
    const sources = (output as { sources?: unknown }).sources;
    return Array.isArray(sources) && sources.length >= 3;
  }

  if (category === "summarization") {
    const text =
      typeof output === "string"
        ? output
        : typeof output === "object" && output !== null && "text" in output
          ? String((output as { text?: unknown }).text ?? "")
          : "";
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    return words >= 50 && words <= 500;
  }

  if (category === "verification") {
    if (typeof output === "boolean") {
      return true;
    }
    if (typeof output === "object" && output !== null && "result" in output) {
      return typeof (output as { result?: unknown }).result === "boolean";
    }
    return false;
  }

  return false;
}

function getDemoTaskPayload(index = 0): {
  title: string;
  description: string;
  category: "classification" | "research" | "summarization" | "verification";
  budget_sats: number;
  status: "open";
  posted_by: string;
} {
  const presets = [
    {
      title: "Classify customer support intents",
      description: "Tag 100 support tickets into intent buckets for routing.",
      category: "classification" as const,
      budget_sats: 1400,
    },
    {
      title: "Research zk-rollup bridge risks",
      description: "Collect key security and operational risks with sources.",
      category: "research" as const,
      budget_sats: 2200,
    },
    {
      title: "Summarize weekly protocol updates",
      description: "Create an executive summary from changelog updates.",
      category: "summarization" as const,
      budget_sats: 1300,
    },
    {
      title: "Verify anomaly alert quality",
      description: "Determine whether alert signal should be accepted or rejected.",
      category: "verification" as const,
      budget_sats: 1100,
    },
  ];

  const preset = presets[index % presets.length];
  return {
    ...preset,
    status: "open",
    posted_by: "demo-system",
  };
}

function getDemoOutputForCategory(category: string): unknown {
  if (category === "classification") {
    return {
      labels: ["billing", "outage", "feature-request"],
      confidence: 0.91,
    };
  }

  if (category === "research") {
    return {
      summary: "Bridge risk profile covers validator set trust, relayer liveness, and proof delays.",
      sources: [
        "https://example.org/report-1",
        "https://example.org/report-2",
        "https://example.org/report-3",
      ],
    };
  }

  if (category === "summarization") {
    return {
      text: "This week the protocol shipped stability fixes across transaction indexing and job retries. "
        + "The release reduced timeout incidents, improved throughput under load, and introduced better "
        + "visibility for failed tasks. Teams also merged improvements to task assignment reliability, "
        + "with stronger bid filtering and clearer assignment state transitions. Internal QA confirms fewer "
        + "edge-case regressions than the previous sprint. Follow-up work focuses on dispute handling, "
        + "transaction observability, and dashboard clarity for operators tracking sats flow.",
    };
  }

  if (category === "verification") {
    return {
      result: true,
      notes: "Signal quality is acceptable for production routing.",
    };
  }

  return { result: false };
}

async function ensureDemoAgents(): Promise<{ agents: AgentRow[]; createdCount: number }> {
  const supabase = getSupabaseAdminClient();
  const demoAgentSpecs = [
    {
      name: "Demo Agent Alpha",
      type: "general",
      specialty: "classification",
      reputation: 0.92,
      total_earned: 2500,
      tasks_completed: 8,
      tasks_failed: 1,
      is_online: true,
      wallet_address: "demo_wallet_alpha",
    },
    {
      name: "Demo Agent Beta",
      type: "research",
      specialty: "research",
      reputation: 0.88,
      total_earned: 2100,
      tasks_completed: 6,
      tasks_failed: 1,
      is_online: true,
      wallet_address: "demo_wallet_beta",
    },
    {
      name: "Demo Agent Gamma",
      type: "summarizer",
      specialty: "summarization",
      reputation: 0.84,
      total_earned: 1600,
      tasks_completed: 5,
      tasks_failed: 2,
      is_online: true,
      wallet_address: "demo_wallet_gamma",
    },
  ];

  const { data: existingAgents, error: existingAgentsError } = await supabase
    .from("agents")
    .select("id, name, specialty, reputation, total_earned, tasks_completed, tasks_failed, wallet_address")
    .in(
      "name",
      demoAgentSpecs.map((spec) => spec.name)
    )
    .returns<AgentRow[]>();

  if (existingAgentsError) {
    throw new Error(`Failed to fetch demo agents: ${existingAgentsError.message}`);
  }

  const existingByName = new Set((existingAgents ?? []).map((agent) => agent.name));
  const missingSpecs = demoAgentSpecs.filter((spec) => !existingByName.has(spec.name));

  let createdCount = 0;
  if (missingSpecs.length > 0) {
    const { error: insertAgentsError } = await supabase.from("agents").insert(missingSpecs);
    if (insertAgentsError) {
      throw new Error(`Failed to create demo agents: ${insertAgentsError.message}`);
    }
    createdCount = missingSpecs.length;
  }

  const { data: finalAgents, error: finalAgentsError } = await supabase
    .from("agents")
    .select("id, name, specialty, reputation, total_earned, tasks_completed, tasks_failed, wallet_address")
    .in(
      "name",
      demoAgentSpecs.map((spec) => spec.name)
    )
    .order("name", { ascending: true })
    .returns<AgentRow[]>();

  if (finalAgentsError) {
    throw new Error(`Failed to fetch final demo agents: ${finalAgentsError.message}`);
  }

  return { agents: finalAgents ?? [], createdCount };
}

async function ensureOpenDemoTasks(minOpenTasks: number): Promise<{ createdTaskIds: string[] }> {
  const supabase = getSupabaseAdminClient();

  const { count: openTaskCount, error: openTaskCountError } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("status", "open");

  if (openTaskCountError) {
    throw new Error(`Failed to count open tasks: ${openTaskCountError.message}`);
  }

  const currentOpen = openTaskCount ?? 0;
  if (currentOpen >= minOpenTasks) {
    return { createdTaskIds: [] };
  }

  const toCreate = minOpenTasks - currentOpen;
  const payload = Array.from({ length: toCreate }, (_, idx) => getDemoTaskPayload(idx));

  const { data: createdTasks, error: createTasksError } = await supabase
    .from("tasks")
    .insert(payload)
    .select("id");

  if (createTasksError) {
    throw new Error(`Failed to create demo tasks: ${createTasksError.message}`);
  }

  return { createdTaskIds: (createdTasks ?? []).map((task) => String(task.id)) };
}

async function createDemoTask(index = 0): Promise<TaskRow> {
  const supabase = getSupabaseAdminClient();
  const payload = getDemoTaskPayload(index);

  const { data: createdTask, error: createTaskError } = await supabase
    .from("tasks")
    .insert(payload)
    .select("id, category, budget_sats, status, winning_agent_id, created_at, completed_at")
    .single<TaskRow>();

  if (createTaskError || !createdTask) {
    throw new Error(`Failed to create demo task: ${createTaskError?.message ?? "Unknown error"}`);
  }

  return createdTask;
}

async function createBidsAndAssignWinner(task: TaskRow, agents: AgentRow[]): Promise<{
  createdBids: BidRow[];
  winningAgentId: string;
}> {
  const supabase = getSupabaseAdminClient();

  if (agents.length < 3) {
    throw new Error("At least 3 demo agents are required to create demo bids.");
  }

  const selectedAgents = agents.slice(0, 3);
  const bidPayload = selectedAgents.map((agent, idx) => ({
    task_id: task.id,
    agent_id: agent.id,
    amount_sats: Math.max(100, Math.floor(task.budget_sats - (idx + 1) * 120)),
    estimated_time: 120 + idx * 20,
  }));

  const { data: insertedBids, error: insertBidsError } = await supabase
    .from("bids")
    .insert(bidPayload)
    .select("id, task_id, agent_id, amount_sats")
    .returns<BidRow[]>();

  if (insertBidsError) {
    throw new Error(`Failed to insert demo bids: ${insertBidsError.message}`);
  }

  const bids = insertedBids ?? [];
  if (bids.length === 0) {
    throw new Error("No bids were created for demo task.");
  }

  const agentById = new Map(agents.map((agent) => [agent.id, agent]));
  let winningBid = bids[0];
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const bid of bids) {
    const reputation = agentById.get(bid.agent_id)?.reputation ?? 0;
    const score = calculateBidScore(reputation, task.budget_sats, bid.amount_sats);
    if (score > bestScore) {
      bestScore = score;
      winningBid = bid;
    }
  }

  const { error: assignError } = await supabase
    .from("tasks")
    .update({
      status: "assigned",
      winning_agent_id: winningBid.agent_id,
    })
    .eq("id", task.id);

  if (assignError) {
    throw new Error(`Failed to assign winning demo bid: ${assignError.message}`);
  }

  return { createdBids: bids, winningAgentId: winningBid.agent_id };
}

async function finalizeDemoTask(
  taskId: string,
  category: string,
  winningAgentId: string,
  budgetSats: number,
  forceFail = false
): Promise<{ status: "completed" | "disputed"; transactionCreated: boolean }> {
  const supabase = getSupabaseAdminClient();

  const output: Json = (forceFail
    ? { note: "Intentional demo failure payload." }
    : getDemoOutputForCategory(category)) as Json;

  const verificationPassed = !forceFail && verifyDemoOutput(category, output);
  const nextStatus: "completed" | "disputed" = verificationPassed ? "completed" : "disputed";
  const completedAt = new Date().toISOString();

  const { error: updateTaskError } = await supabase
    .from("tasks")
    .update({
      output,
      verification_passed: verificationPassed,
      completed_at: completedAt,
      status: nextStatus,
    })
    .eq("id", taskId)
    .eq("winning_agent_id", winningAgentId);

  if (updateTaskError) {
    throw new Error(`Failed to finalize demo task: ${updateTaskError.message}`);
  }

  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("id, tasks_completed, tasks_failed, total_earned, wallet_address")
    .eq("id", winningAgentId)
    .single<AgentRow>();

  if (agentError || !agent) {
    throw new Error(`Failed to fetch winning demo agent: ${agentError?.message ?? "Not found"}`);
  }

  if (verificationPassed) {
    const { error: updateAgentError } = await supabase
      .from("agents")
      .update({
        tasks_completed: (agent.tasks_completed ?? 0) + 1,
        total_earned: (agent.total_earned ?? 0) + budgetSats,
      })
      .eq("id", winningAgentId);

    if (updateAgentError) {
      throw new Error(`Failed to update winning demo agent success stats: ${updateAgentError.message}`);
    }

    const { error: insertTransactionError } = await supabase.from("transactions").insert({
      task_id: taskId,
      from_wallet: null,
      to_wallet: agent.wallet_address,
      amount_sats: budgetSats,
      type: "release",
      payment_hash: null,
      status: "completed",
    });

    if (insertTransactionError) {
      throw new Error(`Failed to insert demo release transaction: ${insertTransactionError.message}`);
    }

    return { status: nextStatus, transactionCreated: true };
  }

  const { error: updateAgentError } = await supabase
    .from("agents")
    .update({
      tasks_failed: (agent.tasks_failed ?? 0) + 1,
    })
    .eq("id", winningAgentId);

  if (updateAgentError) {
    throw new Error(`Failed to update winning demo agent failure stats: ${updateAgentError.message}`);
  }

  return { status: nextStatus, transactionCreated: false };
}

async function runSeedMode(): Promise<{ summary: DemoSummary; details: Record<string, unknown> }> {
  const { agents, createdCount: agentsCreated } = await ensureDemoAgents();
  const { createdTaskIds } = await ensureOpenDemoTasks(3);

  return {
    summary: {
      agents_created: agentsCreated,
      tasks_created: createdTaskIds.length,
      bids_created: 0,
      tasks_completed: 0,
      tasks_disputed: 0,
    },
    details: {
      demo_agent_ids: agents.map((agent) => agent.id),
      created_task_ids: createdTaskIds,
    },
  };
}

async function runTaskFlowMode(): Promise<{ summary: DemoSummary; details: Record<string, unknown> }> {
  const { agents, createdCount: agentsCreated } = await ensureDemoAgents();
  const task = await createDemoTask(1);
  const bidFlow = await createBidsAndAssignWinner(task, agents);
  const completion = await finalizeDemoTask(
    task.id,
    task.category,
    bidFlow.winningAgentId,
    task.budget_sats,
    false
  );

  return {
    summary: {
      agents_created: agentsCreated,
      tasks_created: 1,
      bids_created: bidFlow.createdBids.length,
      tasks_completed: completion.status === "completed" ? 1 : 0,
      tasks_disputed: completion.status === "disputed" ? 1 : 0,
    },
    details: {
      task_id: task.id,
      winning_agent_id: bidFlow.winningAgentId,
      bid_ids: bidFlow.createdBids.map((bid) => bid.id),
      completion_status: completion.status,
      transaction_created: completion.transactionCreated,
    },
  };
}

async function runFullDemoMode(): Promise<{ summary: DemoSummary; details: Record<string, unknown> }> {
  const { agents, createdCount: agentsCreated } = await ensureDemoAgents();
  const { createdTaskIds: seededOpenTaskIds } = await ensureOpenDemoTasks(3);

  const successfulTask = await createDemoTask(2);
  const disputedTask = await createDemoTask(0);

  const successfulFlow = await createBidsAndAssignWinner(successfulTask, agents);
  const disputedFlow = await createBidsAndAssignWinner(disputedTask, agents);

  const successfulResult = await finalizeDemoTask(
    successfulTask.id,
    successfulTask.category,
    successfulFlow.winningAgentId,
    successfulTask.budget_sats,
    false
  );

  const disputedResult = await finalizeDemoTask(
    disputedTask.id,
    disputedTask.category,
    disputedFlow.winningAgentId,
    disputedTask.budget_sats,
    true
  );

  return {
    summary: {
      agents_created: agentsCreated,
      tasks_created: seededOpenTaskIds.length + 2,
      bids_created: successfulFlow.createdBids.length + disputedFlow.createdBids.length,
      tasks_completed: successfulResult.status === "completed" ? 1 : 0,
      tasks_disputed: disputedResult.status === "disputed" ? 1 : 0,
    },
    details: {
      seeded_open_task_ids: seededOpenTaskIds,
      successful_task_id: successfulTask.id,
      disputed_task_id: disputedTask.id,
      successful_winner: successfulFlow.winningAgentId,
      disputed_winner: disputedFlow.winningAgentId,
      successful_transaction_created: successfulResult.transactionCreated,
      disputed_transaction_created: disputedResult.transactionCreated,
    },
  };
}

export async function POST(request: Request) {
  try {
    let body: DemoRequestBody;
    try {
      body = (await request.json()) as DemoRequestBody;
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body. Expected { mode: 'seed' | 'task_flow' | 'full_demo' }." },
        { status: 400 }
      );
    }

    if (!isValidMode(body.mode)) {
      return NextResponse.json(
        { ok: false, error: "Invalid mode. Allowed values: seed, task_flow, full_demo." },
        { status: 400 }
      );
    }

    const mode = body.mode;

    if (mode === "seed") {
      const result = await runSeedMode();
      return NextResponse.json(
        {
          ok: true,
          mode,
          summary: result.summary,
          details: result.details,
        },
        { status: 200 }
      );
    }

    if (mode === "task_flow") {
      const result = await runTaskFlowMode();
      return NextResponse.json(
        {
          ok: true,
          mode,
          summary: result.summary,
          details: result.details,
        },
        { status: 200 }
      );
    }

    const result = await runFullDemoMode();
    return NextResponse.json(
      {
        ok: true,
        mode,
        summary: result.summary,
        details: result.details,
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
