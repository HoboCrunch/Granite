import { Plugin } from "obsidian";
import {
  type CodeViewerSettings,
  DEFAULT_SETTINGS,
  mergeSettings,
} from "./settings/defaults";
import { CodeViewerSettingTab } from "./settings/settings";
import { CODE_EXTENSIONS } from "./language/languageMap";
import { CodeView, CODE_VIEW_TYPE } from "./views/CodeView";
import { CsvView, CSV_VIEW_TYPE } from "./views/CsvView";

export default class CodeViewerPlugin extends Plugin {
  settings: CodeViewerSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

  async onload(): Promise<void> {
    this.settings = mergeSettings(await this.loadData());

    this.registerView(CODE_VIEW_TYPE, (leaf) => new CodeView(leaf));
    this.registerView(CSV_VIEW_TYPE, (leaf) => new CsvView(leaf));

    const enabledCode = CODE_EXTENSIONS.filter(
      (ext) => this.settings.enabledExtensions[ext] !== false,
    );
    if (enabledCode.length > 0) {
      this.registerExtensions(enabledCode, CODE_VIEW_TYPE);
    }

    if (this.settings.enabledExtensions["csv"] !== false) {
      this.registerExtensions(["csv"], CSV_VIEW_TYPE);
    }

    this.addSettingTab(new CodeViewerSettingTab(this.app, this));
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
