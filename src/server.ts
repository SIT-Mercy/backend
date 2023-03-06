import { assert } from "console"
import express, { type Request, type Response } from "express"
import jwt from "jsonwebtoken"
import { type Db, MongoClient } from "mongodb"
import { AuthError } from "mercy-shared"

interface AuthedRequest extends Request {
  studentId?: string
}

interface ServerContext {
  db: Db
  jwtSecret: string
}

export async function start(): Promise<void> {
  // TODO: generate a random secret when lanuching
  const jwtSecret = "mysecretkey"
  const uri = "mongodb://localhost:27017"
  const client = new MongoClient(uri)
  try {
    const db = client.db("sit_mercy")
    await startServer({
      db,
      jwtSecret
    })
  } catch (e) {
    client.close()
    console.log(e)
  }
}

async function startServer(ctx: ServerContext): Promise<void> {
  const app = express()

  const staffs = ctx.db.collection("staffs")

  // Convert the "req.body" to json
  app.use(express.json())

  // validate each request with jwt
  app.use((req: AuthedRequest, res, next) => {
    // Skip "/login" itself
    if (req.path === "/login") {
      next()
      return
    }
    // Check if Authorization header is present
    const authHeader = req.headers.authorization
    if (!authHeader) {
      res.status(401)
      res.json({ error: AuthError.missingHeader })
      return
    }
    console.log(authHeader)
    try {
      // Extract token from Authorization header
      const scheme = authHeader.split(" ")
      // Use Bearer authentication scheme
      assert(scheme[0] === "Bearer")
      const token = scheme[1]
      // Verify token and decode payload
      const payload = jwt.verify(token, ctx.jwtSecret)

      // Attach payload to request object for later use
      req.studentId = payload.sub as string
      console.log(payload)
      next()
    } catch (err) {
      console.log(err)
      // Return error if token is invalid
      res.status(401)
      res.json({ error: AuthError.invalidJwt })
    }
  })

  app.get("/", (req, res) => {
    res.status(200)
    res.contentType("text/plain")
    res.send("Hello world!")
    res.end()
  })

  app.post("/addUser", (req: AuthedRequest, res) => {

  })

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.post("/login", async (req, res) => {
    const { studentId, password } = req.body
    const staff = await staffs.findOne({ studentId })
    if (!staff) {
      res.status(401)
      res.json({ error: AuthError.staffNotFound })
      return
    }
    if (staff.password !== password) {
      res.status(401)
      res.json({ error: AuthError.wrongStudentIdOrPassword })
      return
    }
    console.log(staff.studentId)
    // Create JWT token
    const token = jwt.sign({ sub: staff.studentId }, ctx.jwtSecret, {
      expiresIn: "2h"
    })
    console.log(token)
    // Send token in response
    res.json({ token })
  })

  app.listen(12878, () => {
    console.log("Server running at http://localhost:12878")
  })
}
