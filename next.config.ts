import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Transpile Three.js and related packages
  transpilePackages: [
    "three",
    "@react-three/fiber",
    "@react-three/drei",
    "@react-three/postprocessing",
    "postprocessing",
  ],
};

export default nextConfig;
