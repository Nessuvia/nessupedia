import type { Pinia } from "pinia";
import { createRouter, createWebHistory, type RouteLocationRaw, type Router } from "vue-router";
import { wikiService } from "@/services";
import { MAIN_PAGE_TITLE, useWikiStore } from "@/stores/wiki";
import NewWikiView from "@/views/NewWikiView.vue";
import PageView from "@/views/PageView.vue";
import WikiLayout from "@/views/WikiLayout.vue";

export async function homeLocation(lastWikiId: string | null): Promise<RouteLocationRaw> {
  const wikis = await wikiService.list();
  const wiki = wikis.find(({ id }) => id === lastWikiId) ?? wikis[0];
  return wiki ? { name: "wiki", params: { wikiId: wiki.id } } : { name: "new-wiki" };
}

export function createAppRouter(pinia: Pinia): Router {
  return createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
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
        props: true,
        children: [
          {
            path: "",
            name: "wiki",
            redirect: (to) => ({ name: "page", params: { wikiId: to.params.wikiId, title: MAIN_PAGE_TITLE } }),
          },
          { path: "wiki/:title(.*)", name: "page", component: PageView, props: true },
        ],
      },
      { path: "/:unknown(.*)*", redirect: "/" },
    ],
  });
}
