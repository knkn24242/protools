import { useEffect, useState } from "react";
import { clearAiConfig, loadAiConfig, saveAiConfig, type AiConfig } from "./ai";

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export async function updateAiConfig(c: AiConfig | null) {
  if (c) await saveAiConfig(c);
  else await clearAiConfig();
  notify();
}

/** AI 設定の状態。ready = API キーが設定済みでオンライン */
export function useAi() {
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const load = () => loadAiConfig().then(setConfig);
    load();
    listeners.add(load);
    const on = () => setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      listeners.delete(load);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);
  return { config, online, ready: !!config?.apiKey && online };
}
