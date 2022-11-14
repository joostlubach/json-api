import { ActionOptions } from 'json-api'
import { AnyResource, RequestContext, ResourceLocator } from '../'
import APIError from '../APIError'

export default async function show(this: AnyResource, context: RequestContext, locator: ResourceLocator, options: ActionOptions) {
  const db = this.adapter(context)
  if (db == null) {
    throw new APIError(405, `Resource \`${this.type}\` can not be shown`)
  }

  const query = await this.query(context)

  const {pack} = await db.get(query, locator, options)
  Object.assign(pack.meta, await this?.getPackMeta(context))

  return pack
}