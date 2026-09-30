export type InterviewStatus = "start" | "resume";

export interface AirInfoResponse {
  status: InterviewStatus;
  persona?: string;
  language?: string;
  candidateName?: string;
  jobName?: string;
  clientName?: string;
  agentName?: string;
  // Needed by /api/livekit/token so it can be set as the participant's
  // pipeline_id attribute - that's what agent.yaml's air-start flow reads.
  pipelineId?: string;
  // Opaque encrypted token from /air/info, passed through untouched to the
  // interviewer agent as the `sessionContext` participant attribute.
  sessionContext?: string;
  // Only meaningful on "resume" — the room to rejoin. Room names are now
  // timestamped per session, so the frontend has no way to derive this on
  // its own; the real /air/info backend must return it for resume to work.
  roomName?: string;
}

export interface TokenRequestBody {
  candidateId: string;
  jobId: string;
  pipelineId?: string;
  sessionContext?: string;
  persona?: string;
  language?: string;
  candidateName?: string;
  jobName?: string;
  clientName?: string;
  // Pass this on resume to rejoin the same room. Omit it to start a fresh,
  // uniquely-named room.
  roomName?: string;
}

export interface RoomConnection {
  token: string;
  serverUrl: string;
  roomName: string;
}

// Top-level fields are the recruiter project's room (unchanged shape);
// `test` is the matching room in the livekit-agent-testing project. The
// browser joins both and bridges audio between them.
export interface TokenResponse extends RoomConnection {
  test: RoomConnection;
}
