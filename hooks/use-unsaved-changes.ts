"use client";

import { useEffect } from "react";

const defaultMessage = "You have unsaved changes. If you leave this page they will be lost.";

// Warns before leaving a page that has unsaved changes:
// - closing or reloading the tab, or typing another address (the browser's own prompt);
// - clicking a link of the app (a confirmation).
// The back button of the browser isn't covered.
export function useUnsavedChangesGuard(hasUnsavedChanges: boolean, message: string = defaultMessage) {
  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    // Capture phase, so it runs before the router handles the click
    const onClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
      ) return;

      const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;

      const url = new URL(link.href, window.location.href);
      // Another site: the browser's prompt applies. Same page: nothing is lost.
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [hasUnsavedChanges, message]);
}
