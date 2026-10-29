"use client";

import { useEffect, useState } from "react";

import { backendApi } from "@/lib/backend-api";

type Props = {
  avatarUrl: string | null;
  label: string;
  className?: string;
};

export function ProfileAvatar({ avatarUrl, label, className = "" }: Props) {
  const [imageState, setImageState] = useState<{
    avatarUrl: string;
    objectUrl: string;
    failed: boolean;
  } | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    if (!avatarUrl) return;

    void backendApi.users.getAvatar(avatarUrl)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setImageState({ avatarUrl, objectUrl, failed: false });
      })
      .catch(() => {
        if (active) setImageState({ avatarUrl, objectUrl: "", failed: true });
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [avatarUrl]);

  const currentImage = imageState?.avatarUrl === avatarUrl ? imageState : null;
  return (
    <span
      role="img"
      aria-label={label}
      title={currentImage?.failed ? `${label} image could not be loaded` : label}
      className={`grid size-10 shrink-0 place-items-center overflow-hidden rounded-full border border-white/10 bg-white/5 ${className}`}
    >
      {currentImage?.objectUrl ? (
        // Blob URLs are created from authenticated backend responses, not user-provided URLs.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={currentImage.objectUrl} alt="" className="size-full object-cover" />
      ) : currentImage?.failed ? (
        <span aria-hidden="true" className="text-xs font-semibold text-red-300">!</span>
      ) : null}
    </span>
  );
}
