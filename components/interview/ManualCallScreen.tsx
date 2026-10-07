"use client";

import { useCallback, useEffect, useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  useIsSpeaking,
  useLocalParticipant,
  useRemoteParticipants,
  useRoomContext,
  useTracks,
} from "@livekit/components-react";
import { RoomEvent, Track } from "livekit-client";
import type { RemoteParticipant } from "livekit-client";
import { Mic, MicOff, PhoneOff } from "lucide-react";
import { motion } from "framer-motion";
import { ParticipantTile } from "./ParticipantTile";

interface ManualCallScreenProps {
  serverUrl: string;
  token: string;
  agentDisplayName: string;
  onEnded: () => void;
}

// Manual mode: you are the candidate. One room with the interviewer, your
// real mic and camera published (`audio video`), the interviewer's audio
// played on your speaker.
export function ManualCallScreen({
  serverUrl,
  token,
  agentDisplayName,
  onEnded,
}: ManualCallScreenProps) {
  return (
    <LiveKitRoom
      serverUrl={serverUrl}
      token={token}
      connect
      audio
      video
      onDisconnected={onEnded}
      className="flex h-full flex-1 flex-col"
    >
      <RoomAudioRenderer />
      <ManualCallInner agentDisplayName={agentDisplayName} onEnded={onEnded} />
    </LiveKitRoom>
  );
}

// useIsSpeaking throws if it's handed `undefined`, and the agent isn't in
// the room until it dials in — so this only mounts once it exists.
function AgentTile({
  participant,
  agentDisplayName,
}: {
  participant: RemoteParticipant;
  agentDisplayName: string;
}) {
  const speaking = useIsSpeaking(participant);
  return (
    <ParticipantTile
      label={agentDisplayName}
      sublabel="AI Recruiter"
      speaking={speaking}
      accent="agent"
      avatarInitial={agentDisplayName.charAt(0).toUpperCase()}
    />
  );
}

function ManualCallInner({
  agentDisplayName,
  onEnded,
}: {
  agentDisplayName: string;
  onEnded: () => void;
}) {
  const room = useRoomContext();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const agent = useRemoteParticipants()[0];

  const cameraTracks = useTracks([Track.Source.Camera]);
  const localCameraTrack = cameraTracks.find((t) => t.participant.isLocal);

  const candidateSpeaking = useIsSpeaking(localParticipant);

  const [ending, setEnding] = useState(false);

  // Same rule as auto mode: the AI recruiter leaving its room means the
  // interview is over. Disconnecting fires LiveKitRoom's onDisconnected,
  // which moves the UI to the completion screen.
  useEffect(() => {
    const onParticipantLeft = (participant: RemoteParticipant) => {
      if (participant.isAgent) void room.disconnect();
    };
    room.on(RoomEvent.ParticipantDisconnected, onParticipantLeft);
    return () => {
      room.off(RoomEvent.ParticipantDisconnected, onParticipantLeft);
    };
  }, [room]);

  const toggleMic = useCallback(() => {
    void localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
  }, [localParticipant, isMicrophoneEnabled]);

  const endCall = useCallback(async () => {
    setEnding(true);
    await room.disconnect();
    onEnded();
  }, [room, onEnded]);

  return (
    <div className="flex flex-1 flex-col items-center justify-between px-6 py-10 sm:px-10">
      <div className="flex flex-1 flex-col items-center justify-center gap-16 sm:flex-row sm:gap-24">
        {agent ? (
          <AgentTile participant={agent} agentDisplayName={agentDisplayName} />
        ) : (
          <ParticipantTile
            label={agentDisplayName}
            sublabel="Waiting to join…"
            speaking={false}
            accent="agent"
            avatarInitial={agentDisplayName.charAt(0).toUpperCase()}
          />
        )}
        <ParticipantTile
          label="You"
          sublabel={isMicrophoneEnabled ? "Mic on" : "Mic muted"}
          speaking={candidateSpeaking}
          muted={!isMicrophoneEnabled}
          accent="candidate"
          videoElement={
            localCameraTrack ? (
              <VideoTrack
                trackRef={localCameraTrack}
                className="h-full w-full scale-x-[-1] object-cover"
              />
            ) : undefined
          }
          avatarInitial="Y"
        />
      </div>

      <div className="mt-10 flex items-center gap-5">
        <button
          onClick={toggleMic}
          className={`glass-panel flex h-14 w-14 items-center justify-center rounded-full transition-colors ${
            isMicrophoneEnabled ? "text-white" : "bg-red-500/20 text-red-300"
          }`}
          aria-label={isMicrophoneEnabled ? "Mute microphone" : "Unmute microphone"}
        >
          {isMicrophoneEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </button>

        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={endCall}
          disabled={ending}
          className="flex h-14 items-center gap-2 rounded-full bg-red-500 px-6 font-medium text-white shadow-lg shadow-red-500/30 transition-opacity disabled:opacity-60"
        >
          <PhoneOff className="h-5 w-5" />
          End interview
        </motion.button>
      </div>
    </div>
  );
}
