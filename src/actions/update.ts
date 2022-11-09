import Pack from '../Pack'
import Document from '../Document'
import APIError from '../APIError'
import RequestContext from '../RequestContext'
import { AnyResource, UpdateOptions } from '../types'

export default async function update(this: AnyResource, context: RequestContext, document: Document, _: Pack, options: UpdateOptions<any>) {
  const db = this.adapter(context)
  if (db == null) {
    throw new APIError(405, `Resource \`${this.type}\` can not be updated`)
  }

  const {pack} = await db.update(document, options)
  return pack
}