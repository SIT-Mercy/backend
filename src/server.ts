import express, { type Request, type Response } from "express"

export async function startServer(): Promise<void> {
  const app = express()

  app.get("/", (req, res) => {
    res.status(200)
    res.contentType("text/plain")
    res.send("Hello world!")
    res.end()
  })
  app.listen(6878, () => {
    console.log("Server running at http://localhost:6878")
  })
}
