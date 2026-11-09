"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  findSignatureBounds,
  type SignatureBounds,
} from "@/lib/signature-bounds";

interface Crop {
  source: string;
  bounds: SignatureBounds;
  width: number;
  height: number;
}

/** Display-only crop: the complete uploaded image remains unchanged in the contract. */
export function SignatureImage({
  source,
  label,
}: {
  source: string;
  label: string;
}) {
  const [crop, setCrop] = useState<Crop | null>(null);
  useEffect(() => {
    let cancelled = false;
    const image = new window.Image();
    image.onload = () => {
      if (cancelled) return;
      try {
        const scale = Math.min(
          1,
          1024 / Math.max(image.naturalWidth, image.naturalHeight),
        );
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return;
        context.drawImage(image, 0, 0, width, height);
        const bounds = findSignatureBounds(
          context.getImageData(0, 0, width, height).data,
          width,
          height,
        );
        if (!bounds || cancelled) return;
        const scaleX = image.naturalWidth / width,
          scaleY = image.naturalHeight / height;
        setCrop({
          source,
          width: image.naturalWidth,
          height: image.naturalHeight,
          bounds: {
            x: bounds.x * scaleX,
            y: bounds.y * scaleY,
            width: bounds.width * scaleX,
            height: bounds.height * scaleY,
          },
        });
      } catch {
        /* Leave the original visible if the browser cannot inspect the image. */
      }
    };
    image.src = source;
    return () => {
      cancelled = true;
    };
  }, [source]);
  if (!crop || crop.source !== source)
    return (
      <Image
        unoptimized
        src={source}
        width={220}
        height={80}
        alt={label}
        className="h-auto max-h-20 w-auto max-w-[95%] object-contain"
      />
    );
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`${crop.bounds.x} ${crop.bounds.y} ${crop.bounds.width} ${crop.bounds.height}`}
      className="h-20 w-full max-w-[220px]"
      preserveAspectRatio="xMidYMid meet"
    >
      <image href={source} width={crop.width} height={crop.height} />
    </svg>
  );
}
