import express, { type Request, type Response } from "express"

const app = express()

async function startServer() {
  app.listen(80)
}

