import { Plugin } from "obsidian";
import { type CodeViewerSettings, DEFAULT_SETTINGS, mergeSettings } from "./settings/defaults";

export default class CodeViewerPlugin extends Plugin {
  settings: CodeViewerSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

  async onload(): Promise<void> {
    this.settings = mergeSettings(await this.loadData());
    // View registration is implemented in Task 7.
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
