import { useRef, useState } from "react";
import { defaultProgress, migrate, useProgress } from "../lib/store";
import { Card } from "../components/ui";
import { MODEL_LABEL, testConnection, type AiModel } from "../lib/ai";
import { updateAiConfig, useAi } from "../lib/useAi";

export default function SettingsPage() {
  const { data, setSettings, replaceAll } = useProgress();
  const s = data.settings;
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");

  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `pro-tools-academy-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setMsg("進捗データを書き出しました。");
  };

  const importData = async (file: File) => {
    try {
      const parsed = migrate(JSON.parse(await file.text()));
      if (!parsed) throw new Error("形式が違います");
      if (!confirm("現在の進捗データを、読み込んだデータで置き換えます。よろしいですか？")) return;
      replaceAll(parsed);
      setMsg("進捗データを読み込みました。");
    } catch (e) {
      setMsg(`読み込みに失敗しました：${(e as Error).message}`);
    }
  };

  return (
    <div className="page">
      <h1>Settings</h1>
      <div className="grid two">
        <Card title="学習環境">
          <label className="field">
            <span>使用OS（ショートカット表示）</span>
            <div className="seg">
              {(["mac", "win"] as const).map((o) => (
                <button key={o} className={s.os === o ? "on" : ""} onClick={() => setSettings({ os: o })}>
                  {o === "mac" ? "macOS" : "Windows"}
                </button>
              ))}
            </div>
          </label>
          <label className="field">
            <span>Pro Toolsのバージョン</span>
            <select value={s.ptVersion} onChange={(e) => setSettings({ ptVersion: e.target.value })}>
              <option value="2024">2024.x</option>
              <option value="2023">2023.x</option>
              <option value="2025">2025.x 以降</option>
              <option value="older">2022 以前</option>
            </select>
            <span className="small muted">現在の教材は 2023.x〜2024.x を基準に作成しています。</span>
          </label>
          <label className="field">
            <span>1日の学習時間</span>
            <div className="seg">
              {([60, 30] as const).map((m) => (
                <button key={m} className={s.dailyMinutes === m ? "on" : ""} onClick={() => setSettings({ dailyMinutes: m })}>
                  {m}分{m === 30 ? "（忙しい日）" : "（標準）"}
                </button>
              ))}
            </div>
          </label>
        </Card>

        <Card title="データ管理">
          <p className="muted small">学習データはこのブラウザ内（IndexedDB）にのみ保存され、外部サーバーには送信されません。エクスポートには実技課題のスクリーンショット画像は含まれません（記録の一覧のみ）。</p>
          <div className="btn-row">
            <button className="btn" onClick={exportData}>
              エクスポート（JSON）
            </button>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              インポート
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importData(f);
                e.target.value = "";
              }}
            />
          </div>
          <div className="btn-row">
            <button
              className="btn danger"
              onClick={() => {
                if (confirm("全ての学習進捗を削除します。元に戻せません。よろしいですか？")) {
                  replaceAll({ ...defaultProgress(), settings: s });
                  setMsg("進捗をリセットしました。");
                }
              }}
            >
              進捗をリセット
            </button>
          </div>
          {msg && <p className="notice">{msg}</p>}
        </Card>

        <AiSettings />

        <Card title="教材の正確性について">
          <p className="small">
            教材には対応バージョンと出典を記録しています。「公式照合前」の教材はAIが作成した下書きで、Avid公式ユーザーガイドとの照合が完了していません。「要確認」と表示された項目は特に注意してください。
          </p>
        </Card>
      </div>
    </div>
  );
}

function AiSettings() {
  const { config, online } = useAi();
  const [key, setKey] = useState("");
  const [model, setModel] = useState<AiModel>("claude-opus-5-5");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const shown = config?.model ?? model;

  return (
    <Card title="AI 機能（任意・API 接続）" className="span-full">
      <p className="small">
        このアプリは API なし・オフラインですべての学習機能が使えます（講師はオフライン講師、記述式はキーワード採点、学習アドバイスは標準プラン）。API キーを設定した場合だけ、追加で AI 版（AI講師・スクリーンショットの AI 確認・AI 採点・AI アドバイス）を選べるようになります。設定は任意です。
      </p>
      <div className="ai-status">
        状態：
        {config?.apiKey ? <span className="badge good">API キー設定済み</span> : <span className="badge">未設定</span>}
        {!online && <span className="badge warn">オフライン</span>}
      </div>
      <label className="field">
        <span>API キー</span>
        <input
          type="password"
          className="text-input"
          autoComplete="off"
          placeholder={config?.apiKey ? "設定済み（変更する場合のみ入力）" : "sk-ant-..."}
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        <span className="small muted">
          キーはこのブラウザの IndexedDB にのみ保存され、送信先は Anthropic API（api.anthropic.com）だけです。進捗のエクスポートには含まれません。API の利用料金は API キーの所有者に請求されます。
        </span>
      </label>
      <label className="field">
        <span>モデル</span>
        <select
          value={shown}
          onChange={async (e) => {
            const m = e.target.value as AiModel;
            setModel(m);
            if (config) await updateAiConfig({ ...config, model: m });
          }}
        >
          {(Object.keys(MODEL_LABEL) as AiModel[]).map((m) => (
            <option key={m} value={m}>
              {MODEL_LABEL[m]}
            </option>
          ))}
        </select>
      </label>
      <div className="btn-row">
        <button
          className="btn primary"
          disabled={!key.trim()}
          onClick={async () => {
            await updateAiConfig({ apiKey: key.trim(), model: shown });
            setKey("");
            setStatus("API キーを保存しました。");
          }}
        >
          保存
        </button>
        <button
          className="btn"
          disabled={!config?.apiKey || busy}
          onClick={async () => {
            setBusy(true);
            setStatus("接続を確認しています…");
            try {
              const r = await testConnection();
              setStatus(`接続できました（応答：${r}）`);
            } catch (e) {
              setStatus((e as Error).message);
            }
            setBusy(false);
          }}
        >
          接続テスト
        </button>
        <button
          className="btn danger"
          disabled={!config?.apiKey}
          onClick={async () => {
            if (!confirm("保存した API キーを削除します。よろしいですか？")) return;
            await updateAiConfig(null);
            setStatus("API キーを削除しました。");
          }}
        >
          キーを削除
        </button>
      </div>
      {status && <p className="notice">{status}</p>}
      <p className="small muted">
        Opus 5.5 / Sonnet 5.5 では、安全上の理由で回答が拒否された場合にサーバー側で別モデルへ自動的に切り替える設定（fallbacks）を有効にしています。
      </p>
    </Card>
  );
}
