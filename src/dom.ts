// Tiny DOM helpers. Text is always set via text nodes, never innerHTML, so
// names and wishlist content can't inject markup.

import { t } from "./strings.it.ts";

type Child = Node | string | number | false | null | undefined;
type Attrs = Record<string, string | number | boolean | EventListener | null | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Array<Child | Child[]>
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.slice(2), value);
    } else if (key === "value" && "value" in el) {
      (el as HTMLInputElement).value = String(value);
    } else {
      el.setAttribute(key, value === true ? "" : String(value));
    }
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

// --- Toast ------------------------------------------------------------------

let toastTimer: number | undefined;

export function toast(message: string, kind: "ok" | "error" = "ok", durationMs = 3500) {
  let el = document.getElementById("toast");
  if (!el) {
    el = h("div", { id: "toast", role: "status", "aria-live": "polite" });
    document.body.append(el);
  }
  el.textContent = message;
  el.className = `toast toast-${kind} toast-show`;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.classList.remove("toast-show"), durationMs);
}

// --- Confirmation dialog ------------------------------------------------------

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  /** If set, the user must type this word to enable the confirm button. */
  requireWord?: string;
}

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const confirmBtn = h(
      "button",
      { type: "submit", class: opts.danger ? "btn btn-danger" : "btn btn-primary" },
      opts.confirmLabel ?? t.confirm,
    );
    let wordInput: HTMLInputElement | null = null;
    if (opts.requireWord) {
      wordInput = h("input", { type: "text", autocomplete: "off", autocapitalize: "characters" });
      confirmBtn.disabled = true;
      wordInput.addEventListener("input", () => {
        confirmBtn.disabled = wordInput!.value.trim().toUpperCase() !== opts.requireWord;
      });
    }

    const dialog = h("dialog", { class: "dialog" });
    const close = (result: boolean) => {
      dialog.close();
      dialog.remove();
      resolve(result);
    };
    const form = h(
      "form",
      {
        method: "dialog",
        onsubmit: (e: Event) => {
          e.preventDefault();
          if (!confirmBtn.disabled) close(true);
        },
      },
      opts.title && h("h3", {}, opts.title),
      h("p", {}, opts.message),
      opts.requireWord && h("label", { class: "field" }, h("span", {}, t.confirmResetPrompt(opts.requireWord)), wordInput),
      h(
        "div",
        { class: "row row-end" },
        h("button", { type: "button", class: "btn btn-ghost", onclick: () => close(false) }, t.cancel),
        confirmBtn,
      ),
    );
    dialog.append(form);
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      close(false);
    });
    document.body.append(dialog);
    dialog.showModal();
    (wordInput ?? confirmBtn).focus();
  });
}
