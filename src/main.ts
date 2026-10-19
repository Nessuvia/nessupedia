import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
import { createAppRouter } from "./router";
import "./styles/theme.css";
import "./styles/content.css";
import "./composables/useColorMode";
import { reportError } from "./composables/useAppError";

// A new deploy's service worker deletes the old build's chunks, so an open tab reloads onto the new build
// when a lazy import fails. Once per 10 seconds, so a chunk that's really missing doesn't loop.
window.addEventListener("vite:preloadError", (event) => {
  const last = Number(sessionStorage.getItem("chunkReloadAt"));
  if (Date.now() - last < 10_000) return;
  event.preventDefault();
  sessionStorage.setItem("chunkReloadAt", String(Date.now()));
  location.reload();
});

window.addEventListener("unhandledrejection", (event) => reportError(event.reason));

const pinia = createPinia();
const app = createApp(App);
app.config.errorHandler = (cause) => {
  console.error(cause);
  reportError(cause);
};
app.use(pinia).use(createAppRouter(pinia)).mount("#app");
