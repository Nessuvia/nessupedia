import type { Pinia } from "pinia";
import { createRouter, createWebHistory, type RouteLocationRaw, type Router } from "vue-router";
import { wikiService } from "@/services";
import { MAIN_PAGE_TITLE, useWikiStore } from "@/stores/wiki";
import AllPagesView from "@/views/AllPagesView.vue";
import NewWikiView from "@/views/NewWikiView.vue";
import PageRail from "@/views/PageRail.vue";
import PageView from "@/views/PageView.vue";
import RecentChangesView from "@/views/RecentChangesView.vue";
import WikiLayout from "@/views/WikiLayout.vue";

export async function homeLocation(lastWikiId: string | null): Promise<RouteLocationRaw> {
  const wikis = await wikiService.list();
  const wiki = wikis.find(({ id }) => id === lastWikiId) ?? wikis[0];
  return wiki ? { name: "wiki", params: { wikiId: wiki.id } } : { name: "new-wiki" };
}

export function createAppRouter(pinia: Pinia): Router {
  return createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    // Other pages load their content after navigating, so PageView scrolls to their section itself.
    scrollBehavior: (to, from, saved) => {
      if (saved) return saved;
      if (to.path === from.path) return to.hash ? { el: to.hash } : false;
      return to.hash ? false : { top: 0 };
    },
    routes: [
      {
        path: "/",
        name: "home",
        component: { render: () => null },
        beforeEnter: () => homeLocation(useWikiStore(pinia).lastWikiId),
      },
      { path: "/new-wiki", name: "new-wiki", component: NewWikiView },
      {
        path: "/w/:wikiId",
        component: WikiLayout,
        props: (route) => ({ wikiId: route.params.wikiId }),
        children: [
          {
            path: "",
            name: "wiki",
            redirect: (to) => ({ name: "page", params: { wikiId: to.params.wikiId, title: MAIN_PAGE_TITLE } }),
          },
          {
            path: "wiki/:title(.*)",
            name: "page",
            components: { default: PageView, rail: PageRail },
            props: { default: true, rail: true },
          },
          { path: "special/all-pages", name: "all-pages", component: AllPagesView, props: true },
          { path: "special/recent-changes", name: "recent-changes", component: RecentChangesView, props: true },
        ],
      },
      { path: "/:unknown(.*)*", redirect: "/" },
    ],
  });
}
