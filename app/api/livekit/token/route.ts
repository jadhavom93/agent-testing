import { NextRequest, NextResponse } from "next/server";
import { AccessToken, AgentDispatchClient, RoomServiceClient } from "livekit-server-sdk";
import { getLiveKitEnv, getTestLiveKitEnv, generateRoomName } from "@/lib/livekit/config";
import type { TokenRequestBody, TokenResponse } from "@/lib/types";

type LiveKitEnv = { url: string; apiKey: string; apiSecret: string };

// RoomServiceClient / AgentDispatchClient talk to LiveKit's HTTP API, not the
// ws:// media URL.
const toHttp = (url: string) => url.replace(/^ws/, "http");

async function ensureRoom(env: LiveKitEnv, roomName: string, metadata: string) {
  const roomService = new RoomServiceClient(toHttp(env.url), env.apiKey, env.apiSecret);
  try {
    await roomService.createRoom({ name: roomName, metadata, emptyTimeout: 60 * 15 });
  } catch (err) {
    // Most likely the room already exists (a "resume" case) — keep its
    // metadata current instead of failing the request.
    try {
      await roomService.updateRoomMetadata(roomName, metadata);
    } catch (metaErr) {
      console.error("[livekit/token] could not create or update room", roomName, err, metaErr);
    }
  }
}

async function dispatchAgent(env: LiveKitEnv, roomName: string, agentName: string) {
  const client = new AgentDispatchClient(toHttp(env.url), env.apiKey, env.apiSecret);
  await client.createDispatch(roomName, agentName);
}

async function mintToken(
  env: LiveKitEnv,
  roomName: string,
  identity: string,
  name: string,
  attributes: Record<string, string>
) {
  const at = new AccessToken(env.apiKey, env.apiSecret, { identity, name, attributes });
  at.addGrant({
    room: roomName,
    roomJoin: true,
    // Must stay true: the browser republishes the *other* agent's audio into
    // each room as its own mic track (see CallScreen's bridgeAudio).
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
  });
  return at.toJwt();
}

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
  // Validated here so a misconfig fails at start, not halfway through the
  // session — the actual dispatch happens in /api/livekit/dispatch.
  if (!process.env.LIVEKIT_AGENT_NAME) {
    return NextResponse.json(
      {
        error:
          "LIVEKIT_AGENT_NAME isn't configured. Set it in .env.local to the agent_name the AI Recruiter worker was deployed with (e.g. ai-recruiter-dev), so the room can explicitly dispatch it.",
      },
      { status: 500 }
    );
  }

  // The test agent lives in a *different* LiveKit project, and a room only
  // exists inside one project — so it gets its own room there, created and
  // dispatched with that project's credentials.
  const testEnv = getTestLiveKitEnv();
  if (!testEnv) {
    return NextResponse.json(
      {
        error:
          "The testing LiveKit project isn't configured. Set LIVEKIT_TEST_URL, LIVEKIT_TEST_API_KEY and LIVEKIT_TEST_API_SECRET in .env.local.",
      },
      { status: 500 }
    );
  }
  const testAgentName = process.env.LIVEKIT_TEST_AGENT_NAME || "agent-testing";

  const body = (await request.json()) as TokenRequestBody;
  const {
    candidateId,
    jobId,
    pipelineId,
    sessionContext,
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
  // session can never collide with this one. The same name is reused in the
  // testing project — different projects, so no collision.
  const roomName = requestedRoomName ?? generateRoomName(jobId, candidateId);
  const roomMetadata = JSON.stringify({
    persona: persona ?? "default",
    language: language ?? "English",
  });

  await Promise.all([
    ensureRoom(env, roomName, roomMetadata),
    ensureRoom(testEnv, roomName, roomMetadata),
  ]);

  // Only the test agent is dispatched here. The interviewer is dispatched
  // later by /api/livekit/dispatch, which the browser calls only once the
  // test agent is actually subscribed to the relay track — so the
  // interviewer's intro can never start before someone is listening.
  try {
    await dispatchAgent(testEnv, roomName, testAgentName);
  } catch (err) {
    console.error("[livekit/token] could not dispatch test agent", err);
    return NextResponse.json(
      { error: `Could not dispatch ${testAgentName} in the testing project.` },
      { status: 502 }
    );
  }

  // Keys here must match exactly what agent.yaml's `prompt.template_vars`
  // and `flow` sections read from `participant.attributes.*` (casing
  // included - the agent config mixes camelCase and snake_case).
  const attributes = {
    persona: persona ?? "",
    candidateName: candidateName ?? "",
    jobName: jobName ?? "",
    clientName: clientName ?? "",
    pipeline_id: pipelineId ?? "",
    // agent.yaml reads participant.attributes.interviewLang — the room
    // metadata's `language` alone never reached the agent.
    interviewLang: language ?? "English",
    // Recruiter room only — deliberately not in testAttributes below, so
    // the test agent's project never receives it.
    sessionContext: sessionContext ?? "",
    candidate_id: candidateId,
    job_id: jobId,
  };

  // In the recruiter room, the browser stands in for the candidate (it
  // carries the test agent's voice), so it keeps the candidate identity and
  // attributes. In the testing room it stands in for the recruiter (it
  // carries the recruiter's voice).
  //
  // The test agent's config reads exactly these two (its
  // `template_vars`): candidate_name <- attributes.candidateName,
  // interview_language <- attributes.interviewLang. Same default language
  // as the room metadata above, so both sides agree.
  const testAttributes = {
    candidateName: candidateName ?? "",
    interviewLang: language ?? "English",
  };

  const [recruiterToken, testToken] = await Promise.all([
    mintToken(env, roomName, candidateId, candidateName ?? candidateId, attributes),
    mintToken(testEnv, roomName, `recruiter-bridge-${candidateId}`, "AI Recruiter (bridged)", testAttributes),
  ]);

  const response: TokenResponse = {
    token: recruiterToken,
    serverUrl: env.url,
    roomName,
    test: {
      token: testToken,
      serverUrl: testEnv.url,
      roomName,
    },
  };

  return NextResponse.json(response);
}
