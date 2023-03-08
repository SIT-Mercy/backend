/* eslint-disable @typescript-eslint/no-misused-promises */
import { type Express } from "express"
import { StaffPermission, StaffError, StudentError, type Staff } from "mercy-shared"
import { type AuthedRequest, type WithStaff } from "../type"
import { type Collection, ObjectId } from "mongodb"
import { arraysEqualNoOrder } from "../util.js"

interface StaffContext {
  checkPermisionOf: any
  resolveStaff: any
  staffs: Collection
  students: Collection
}

export function init(
  app: Express,
  ctx: StaffContext
): void {
  /**
   * Add a new staff.
   */
  app.post("/op/staff/add",
    ctx.checkPermisionOf([StaffPermission.alterStaffs]),
    async (req, res) => {
      const $ = req.body
      const studentId = $.studentId as string | null
      if (!studentId) {
        return res.status(400).json({
          error: StaffError.invalidQuery
        })
      }
      if (await ctx.staffs.findOne({ studentId }) != null) {
        return res.status(400).json({
          error: StaffError.alreadyExists
        })
      }
      // find its related student
      const student = await ctx.students.findOne({ studentId })
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
      const result = await ctx.staffs.insertOne(newStaff)
      res.status(200).json({
        ...newStaff,
        _id: result.insertedId
      })
    })

  /**
   * Update a staff.
   */
  app.post("/op/staff/update",
    ctx.checkPermisionOf([StaffPermission.alterStaffs]),
    ctx.resolveStaff,
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
        await ctx.staffs.updateOne({
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
    ctx.resolveStaff,
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
}
