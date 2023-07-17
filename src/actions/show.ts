import { pick } from 'lodash'
import APIError from '../APIError'
import RequestContext from '../RequestContext'
import { ActionOptions, AnyResource, ResourceLocator } from '../types'

export default async function show(this: AnyResource, context: RequestContext, locator: ResourceLocator, options: ActionOptions) {
  const db = this.adapter(context)
  if (db == null) {
    throw new APIError(405, `Resource \`${this.type}\` can not be shown`)
  }

  const query = await this.query(context, pick(options, 'label'))

  const {pack} = await db.get(query, locator, options)
  Object.assign(pack.meta, await this?.getPackMeta(context))

  return pack
}