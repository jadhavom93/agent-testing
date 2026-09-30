import { NextRequest, NextResponse } from "next/server";
import type { AirInfoResponse } from "@/lib/types";

const AIR_INFO_BASE_URL = process.env.AIR_INFO_BASE_URL;
const AIR_INFO_API_KEY = process.env.AIR_INFO_API_KEY;

export async function GET(request: NextRequest) {
  const candidateId = request.nextUrl.searchParams.get("candidateId");
  const jobId = request.nextUrl.searchParams.get("jobId");

  if (!candidateId || !jobId) {
    return NextResponse.json(
      { error: "candidateId and jobId are required query params" },
      { status: 400 }
    );
  }

  if (!AIR_INFO_BASE_URL) {
    // No dev backend configured yet — return a mocked response so the UI
    // can be exercised end to end. Set AIR_INFO_BASE_URL in .env.local and
    // swap in the real call below once the real contract is confirmed.
    const mocked: AirInfoResponse = {
      status: "start",
      persona: "Ava",
      language: "English",
      candidateName: "Test Candidate",
      jobName: "Test Job",
      clientName: "Test Client",
      agentName: "Ava · AI Recruiter",
      pipelineId: "mock-pipeline-id",
      // roomName is intentionally omitted here — a real "resume" response
      // from the dev backend needs to include the room it should rejoin.
    };
    return NextResponse.json(mocked);
  }

  try {
    const upstream = new URL("/air/info", AIR_INFO_BASE_URL);
    upstream.searchParams.set("candidateId", candidateId);
    upstream.searchParams.set("jobId", jobId);

    const res = await fetch(upstream, {
      cache: "no-store",
      headers: AIR_INFO_API_KEY
        ? { "X-API-Key": AIR_INFO_API_KEY }
        : undefined,
    });
    if (!res.ok) {
      throw new Error(`Upstream /air/info responded ${res.status}`);
    }

    // The real /air/info wraps its data as { status, message, payload }, with
    // the fields the UI needs nested inside payload (candidateDetails /
    // jobDetails), not flat like AirInfoResponse — unwrap and map them here
    // once, rather than at every call site.
    const upstreamBody = (await res.json()) as {
      payload?: {
        pipelineId?: string;
        sessionContext?: string;
        interviewer_persona?: string;
        candidateDetails?: { candidateName?: string };
        jobDetails?: {
          jobName?: string;
          clientName?: string;
          jobApplicationMetadata?: {
            // See INTERVIEW_ACCESS_STATE in webhook-ternity's
            // screeningHelperConst.js: "fresh" (start/retake), "resume",
            // "inProgress" (active elsewhere), or "lock" (not attemptable).
            attemptPermit?: "fresh" | "resume" | "inProgress" | "lock";
            // Language name, e.g. "German" (not a locale code).
            interviewLang?: string;
            comments?: string;
          };
        };
      };
    };
    const payload = upstreamBody.payload ?? {};
    const attemptPermit =
      payload.jobDetails?.jobApplicationMetadata?.attemptPermit;

    // Locked (already completed / not attemptable) isn't a start/resume
    // state at all — surface it as an error so the existing infoError UI
    // blocks the candidate from beginning, instead of forcing it into
    // AirInfoResponse's start|resume shape.
    if (attemptPermit === "lock") {
      return NextResponse.json(
        {
          error:
            payload.jobDetails?.jobApplicationMetadata?.comments ??
            "This interview is not available.",
        },
        { status: 403 }
      );
    }

    // "resume" and "inProgress" (already started, active elsewhere) both
    // mean the candidate should continue rather than begin fresh; "fresh"
    // (covers both a first attempt and an allowed retake) means start.
    const status: AirInfoResponse["status"] =
      attemptPermit === "resume" || attemptPermit === "inProgress"
        ? "resume"
        : "start";

    const data: AirInfoResponse = {
      status,
      persona: payload.interviewer_persona,
      language: payload.jobDetails?.jobApplicationMetadata?.interviewLang,
      candidateName: payload.candidateDetails?.candidateName,
      jobName: payload.jobDetails?.jobName,
      clientName: payload.jobDetails?.clientName,
      pipelineId: payload.pipelineId,
      sessionContext: payload.sessionContext,
    };
    return NextResponse.json(data);
  } catch (err) {
    console.error("[air-info] upstream call failed", err);
    return NextResponse.json(
      { error: "Failed to reach the /air/info dev backend" },
      { status: 502 }
    );
  }
}
