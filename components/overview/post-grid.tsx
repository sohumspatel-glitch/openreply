"use client";

/**
 * Post grid
 *
 * Two columns on a phone up to five on a wide desktop. Cards are equal height
 * so a missing caption never leaves a ragged row.
 */

import PostCard from "@/components/overview/post-card";
import type { OverviewPost } from "@/app/api/instagram/overview/route";

const GRID_CLASS =
  "grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5";

interface PostGridProps {
  posts: OverviewPost[];
  onSelect: (post: OverviewPost) => void;
}

export default function PostGrid({ posts, onSelect }: PostGridProps) {
  return (
    <ul className={GRID_CLASS}>
      {posts.map((post) => (
        <li key={post.id}>
          <PostCard post={post} onOpen={() => onSelect(post)} />
        </li>
      ))}
    </ul>
  );
}

export function PostGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className={GRID_CLASS} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-media border border-border bg-surface shadow-hair"
        >
          <div className="aspect-[4/5] w-full rounded-t-media bg-surface-sand motion-safe:animate-pulse" />
          <div className="flex flex-col gap-2 px-3 py-3">
            <div className="h-3.5 w-4/5 rounded-control bg-surface-warm motion-safe:animate-pulse" />
            <div className="h-3 w-3/5 rounded-control bg-surface-warm motion-safe:animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}
