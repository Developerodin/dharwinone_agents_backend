/** Phase 1 token pack catalog (§10.1 scaffold — Razorpay checkout deferred). */
export type TokenPack = {
  packId: string;
  name: string;
  tokens: number;
  priceInr: number;
  popular?: boolean;
};

export const TOKEN_PACKS: TokenPack[] = [
  { packId: "starter", name: "Starter", tokens: 100, priceInr: 99 },
  { packId: "growth", name: "Growth", tokens: 500, priceInr: 399, popular: true },
  { packId: "pro", name: "Pro", tokens: 1200, priceInr: 799 },
];

export function getTokenPack(packId: string): TokenPack | undefined {
  return TOKEN_PACKS.find((p) => p.packId === packId);
}
