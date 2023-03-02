import { install as installSourceMap } from "source-map-support"
import { startServer } from "./server.js"

installSourceMap()

await startServer()
