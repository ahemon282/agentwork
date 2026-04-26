import { NextResponse } from "next/server";

const REQUIRED_AUTH = "L402 demo-paid";
const AMOUNT_SATS = 100;
const PURPOSE = "post_agent_task";
const INVOICE = "lnbc100n1demoagentworkl402taskaccess";
const REALM = "AgentWork";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");

  if (authorization !== REQUIRED_AUTH) {
    return NextResponse.json(
      {
        ok: false,
        error: "Payment required",
        protocol: "L402",
        amount_sats: AMOUNT_SATS,
        purpose: PURPOSE,
        invoice: INVOICE,
        message: "L402 payment required before an agent task can be posted.",
      },
      {
        status: 402,
        headers: {
          "WWW-Authenticate": `L402 realm="${REALM}", amount_sats="${AMOUNT_SATS}", purpose="${PURPOSE}", invoice="${INVOICE}"`,
        },
      }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      protocol: "L402",
      access: "granted",
      task_access_unlocked: true,
      amount_sats: AMOUNT_SATS,
      message: "L402 payment proof accepted. Agent task posting unlocked.",
    },
    { status: 200 }
  );
}
