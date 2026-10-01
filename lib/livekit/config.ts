export function getLiveKitEnv() {
  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!url || !apiKey || !apiSecret) {
    return null;
  }

  return { url, apiKey, apiSecret };
}

// Credentials for the *second* LiveKit project, where the
// livekit-agent-testing worker is registered. Rooms are scoped to a single
// project, so the test agent can only be dispatched into a room created
// with these credentials, never into the recruiter project's room.
export function getTestLiveKitEnv() {
  const url = process.env.LIVEKIT_TEST_URL;
  const apiKey = process.env.LIVEKIT_TEST_API_KEY;
  const apiSecret = process.env.LIVEKIT_TEST_API_SECRET;

  if (!url || !apiKey || !apiSecret) {
    return null;
  }

  return { url, apiKey, apiSecret };
}

export function generateRoomName(jobId: string, candidateId: string) {
  const safe = (value: string) =>
    value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  // Optional run key (LIVEKIT_ROOM_KEY), put first so every room from one
  // test run shares a prefix — filter by it in the LiveKit dashboard or
  // when listing rooms/sessions. Unset = no prefix, same names as before.
  const key = process.env.LIVEKIT_ROOM_KEY?.trim();
  const prefix = key ? `${safe(key)}-` : "";
  // Timestamped so the same candidate+job never collides with a previous
  // (possibly still-lingering) session under the same room name. This means
  // the frontend can no longer derive a "resume" room on its own — the
  // backend must hand back the roomName to rejoin (see AirInfoResponse).
  // Random suffix: under load, two sessions for the same job+candidate can
  // start in the same millisecond.
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${prefix}interview-${safe(jobId)}-${safe(candidateId)}-${Date.now()}-${suffix}`;
}
