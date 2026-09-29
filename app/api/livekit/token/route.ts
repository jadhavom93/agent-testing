import { NextRequest, NextResponse } from "next/server";
import { AccessToken, AgentDispatchClient, RoomServiceClient } from "livekit-server-sdk";
import { getLiveKitEnv, generateRoomName } from "@/lib/livekit/config";
import type { TokenRequestBody, TokenResponse } from "@/lib/types";

export async function POST(request: NextRequest) {
  const env = getLiveKitEnv();
  if (!env) {
    return NextResponse.json(
      {
        error:
          "LiveKit isn't configured yet. Set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET in .env.local.",
      },
      { status: 500 }
    );
  }

  // The ai-recruiter agent registers with an `agent_name` (see agent.yaml),
  // which puts it in *explicit* dispatch mode: LiveKit never auto-joins it
  // to a room just because the room exists. Something has to explicitly
  // request that agent per room (below) - this was the missing piece, which
  // is why room/token setup "worked" but no agent ever showed up.
  const agentName = process.env.LIVEKIT_AGENT_NAME;
  if (!agentName) {
    return NextResponse.json(
      {
        error:
          "LIVEKIT_AGENT_NAME isn't configured. Set it in .env.local to the agent_name the AI Recruiter worker was deployed with (e.g. ai-recruiter-dev), so the room can explicitly dispatch it.",
      },
      { status: 500 }
    );
  }

  const body = (await request.json()) as TokenRequestBody;
  const {
    candidateId,
    jobId,
    pipelineId,
    persona,
    language,
    candidateName,
    jobName,
    clientName,
    roomName: requestedRoomName,
  } = body;

  if (!candidateId || !jobId) {
    return NextResponse.json(
      { error: "candidateId and jobId are required" },
      { status: 400 }
    );
  }

  // Resume passes back the room it was already in; a fresh start gets a new,
  // uniquely-timestamped room so a lingering identity from a previous
  // session can never collide with this one.
  const roomName = requestedRoomName ?? generateRoomName(jobId, candidateId);
  const roomMetadata = JSON.stringify({
    persona: persona ?? "default",
    language: language ?? "en-US",
  });

  // RoomServiceClient talks to LiveKit's HTTP API, not the ws:// media URL.
  const httpUrl = env.url.replace(/^ws/, "http");
  const roomService = new RoomServiceClient(httpUrl, env.apiKey, env.apiSecret);

  try {
    await roomService.createRoom({
      name: roomName,
      metadata: roomMetadata,
      emptyTimeout: 60 * 15,
    });
  } catch (err) {
    // Most likely the room already exists (a "resume" case) — keep its
    // metadata current instead of failing the request.
    try {
      await roomService.updateRoomMetadata(roomName, roomMetadata);
    } catch (metaErr) {
      console.error("[livekit/token] could not create or update room", err, metaErr);
    }
  }

  // Explicit dispatch, covering both the fresh-room and resume paths above:
  // ask LiveKit to send the named agent into this room. Without this call
  // the agent worker is never assigned a job for it, no matter how the room
  // itself was created or updated.
  const agentDispatch = new AgentDispatchClient(httpUrl, env.apiKey, env.apiSecret);
  try {
    await agentDispatch.createDispatch(roomName, agentName);
  } catch (err) {
    console.error("[livekit/token] could not dispatch agent", err);
    return NextResponse.json(
      { error: "Could not dispatch the AI Recruiter agent to the room." },
      { status: 502 }
    );
  }

  // Keys here must match exactly what agent.yaml's `prompt.template_vars`
  // and `flow` sections read from `participant.attributes.*` (casing
  // included - the agent config mixes camelCase and snake_case).
  const at = new AccessToken(env.apiKey, env.apiSecret, {
    identity: candidateId,
    name: candidateName ?? candidateId,
    attributes: {
      persona: persona ?? "",
      candidateName: candidateName ?? "",
      jobName: jobName ?? "",
      clientName: clientName ?? "",
      pipeline_id: pipelineId ?? "",
      candidate_id: candidateId,
      job_id: jobId,
    },
  });

  at.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
  });

  const token = await at.toJwt();

  const response: TokenResponse = {
    token,
    serverUrl: env.url,
    roomName,
  };

  return NextResponse.json(response);
}
