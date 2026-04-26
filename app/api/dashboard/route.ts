import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "../../../lib/supabase";

// Returns a single dashboard payload for the AgentWork landing experience.

type MarketTask = {
  id: string;
  title: string;
  description: string;
  category: string;
  budget_sats: number;
  status: string | null;
  created_at: string | null;
  winning_agent_id: string | null;
};

type RecentTransaction = {
  id: string;
  task_id: string | null;
  amount_sats: number;
  type: string;
  status: string | null;
  created_at: string | null;
};

type TopAgent = {
  id: string;
  name: string;
  specialty: string | null;
  reputation: number | null;
  total_earned: number | null;
  tasks_completed: number | null;
  is_online: boolean | null;
};

type RecentPipeline = {
  id: string;
  name: string;
  status: string | null;
  total_sats: number | null;
  created_at: string | null;
};

function toSafeNumber(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return value;
}

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();

    const { data: completedTransactions, error: completedTransactionsError } = await supabase
      .from("transactions")
      .select("amount_sats")
      .eq("status", "completed");

    if (completedTransactionsError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to fetch completed transactions for hero counters.",
          details: completedTransactionsError.message,
        },
        { status: 500 }
      );
    }

    const totalSatsTransacted = (completedTransactions ?? []).reduce((sum, transaction) => {
      return sum + toSafeNumber(transaction.amount_sats);
    }, 0);

    const { count: tasksCompletedCount, error: tasksCompletedError } = await supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed");

    if (tasksCompletedError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to fetch completed task count for hero counters.",
          details: tasksCompletedError.message,
        },
        { status: 500 }
      );
    }

    const { count: activeAgentsCount, error: activeAgentsError } = await supabase
      .from("agents")
      .select("id", { count: "exact", head: true })
      .eq("is_online", true);

    if (activeAgentsError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to fetch active agent count for hero counters.",
          details: activeAgentsError.message,
        },
        { status: 500 }
      );
    }

    const { data: marketTasks, error: marketTasksError } = await supabase
      .from("tasks")
      .select("id, title, description, category, budget_sats, status, created_at, winning_agent_id")
      .order("created_at", { ascending: false })
      .limit(8)
      .returns<MarketTask[]>();

    if (marketTasksError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to fetch market tasks.",
          details: marketTasksError.message,
        },
        { status: 500 }
      );
    }

    const { data: recentTransactions, error: recentTransactionsError } = await supabase
      .from("transactions")
      .select("id, task_id, amount_sats, type, status, created_at")
      .order("created_at", { ascending: false })
      .limit(12)
      .returns<RecentTransaction[]>();

    if (recentTransactionsError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to fetch recent transactions.",
          details: recentTransactionsError.message,
        },
        { status: 500 }
      );
    }

    const { data: topAgents, error: topAgentsError } = await supabase
      .from("agents")
      .select("id, name, specialty, reputation, total_earned, tasks_completed, is_online")
      .order("total_earned", { ascending: false, nullsFirst: false })
      .limit(5)
      .returns<TopAgent[]>();

    if (topAgentsError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to fetch top agents.",
          details: topAgentsError.message,
        },
        { status: 500 }
      );
    }

    const { data: recentPipelines, error: recentPipelinesError } = await supabase
      .from("pipelines")
      .select("id, name, status, total_sats, created_at")
      .order("created_at", { ascending: false })
      .limit(5)
      .returns<RecentPipeline[]>();

    if (recentPipelinesError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to fetch recent pipelines.",
          details: recentPipelinesError.message,
        },
        { status: 500 }
      );
    }

    const { count: activeStreamsCount, error: activeStreamsError } = await supabase
      .from("salary_streams")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);

    if (activeStreamsError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to fetch active salary stream count.",
          details: activeStreamsError.message,
        },
        { status: 500 }
      );
    }

    const { data: salaryStreams, error: salaryStreamsError } = await supabase
      .from("salary_streams")
      .select("total_streamed");

    if (salaryStreamsError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to fetch salary streamed totals.",
          details: salaryStreamsError.message,
        },
        { status: 500 }
      );
    }

    const totalStreamed = (salaryStreams ?? []).reduce((sum, stream) => {
      return sum + toSafeNumber(stream.total_streamed);
    }, 0);

    return NextResponse.json(
      {
        ok: true,
        dashboard: {
          hero: {
            total_sats_transacted: totalSatsTransacted,
            tasks_completed: tasksCompletedCount ?? 0,
            active_agents: activeAgentsCount ?? 0,
          },
          market: {
            tasks: marketTasks ?? [],
          },
          payments: {
            recent_transactions: recentTransactions ?? [],
          },
          agents: {
            top_agents: topAgents ?? [],
          },
          pipelines: {
            recent_pipelines: recentPipelines ?? [],
          },
          salary_mode: {
            active_streams: activeStreamsCount ?? 0,
            total_streamed: totalStreamed,
          },
        },
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
