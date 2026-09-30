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
  // Timestamped so the same candidate+job never collides with a previous
  // (possibly still-lingering) session under the same room name. This means
  // the frontend can no longer derive a "resume" room on its own — the
  // backend must hand back the roomName to rejoin (see AirInfoResponse).
  return `interview-${safe(jobId)}-${safe(candidateId)}-${Date.now()}`;
}
