/* eslint-disable @typescript-eslint/no-misused-promises */
import { loader } from "sheet-engine"
import { type Express } from "express"
import multer from "multer"
interface SheetContext {
  sheetLoaderDir: string
}

export async function init(
  app: Express,
  ctx: SheetContext,
): Promise<void> {
  const entries = await loader.loadSheetProviderInDir(ctx.sheetLoaderDir)
  const name2Loader = new Map<string, loader.XlsxSheetLoaderPorvider>()
  for (const entry of entries) {
    name2Loader.set(entry.name, entry)
  }

  app.get("/op/sheet-loaders",
    (req, res) => {
      const loaders = entries.map((e) => {
        return {
          name: e.name,
          description: e.description,
          type: e.type,
        }
      })
      return res.status(200).json(loaders)
    })
  const upload = multer()
  app.post("/op/load-students",
    upload.single("StudentList"),
    async (res, req) => {

    })
}
