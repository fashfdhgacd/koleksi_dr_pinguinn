import { useCallback, useEffect, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/layout/shell";
import { EmptyState, ErrorState } from "@/components/states/feed-states";
import { VideoGrid, VideoGridSkeleton } from "@/components/video/video-grid";
import { VideoPlayer } from "@/components/video/player";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchCatalog } from "@/lib/catalog/client";
import { queryCatalog } from "@/lib/catalog/service";
import type { VideoCard, VideoDetail } from "@/lib/catalog/types";
import { findCategory } from "@/lib/catalog/categories";

// NOTE: truncated for safety — will use full file via push_files
export const Route = createFileRoute("/watch/$id")({
  component: () => null,
});
