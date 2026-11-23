import { localeRewrites } from "./lib/public-locale";
import { createRouter } from "@tanstack/react-router";
import { AppErrorComponent } from "@/lib/error-component";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({
    routeTree,
    rewrite: localeRewrites(),
    defaultErrorComponent: AppErrorComponent,
    defaultPreload: false,
    scrollRestoration: true,
  });
}
