import withMdkCheckout from "@moneydevkit/nextjs/next-plugin";

const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default withMdkCheckout(nextConfig);
