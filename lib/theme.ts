// Theme choice, saved per device. The <html data-theme> attribute switches the CSS variables;
// an inline script in the layout applies it before first paint so there's no flash.
export type Theme = "heritage" | "classic";
export const THEMES: { id: Theme; label: string }[] = [
  { id: "heritage", label: "Heritage" },
  { id: "classic", label: "Classic green" },
];
const KEY = "29-theme";

export function getTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === "classic" ? "classic" : "heritage";
  } catch {
    return "heritage";
  }
}

export function setTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem(KEY, t);
  } catch {
    // storage blocked: applies for this visit only
  }
}

/** Runs inline in <head> before the page paints. */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem("${KEY}");if(t==="classic")document.documentElement.dataset.theme=t}catch(e){}`;
