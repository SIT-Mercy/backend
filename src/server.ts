/* eslint-disable @typescript-eslint/no-misused-promises */
import assert from "assert"
import express, { type Request, type Response } from "express"
import { type Query } from "express-serve-static-core"
import jwt from "jsonwebtoken"
import { AuthError, StaffError, StaffPermission, type Student, StudentError, type Staff } from "mercy-shared"
import { type Db, MongoClient, ObjectId, type Int32 } from "mongodb"
import { arraysEqualNoOrder } from "./util.js"
const { TokenExpiredError } = jwt

interface AuthedRequest extends Request {
  staffSelf: Staff
}

interface WithStudent {
  student: Student
}

interface WithStaff {
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
  app.use("/op/*", async (req: AuthedRequest, res, next) => {
    // Skip "/op/login" itself
    if (req.path === "/op/login") {
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

  function checkPermisionOf(requirements: StaffPermission[]) {
    return (req: AuthedRequest, res: Response, next) => {
      if (requirements.every((it) => req.staffSelf.permissions.includes(it))) {
        next()
      } else {
        return res.status(403).json({
          error: AuthError.noPermission
        })
      }
    }
  }

  async function resolveStudent(req: Request & WithStudent, res: Response, next): Promise<any> {
    const $ = req.body
    const studentId = $.studentId as string
    const _id = $._id as string
    let found: Student
    if (studentId) {
      found = await students.findOne({ studentId }) as Student
    } else if (_id) {
      found = await students.findOne({ _id: new ObjectId(_id) }) as Student
    } else {
      return res.status(400).json({ error: StudentError.notFound })
    }
    if (found) {
      req.student = found
      next()
    } else {
      return res.status(404).json({ error: StudentError.notFound })
    }
  }

  async function resolveStaff(req: Request & WithStaff, res: Response, next): Promise<any> {
    const $ = req.body
    const studentId = $.studentId as string
    const _id = $._id as string
    let found: Staff
    if (studentId) {
      found = await staffs.findOne({ studentId }) as Staff
    } else if (_id) {
      found = await staffs.findOne({ _id: new ObjectId(_id) }) as Staff
    } else {
      return res.status(400).json({ error: StaffError.invalidQuery })
    }
    if (found) {
      req.staff = found
      next()
    } else {
      return res.status(404).json({ error: StaffError.notFound })
    }
  }

  app.post("/op/addStudent",
    checkPermisionOf([StaffPermission.alterStaffs]),
    async (req: AuthedRequest, res) => {
      const $ = req.body
      const studentId = $.studentId as string | null
      if (!studentId) {
        return res.status(400).json({
          error: StudentError.invalidQuery
        })
      }
      if (await students.findOne({ studentId }) != null) {
        return res.status(400).json({
          error: StudentError.alreadyExists
        })
      }
      const newStudent: Partial<Student> = {
        studentId: $.studentId,
        name: $.name,
        college: $.college,
        creationTime: new Date(),
        version: 0
      }
      const result = await students.insertOne(newStudent)
      return res.status(200).json({
        ...newStudent,
        _id: result.insertedId
      })
    })

  app.post("/op/updateStudent",
    checkPermisionOf([StaffPermission.alterStaffs]),
    resolveStudent,
    async (req: AuthedRequest & WithStudent, res) => {
      const $ = req.body
      const student = req.student
      const update: Partial<Student> = {}
      // TODO: validate data type
      if ($.studentId && student.studentId !== $.studentId) update.studentId = $.studentId
      if ($.name && student.name !== $.name) update.name = $.name
      if ($.college && student.college !== $.college) update.college = $.college
      if ($.phone && student.phone !== $.phone) update.phone = $.phone
      if ($.poorLv && student.poorLv !== $.poorLv) update.poorLv = $.poorLv
      if (Object.keys(update).length > 0) {
        update.version = (student.version as number) + 1
        const result = await students.updateOne({
          _id: student._id
        }, {
          $set: update
        })
        console.log(result)
      }
      res.status(200).json({
        _id: student._id,
        ...update,
      })
    })

  /**
   * Add a new staff.
   */
  app.post("/op/addStaff",
    checkPermisionOf([StaffPermission.alterStaffs]),
    async (req, res) => {
      const $ = req.body
      const studentId = $.studentId as string | null
      if (!studentId) {
        return res.status(400).json({
          error: StaffError.invalidQuery
        })
      }
      if (await staffs.findOne({ studentId }) != null) {
        return res.status(400).json({
          error: StaffError.alreadyExists
        })
      }
      // find its related student
      const student = await students.findOne({ studentId })
      if (!student) {
        return res.status(400).send({
          error: StudentError.notFound
        })
      }
      const newStaff: Partial<Staff> = {
        studentId,
        student_id: student._id,
        password: $.password ?? "",
        permissions: $.permissions ?? [],
        creationTime: new Date(),
        version: 0
      }
      const result = await staffs.insertOne(newStaff)
      res.status(200).json({
        ...newStaff,
        _id: result.insertedId
      })
    })

  /**
   * Update a staff.
   */
  app.post("/op/updateStaff",
    checkPermisionOf([StaffPermission.alterStaffs]),
    resolveStaff,
    async (req: AuthedRequest & WithStaff, res) => {
      const $ = req.body
      const staff = req.staff

      const update: Partial<Staff> = {}
      // TODO: validate data type
      if ($.studentId && staff.studentId !== $.studentId) update.studentId = $.studentId
      if ($.password && staff.password !== $.password) update.password = $.password
      if ($.permissions && arraysEqualNoOrder(staff.permissions, $.permissions)) update.permissions = $.permissions
      if (Object.keys(update).length > 0) {
        update.version = (staff.version as number) + 1
        await staffs.updateOne({
          _id: staff._id
        }, {
          $set: update
        })
      }
      res.status(200).json({
        _id: staff._id,
        ...update
      })
    })

  app.get("/op/studentInfo",
    resolveStudent,
    async (req: AuthedRequest & WithStudent, res) => {
      const student = req.student
      res.json(student)
    })

  /**
   * For students checking their info.
   * It only requires name and student ID, so don't return security info.
   */
  app.get("/studentInfo", async (req, res) => {
    const name = req.query.name
    const studentId = req.query.studentId
    if (typeof studentId !== "string" && typeof name !== "string") {
      return res.status(400).json({ error: StudentError.invalidQuery })
    }
    const student = await students.findOne({ studentId, name }) as Student | null
    if (!student) {
      return res.status(404).json({ error: StudentError.notFound })
    }
    res.json({
      studentId: student.studentId,
      name: student.name,
      point: student.point,
      college: student.college,
    } as Partial<Student>)
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
