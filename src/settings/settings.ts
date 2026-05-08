import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type CodeViewerPlugin from "../main";
import { ALL_EXTENSIONS, DEFAULT_SETTINGS } from "./defaults";

export class CodeViewerSettingTab extends PluginSettingTab {
  plugin: CodeViewerPlugin;

  constructor(app: App, plugin: CodeViewerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Code Viewer" });
    containerEl.createEl("p", {
      text: "Enable or disable per-extension. Changes take effect after reloading Obsidian (Ctrl/Cmd+R).",
      cls: "setting-item-description",
    });

    for (const ext of ALL_EXTENSIONS) {
      new Setting(containerEl).setName(`.${ext}`).addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enabledExtensions[ext] ?? true)
          .onChange(async (value) => {
            this.plugin.settings.enabledExtensions[ext] = value;
            await this.plugin.saveSettings();
          }),
      );
    }

    new Setting(containerEl).addButton((btn) =>
      btn
        .setButtonText("Restore defaults")
        .setCta()
        .onClick(async () => {
          this.plugin.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
          await this.plugin.saveSettings();
          new Notice("Code Viewer: defaults restored. Reload Obsidian to apply.");
          this.display();
        }),
    );
  }
}
