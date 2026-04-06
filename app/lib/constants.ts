// Colors
export const COLORS = {
  background: "#080810",
  neonGreen: "#00FF88",
  gold: "#FFD700",
  blockEmpty: "#2a2a3a",
  blockStandard: "#1a3a6a",
  blockIntelligent: "#4a1a6a",
  blockMixed: "#2a3a6a",
  blockEdgeGlow: "#00FF88",
  orbStandard: "#4488ff",
  orbIntelligent: "#FFD700",
  statusPending: "#FFD700",
  statusAccepted: "#4488ff",
  statusFinalized: "#00FF88",
  statusCanceled: "#ff4444",
  statusUninitialized: "#888888",
};

// Block Tower
export const BLOCK_WIDTH = 2.5;
export const BLOCK_HEIGHT = 0.5;
export const BLOCK_DEPTH = 2.5;
export const BLOCK_GAP = 0.08;
export const BLOCK_STEP = BLOCK_HEIGHT + BLOCK_GAP;
export const MAX_VISIBLE_BLOCKS = 100;
export const OLDER_BLOCKS_FETCH = 20;

// Transaction Orbs
export const ORB_RADIUS_STANDARD = 0.12;
export const ORB_RADIUS_INTELLIGENT = 0.18;
export const ORBIT_RADIUS_BASE = 2.0;
export const ORBIT_RADIUS_STEP = 0.6;

// Animation
export const BOUNCE_DURATION = 600; // ms
export const GLOW_DURATION = 2000; // ms
export const PULSE_SPEED = 1.5; // seconds per cycle
export const CAMERA_TRANSITION_DURATION = 1.2; // seconds

// Polling
export const BLOCK_POLL_INTERVAL = 5000; // ms
export const SYNC_POLL_INTERVAL = 10000; // ms

// RPC — all calls go through the local Next.js proxy to avoid browser network issues
export const RPC_URL = "/api/rpc";
export const INITIAL_BLOCK_FETCH = 20;

// Star Field
export const STAR_COUNT = 2000;
export const STAR_SPREAD = 200;
