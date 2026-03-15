import { writable } from "svelte/store";

export type Route =
  | { name: "dashboard" }
  | { name: "auth" }
  | { name: "match"; id: string }
  | { name: "tournament"; id: string }
  | { name: "ranking" }
  | { name: "history" }
  | { name: "training" }
  | { name: "social" }
  | { name: "admin" };

function parseRoute(pathname: string): Route {
  if (pathname.startsWith("/match/")) {
    return { name: "match", id: pathname.replace("/match/", "") };
  }

  if (pathname.startsWith("/tournament/")) {
    return { name: "tournament", id: pathname.replace("/tournament/", "") };
  }

  switch (pathname) {
    case "/auth":
      return { name: "auth" };
    case "/ranking":
      return { name: "ranking" };
    case "/history":
      return { name: "history" };
    case "/training":
      return { name: "training" };
    case "/social":
      return { name: "social" };
    case "/admin":
      return { name: "admin" };
    default:
      return { name: "dashboard" };
  }
}

export const route = writable<Route>(parseRoute(window.location.pathname));

export function goto(path: string) {
  if (window.location.pathname !== path) {
    window.history.pushState({}, "", path);
    route.set(parseRoute(path));
  }
}

window.addEventListener("popstate", () => {
  route.set(parseRoute(window.location.pathname));
});
