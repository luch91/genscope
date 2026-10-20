// Colors
export const COLORS = {
  background: "#080810",
  neonGreen: "#00FF88",
  gold: "#FFD700",
  blockEmpty: "#30334d",
  blockStandard: "#245b9e",
  blockIntelligent: "#6b2f91",
  blockMixed: "#285f83",
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
// Keep enough negative space between slabs for edge glow and drop animations.
// The former 80px-in-world gap visually collapsed once bloom was applied.
export const BLOCK_GAP = 0.22;
export const BLOCK_STEP = BLOCK_HEIGHT + BLOCK_GAP;
// The store retains a much larger navigable history. The scene deliberately
// presents a stable subset so hydration never forces the camera to zoom out.
export const SCENE_VISIBLE_BLOCKS_DESKTOP = 14;
export const SCENE_VISIBLE_BLOCKS_MOBILE = 12;
// One shader-based grid spans the scene; increasing this footprint does not
// create additional meshes or geometry subdivisions.
export const GRID_SIZE = 160;
export const GRID_CELL_SIZE = 1;
export const GRID_FADE_DISTANCE = 78;
export const GRID_FLOOR_CLEARANCE = 0.14;
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
export const BLOCK_POLL_INTERVAL = 1000;
export const HIDDEN_BLOCK_POLL_INTERVAL = 15000;
export const MAX_BLOCK_POLL_BACKOFF = 30000;
export const SYNC_POLL_INTERVAL = 30000;

// RPC — all calls go through the local Next.js proxy to avoid browser network issues
export const RPC_URL = "/api/rpc";
export const INITIAL_BLOCK_FETCH = 20;

// Star Field
export const STAR_COUNT = 2000;
export const STAR_SPREAD = 200;
