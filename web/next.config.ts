import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js 16 dev server refuses to fully serve cross-origin browsers
  // (anything other than the localhost it's bound to) unless the origin is
  // listed here. Without this, Cloudflare tunnel or LAN-IP access works for
  // the HTML shell but client JS modules never finish initialising — pages
  // get stuck in the loading state because useEffect never runs the fetches.
  //
  // The trycloudflare.com glob covers our quick-tunnel demo URLs (which
  // change on every restart). LAN access via 192.168.* is included so the
  // demo also works from a phone on the same Wi-Fi.
  //
  // No effect in production builds — this is a dev-server-only setting.
  allowedDevOrigins: [
    "*.trycloudflare.com",
    "192.168.*.*",
    "127.0.0.1",
    "localhost",
  ],
};

export default nextConfig;
