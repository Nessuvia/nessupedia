<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, ref, watch, watchEffect } from "vue";
import AssetThumb from "@/components/forms/AssetThumb.vue";
import ListInput from "@/components/ListInput.vue";
import { emptyCard, type CardData } from "@/cards/cardFile";
import { useLeaveGuard } from "@/composables/useLeaveGuard";
import { useLiveQuery } from "@/composables/useLiveQuery";
import { titleParam } from "@/router/params";
import { cardService, pageService } from "@/services";
import { useWikiStore } from "@/stores/wiki";
import { downloadFile } from "@/utils/download";

const props = defineProps<{ wikiId: string; title: string }>();

const { currentWiki } = storeToRefs(useWikiStore());

const page = useLiveQuery(
  async ([wikiId, title]) => (await pageService.getByTitle(wikiId, title)) ?? null,
  () => [props.wikiId, props.title] as const,
);
const stored = useLiveQuery(async (pageId) => (pageId ? ((await cardService.get(pageId)) ?? null) : undefined), () => page.value?.id);

// The fields the form edits; the rest of the card, such as its lorebook and extensions, is saved as it was.
type Editable = Pick<
  CardData,
  | "name"
  | "nickname"
  | "description"
  | "personality"
  | "scenario"
  | "mes_example"
  | "first_mes"
  | "alternate_greetings"
  | "system_prompt"
  | "post_history_instructions"
  | "creator"
  | "character_version"
  | "tags"
  | "creator_notes"
>;

function editable(data: CardData): Editable {
  return {
    name: data.name,
    nickname: data.nickname ?? "",
    description: data.description,
    personality: data.personality,
    scenario: data.scenario,
    mes_example: data.mes_example,
    first_mes: data.first_mes,
    alternate_greetings: [...data.alternate_greetings],
    system_prompt: data.system_prompt,
    post_history_instructions: data.post_history_instructions,
    creator: data.creator,
    character_version: data.character_version,
    tags: [...data.tags],
    creator_notes: data.creator_notes,
  };
}

const base = ref("");
const draft = ref<Editable>();
const dirty = computed(() => !!draft.value && JSON.stringify(draft.value) !== base.value);
useLeaveGuard(dirty);

// Saves elsewhere, like a new image, reload the form only when nothing is being typed.
watch(stored, (card) => {
  if (dirty.value) return;
  draft.value = card ? editable(card.card.data) : undefined;
  base.value = JSON.stringify(draft.value);
});

const busy = ref(false);
const error = ref("");

async function run(action: () => Promise<unknown>) {
  busy.value = true;
  error.value = "";
  try {
    await action();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    busy.value = false;
  }
}

const picked = (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  return file;
};

function upload(event: Event) {
  const file = picked(event);
  if (file && (!stored.value || window.confirm("Replace this card? The current one stays in the page's history."))) {
    void run(async () => {
      base.value = "";
      draft.value = undefined;
      await cardService.upload(page.value!.id, file);
    });
  }
}

function startBlank() {
  void run(() => cardService.save(page.value!.id, emptyCard(page.value!.title), undefined, { summary: "Added a card" }));
}

function save() {
  if (!dirty.value || busy.value) return;
  const card = stored.value!;
  const { nickname, ...fields } = draft.value!;
  const data: CardData = { ...card.card.data, ...fields };
  if (nickname?.trim()) data.nickname = nickname;
  else delete data.nickname;
  void run(async () => {
    await cardService.save(card.pageId, { ...card.card, data }, card.avatar);
    base.value = JSON.stringify(draft.value);
  });
}

function changeImage(event: Event) {
  const file = picked(event);
  if (file) void run(() => cardService.setAvatar(page.value!.id, file));
}

function removeImage() {
  const card = stored.value!;
  void run(() => cardService.save(card.pageId, card.card, undefined, { summary: "Removed the card's image" }));
}

function removeCard() {
  if (window.confirm("Remove this card from the page? It stays in the page's history.")) void run(() => cardService.remove(page.value!.id));
}

function download() {
  void run(async () => {
    const { data, fileName, type } = await cardService.download(page.value!.id);
    downloadFile(data, fileName, type);
  });
}

const lorebook = computed(() => stored.value?.card.data.character_book);

watchEffect(() => {
  document.title = [`Card of ${page.value?.title ?? props.title}`, currentWiki.value?.name].filter(Boolean).join(" | ");
});
</script>

<template>
  <article class="content-card" @keydown.ctrl.s.prevent="save" @keydown.meta.s.prevent="save">
    <header class="card-bar">
      <RouterLink class="button secondary" :to="{ name: 'page', params: { title: titleParam(page?.title ?? title) } }">Back</RouterLink>
      <div v-if="stored" class="card-actions">
        <span class="status">{{ busy ? "Saving…" : dirty ? "Unsaved changes" : "Saved" }}</span>
        <button class="button" type="button" :disabled="!dirty || busy" @click="save">Save</button>
        <button class="button secondary" type="button" :disabled="busy" @click="download">Download</button>
        <label class="button secondary">
          Replace
          <input type="file" accept=".png,.json,image/png,application/json" hidden @change="upload" />
        </label>
        <button class="button secondary" type="button" :disabled="busy" @click="removeCard">Remove</button>
      </div>
    </header>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>

    <p v-if="page === null" class="empty">There's no page titled {{ title }}.</p>

    <div v-else-if="stored === null" class="no-card">
      <h1>{{ page?.title }}</h1>
      <p class="empty">This page has no character card. Add a V2 or V3 card as a .png or .json file, or start a blank one.</p>
      <label class="button">
        Add a card
        <input type="file" accept=".png,.json,image/png,application/json" hidden @change="upload" />
      </label>
      <button class="button secondary" type="button" :disabled="busy" @click="startBlank">Start a blank card</button>
    </div>

    <template v-else-if="stored && draft">
      <section class="card-head">
        <AssetThumb v-if="stored.avatar" class="avatar" :wiki-id="wikiId" :path="stored.avatar" />
        <span v-else class="avatar" />
        <div>
          <h1>{{ draft.nickname || draft.name }}</h1>
          <p class="note">Character card of {{ page?.title }}</p>
        </div>
      </section>

      <div class="columns">
        <div class="column">
          <details class="card-section" open>
            <summary>Identity</summary>
            <label class="label">Name <input v-model="draft.name" class="text-input" type="text" /></label>
            <label class="label">Nickname <input v-model="draft.nickname" class="text-input" type="text" /></label>
            <p class="note">Chat apps show the nickname in place of the name. <code v-text="'{{char}}'" /> always uses the name.</p>
            <label class="label">Description <textarea v-model="draft.description" class="text-input" rows="8" /></label>
            <label class="label">Personality <textarea v-model="draft.personality" class="text-input" rows="3" /></label>
            <label class="label">Scenario <textarea v-model="draft.scenario" class="text-input" rows="3" /></label>
            <label class="label">Example dialogue <textarea v-model="draft.mes_example" class="text-input" rows="5" /></label>
          </details>

          <details class="card-section">
            <summary>Openings <span class="count">{{ 1 + draft.alternate_greetings.length }} greetings</span></summary>
            <label class="label">First message <textarea v-model="draft.first_mes" class="text-input" rows="6" /></label>
            <div v-for="(_, index) in draft.alternate_greetings" :key="index" class="greeting">
              <div class="greeting-head">
                <span class="label">Alternate greeting {{ index + 1 }}</span>
                <button class="link-button" type="button" @click="draft.alternate_greetings.splice(index, 1)">Delete</button>
              </div>
              <textarea v-model="draft.alternate_greetings[index]" class="text-input" rows="6" :aria-label="`Alternate greeting ${index + 1}`" />
            </div>
            <button class="button secondary" type="button" @click="draft.alternate_greetings.push('')">Add greeting</button>
          </details>

          <details class="card-section">
            <summary>Lorebook <span v-if="lorebook" class="count">{{ lorebook.entries.length }} entries</span></summary>
            <p v-if="lorebook">
              <strong>{{ lorebook.name || "Unnamed lorebook" }}</strong>, {{ lorebook.entries.length }} entries.
            </p>
            <p class="note">{{ lorebook ? "The lorebook is kept as it came and goes out with the card." : "This card has no lorebook." }}</p>
          </details>
        </div>

        <div class="column">
          <details class="card-section" open>
            <summary>Image</summary>
            <div class="image-row">
              <AssetThumb v-if="stored.avatar" class="avatar large" :wiki-id="wikiId" :path="stored.avatar" />
              <label class="button secondary">
                {{ stored.avatar ? "Replace" : "Add image" }}
                <input type="file" accept="image/*" hidden @change="changeImage" />
              </label>
              <button v-if="stored.avatar" class="button secondary" type="button" :disabled="busy" @click="removeImage">Remove</button>
            </div>
            <p class="note">A card with an image downloads as a PNG; without one, as JSON.</p>
          </details>

          <details class="card-section">
            <summary>Prompt</summary>
            <label class="label">System prompt <textarea v-model="draft.system_prompt" class="text-input" rows="4" /></label>
            <label class="label">Post-history instructions <textarea v-model="draft.post_history_instructions" class="text-input" rows="4" /></label>
          </details>

          <details class="card-section">
            <summary>Metadata</summary>
            <label class="label">Creator <input v-model="draft.creator" class="text-input" type="text" /></label>
            <label class="label">Version <input v-model="draft.character_version" class="text-input" type="text" /></label>
            <ListInput v-model="draft.tags" label="Tags" />
            <label class="label">Creator notes <textarea v-model="draft.creator_notes" class="text-input" rows="4" /></label>
          </details>
        </div>
      </div>
    </template>
  </article>
</template>

<style scoped>
.card-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin: 0.5rem 0 1rem;
}

.card-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.status,
.note,
.count,
.empty {
  color: var(--color-muted);
  font-size: 0.85rem;
}

.card-head {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
}

.card-head h1 {
  margin: 0;
  border: 0;
}

.card-head .note {
  margin: 0.25rem 0 0;
}

.card-head .avatar {
  width: 5rem;
  height: 5rem;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  background: var(--color-page);
  object-fit: cover;
}

.image-row .avatar.large {
  width: 6rem;
  height: 6rem;
  border-radius: 4px;
}

.columns {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
}

.column {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  gap: 1rem;
  min-width: 0;
}

@media (max-width: 48rem) {
  .columns {
    flex-direction: column;
    align-items: stretch;
  }
}

.card-section {
  padding: 0 1rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
}

.card-section[open] {
  padding-bottom: 1rem;
}

.card-section summary {
  padding: 0.75rem 0;
  font-weight: 600;
  cursor: pointer;
}

.card-section .count {
  margin-left: 0.4rem;
  font-weight: normal;
}

.label {
  display: block;
  margin-top: 0.75rem;
  font-weight: 600;
  font-size: 0.9rem;
}

.label .text-input {
  margin-top: 0.25rem;
  font-weight: normal;
}

textarea.text-input {
  resize: vertical;
  field-sizing: content;
  min-height: 4.5rem;
  max-height: 30rem;
}

.greeting-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.greeting textarea {
  margin-top: 0.25rem;
}

.link-button {
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-danger);
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}

.card-section > .button {
  margin-top: 0.75rem;
}

.image-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.no-card .button {
  margin-right: 0.5rem;
}
</style>
