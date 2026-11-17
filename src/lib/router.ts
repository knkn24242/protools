// ハッシュベースの簡易ルーター（file:// やオフラインでも動作する）
import { useEffect, useState } from "react";

export function useRoute(): string[] {
  const parse = () =>
    (window.location.hash.replace(/^#\/?/, "") || "dashboard").split("/").filter(Boolean);
  const [route, setRoute] = useState<string[]>(parse);
  useEffect(() => {
    const on = () => {
      setRoute(parse());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

export function go(path: string) {
  window.location.hash = `#/${path}`;
}
