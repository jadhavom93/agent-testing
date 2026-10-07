export type InterviewStatus = "start" | "resume";

// "auto": the test agent plays the candidate and the browser only listens
// (two rooms, audio bridged). "manual": you are the candidate, with your own
// mic and camera, in a single room with the interviewer.
export type InterviewMode = "auto" | "manual";

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
  introMessage?: string;
  exitMessage?: string;
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
  introMessage?: string;
  exitMessage?: string;
  persona?: string;
  language?: string;
  candidateName?: string;
  jobName?: string;
  clientName?: string;
  // Pass this on resume to rejoin the same room. Omit it to start a fresh,
  // uniquely-named room.
  roomName?: string;
  // Defaults to "auto" when omitted.
  mode?: InterviewMode;
}

export interface RoomConnection {
  token: string;
  serverUrl: string;
  roomName: string;
}

// Top-level fields are the recruiter project's room (unchanged shape).
// `test` is the matching room in the testing project — only present in
// "auto" mode, where the browser joins both rooms and bridges audio.
export interface TokenResponse extends RoomConnection {
  mode: InterviewMode;
  test?: RoomConnection;
}
