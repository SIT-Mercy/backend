import { loader } from "sheet-engine"
import { type Express } from "express"

interface SheetContext {
  sheetLoaderDir: string
}

export async function init(
  app: Express,
  ctx: SheetContext,
): Promise<void> {
  const entries = await loader.loadSheetProviderInDir(ctx.sheetLoaderDir)
  const name2Loader = new Map<string, loader.XlsxSheetLoaderEntry>()
  for (const entry of entries) {
    name2Loader.set(entry.name, entry)
  }
}
