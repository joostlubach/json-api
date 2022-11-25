import { pick } from 'lodash'
import { AnyResource, RequestContext } from '../'
import { ActionOptions, BulkSelector } from '../types'

export default async function del(this: AnyResource, context: RequestContext, selector: BulkSelector, options: ActionOptions = {}) {
  const db = this.adapter(context)

  let query = await this.query(context, pick(options, 'label'))
  query = await this.applyBulkSelector(query, selector, context)

  return await db.delete(query, options)
}