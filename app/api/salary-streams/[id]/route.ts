import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "../../../../lib/supabase";

// Handles salary stream lifecycle operations for demo salary mode controls.

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

type PatchRequestBody = {
  action?: "stop" | "tick" | "update_rate";
  amount?: unknown;
  sats_per_second?: unknown;
};

function toSafeNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return value;
}

function normalizeStream(stream: SalaryStreamRow): SalaryStreamRow {
  return {
    ...stream,
    sats_per_second: toSafeNumber(stream.sats_per_second),
    total_streamed: toSafeNumber(stream.total_streamed),
  };
}

async function getStreamById(streamId: string): Promise<SalaryStreamRow | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("salary_streams")
    .select("id, agent_id, sats_per_second, total_streamed, is_active, started_at, stopped_at")
    .eq("id", streamId)
    .maybeSingle<SalaryStreamRow>();

  if (error) {
    throw new Error(`Failed to fetch salary stream: ${error.message}`);
  }

  return data ?? null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: streamId } = await context.params;
    if (!streamId || typeof streamId !== "string" || streamId.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: "Invalid salary stream id in route parameter." },
        { status: 400 }
      );
    }

    const stream = await getStreamById(streamId);
    if (!stream) {
      return NextResponse.json(
        { ok: false, error: "Salary stream not found." },
        { status: 404 }
      );
    }

    const normalizedStream = normalizeStream(stream);
    let agent: AgentLite | null = null;

    if (normalizedStream.agent_id) {
      const supabase = getSupabaseAdminClient();
      const { data: agentData, error: agentError } = await supabase
        .from("agents")
        .select("id, name, specialty, is_online")
        .eq("id", normalizedStream.agent_id)
        .maybeSingle<AgentLite>();

      if (agentError) {
        return NextResponse.json(
          { ok: false, error: "Failed to fetch related agent.", details: agentError.message },
          { status: 500 }
        );
      }

      agent = agentData ?? null;
    }

    const streamWithAgent: SalaryStreamWithAgent = {
      ...normalizedStream,
      agent,
    };

    return NextResponse.json(
      {
        ok: true,
        stream: streamWithAgent,
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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: streamId } = await context.params;
    if (!streamId || typeof streamId !== "string" || streamId.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: "Invalid salary stream id in route parameter." },
        { status: 400 }
      );
    }

    let body: PatchRequestBody;
    try {
      body = (await request.json()) as PatchRequestBody;
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid JSON body. Expected action: stop | tick | update_rate.",
        },
        { status: 400 }
      );
    }

    if (!body.action || !["stop", "tick", "update_rate"].includes(body.action)) {
      return NextResponse.json(
        { ok: false, error: "Invalid action. Allowed: stop, tick, update_rate." },
        { status: 400 }
      );
    }

    const existingStream = await getStreamById(streamId);
    if (!existingStream) {
      return NextResponse.json(
        { ok: false, error: "Salary stream not found." },
        { status: 404 }
      );
    }

    const supabase = getSupabaseAdminClient();

    if (body.action === "stop") {
      const nowIso = new Date().toISOString();

      const { data: updatedStream, error: updateError } = await supabase
        .from("salary_streams")
        .update({
          is_active: false,
          stopped_at: nowIso,
        })
        .eq("id", streamId)
        .select("id, agent_id, sats_per_second, total_streamed, is_active, started_at, stopped_at")
        .single<SalaryStreamRow>();

      if (updateError || !updatedStream) {
        return NextResponse.json(
          {
            ok: false,
            error: "Failed to stop salary stream.",
            details: updateError?.message ?? "Unknown update error.",
          },
          { status: 500 }
        );
      }

      return NextResponse.json(
        {
          ok: true,
          stream: normalizeStream(updatedStream),
          message: "Salary stream stopped successfully.",
        },
        { status: 200 }
      );
    }

    if (body.action === "tick") {
      if (existingStream.is_active !== true) {
        return NextResponse.json(
          { ok: false, error: "Cannot tick an inactive salary stream." },
          { status: 409 }
        );
      }

      const amount = body.amount;
      if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json(
          { ok: false, error: "amount must be a positive number for tick action." },
          { status: 400 }
        );
      }

      const nextTotal = toSafeNumber(existingStream.total_streamed) + amount;

      const { data: updatedStream, error: updateError } = await supabase
        .from("salary_streams")
        .update({
          total_streamed: nextTotal,
        })
        .eq("id", streamId)
        .select("id, agent_id, sats_per_second, total_streamed, is_active, started_at, stopped_at")
        .single<SalaryStreamRow>();

      if (updateError || !updatedStream) {
        return NextResponse.json(
          {
            ok: false,
            error: "Failed to tick salary stream.",
            details: updateError?.message ?? "Unknown update error.",
          },
          { status: 500 }
        );
      }

      return NextResponse.json(
        {
          ok: true,
          stream: normalizeStream(updatedStream),
          message: "Salary stream total incremented successfully.",
        },
        { status: 200 }
      );
    }

    const nextRate = body.sats_per_second;
    if (typeof nextRate !== "number" || !Number.isFinite(nextRate) || nextRate <= 0) {
      return NextResponse.json(
        { ok: false, error: "sats_per_second must be a positive finite number for update_rate action." },
        { status: 400 }
      );
    }

    const { data: updatedStream, error: updateError } = await supabase
      .from("salary_streams")
      .update({
        sats_per_second: nextRate,
      })
      .eq("id", streamId)
      .select("id, agent_id, sats_per_second, total_streamed, is_active, started_at, stopped_at")
      .single<SalaryStreamRow>();

    if (updateError || !updatedStream) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to update salary stream rate.",
          details: updateError?.message ?? "Unknown update error.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        stream: normalizeStream(updatedStream),
        message: "Salary stream rate updated successfully.",
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
