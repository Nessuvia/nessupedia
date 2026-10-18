import type { RouteLocationNormalized } from "vue-router";

// Page titles travel as path segments, so a subpage's URL reads /wiki/Mira/History rather than
// escaping its slash. Pass titles to the page and edit routes through `titleParam`.
export function titleParam(title: string): string[] {
  return title.split("/");
}

export function titleFromRoute(route: Pick<RouteLocationNormalized, "params">): string {
  return ([] as string[]).concat(route.params.title ?? []).join("/");
}
