"use client";

import { useState } from "react";
import { useCheckout } from "@moneydevkit/nextjs";

export default function MdkTestPage() {
  const { createCheckout, isLoading } = useCheckout();
  const [error, setError] = useState<string | null>(null);

  const handleCreateCheckout = async () => {
    setError(null);

    const result = await createCheckout({
      type: "AMOUNT",
      amount: 100,
      currency: "SAT",
      successUrl: "/checkout/success",
      title: "MDK Test Checkout",
    });

    if (result.data?.checkoutUrl) {
      window.location.href = result.data.checkoutUrl;
      return;
    }

    setError(result.error?.message || "Failed to create checkout.");
  };

  return (
    <main style={{ padding: 24, maxWidth: 480 }}>
      <h1>MDK Test</h1>
      <button onClick={handleCreateCheckout} disabled={isLoading}>
        {isLoading ? "Creating checkout..." : "Pay 100 sats"}
      </button>
      {error ? <p style={{ color: "crimson" }}>{error}</p> : null}
    </main>
  );
}
