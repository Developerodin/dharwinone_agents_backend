"use client";

import { AXON_VIDEO_URL } from "./motionPresets";

export function AxonVideoBackground() {
  return (
    <div className="axon-video-layer" aria-hidden="true">
      <video autoPlay muted loop playsInline className="axon-video">
        <source src={AXON_VIDEO_URL} type="video/mp4" />
      </video>
    </div>
  );
}
