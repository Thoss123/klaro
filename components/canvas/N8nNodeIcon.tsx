"use client";

/**
 * Node icon with multi-URL fallback — bundled SVG → n8n proxy → react-icons.
 */

import React, { useMemo, useState } from 'react';
import { getN8nIconCandidates } from '@/lib/n8n-icon-map';
import { getToolVisual } from './tool-icons';

export default function N8nNodeIcon({
  tool,
  type,
  n8nType,
  label,
  size,
  color,
}: {
  tool?: string | null;
  type?: string | null;
  n8nType?: string | null;
  label?: string | null;
  size: number;
  color: string;
}) {
  const candidates = useMemo(
    () => getN8nIconCandidates(tool, type, n8nType, label),
    [tool, type, n8nType, label],
  );
  const [idx, setIdx] = useState(0);
  const visual = getToolVisual(tool, type);
  const { Icon } = visual;

  const src = candidates[idx];

  if (!src || idx >= candidates.length) {
    return <Icon size={size} color={color} />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className="object-contain"
      onError={() => setIdx(i => i + 1)}
    />
  );
}
