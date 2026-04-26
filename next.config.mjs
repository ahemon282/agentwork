import withMdkCheckout from "@moneydevkit/nextjs/next-plugin";

const nextConfig = {
  env: {
    PUBLIC_APP_URL: "https://agentwork-nine.vercel.app",
    MDK_WEBHOOK_URL: "https://agentwork-nine.vercel.app/api/mdk",
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default withMdkCheckout(nextConfig);
