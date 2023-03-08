import { type Collection, ObjectId } from "mongodb"
import {
  AuthError, StaffError, StudentError, ItemError,
  type StaffPermission,
  type Student, type Staff, type Item
} from "mercy-shared"
import type { AuthedRequest, WithItem, WithStaff, WithStudent } from "./type.js"
import type { Request, Response } from "express"

interface DbContext {
  students: Collection
  items: Collection
  staffs: Collection
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function build(db: DbContext) {
  function checkPermisionOf(requirement: StaffPermission[] | StaffPermission) {
    return (req: AuthedRequest, res: Response, next) => {
      let meet: boolean
      if (Array.isArray(requirement)) {
        meet = requirement.every((it) => req.staffSelf.permissions.includes(it))
      } else {
        meet = req.staffSelf.permissions.includes(requirement)
      }
      if (meet) {
        next()
      } else {
        return res.status(403).json({
          error: AuthError.noPermission
        })
      }
    }
  }

  async function resolveStudent(req: AuthedRequest & WithStudent, res: Response, next): Promise<any> {
    const $ = req.body
    const studentId = ($.studentId || req.query.studentId) as string
    const _id = ($._id || req.query.id) as string
    let found: Student
    if (studentId) {
      found = await db.students.findOne({ studentId }) as Student
    } else if (_id) {
      found = await db.students.findOne({ _id: new ObjectId(_id) }) as Student
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

  async function resolveStaff(req: AuthedRequest & WithStaff, res: Response, next): Promise<any> {
    const $ = req.body
    const studentId = $.studentId as string
    const _id = $._id as string
    let found: Staff
    if (studentId) {
      found = await db.staffs.findOne({ studentId }) as Staff
    } else if (_id) {
      found = await db.staffs.findOne({ _id: new ObjectId(_id) }) as Staff
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

  async function resolveItem(req: AuthedRequest & WithItem, res: Response, next): Promise<any> {
    const $ = req.body
    const _id = $._id as string
    let found: Item
    if (_id) {
      found = await db.items.findOne({ _id: new ObjectId(_id) }) as Item
    } else {
      return res.status(400).json({ error: ItemError.invalidQuery })
    }
    if (found) {
      req.item = found
      next()
    } else {
      return res.status(404).json({ error: ItemError.notFound })
    }
  }
  return {
    checkPermisionOf,
    resolveItem,
    resolveStaff,
    resolveStudent
  }
}
