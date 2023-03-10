/* eslint-disable @typescript-eslint/no-misused-promises */
import assert from "assert"
import express, { type Request, type Response } from "express"
import jwt from "jsonwebtoken"
import {
  AuthError, StaffError, type Staff
} from "mercy-shared"
import { type Db, MongoClient, ObjectId } from "mongodb"
import { type AuthedRequest } from "./type.js"
import { build as buildMiddleware } from "./middleware.js"
import { init as initItemService } from "./service/item.js"
import { init as initStaffService } from "./service/staff.js"
import { init as initStudentService } from "./service/student.js"
import cors from "cors"
const { TokenExpiredError } = jwt
interface ServerOptions {
  dbUri: string
  dbName: string
  port: number
}
interface ServerContext {
  db: Db
  jwtSecret: string
  port: number
}

export async function start(options: ServerOptions): Promise<void> {
  // TODO: generate a random secret when lanuching
  const jwtSecret = "mysecretkey"
  const client = new MongoClient(options.dbUri)
  try {
    const db = client.db(options.dbName)
    await startServer({
      db,
      jwtSecret,
      port: options.port
    })
  } catch (e) {
    client.close()
    console.log(e)
  }
}

async function startServer(ctx: ServerContext): Promise<void> {
  const app = express()

  // Convert the "req.body" to json
  app.use(express.json())
  // Cross-origin requests sharing
  app.use(cors())

  const staffs = ctx.db.collection("staffs")
  const students = ctx.db.collection("students")
  const items = ctx.db.collection("items")

  // validate each request with jwt
  app.use("/op/*", async (req: AuthedRequest, res, next) => {
    // Skip "/op/login" itself
    if (req.baseUrl === "/op/login") {
      next()
      return
    }
    // Check if Authorization header is present
    const authHeader = req.headers.authorization
    if (!authHeader) {
      return res.status(401).json({
        error: AuthError.missingHeader
      })
    }
    try {
      // Extract token from Authorization header
      const scheme = authHeader.split(" ")
      // Use Bearer authentication scheme
      assert(scheme[0] === "Bearer")
      const token = scheme[1]
      // Verify token and decode payload
      const payload = jwt.verify(token, ctx.jwtSecret)

      // Attach payload to request object for later use
      const studentId = payload.sub as string
      const staff = await staffs.findOne({ studentId })
      if (!staff) {
        return res.status(401).json({ error: StaffError.notFound })
      }
      req.staffSelf = staff as Staff
      next()
    } catch (err) {
      if (err instanceof TokenExpiredError) {
        return res.status(401).json({ error: AuthError.expiredJwt })
      } else {
        res.status(401).json({ error: AuthError.invalidJwt })
      }
    }
  })
  /**
   * For JWT validation
   */
  app.post("/op/validate", (req, res) => {
    res.status(200)
    res.end()
  })

  const {
    checkPermisionOf,
    resolveStaff, resolveItem, resolveStudent,
  } = buildMiddleware({
    staffs, students, items
  })

  initStudentService(app, {
    checkPermisionOf,
    resolveStudent,
    students,
  })

  initStaffService(app, {
    checkPermisionOf,
    resolveStaff,
    students,
    staffs,
  })

  initItemService(app, {
    checkPermisionOf,
    resolveItem,
    items,
  })

  app.post("/op/login",
    async (req, res) => {
      const { studentId, password } = req.body
      const staff = await staffs.findOne({ studentId })
      if (!staff) {
        res.status(401)
        res.json({ error: StaffError.notFound })
        return
      }
      if (staff.password !== password) {
        res.status(401)
        res.json({ error: AuthError.wrongCredentials })
        return
      }
      // Create JWT token
      const token = jwt.sign({ sub: staff.studentId }, ctx.jwtSecret, {
        expiresIn: "2h"
      })
      // Send token in response
      res.json({ token })
    })

  app.listen(ctx.port, () => {
    console.log(`Server running at http://localhost:${ctx.port}`)
  })
}
