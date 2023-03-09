/* eslint-disable @typescript-eslint/no-misused-promises */
import { type Express, type RequestHandler } from "express"
import { StaffPermission, ItemError, type Item } from "mercy-shared"
import { type AuthedRequest, type WithItem } from "../type"
import { type Collection, ObjectId } from "mongodb"

interface ItemContext {
  checkPermisionOf: any
  resolveItem: any
  items: Collection
}

export function init(
  app: Express,
  ctx: ItemContext
): void {
  app.post("/op/item/add",
    ctx.checkPermisionOf(StaffPermission.alterItems),
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
      const result = await ctx.items.insertOne(newItem)
      return res.status(200).json({
        ...newItem,
        _id: result.insertedId
      })
    })

  app.post("/op/item/update",
    ctx.checkPermisionOf(StaffPermission.alterItems),
    ctx.resolveItem,
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
        await ctx.items.updateOne({
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
    ctx.resolveItem,
    (req: AuthedRequest & WithItem, res) => {
      const item = req.item
      res.status(200).json(item)
    })

  app.get("/op/items",
    async (req: AuthedRequest, res) => {
      const all = await ctx.items.find({ active: true } as Partial<Item>).toArray()
      return res.status(200).json(all)
    })

  app.get("/item",
    ctx.resolveItem,
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

  app.get("/items",
    async (req: AuthedRequest, res) => {
      const all = await ctx.items.find({ active: true } as Partial<Item>).toArray()
      return res.status(200).json(all)
    })
}
