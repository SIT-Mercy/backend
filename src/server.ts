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
const { TokenExpiredError } = jwt

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
  const students = ctx.db.collection("students")
  const items = ctx.db.collection("items")

  // Convert the "req.body" to json
  app.use(express.json())

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

  app.get("/", (req, res) => {
    res.status(200)
    res.contentType("text/plain")
    res.send("Hello world!")
    res.end()
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

  app.listen(2468, () => {
    console.log("Server running at http://localhost:2468")
  })
}
