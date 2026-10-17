declare module "cloudflare:workers" {
  export const env: {
    RPC_RATE_LIMITER: {
      limit(options: { key: string }): Promise<{ success: boolean }>;
    };
  };
}
