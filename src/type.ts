import type { Staff, Student, Item } from "mercy-shared"
import { type Request } from "express"

export interface AuthedRequest extends Request {
  staffSelf: Staff
}

export interface WithStudent {
  student: Student
}

export interface WithStaff {
  staff: Staff
}

export interface WithItem {
  item: Item
}
