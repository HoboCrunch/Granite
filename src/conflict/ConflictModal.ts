import { App, Modal } from "obsidian";

export type ConflictChoice = "keep" | "reload" | "cancel";

class ConflictModal extends Modal {
  private resolved = false;

  constructor(
    app: App,
    private fileName: string,
    private onResolve: (choice: ConflictChoice) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl, titleEl } = this;
    titleEl.setText(`External change to ${this.fileName}`);
    contentEl.empty();
    contentEl.createEl("p", {
      text:
        "This file changed on disk while you had unsaved edits. " +
        "Choose how to resolve:",
    });

    const buttons = contentEl.createDiv({ cls: "code-viewer-conflict-buttons" });

    const keepBtn = buttons.createEl("button", { text: "Keep yours" });
    keepBtn.addClass("mod-warning");
    keepBtn.addEventListener("click", () => this.resolve("keep"));

    const reloadBtn = buttons.createEl("button", { text: "Reload from disk" });
    reloadBtn.addClass("mod-cta");
    reloadBtn.addEventListener("click", () => this.resolve("reload"));

    const cancelBtn = buttons.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => this.resolve("cancel"));
  }

  onClose(): void {
    if (!this.resolved) {
      this.resolved = true;
      this.onResolve("cancel");
    }
    this.contentEl.empty();
  }

  private resolve(choice: ConflictChoice): void {
    if (this.resolved) return;
    this.resolved = true;
    this.onResolve(choice);
    this.close();
  }
}

export function showConflictModal(app: App, fileName: string): Promise<ConflictChoice> {
  return new Promise((resolve) => {
    const modal = new ConflictModal(app, fileName, resolve);
    modal.open();
  });
}
