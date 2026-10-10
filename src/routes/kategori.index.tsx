import { Link, createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/layout/shell";
import { CATEGORY_LIST } from "@/lib/catalog/categories";
import { RANKINGS } from "@/lib/catalog/rankings";
import { queryCatalog } from "@/lib/catalog/service";
import type { CategoryInfo } from "@/lib/catalog/types";
import { SITE_ORIGIN } from "@/lib/seo";

const countFmt = new Intl.NumberFormat("id-ID");

const ICONS: Record<string, string> = {
  "paling-ditonton": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAfUlEQVR4nO2VUQqAMAxDW+9/5/olKHQxtRMH5v2NtUnoxmYmhBB/x580RUQMBd1LmnQxMu2EuS3IjJFwtR4GOItlIt19M7MNBWDFszUypQIcgow5E2LUQ03gTdYNgEY3Olt0XK1LyISo3JVL3wzzTv36L2E1TPUvEEKIz9kBGMVUFAaUGJ4AAAAASUVORK5CYII=",
  "paling-disukai": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAZUlEQVR4nO2UMQ4AIAgDwfj/L+PkpANUCIO9HbwCUYSQ31G00MzsaKYa7jdQgYzHYYFbepSUCaDpRY
  // NOTE: full content is in the local file, this is abbreviated for call
};