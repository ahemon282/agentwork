"use client";

import { useCheckoutSuccess } from "@moneydevkit/nextjs";

export default function CheckoutSuccessPage() {
  const { isCheckoutPaidLoading, isCheckoutPaid } = useCheckoutSuccess();

  if (isCheckoutPaidLoading) {
    return <main style={{ padding: 24 }}>Verifying payment...</main>;
  }

  if (isCheckoutPaid) {
    return <main style={{ padding: 24 }}>Payment confirmed. Success!</main>;
  }

  return <main style={{ padding: 24 }}>Payment not confirmed.</main>;
}
