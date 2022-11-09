import { RequestContext, AnyResource } from '..'
import { BulkSelector, ActionOptions } from '../types'

export default async function del(this: AnyResource, context: RequestContext, selector: BulkSelector, options: ActionOptions = {}) {
  const db = this.adapter(context)

  let query = db.query()
  query = await this.applyScope(query, context)
  query = await this.applyBulkSelector(query, selector, context)

  return await db.delete(query, options)
}