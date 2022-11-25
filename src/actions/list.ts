import APIError from '../APIError'
import Pack from '../Pack'
import RequestContext from '../RequestContext'
import { AnyResource, ListOptions } from '../types'

export default async function list(this: AnyResource, context: RequestContext, options: ListOptions): Promise<Pack> {
  const db = this.adapter(context)
  if (db == null) {
    throw new APIError(405, `Resource \`${this.type}\` can not be listed`)
  }

  let query = await this.query(context, {label: options.label})
  const grandTotal = this.totals ? await db.count(query) : null
  if (options.filters != null) {
    query = await db.applyFilters(query, options.filters)
  }
  if (options.search != null) {
    query = await db.applySearch(query, options.search)
  }
  if (options.sorts) {
    query = await db.applySorts(query, options.sorts)
  }

  const pagination = this.paginationParams(options.pagination ?? {offset: 0, limit: null})

  const pack = await db.find(query, pagination, options)
  Object.assign(pack.meta, await this?.getPackMeta(context))

  pack.meta.total       = grandTotal
  pack.meta.searchTotal = (!this.totals || options.search == null) ? grandTotal : await db.count(query)

  return pack
}