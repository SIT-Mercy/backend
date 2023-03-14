/* eslint-disable @typescript-eslint/no-misused-promises */
import { type RequestHandler, type Express } from "express"
import { StaffPermission, StudentError, type Student } from "mercy-shared"
import { type AuthedRequest, type WithStudent } from "../type"
import { type Collection, ObjectId } from "mongodb"

interface StudentContext {
  checkPermisionOf: (arg: any) => RequestHandler
  resolveStudent: any
  students: Collection
}

export function init(
  app: Express,
  ctx: StudentContext
): void {
  app.post("/op/student/add",
    ctx.checkPermisionOf([StaffPermission.alterStudents]),
    async (req: AuthedRequest, res) => {
      const $ = req.body
      const studentId = $.studentId as string | null
      if (!studentId) {
        return res.status(400).json({
          error: StudentError.invalidQuery
        })
      }
      if (await ctx.students.findOne({ studentId }) != null) {
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
      const result = await ctx.students.insertOne(newStudent)
      return res.status(200).json({
        ...newStudent,
        _id: result.insertedId
      })
    })

  app.post("/op/student/update",
    ctx.checkPermisionOf([StaffPermission.alterStudents]),
    ctx.resolveStudent,
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
        const result = await ctx.students.updateOne({
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
    ctx.resolveStudent,
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
      const student = await ctx.students.findOne({ studentId, name }) as Student | null
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
   * Get all students
   */
  app.get("/op/students",
    async (req, res) => {
      const $ = req.body
      let students: any
      if ($.page && $.limit) {
        // pagination
        const skip = ($.page - 1) * $.limit
        students = await ctx.students.find().skip(skip).limit($.limit).toArray()
      } else {
        // all
        students = await ctx.students.find().toArray()
      }
      return res.status(200).json(students)
    })

  app.get("/op/students/query",
    async (req, res) => {
      const $ = req.body
      const prompt = $.prompt
      if (prompt) {
        const found = await ctx.students.find({
          $or: [
            { studentId: { $regex: prompt, $options: "i" } },
            { name: { $regex: prompt, $options: "i" } }
          ]
        }).toArray()
        return res.status(200).json(found)
      } else {
        return res.status(200).json([])
      }
    }
  )
}
