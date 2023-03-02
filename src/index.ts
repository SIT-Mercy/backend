import express, { type Request, type Response } from "express"
import { install as installSourceMap } from "source-map-support"

installSourceMap()

const app = express()

async function startServer(): Promise<void> {
  app.listen(80)
}
