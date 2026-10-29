import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
export type RpcEvent = { id?: number | string; method: string; params: any };
export const desktop = isTauri();
export async function rpc<T = any>(
  method: string,
  params: any = {},
): Promise<T> {
  if (!desktop)
    throw new Error(
      "Open the desktop app to connect to your local Codex session.",
    );
  return invoke<T>("rpc", { method, params });
}
export const connect = () => invoke<any>("connect");
export const chooseUploads = (cwd: string) =>
  invoke<{ name: string; path: string; size: number }[]>("choose_uploads", {
    cwd,
  });
export const listPlugins = () => invoke<any>("plugin_catalog");
export const installPlugin = (pluginId: string, force = true) =>
  invoke<any>("install_plugin", { pluginId, force });
export const respond = (id: number | string, result: any) =>
  invoke("respond", { id, result });
export const rejectRequest = (id: number | string) =>
  invoke("respond", {
    id,
    error: {
      code: -32601,
      message: "This client does not support this request.",
    },
  });
export const onEvent = (handler: (event: RpcEvent) => void) =>
  listen<RpcEvent>("codex-event", (e) => handler(e.payload));
