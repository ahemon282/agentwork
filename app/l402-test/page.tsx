"use client";

import { useState } from "react";

type ApiResult = {
  status: number | null;
  body: unknown;
  wwwAuthenticate: string | null;
};

export default function L402TestPage() {
  const [result, setResult] = useState<ApiResult>({
    status: null,
    body: null,
    wwwAuthenticate: null,
  });
  const [loading, setLoading] = useState(false);

  const runTest = async (withProof: boolean) => {
    setLoading(true);
    try {
      const response = await fetch("/api/l402/task-access", {
        method: "POST",
        headers: withProof ? { Authorization: "L402 demo-paid" } : undefined,
      });

      const json = (await response.json()) as unknown;
      setResult({
        status: response.status,
        body: json,
        wwwAuthenticate: response.headers.get("WWW-Authenticate"),
      });
    } catch (error) {
      setResult({
        status: null,
        body: {
          ok: false,
          error: error instanceof Error ? error.message : "Unknown request error",
        },
        wwwAuthenticate: null,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      style={{
        maxWidth: 760,
        margin: "40px auto",
        padding: "0 16px",
        fontFamily: "Inter, Arial, sans-serif",
      }}
    >
      <h1 style={{ marginBottom: 8 }}>AgentWork L402 Proof</h1>
      <p style={{ marginTop: 0, color: "#444" }}>
        This demonstrates payment-gated agent task access.
      </p>

      <div style={{ display: "flex", gap: 12, marginTop: 20, marginBottom: 20 }}>
        <button
          type="button"
          onClick={() => runTest(false)}
          disabled={loading}
          style={{ padding: "10px 14px", cursor: loading ? "not-allowed" : "pointer" }}
        >
          Try without payment
        </button>
        <button
          type="button"
          onClick={() => runTest(true)}
          disabled={loading}
          style={{ padding: "10px 14px", cursor: loading ? "not-allowed" : "pointer" }}
        >
          Unlock with L402 proof
        </button>
      </div>

      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: 8,
          padding: 12,
          background: "#fafafa",
        }}
      >
        <div style={{ marginBottom: 8 }}>
          <strong>Status:</strong> {result.status ?? "Not run yet"}
        </div>
        <div style={{ marginBottom: 8 }}>
          <strong>WWW-Authenticate:</strong> {result.wwwAuthenticate ?? "(none)"}
        </div>
        <pre
          style={{
            margin: 0,
            padding: 12,
            borderRadius: 6,
            overflowX: "auto",
            background: "#fff",
            border: "1px solid #eee",
          }}
        >
          {JSON.stringify(result.body, null, 2)}
        </pre>
      </section>
    </main>
  );
}
