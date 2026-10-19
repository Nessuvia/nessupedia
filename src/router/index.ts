import type { Pinia } from "pinia";
import { createRouter, createWebHistory, type RouteLocationNormalized, type RouteLocationRaw, type Router } from "vue-router";
import { wikiService } from "@/services";
import { titleFromRoute, titleParam } from "./params";
import { MAIN_PAGE_TITLE, useWikiStore } from "@/stores/wiki";
import AllPagesView from "@/views/AllPagesView.vue";
import AppearanceView from "@/views/AppearanceView.vue";
import CategoriesView from "@/views/CategoriesView.vue";
import CategoryView from "@/views/CategoryView.vue";
import ContinuityView from "@/views/ContinuityView.vue";
import NewPageView from "@/views/NewPageView.vue";
import NewWikiView from "@/views/NewWikiView.vue";
import PageRail from "@/views/PageRail.vue";
import PageView from "@/views/PageView.vue";
import RecentChangesView from "@/views/RecentChangesView.vue";
import SearchView from "@/views/SearchView.vue";
import TemplatesView from "@/views/TemplatesView.vue";
import WikiLayout from "@/views/WikiLayout.vue";
import WikiSettingsView from "@/views/WikiSettingsView.vue";

declare module "vue-router" {
  interface RouteMeta {
    wide?: boolean;
  }
}

// URLs name a wiki by its slug; the guard in createAppRouter records which ID each slug it has seen belongs to.
const wikiIds = new Map<string, string>();

function wikiIdFrom(route: RouteLocationNormalized): string {
  const segment = String(route.params.wiki);
  return wikiIds.get(segment) ?? segment;
}

// The route params as props, with the wiki slug swapped for its ID.
function wikiProps(route: RouteLocationNormalized) {
  const { wiki: _wiki, ...params } = route.params;
  return { ...params, wikiId: wikiIdFrom(route) };
}

const pageProps = (route: RouteLocationNormalized) => ({ wikiId: wikiIdFrom(route), title: titleFromRoute(route) });

export async function homeLocation(lastWikiId: string | null): Promise<RouteLocationRaw> {
  const wikis = await wikiService.list();
  const wiki = wikis.find(({ id }) => id === lastWikiId) ?? wikis[0];
  return wiki ? { name: "wiki", params: { wiki: wiki.slug } } : { name: "new-wiki" };
}

export function createAppRouter(pinia: Pinia): Router {
  const router = createRouter({
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
        path: "/w/:wiki",
        component: WikiLayout,
        props: (route) => ({ wikiId: wikiIdFrom(route) }),
        children: [
          {
            path: "",
            name: "wiki",
            redirect: (to) => ({ name: "page", params: { wiki: to.params.wiki, title: titleParam(MAIN_PAGE_TITLE) } }),
          },
          {
            path: "wiki/:title+",
            name: "page",
            components: { default: PageView, rail: PageRail },
            props: { default: pageProps, rail: pageProps },
          },
          {
            path: "edit/:title+",
            name: "edit-page",
            component: () => import("@/views/EditView.vue"),
            props: pageProps,
            meta: { wide: true },
          },
          {
            path: "history/:title+",
            name: "page-history",
            component: () => import("@/views/PageHistoryView.vue"),
            props: pageProps,
          },
          {
            path: "new",
            name: "new-page",
            component: NewPageView,
            props: (route) => ({
              wikiId: wikiIdFrom(route),
              initialTitle: typeof route.query.title === "string" ? route.query.title : undefined,
              initialTemplate: typeof route.query.template === "string" ? route.query.template : undefined,
              withTitle: typeof route.query.with === "string" ? route.query.with : undefined,
            }),
          },
          {
            path: "special/search",
            name: "search",
            component: SearchView,
            props: (route) => ({
              wikiId: wikiIdFrom(route),
              query: typeof route.query.q === "string" ? route.query.q : "",
            }),
          },
          { path: "special/settings", name: "wiki-settings", component: WikiSettingsView, props: wikiProps },
          { path: "special/appearance", name: "appearance", component: AppearanceView, props: wikiProps },
          { path: "special/all-pages", name: "all-pages", component: AllPagesView, props: wikiProps },
          { path: "special/recent-changes", name: "recent-changes", component: RecentChangesView, props: wikiProps },
          { path: "special/categories", name: "categories", component: CategoriesView, props: wikiProps },
          { path: "special/category/:name(.*)", name: "category", component: CategoryView, props: wikiProps },
          { path: "special/templates", name: "templates", component: TemplatesView, props: wikiProps },
          { path: "special/continuity/:name", name: "continuity", component: ContinuityView, props: wikiProps },
          { path: "special/review/:runId", name: "review", component: () => import("@/views/ReviewView.vue"), props: wikiProps },
          {
            path: "special/templates/:templateId/edit",
            name: "edit-template",
            component: () => import("@/views/TemplateEditView.vue"),
            props: wikiProps,
            meta: { wide: true },
          },
        ],
      },
      { path: "/:unknown(.*)*", redirect: "/" },
    ],
  });

  // Links from before slugs name the wiki by ID, so they're sent on to its slug.
  router.beforeEach(async (to) => {
    if (typeof to.params.wiki !== "string") return;
    const wiki = await wikiService.fromUrl(to.params.wiki);
    if (!wiki) return;
    wikiIds.set(wiki.slug, wiki.id);
    if (to.params.wiki !== wiki.slug) return { name: to.name!, params: { ...to.params, wiki: wiki.slug }, query: to.query, hash: to.hash, replace: true };
  });
  return router;
}
