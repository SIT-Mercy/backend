import { install as installSourceMap } from "source-map-support"
import { start } from "./server.js"
import path from "path"
import { fileURLToPath } from "url"

installSourceMap()

const rootDir = path.dirname(fileURLToPath(import.meta.url))

await start({
  dbUri: "mongodb://localhost:27017",
  dbName: "sit_mercy",
  port: 2468,
  dataDir: rootDir,
})
