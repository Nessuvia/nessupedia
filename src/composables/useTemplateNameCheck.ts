import type { Template } from "@/db/types";
import { titleKey } from "@/markdown/wikilinks";
import { templateService } from "@/services";
import { templateNameError } from "@/services/TemplateService";
import { useLiveQuery } from "./useLiveQuery";

// The wiki's templates, and a check for names a new or renamed template can't take.
export function useTemplateNameCheck(wikiId: () => string) {
  const templates = useLiveQuery((id) => templateService.list(id), wikiId);

  function check(name: string, own?: Pick<Template, "id">): string | undefined {
    const clash = templates.value?.find((template) => titleKey(template.name) === titleKey(name));
    if (clash && clash.id !== own?.id) return `A template named "${clash.name}" already exists.`;
    return templateNameError(name);
  }

  return { templates, check };
}
