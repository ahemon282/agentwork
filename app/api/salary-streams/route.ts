import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "../../../lib/supabase";

// Provides salary stream listing and demo stream creation for salary mode.

type AgentLite = {
  id: string;
  name: string;
  specialty: string | null;
  is_online: boolean | null;
};

type SalaryStreamRow = {
  id: string;
  agent_id: string | null;
  sats_per_second: number;
  total_streamed: number | null;
  is_active: boolean | null;
  started_at: string | null;
  stopped_at: string | null;
};

type SalaryStreamWithAgent = SalaryStreamRow & {
  agent: AgentLite | null;
};

type CreateSalaryStreamBody = {
  agent_id?: unknown;
  sats_per_second?: unknown;
};

function toSafeNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return value;
}

function getGetDefaults() {
  return {
    streams: [] as SalaryStreamWithAgent[],
    summary: {
      active_streams: 0,
      total_streamed: 0,
      average_sats_per_second: 0,
    },
  };
}

export async function GET() {
  const defaults = getGetDefaults();

  try {
    const supabase = getSupabaseAdminClient();

    const { data: streamsData, error: streamsError } = await supabase
      .from("salary_streams")
      .select("id, agent_id, sats_per_second, total_streamed, is_active, started_at, stopped_at")
      .order("started_at", { ascending: false })
      .returns<SalaryStreamRow[]>();

    if (streamsError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to fetch salary streams.",
          details: streamsError.message,
          ...defaults,
        },
        { status: 500 }
      );
    }

    const streams = streamsData ?? [];
    const agentIds = Array.from(
      new Set(
        streams
          .map((stream) => stream.agent_id)
          .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      )
    );

    let agentById = new Map<string, AgentLite>();
    if (agentIds.length > 0) {
      const { data: agentsData, error: agentsError } = await supabase
        .from("agents")
        .select("id, name, specialty, is_online")
        .in("id", agentIds)
        .returns<AgentLite[]>();

      if (agentsError) {
        return NextResponse.json(
          {
            ok: false,
            error: "Failed to fetch agents for salary streams.",
            details: agentsError.message,
            ...defaults,
          },
          { status: 500 }
        );
      }

      agentById = new Map((agentsData ?? []).map((agent) => [agent.id, agent]));
    }

    const streamsWithAgent: SalaryStreamWithAgent[] = streams.map((stream) => ({
      ...stream,
      sats_per_second: toSafeNumber(stream.sats_per_second),
      total_streamed: toSafeNumber(stream.total_streamed),
      agent: stream.agent_id ? agentById.get(stream.agent_id) ?? null : null,
    }));

    const activeStreams = streamsWithAgent.filter((stream) => stream.is_active === true);
    const activeStreamsCount = activeStreams.length;
    const totalStreamed = streamsWithAgent.reduce((sum, stream) => {
      return sum + toSafeNumber(stream.total_streamed);
    }, 0);

    const totalActiveSatsPerSecond = activeStreams.reduce((sum, stream) => {
      return sum + toSafeNumber(stream.sats_per_second);
    }, 0);

    const averageSatsPerSecond =
      activeStreamsCount === 0 ? 0 : Number((totalActiveSatsPerSecond / activeStreamsCount).toFixed(2));

    return NextResponse.json(
      {
        ok: true,
        streams: streamsWithAgent,
        summary: {
          active_streams: activeStreamsCount,
          total_streamed: totalStreamed,
          average_sats_per_second: averageSatsPerSecond,
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
        ...defaults,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    let body: CreateSalaryStreamBody;
    try {
      body = (await request.json()) as CreateSalaryStreamBody;
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid JSON body. Expected { agent_id: string, sats_per_second: number }.",
        },
        { status: 400 }
      );
    }

    const agentId = body.agent_id;
    const satsPerSecond = body.sats_per_second;

    if (typeof agentId !== "string" || agentId.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: "agent_id is required and must be a non-empty string." },
        { status: 400 }
      );
    }

    if (typeof satsPerSecond !== "number" || !Number.isFinite(satsPerSecond) || satsPerSecond <= 0) {
      return NextResponse.json(
        { ok: false, error: "sats_per_second must be a positive number." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();

    const { data: existingAgent, error: agentError } = await supabase
      .from("agents")
      .select("id")
      .eq("id", agentId)
      .maybeSingle<{ id: string }>();

    if (agentError) {
      return NextResponse.json(
        { ok: false, error: "Failed to validate agent.", details: agentError.message },
        { status: 500 }
      );
    }

    if (!existingAgent) {
      return NextResponse.json(
        { ok: false, error: "Agent not found." },
        { status: 404 }
      );
    }

    const nowIso = new Date().toISOString();

    const { data: createdStream, error: createStreamError } = await supabase
      .from("salary_streams")
      .insert({
        agent_id: agentId,
        sats_per_second: satsPerSecond,
        total_streamed: 0,
        is_active: true,
        started_at: nowIso,
        stopped_at: null,
      })
      .select("id, agent_id, sats_per_second, total_streamed, is_active, started_at, stopped_at")
      .single<SalaryStreamRow>();

    if (createStreamError || !createdStream) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to create salary stream.",
          details: createStreamError?.message ?? "Unknown insert error.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        stream: {
          ...createdStream,
          sats_per_second: toSafeNumber(createdStream.sats_per_second),
          total_streamed: toSafeNumber(createdStream.total_streamed),
        },
        message: "Salary stream started successfully.",
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
