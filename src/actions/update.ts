import { pick } from 'lodash'
import APIError from '../APIError'
import Document from '../Document'
import Pack from '../Pack'
import RequestContext from '../RequestContext'
import { AnyResource, UpdateOptions } from '../types'

export default async function update(this: AnyResource, context: RequestContext, document: Document, _: Pack, options: UpdateOptions<any>) {
  const db = this.adapter(context)
  if (db == null) {
    throw new APIError(405, `Resource \`${this.type}\` can not be updated`)
  }

  const query  = await this.query(context, pick(options, 'label'))
  const {pack} = await db.update(query, document, options)
  return pack
}