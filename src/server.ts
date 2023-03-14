/* eslint-disable @typescript-eslint/no-misused-promises */
import assert from "assert"
import express, { type Request, type Response } from "express"
import jwt from "jsonwebtoken"
import {
  AuthError, StaffError, type Student, type Staff
} from "mercy-shared"
import { type Db, MongoClient, ObjectId } from "mongodb"
import { type AuthedRequest } from "./type.js"
import { build as buildMiddleware } from "./middleware.js"
import { init as initItemService } from "./service/item.js"
import { init as initStaffService } from "./service/staff.js"
import { init as initStudentService } from "./service/student.js"
import cors from "cors"
import { init as initSheetService } from "./service/sheet.js"
import path from "path"
const { TokenExpiredError } = jwt

interface ServerOptions {
  dbUri: string
  dbName: string
  port: number
  dataDir: string
}
interface ServerContext {
  db: Db
  jwtSecret: string
  port: number
  dataDir: string
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
      port: options.port,
      dataDir: options.dataDir,
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
    return res.status(200).end()
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

  await initSheetService(app, {
    sheetLoaderDir: path.resolve(ctx.dataDir, "sheet-loader")
  })

  app.post("/op/login",
    async (req, res) => {
      const { studentId, password } = req.body
      // only finding active staffs
      const staff = await staffs.findOne({ studentId, active: true }) as Staff || null
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
      const student = await students.findOne({ _id: staff.student_id }) as Student
      // Send token in response and staff info
      return res.json({
        _id: staff._id,
        student_id: student._id,
        studentId: staff.studentId,
        name: student.name,
        permissions: staff.permissions,
        jwt: token,
      })
    })

  app.listen(ctx.port, () => {
    console.log(`Server running at http://localhost:${ctx.port}`)
  })
}
