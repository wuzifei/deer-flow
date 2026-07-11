import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Copy text to clipboard, reliable across HTTP tunneling, iframes, and
 * Radix Dialog focus traps.
 *
 * Challenges handled:
 *  - Radix Dialog focus trap: a textarea mounted on <body> loses focus
 *    synchronously (the trap yanks it back into the dialog), clearing the
 *    selection before execCommand reads it. Mount the textarea *inside* the
 *    active dialog so focus never leaves the trap's scope.
 *  - textarea value is a property, not a DOM child: must use textarea.select(),
 *    not range.selectNodeContents (which selects nothing).
 *  - Non-secure context (HTTP): navigator.clipboard.writeText silently
 *    resolves without copying — never used as a fallback there.
 *
 * Returns true on success, false otherwise.
 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof window === "undefined" || !text) return false;

  // Mount inside the active dialog (if any) so its focus trap doesn't fight us.
  const active = document.activeElement;
  const dialog = active?.closest('[role="dialog"], [data-slot="dialog-content"]');
  const mount: HTMLElement =
    dialog instanceof HTMLElement ? dialog : document.body;

  if (typeof document.execCommand === "function") {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    // Off-screen but fully visible (opacity:1): opacity:0 can make some
    // browsers skip the copy. position:absolute avoids the dialog's transform
    // creating a fixed containing block.
    textarea.style.position = "absolute";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";

    // textarea.select() overwrites the document selection — save & restore it.
    const selection = document.getSelection();
    let savedRange: Range | null = null;
    if (selection && selection.rangeCount > 0) {
      savedRange = selection.getRangeAt(0);
    }

    let ok = false;
    try {
      mount.appendChild(textarea);
      textarea.select();
      textarea.setSelectionRange(0, text.length);
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
    } catch {
      ok = false;
    } finally {
      if (textarea.parentNode) textarea.parentNode.removeChild(textarea);
      if (savedRange && selection) {
        selection.removeAllRanges();
        selection.addRange(savedRange);
      }
    }
    if (ok) return true;
    console.warn("[copyText] execCommand copy failed");
  }

  // Clipboard API fallback — secure contexts only. On HTTP it silently
  // resolves without copying, so we must not use it there.
  if (window.isSecureContext && navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      console.warn("[copyText] clipboard.writeText failed", e);
    }
  }

  return false;
}

/** Shared class for external links (underline by default). */
export const externalLinkClass =
  "text-primary underline underline-offset-2 hover:no-underline";
/** Link style without underline by default (e.g. for streaming/loading). */
export const externalLinkClassNoUnderline = "text-primary hover:underline";
