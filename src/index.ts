import { install as installSourceMap } from "source-map-support"
import { start } from "./server.js"

installSourceMap()

await start()
