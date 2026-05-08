import { CODE_EXTENSIONS } from "../language/languageMap";

export interface CodeViewerSettings {
  enabledExtensions: Record<string, boolean>;
}

export const ALL_EXTENSIONS: string[] = [...CODE_EXTENSIONS, "csv"].sort();

export const DEFAULT_SETTINGS: CodeViewerSettings = {
  enabledExtensions: Object.fromEntries(ALL_EXTENSIONS.map((e) => [e, true])),
};

export function mergeSettings(loaded: unknown): CodeViewerSettings {
  const enabled: Record<string, boolean> = { ...DEFAULT_SETTINGS.enabledExtensions };
  if (
    loaded &&
    typeof loaded === "object" &&
    "enabledExtensions" in loaded &&
    typeof (loaded as { enabledExtensions: unknown }).enabledExtensions === "object" &&
    (loaded as { enabledExtensions: unknown }).enabledExtensions !== null
  ) {
    const incoming = (loaded as { enabledExtensions: Record<string, unknown> }).enabledExtensions;
    for (const ext of ALL_EXTENSIONS) {
      if (typeof incoming[ext] === "boolean") {
        enabled[ext] = incoming[ext] as boolean;
      }
    }
  }
  return { enabledExtensions: enabled };
}
