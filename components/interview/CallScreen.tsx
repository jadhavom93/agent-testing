"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  RoomAudioRenderer,
  RoomContext,
  useIsSpeaking,
  useRemoteParticipants,
} from "@livekit/components-react";
import { Room, RoomEvent, Track } from "livekit-client";
import type {
  LocalTrackPublication,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
} from "livekit-client";
import { ArrowLeftRight, PhoneOff } from "lucide-react";
import { motion } from "framer-motion";
import { ParticipantTile } from "./ParticipantTile";

interface Connection {
  serverUrl: string;
  token: string;
  roomName: string;
}

interface CallScreenProps {
  recruiter: Connection;
  tester: Omit<Connection, "roomName">;
  agentDisplayName: string;
  onEnded: () => void;
}

type Stage = "connecting-tester" | "waiting-tester" | "connecting-recruiter" | "live";

const TESTER_READY_TIMEOUT_MS = 45_000;

type Relay = ReturnType<typeof createRelay>;

// A relay is the mic track this browser publishes into one room to carry the
// *other* room's agent voice. It's published before any real audio exists,
// so the receiving agent is already subscribed when the other agent speaks —
// nothing new to publish or subscribe to mid-sentence, so no clipped words.
//
// The outgoing track is a Web Audio MediaStreamDestination, not the
// forwarded remote track itself. A remote track goes "muted" whenever its
// agent stops sending between turns, and LiveKit pauses a muted local
// track's upstream after a few seconds — which would clip the start of the
// next turn. A destination track stays live and silent between turns.
function createRelay(ctx: AudioContext) {
  const destination = ctx.createMediaStreamDestination();
  const sources = new Map<string, { node: MediaStreamAudioSourceNode; keepAlive: HTMLAudioElement }>();

  const remove = (id: string) => {
    const source = sources.get(id);
    if (!source) return;
    source.node.disconnect();
    source.keepAlive.srcObject = null;
    sources.delete(id);
  };

  return {
    track: destination.stream.getAudioTracks()[0],
    add(id: string, remote: MediaStreamTrack) {
      if (sources.has(id)) return;
      const stream = new MediaStream([remote]);
      // Chrome only feeds a remote WebRTC track into Web Audio while that
      // track is also attached to a media element; a muted one is enough.
      const keepAlive = new Audio();
      keepAlive.muted = true;
      keepAlive.srcObject = stream;
      void keepAlive.play().catch(() => {});
      const node = ctx.createMediaStreamSource(stream);
      node.connect(destination);
      sources.set(id, { node, keepAlive });
    },
    remove,
    close() {
      Array.from(sources.keys()).forEach(remove);
    },
  };
}

// Feeds every remote audio track in `from` into `relay`. In each room the
// only remote participant is that room's agent (this browser is local), so
// exactly one agent's voice crosses over, and our own relay never loops
// back into itself.
function carryAgentAudio(from: Room, relay: Relay) {
  const onSubscribed = (track: RemoteTrack, publication: RemoteTrackPublication) => {
    if (track.kind === Track.Kind.Audio) relay.add(publication.trackSid, track.mediaStreamTrack);
  };
  const onUnsubscribed = (_track: RemoteTrack, publication: RemoteTrackPublication) => {
    relay.remove(publication.trackSid);
  };

  from.on(RoomEvent.TrackSubscribed, onSubscribed);
  from.on(RoomEvent.TrackUnsubscribed, onUnsubscribed);
  from.remoteParticipants.forEach((participant) => {
    participant.trackPublications.forEach((publication) => {
      if (publication.track && publication.isSubscribed) onSubscribed(publication.track, publication);
    });
  });

  return () => {
    from.off(RoomEvent.TrackSubscribed, onSubscribed);
    from.off(RoomEvent.TrackUnsubscribed, onUnsubscribed);
  };
}

// Published as the Microphone source because voice agents listen to a
// participant's mic — to each agent this looks like a normal person talking.
// dtx off keeps packets flowing through silence, so the receiving side
// doesn't see our track go quiet/muted between turns either.
function publishRelay(room: Room, relay: Relay, name: string) {
  return room.localParticipant.publishTrack(relay.track, {
    source: Track.Source.Microphone,
    name,
    dtx: false,
  });
}

// Resolves once someone in `room` subscribes to our mic relay. In the test
// room the only other participant is the test agent, so this is the real
// "ready to hear" signal — joining the room alone isn't.
function waitForRelaySubscriber(room: Room, timeoutMs: number) {
  let cleanup = () => {};
  const promise = new Promise<void>((resolve, reject) => {
    const onSubscribed = (publication: LocalTrackPublication) => {
      if (publication.source !== Track.Source.Microphone) return;
      cleanup();
      resolve();
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(
        new Error(
          room.remoteParticipants.size > 0
            ? "The test agent joined but never started listening to the relayed audio."
            : "The test agent never joined its room."
        )
      );
    }, timeoutMs);
    cleanup = () => {
      window.clearTimeout(timer);
      room.off(RoomEvent.LocalTrackSubscribed, onSubscribed);
    };
    // Attached before the relay is published, so an early subscription
    // can't slip past.
    room.on(RoomEvent.LocalTrackSubscribed, onSubscribed);
  });
  return { promise, cancel: () => cleanup() };
}

const STAGE_TEXT: Record<Stage, string> = {
  "connecting-tester": "Connecting to the test agent…",
  "waiting-tester": "Waiting for the test agent to start listening…",
  "connecting-recruiter": "Test agent is listening. Bringing in the interviewer…",
  live: "Live — both agents are connected.",
};

export function CallScreen({ recruiter, tester, agentDisplayName, onEnded }: CallScreenProps) {
  const [stage, setStage] = useState<Stage>("connecting-tester");
  const [testerRoom, setTesterRoom] = useState<Room | null>(null);
  const [recruiterRoom, setRecruiterRoom] = useState<Room | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);

  const onEndedRef = useRef(onEnded);
  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  const finishRef = useRef<() => void>(() => {});

  useEffect(() => {
    let active = true;
    // Created right after the Start click, so autoplay policy allows it.
    const ctx = new AudioContext();
    void ctx.resume().catch(() => {});
    const intoTester = createRelay(ctx); // interviewer's voice → test room
    const intoRecruiter = createRelay(ctx); // test agent's voice → interviewer room
    const testRoom = new Room();
    const interviewRoom = new Room();
    const cleanups: Array<() => void> = [];

    const teardown = () => {
      cleanups.splice(0).forEach((cleanup) => cleanup());
      intoTester.close();
      intoRecruiter.close();
      void testRoom.disconnect();
      void interviewRoom.disconnect();
      void ctx.close().catch(() => {});
    };

    // One session ends when either side ends (End button, or either room
    // disconnecting on its own) — then everything goes down together.
    const finish = () => {
      if (!active) return;
      active = false;
      teardown();
      onEndedRef.current();
    };
    finishRef.current = finish;

    testRoom.on(RoomEvent.Disconnected, finish);
    interviewRoom.on(RoomEvent.Disconnected, finish);

    // The AI recruiter leaving its room means the interview is over (it
    // leaves after its exit message). End the whole session then: both
    // rooms disconnect — which also releases the test agent — and the UI
    // moves to the completion screen.
    const onInterviewParticipantLeft = (participant: RemoteParticipant) => {
      if (participant.isAgent) finish();
    };
    interviewRoom.on(RoomEvent.ParticipantDisconnected, onInterviewParticipantLeft);

    // Wired up front; audio only flows once each room's agent is subscribed.
    cleanups.push(
      carryAgentAudio(testRoom, intoRecruiter),
      carryAgentAudio(interviewRoom, intoTester)
    );

    const run = async () => {
      // 1. Test room first. The test agent was already dispatched by the
      //    token route.
      await testRoom.connect(tester.serverUrl, tester.token);
      if (!active) return;
      setTesterRoom(testRoom);
      setStage("waiting-tester");

      // 2. Publish the relay that will carry the interviewer's voice, and
      //    wait until the test agent has subscribed to it.
      const subscribed = waitForRelaySubscriber(testRoom, TESTER_READY_TIMEOUT_MS);
      cleanups.push(subscribed.cancel);
      await publishRelay(testRoom, intoTester, "relay-from-interviewer");
      await subscribed.promise;
      if (!active) return;

      // 3. Interviewer room. Its relay is published before the agent is
      //    dispatched, so the agent finds a "candidate" mic already there.
      setStage("connecting-recruiter");
      await interviewRoom.connect(recruiter.serverUrl, recruiter.token);
      if (!active) return;
      await publishRelay(interviewRoom, intoRecruiter, "relay-from-test-agent");
      if (!active) return;
      setRecruiterRoom(interviewRoom);

      // 4. Only now dispatch the interviewer, so its intro can't start
      //    before the test agent is listening.
      const res = await fetch("/api/livekit/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomName: recruiter.roomName }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not dispatch the AI Recruiter agent.");
      if (!active) return;
      setStage("live");
    };

    run().catch((err) => {
      if (!active) return;
      console.error("[call] session setup failed", err);
      setError(err instanceof Error ? err.message : "Could not start the session.");
    });

    // Also covers React Strict Mode's mount → unmount → mount in dev: the
    // first attempt is torn down silently (listeners removed before
    // disconnecting, and every step checks `active`), so it never dispatches
    // the interviewer or ends the session.
    return () => {
      active = false;
      testRoom.off(RoomEvent.Disconnected, finish);
      interviewRoom.off(RoomEvent.Disconnected, finish);
      interviewRoom.off(RoomEvent.ParticipantDisconnected, onInterviewParticipantLeft);
      teardown();
    };
  }, [recruiter.serverUrl, recruiter.token, recruiter.roomName, tester.serverUrl, tester.token]);

  const endCall = useCallback(() => {
    setEnding(true);
    finishRef.current();
  }, []);

  const recruiterPendingText = error
    ? "Not started"
    : stage === "connecting-recruiter"
      ? "Connecting…"
      : "Starts once the test agent is listening";

  return (
    <div className="flex flex-1 flex-col items-center justify-between px-6 py-10 sm:px-10">
      <div className="flex flex-1 flex-col items-center justify-center gap-10 sm:flex-row sm:gap-16">
        {/* Each provider scopes the hooks (and speaker output) to its own
            room: each RoomAudioRenderer plays that room's agent, so both
            agents come out of this device's speaker. */}
        {recruiterRoom ? (
          <RoomContext.Provider value={recruiterRoom}>
            <RoomAudioRenderer />
            <AgentSlot
              label={agentDisplayName}
              sublabel="AI Recruiter"
              waitingText={error ? "Not started" : "Being dispatched…"}
              accent="agent"
            />
          </RoomContext.Provider>
        ) : (
          <ParticipantTile
            label={agentDisplayName}
            sublabel={recruiterPendingText}
            speaking={false}
            accent="agent"
            avatarInitial={agentDisplayName.charAt(0).toUpperCase()}
          />
        )}

        <BridgeIndicator />

        {testerRoom ? (
          <RoomContext.Provider value={testerRoom}>
            <RoomAudioRenderer />
            <AgentSlot
              label="Test agent"
              sublabel={stage === "waiting-tester" ? "Getting ready to listen…" : "livekit-agent-testing"}
              waitingText={error ? "Not connected" : "Waiting to join…"}
              accent="candidate"
            />
          </RoomContext.Provider>
        ) : (
          <ParticipantTile
            label="Test agent"
            sublabel={error ? "Not connected" : "Connecting…"}
            speaking={false}
            accent="candidate"
            avatarInitial="T"
          />
        )}
      </div>

      {error ? (
        <p className="mt-6 max-w-md rounded-xl bg-red-500/10 px-4 py-2 text-center text-xs text-red-300">
          {error}
        </p>
      ) : (
        <p className="mt-6 text-center text-xs text-white/50">{STAGE_TEXT[stage]}</p>
      )}

      <div className="mt-8 flex items-center gap-5">
        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={endCall}
          disabled={ending}
          className="flex h-14 items-center gap-2 rounded-full bg-red-500 px-6 font-medium text-white shadow-lg shadow-red-500/30 transition-opacity disabled:opacity-60"
        >
          <PhoneOff className="h-5 w-5" />
          End session
        </motion.button>
      </div>
    </div>
  );
}

function BridgeIndicator() {
  return (
    <div className="glass-panel flex h-10 w-10 items-center justify-center rounded-full text-white/50">
      <ArrowLeftRight className="h-4 w-4 rotate-90 sm:rotate-0" />
    </div>
  );
}

// Must render inside a RoomContext.Provider. In each room the only remote
// participant is that room's agent.
function AgentSlot({
  label,
  sublabel,
  waitingText,
  accent,
}: {
  label: string;
  sublabel: string;
  waitingText: string;
  accent: "agent" | "candidate";
}) {
  const agent = useRemoteParticipants()[0];

  if (!agent) {
    return (
      <ParticipantTile
        label={label}
        sublabel={waitingText}
        speaking={false}
        accent={accent}
        avatarInitial={label.charAt(0).toUpperCase()}
      />
    );
  }
  return <SpeakingAgentTile participant={agent} label={label} sublabel={sublabel} accent={accent} />;
}

// useIsSpeaking throws if it's handed `undefined`, so this only mounts once
// the participant actually exists.
function SpeakingAgentTile({
  participant,
  label,
  sublabel,
  accent,
}: {
  participant: RemoteParticipant;
  label: string;
  sublabel: string;
  accent: "agent" | "candidate";
}) {
  const speaking = useIsSpeaking(participant);
  return (
    <ParticipantTile
      label={label}
      sublabel={sublabel}
      speaking={speaking}
      accent={accent}
      avatarInitial={label.charAt(0).toUpperCase()}
    />
  );
}
