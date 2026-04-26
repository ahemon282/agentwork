import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "../../../lib/supabase";

// Returns economy/dashboard statistics for the AgentWork frontend.

type TopAgent = {
  id: string;
  name: string;
  specialty: string | null;
  reputation: number | null;
  total_earned: number | null;
  tasks_completed: number | null;
};

type RecentTransaction = {
  id: string;
  task_id: string | null;
  amount_sats: number;
  type: string;
  status: string | null;
  created_at: string | null;
};

function toSafeNumber(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return value;
}

function getUtcDayBoundsIso(): { startOfDayIso: string; startOfNextDayIso: string } {
  const now = new Date();
  const startOfDay = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)
  );
  const startOfNextDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  return {
    startOfDayIso: startOfDay.toISOString(),
    startOfNextDayIso: startOfNextDay.toISOString(),
  };
}

function calculateAverageCompletionSeconds(
  tasks: Array<{ created_at: string | null; completed_at: string | null }>
): number {
  if (!tasks.length) {
    return 0;
  }

  let totalSeconds = 0;
  let validCount = 0;

  for (const task of tasks) {
    if (!task.created_at || !task.completed_at) {
      continue;
    }

    const createdMs = new Date(task.created_at).getTime();
    const completedMs = new Date(task.completed_at).getTime();

    if (!Number.isFinite(createdMs) || !Number.isFinite(completedMs)) {
      continue;
    }

    const diffSeconds = Math.floor((completedMs - createdMs) / 1000);
    if (diffSeconds < 0) {
      continue;
    }

    totalSeconds += diffSeconds;
    validCount += 1;
  }

  if (validCount === 0) {
    return 0;
  }

  return Math.round(totalSeconds / validCount);
}

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();
    const { startOfDayIso, startOfNextDayIso } = getUtcDayBoundsIso();

    const { data: completedTransactions, error: completedTransactionsError } = await supabase
      .from("transactions")
      .select("amount_sats")
      .eq("status", "completed");

    if (completedTransactionsError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to fetch completed transactions.",
          details: completedTransactionsError.message,
        },
        { status: 500 }
      );
    }

    const totalSatsTransacted = (completedTransactions ?? []).reduce((sum, row) => {
      return sum + toSafeNumber(row.amount_sats);
    }, 0);

    const { data: todayTransactions, error: todayTransactionsError } = await supabase
      .from("transactions")
      .select("amount_sats")
      .eq("status", "completed")
      .gte("created_at", startOfDayIso)
      .lt("created_at", startOfNextDayIso);

    if (todayTransactionsError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to fetch today's transactions.",
          details: todayTransactionsError.message,
        },
        { status: 500 }
      );
    }

    const satsToday = (todayTransactions ?? []).reduce((sum, row) => {
      return sum + toSafeNumber(row.amount_sats);
    }, 0);

    const { count: activeTasksCount, error: activeTasksError } = await supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .in("status", ["open", "assigned"]);

    if (activeTasksError) {
      return NextResponse.json(
        { ok: false, error: "Failed to fetch active task count.", details: activeTasksError.message },
        { status: 500 }
      );
    }

    const { count: completedTasksCount, error: completedTasksError } = await supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed");

    if (completedTasksError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to fetch completed task count.",
          details: completedTasksError.message,
        },
        { status: 500 }
      );
    }

    const { count: disputedTasksCount, error: disputedTasksError } = await supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("status", "disputed");

    if (disputedTasksError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to fetch disputed task count.",
          details: disputedTasksError.message,
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
        { ok: false, error: "Failed to fetch active agent count.", details: activeAgentsError.message },
        { status: 500 }
      );
    }

    const { data: completionTasks, error: completionTasksError } = await supabase
      .from("tasks")
      .select("created_at, completed_at")
      .not("created_at", "is", null)
      .not("completed_at", "is", null);

    if (completionTasksError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to fetch task completion durations.",
          details: completionTasksError.message,
        },
        { status: 500 }
      );
    }

    const averageCompletionSeconds = calculateAverageCompletionSeconds(completionTasks ?? []);
    const completedTasks = completedTasksCount ?? 0;
    const disputedTasks = disputedTasksCount ?? 0;
    const successDenominator = completedTasks + disputedTasks;
    const successRate =
      successDenominator === 0
        ? 0
        : Number(((completedTasks / successDenominator) * 100).toFixed(2));

    const { count: totalPipelinesCount, error: totalPipelinesError } = await supabase
      .from("pipelines")
      .select("id", { count: "exact", head: true });

    if (totalPipelinesError) {
      return NextResponse.json(
        { ok: false, error: "Failed to fetch pipeline count.", details: totalPipelinesError.message },
        { status: 500 }
      );
    }

    const { count: activeSalaryStreamsCount, error: activeSalaryStreamsError } = await supabase
      .from("salary_streams")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);

    if (activeSalaryStreamsError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to fetch active salary stream count.",
          details: activeSalaryStreamsError.message,
        },
        { status: 500 }
      );
    }

    const { data: topAgents, error: topAgentsError } = await supabase
      .from("agents")
      .select("id, name, specialty, reputation, total_earned, tasks_completed")
      .order("total_earned", { ascending: false, nullsFirst: false })
      .limit(5)
      .returns<TopAgent[]>();

    if (topAgentsError) {
      return NextResponse.json(
        { ok: false, error: "Failed to fetch top agents.", details: topAgentsError.message },
        { status: 500 }
      );
    }

    const { data: recentTransactions, error: recentTransactionsError } = await supabase
      .from("transactions")
      .select("id, task_id, amount_sats, type, status, created_at")
      .order("created_at", { ascending: false })
      .limit(10)
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

    return NextResponse.json(
      {
        ok: true,
        stats: {
          total_sats_transacted: totalSatsTransacted,
          sats_today: satsToday,
          active_tasks: activeTasksCount ?? 0,
          completed_tasks: completedTasks,
          disputed_tasks: disputedTasks,
          active_agents: activeAgentsCount ?? 0,
          average_completion_seconds: averageCompletionSeconds,
          success_rate: successRate,
          total_pipelines: totalPipelinesCount ?? 0,
          active_salary_streams: activeSalaryStreamsCount ?? 0,
          top_agents: topAgents ?? [],
          recent_transactions: recentTransactions ?? [],
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
