"use client";

import { useCallback, useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  useIsSpeaking,
  useLocalParticipant,
  useRemoteParticipants,
  useTracks,
  useRoomContext,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import type { RemoteParticipant } from "livekit-client";
import { Mic, MicOff, PhoneOff } from "lucide-react";
import { motion } from "framer-motion";
import { ParticipantTile } from "./ParticipantTile";

interface CallScreenProps {
  serverUrl: string;
  token: string;
  agentDisplayName: string;
  onEnded: () => void;
}

export function CallScreen({ serverUrl, token, agentDisplayName, onEnded }: CallScreenProps) {
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
      <CallScreenInner agentDisplayName={agentDisplayName} onEnded={onEnded} />
    </LiveKitRoom>
  );
}

// useIsSpeaking throws if it's ever handed `undefined`, and the agent isn't
// in the room until it dials in. So this only mounts (and only calls the
// hook) once a remote participant actually exists — the parent renders a
// plain "waiting" tile until then instead of calling the hook on nothing.
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

function CallScreenInner({
  agentDisplayName,
  onEnded,
}: {
  agentDisplayName: string;
  onEnded: () => void;
}) {
  const room = useRoomContext();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const agent = remoteParticipants[0];

  const cameraTracks = useTracks([Track.Source.Camera]);
  const localCameraTrack = cameraTracks.find((t) => t.participant.isLocal);

  const candidateSpeaking = useIsSpeaking(localParticipant);

  const [ending, setEnding] = useState(false);

  const toggleMic = useCallback(() => {
    localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
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
