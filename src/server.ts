/* eslint-disable @typescript-eslint/no-misused-promises */
import assert from "assert"
import express, { type Request, type Response } from "express"
import { type Query } from "express-serve-static-core"
import jwt from "jsonwebtoken"
import { AuthError, StaffError, StaffPermission, type Student, StudentError, type Staff } from "mercy-shared"
import { type Db, MongoClient, ObjectId } from "mongodb"

interface AuthedRequest extends Request {
  staff: Staff
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
  const students = ctx.db.collection("students")

  // Convert the "req.body" to json
  app.use(express.json())

  // validate each request with jwt
  app.use(async (req: AuthedRequest, res, next) => {
    // Skip "/login" itself
    if (req.path === "/op/login") {
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
      const studentId = payload.sub as string
      const staff = await staffs.findOne({ studentId })
      if (!staff) {
        res.status(401)
        res.json({ error: AuthError.staffNotFound })
        return
      }
      req.staff = staff as Staff
      console.log(payload)
      next()
    } catch (err) {
      console.log(err)
      // Return error if token is invalid
      res.status(401)
      res.json({ error: AuthError.invalidJwt })
    }
  })

  function checkPermisionOf(requirements: StaffPermission[]) {
    return (req: AuthedRequest, res: Response, next) => {
      if (requirements.every((it) => req.staff.permissions.includes(it))) {
        next()
      } else {
        res.status(403)
        res.json({ error: AuthError.noPermission })
        return
      }
    }
  }

  async function findStudent(query: Query): Promise<Student | null | undefined> {
    // for real StudentId
    const studentId = query.studentId
    // for mongoDB ObjectId
    const student_id = query.student_id
    if (!(studentId instanceof String || student_id instanceof String)) {
      return
    }
    const student = studentId
      ? await students.findOne({ studentId })
      : await students.findOne({ _id: new ObjectId(student_id as string) })
    return student as Student | null
  }

  async function findStaff(query: Query): Promise<Staff | null | undefined> {
    // for real StudentId
    const studentId = query.studentId
    // for mongoDB ObjectId
    const staff_id = query.staff_id
    if (!(studentId instanceof String || staff_id instanceof String)) {
      return
    }
    const staff = studentId
      ? await staffs.findOne({ studentId })
      : await staffs.findOne({ _id: new ObjectId(staff_id as string) })
    return staff as Staff | null
  }

  app.post("/op/updateStudentInfo", (req, res) => {

  })
  /**
   * Update or add a new staff.
   */
  app.put("/op/staffInfo",
    checkPermisionOf([StaffPermission.alterStaffs]),
    async (req, res) => {
      const staff = await findStaff(req.query)
      const $ = req.body
      // if staff exists, then update it
      if (staff) {
        const update: Partial<Staff> = {}
        // TODO: validate data type
        if ($.studentId) update.studentId = $.studentId
        if ($.password) update.password = $.password
        if ($.permissions) update.permissions = $.permissions
        if (Object.keys(update).length > 0) {
          update.version = (staff.version as number) + 1
          await staffs.updateOne({
            _id: staff._id
          }, {
            $set: update
          })
        }
        res.status(200)
      } else {
        // otherwise add it
        if ($.studentId && $.password && $.permissions) {
          await staffs.insertOne({
            studentId: $.studentId,
            password: $.password,
            permissions: $.permissions,
            creationTime: new Date(),
            version: 0
          } as Partial<Staff>)
          res.status(200)
        } else {
          res.status(400)
          res.json({ error: StaffError.invalidStaffInfo })
        }
      }
    })

  app.put("/op/studentInfo",
    checkPermisionOf([StaffPermission.alterStudentInfo]),
    async (req, res) => {
      const student = await findStudent(req.query)
      const $ = req.body
      if (student) {
        const update: Partial<Student> = {}
        // TODO: validate data type
        if ($.studentId) update.studentId = $.studentId
        if ($.name) update.name = $.name
        if ($.college) update.college = $.college
        if ($.phone) update.phone = $.phone
        if ($.poorLv) update.poorLv = $.poorLv
        if (Object.keys(update).length > 0) {
          update.version = (student.version as number) + 1
          await staffs.updateOne({
            _id: student._id
          }, {
            $set: update
          })
        }
        res.status(200)
      } else {
        if ($.studentId && $.name) {
          await students.insertOne({
            studentId: $.studentId,
            name: $.name,
            college: $.college,
            creationTime: new Date(),
            version: 0
          } as Partial<Student>)
          res.status(200)
        } else {
          res.status(400)
          res.json({ error: StudentError.invalidStudentInfo })
        }
      }
    })

  app.get("/op/studentInfo", async (req, res) => {
    const student = await findStudent(req.query)
    if (!student) {
      res.status(404)
      res.json({ error: StudentError.studentNotFound })
      return
    }
    res.json(student)
  })
  
  /**
   * For students checking their info.
   * It only requires name and student ID, so don't return security info.
   */
  app.get("/studentInfo", async (req, res) => {
    const name = req.query.name
    const studentId = req.query.studentId
    if (!(studentId instanceof String && name instanceof String)) {
      res.status(400)
      res.json({ error: StudentError.invalidStudentQuery })
      return
    }
    const student = await students.findOne({ studentId, name })
    if (!student) {
      res.status(404)
      res.json({ error: StudentError.studentNotFound })
      return
    }
    res.json(student)
  })

  app.get("/", (req, res) => {
    res.status(200)
    res.contentType("text/plain")
    res.send("Hello world!")
    res.end()
  })

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
