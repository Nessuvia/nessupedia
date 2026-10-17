import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
import { createAppRouter } from "./router";
import "./styles/theme.css";
import "./styles/content.css";

const pinia = createPinia();
createApp(App).use(pinia).use(createAppRouter(pinia)).mount("#app");
