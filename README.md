# GenScope

3D block explorer for the GenLayer Bradbury Testnet. Visualize blocks, transactions, and AI consensus rounds in real time.

## Stack

- Next.js 16 (App Router)
- React Three Fiber + Drei + Postprocessing (Bloom)
- Zustand
- viem (ABI encoding/decoding)

## Features

- Live 3D block tower with drop-in animation
- Intelligent contract detection (AI consensus rounds)
- Transaction orbs orbiting selected blocks
- Live feed sidebar with real-time transaction list
- Search by block number, tx hash, or address
- Clickable stats: latest block, verified chain head, indexed transactions
- Load older blocks on demand
- AI consensus panel: rounds, validators, vote results, equivalence outputs

## Run locally

```bash
npm install
npm run dev
# open http://localhost:3000
```

## Architecture

| Path | Purpose |
|---|---|
| `app/lib/genlayer.ts` | RPC client — fetches receipts to resolve GenLayer TX IDs, then queries the consensusDataContract |
| `app/hooks/useBlocks.ts` | Polls `eth_blockNumber`, fetches initial + new blocks |
| `app/hooks/useTransactions.ts` | Fetches full tx data for every block in the store |
| `app/hooks/useSceneState.ts` | Zustand store — single source of truth |
| `app/components/scene/` | Three.js scene: block tower, orbs, camera, star field |
| `app/components/ui/` | Overlay UI: stats bar, live feed, search, transaction panel |
