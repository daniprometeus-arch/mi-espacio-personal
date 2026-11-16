import { google, drive, fileId } from "./google";
import { stateSchema, type AppState } from "./model";
import { AppError } from "./auth";
export const backupPrefix = "mi-espacio-backup-v1-";
export async function createJsonFile(name: string, state: AppState) {
  const boundary = `mep_${crypto.randomUUID()}`;
  const metadata = JSON.stringify({
    name,
    parents: ["appDataFolder"],
    mimeType: "application/json",
  });
  return google(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body: `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(state)}\r\n--${boundary}--`,
    },
  );
}
export async function listBackups() {
  const params = new URLSearchParams({
    spaces: "appDataFolder",
    q: `name contains '${backupPrefix}' and trashed = false`,
    fields: "files(id,name,createdTime)",
    orderBy: "createdTime desc",
    pageSize: "100",
  });
  return (await (await google(`${drive}/files?${params}`)).json()).files as {
    id: string;
    name: string;
    createdTime: string;
  }[];
}
export async function backupState(state: AppState) {
  await createJsonFile(
    `${backupPrefix}${state.revision}-${Date.now()}.json`,
    state,
  );
}
export async function pruneBackups() {
  const all = await listBackups();
  for (const backup of all.slice(10))
    await google(`${drive}/files/${fileId(backup.id)}`, { method: "DELETE" });
}
export async function readBackup(id: string) {
  const all = await listBackups();
  if (!all.some((b) => b.id === id))
    throw new AppError("Copia no encontrada", 404);
  return stateSchema.parse(
    await (await google(`${drive}/files/${fileId(id)}?alt=media`)).json(),
  );
}
