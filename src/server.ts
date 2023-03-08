/* eslint-disable @typescript-eslint/no-misused-promises */
import assert from "assert"
import express, { type Request, type Response } from "express"
import jwt from "jsonwebtoken"
import {
  AuthError, StaffError, StudentError, ItemError,
  StaffPermission,
  type Student, type Staff, type Item
} from "mercy-shared"
import { type Db, MongoClient, ObjectId } from "mongodb"
import { type AuthedRequest, type WithItem, type WithStaff, type WithStudent } from "./type.js"
import { arraysEqualNoOrder } from "./util.js"
import { build as buildMiddleware } from "./middleware.js"
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

  app.post("/op/student/add",
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

  app.post("/op/student/update",
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
        update.version = student.version + 1
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

  app.get("/op/student",
    resolveStudent,
    async (req: AuthedRequest & WithStudent, res) => {
      const student = req.student
      res.status(200).json(student)
    })

  /**
   * For students checking their info.
   * It only requires name and student ID, so don't return security info.
   */
  app.get("/student",
    async (req, res) => {
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

  /**
   * Add a new staff.
   */
  app.post("/op/staff/add",
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
  app.post("/op/staff/update",
    checkPermisionOf([StaffPermission.alterStaffs]),
    resolveStaff,
    async (req: AuthedRequest & WithStaff, res) => {
      const $ = req.body
      const staff = req.staff

      const update: Partial<Staff> = {}
      // TODO: validate data type
      if ($.studentId && staff.studentId !== $.studentId) update.studentId = $.studentId
      if ($.password && staff.password !== $.password) update.password = $.password
      if ($.permissions && !arraysEqualNoOrder(staff.permissions, $.permissions)) update.permissions = $.permissions
      if (Object.keys(update).length > 0) {
        update.version = staff.version + 1
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

  app.get("/op/staff",
    resolveStaff,
    async (req: AuthedRequest & WithStaff, res) => {
      const staff = req.staff
      res.status(200).json({
        student_id: staff.student_id,
        _id: staff._id,
        permissions: staff.permissions,
        creationTime: staff.creationTime,
        version: staff.version,
        active: staff.active,
      } as Partial<Staff>)
    })

  app.post("/op/item/add",
    checkPermisionOf(StaffPermission.alterItems),
    async (req: AuthedRequest, res) => {
      const $ = req.body
      if (!$.name) {
        return res.status(400).json({
          error: ItemError.invalidInfo
        })
      }
      const newItem: Partial<Item> = {
        name: $.name,
        description: $.description ?? "",
        price: $.price,
        rent: $.rent,
        poorPriceFactor: $.poorPriceFactor ?? 0.0,
        creationTime: new Date(),
        version: 0,
        active: true,
      }
      const result = await items.insertOne(newItem)
      return res.status(200).json({
        ...newItem,
        _id: result.insertedId
      })
    })

  app.post("/op/item/update",
    checkPermisionOf(StaffPermission.alterItems),
    resolveItem,
    async (req: AuthedRequest & WithItem, res) => {
      const $ = req.body
      const item = req.item
      const update: Partial<Item> = {}
      // TODO: validate data type
      if ($.name && item.name !== $.name) update.name = $.studentId
      if ($.description && item.description !== $.description) update.description = $.description
      if ($.name && item.name !== $.name) update.name = $.studentId
      if ($.price !== undefined && item.price !== $.price) update.price = $.price
      if ($.rent !== undefined && item.rent !== $.rent) update.rent = $.rent
      if ($.poorPriceFactor && item.poorPriceFactor !== $.poorPriceFactor) update.poorPriceFactor = $.poorPriceFactor
      if ($.active !== undefined && item.active !== $.active) update.active = $.active

      if (Object.keys(update).length > 0) {
        update.version = item.version + 1
        await staffs.updateOne({
          _id: item._id
        }, {
          $set: update
        })
      }
      res.status(200).json({
        _id: item._id,
        ...update
      })
    })

  app.get("/op/item",
    resolveItem,
    (req: AuthedRequest & WithItem, res) => {
      const item = req.item
      res.status(200).json(item)
    })

  app.get("/item",
    resolveItem,
    (req: AuthedRequest & WithItem, res) => {
      const item = req.item
      if (!item.active) {
        return res.status(404).json(ItemError.notFound)
      }
      res.status(200).json({
        name: item.name,
        description: item.description,
        creationTime: this.creationTime,
        price: item.price,
        rent: item.rent,
        poorPriceFactor: item.poorPriceFactor,
      } as Partial<Item>)
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
