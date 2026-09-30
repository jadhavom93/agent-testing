import { NextRequest, NextResponse } from "next/server";
import { AgentDispatchClient } from "livekit-server-sdk";
import { getLiveKitEnv } from "@/lib/livekit/config";

// Dispatches the interviewer (ai-recruiter) agent into its room. Called by
// the browser only after the test agent has subscribed to the relay track
// that will carry the interviewer's voice — see CallScreen. Dispatching any
// earlier would let the intro start before the test agent can hear it.
export async function POST(request: NextRequest) {
  const env = getLiveKitEnv();
  const agentName = process.env.LIVEKIT_AGENT_NAME;
  if (!env || !agentName) {
    return NextResponse.json(
      { error: "LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET / LIVEKIT_AGENT_NAME must be set in .env.local." },
      { status: 500 }
    );
  }

  const { roomName } = (await request.json()) as { roomName?: string };
  if (!roomName) {
    return NextResponse.json({ error: "roomName is required" }, { status: 400 });
  }

  // AgentDispatchClient talks to LiveKit's HTTP API, not the ws:// media URL.
  const httpUrl = env.url.replace(/^ws/, "http");
  try {
    await new AgentDispatchClient(httpUrl, env.apiKey, env.apiSecret).createDispatch(
      roomName,
      agentName
    );
  } catch (err) {
    console.error("[livekit/dispatch] could not dispatch recruiter agent", err);
    return NextResponse.json(
      { error: "Could not dispatch the AI Recruiter agent to the room." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
