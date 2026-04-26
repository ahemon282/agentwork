import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "../../../../../lib/supabase";

// Places a bid on a task and auto-assigns a winner after 3+ bids.

type BidRequestBody = {
  agent_id: string;
  amount_sats: number;
  estimated_time: number;
};

type TaskRow = {
  id: string;
  budget_sats: number;
  status: string;
};

type AgentRow = {
  id: string;
  reputation: number | null;
};

type BidRow = {
  id: string;
  task_id: string;
  agent_id: string;
  amount_sats: number;
  estimated_time: number;
  created_at: string;
};

function calculateBidScore(
  reputation: number,
  budgetSats: number,
  amountSats: number
): number {
  const budgetRatio = (budgetSats - amountSats) / budgetSats;
  return reputation * 0.6 + budgetRatio * 0.4;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await context.params;

    if (!taskId || typeof taskId !== "string" || taskId.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: "Invalid task id in route parameter." },
        { status: 400 }
      );
    }

    let body: BidRequestBody;
    try {
      body = (await request.json()) as BidRequestBody;
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body." },
        { status: 400 }
      );
    }

    const { agent_id, amount_sats, estimated_time } = body;

    if (!agent_id || typeof agent_id !== "string" || agent_id.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: "agent_id is required and must be a non-empty string." },
        { status: 400 }
      );
    }

    if (!isPositiveNumber(amount_sats)) {
      return NextResponse.json(
        { ok: false, error: "amount_sats must be a positive number." },
        { status: 400 }
      );
    }

    if (!isPositiveNumber(estimated_time)) {
      return NextResponse.json(
        { ok: false, error: "estimated_time must be a positive number." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();

    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .select("id, budget_sats, status")
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

    if (task.status !== "open") {
      return NextResponse.json(
        { ok: false, error: "Task is not open for bidding." },
        { status: 409 }
      );
    }

    if (!isPositiveNumber(task.budget_sats)) {
      return NextResponse.json(
        { ok: false, error: "Task budget is invalid." },
        { status: 500 }
      );
    }

    if (amount_sats > task.budget_sats) {
      return NextResponse.json(
        { ok: false, error: "Bid amount cannot exceed task budget." },
        { status: 409 }
      );
    }

    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .select("id, reputation")
      .eq("id", agent_id)
      .maybeSingle<AgentRow>();

    if (agentError) {
      return NextResponse.json(
        { ok: false, error: "Failed to fetch agent.", details: agentError.message },
        { status: 500 }
      );
    }

    if (!agent) {
      return NextResponse.json(
        { ok: false, error: "Agent not found." },
        { status: 404 }
      );
    }

    const { data: existingBid, error: duplicateCheckError } = await supabase
      .from("bids")
      .select("id")
      .eq("task_id", taskId)
      .eq("agent_id", agent_id)
      .maybeSingle<{ id: string }>();

    if (duplicateCheckError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to validate duplicate bid.",
          details: duplicateCheckError.message,
        },
        { status: 500 }
      );
    }

    if (existingBid) {
      return NextResponse.json(
        { ok: false, error: "Agent has already placed a bid on this task." },
        { status: 409 }
      );
    }

    const { data: insertedBid, error: insertError } = await supabase
      .from("bids")
      .insert({
        task_id: taskId,
        agent_id,
        amount_sats,
        estimated_time,
      })
      .select("id, task_id, agent_id, amount_sats, estimated_time, created_at")
      .single<BidRow>();

    if (insertError) {
      return NextResponse.json(
        { ok: false, error: "Failed to insert bid.", details: insertError.message },
        { status: 500 }
      );
    }

    const { data: allBids, error: allBidsError } = await supabase
      .from("bids")
      .select("id, task_id, agent_id, amount_sats, estimated_time, created_at")
      .eq("task_id", taskId)
      .returns<BidRow[]>();

    if (allBidsError) {
      return NextResponse.json(
        { ok: false, error: "Failed to fetch task bids.", details: allBidsError.message },
        { status: 500 }
      );
    }

    const bidCount = allBids?.length ?? 0;

    if (bidCount >= 3 && allBids) {
      const agentIds = Array.from(new Set(allBids.map((bid) => bid.agent_id)));

      const { data: biddingAgents, error: biddingAgentsError } = await supabase
        .from("agents")
        .select("id, reputation")
        .in("id", agentIds)
        .returns<AgentRow[]>();

      if (biddingAgentsError) {
        return NextResponse.json(
          {
            ok: false,
            error: "Failed to fetch bidding agents for auto-selection.",
            details: biddingAgentsError.message,
          },
          { status: 500 }
        );
      }

      const reputationByAgentId = new Map<string, number>(
        (biddingAgents ?? []).map((a) => [a.id, a.reputation ?? 0])
      );

      let winningBid: BidRow | null = null;
      let bestScore = Number.NEGATIVE_INFINITY;

      for (const bid of allBids) {
        const reputation = reputationByAgentId.get(bid.agent_id) ?? 0;
        const score = calculateBidScore(reputation, task.budget_sats, bid.amount_sats);

        if (score > bestScore) {
          bestScore = score;
          winningBid = bid;
        }
      }

      if (!winningBid) {
        return NextResponse.json(
          { ok: false, error: "Unable to determine winning bid." },
          { status: 500 }
        );
      }

      const { error: updateTaskError } = await supabase
        .from("tasks")
        .update({
          status: "assigned",
          winning_agent_id: winningBid.agent_id,
        })
        .eq("id", taskId)
        .eq("status", "open");

      if (updateTaskError) {
        return NextResponse.json(
          {
            ok: false,
            error: "Failed to auto-assign task winner.",
            details: updateTaskError.message,
          },
          { status: 500 }
        );
      }

      return NextResponse.json(
        {
          ok: true,
          bid: insertedBid,
          bid_count: bidCount,
          auto_selected: true,
          winning_agent_id: winningBid.agent_id,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        bid: insertedBid,
        bid_count: bidCount,
        auto_selected: false,
        winning_agent_id: null,
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error.";
    return NextResponse.json(
      { ok: false, error: "Unexpected server error.", details: message },
      { status: 500 }
    );
  }
}
