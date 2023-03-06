/* eslint-disable @typescript-eslint/no-misused-promises */
import express, { type Request, type Response } from "express"
import jwt from "jsonwebtoken"
import { AuthError, StaffPermission, type Staff } from "mercy-shared"
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
      req.staff = staff
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
  app.use("/op/updateStaff", checkPermisionOf([StaffPermission.alterStaffs]))
  app.use("/op/updateStudentInfo", checkPermisionOf([StaffPermission.alterStudentInfo]))
  app.post("/op/updateStudentInfo", (req, res) => {

  })
  app.post("/op/updateStaff", (req, res) => {

  })
  app.post("/op/updateSelf", (req, res) => {

  })
  app.get("/op/studentInfo", async (req, res) => {
    // for real StudentId
    const studentId = req.query.studentId
    // for mongoDB ObjectId
    const student_id = req.query.student_id
    if (!(studentId instanceof String || student_id instanceof String)) {
      res.status(400)
      res.json({ error: StudentError.studentIdNotGiven })
      return
    }
    const student = studentId ?
      await students.findOne({ studentId })
      : students.findOne({ student_id: new ObjectId(student_id as string) })
    if (!student) {
      res.status(404)
      res.json({ error: StudentError.noSuchStudent })
      return
    }
    res.json(student)
  })
  app.get("/myStudentInfo", async (req, res) => {
    const name = req.query.name
    const studentId = req.query.studentId
    if (!(studentId instanceof String && name instanceof String)) {
      res.status(400)
      res.json({ error: StudentError.studentIdNotGiven })
      return
    }
    const student = await students.findOne({ studentId, name })
    if (!student) {
      res.status(404)
      res.json({ error: StudentError.noSuchStudent })
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

  app.post("/addUser", (req: AuthedRequest, res) => {

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
