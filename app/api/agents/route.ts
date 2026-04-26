import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "../../../lib/supabase";

// Returns a frontend-friendly agent directory with summary metadata.

type AgentRow = {
  id: string;
  name: string;
  type: string;
  specialty: string | null;
  reputation: number | null;
  total_earned: number | null;
  tasks_completed: number | null;
  tasks_failed: number | null;
  is_online: boolean | null;
  wallet_address: string | null;
  created_at: string | null;
};

function buildSpecialties(agents: AgentRow[]): string[] {
  const unique = new Set<string>();

  for (const agent of agents) {
    if (typeof agent.specialty !== "string") {
      continue;
    }

    const value = agent.specialty.trim();
    if (!value) {
      continue;
    }

    unique.add(value);
  }

  return Array.from(unique).sort((a, b) => a.localeCompare(b));
}

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase
      .from("agents")
      .select(
        "id, name, type, specialty, reputation, total_earned, tasks_completed, tasks_failed, is_online, wallet_address, created_at"
      )
      .order("is_online", { ascending: false, nullsFirst: false })
      .order("total_earned", { ascending: false, nullsFirst: false })
      .order("reputation", { ascending: false, nullsFirst: false })
      .returns<AgentRow[]>();

    if (error) {
      return NextResponse.json(
        { ok: false, error: "Failed to fetch agents.", details: error.message },
        { status: 500 }
      );
    }

    const agents = data ?? [];
    const totalAgents = agents.length;
    const activeAgents = agents.filter((agent) => agent.is_online === true).length;
    const specialties = buildSpecialties(agents);

    return NextResponse.json(
      {
        ok: true,
        agents,
        summary: {
          total_agents: totalAgents,
          active_agents: activeAgents,
          specialties,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error.";
    return NextResponse.json(
      {
        ok: false,
        error: "Unexpected server error.",
        details: message,
        agents: [],
        summary: {
          total_agents: 0,
          active_agents: 0,
          specialties: [],
        },
      },
      { status: 500 }
    );
  }
}
