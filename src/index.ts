import { install as installSourceMap } from "source-map-support"
import { start } from "./server.js"

installSourceMap()

await start({
  dbUri: "mongodb://localhost:27017",
  dbName: "sit_mercy",
  port: 2468
})
