import { pick } from 'lodash'
import APIError from '../APIError'
import Document from '../Document'
import Pack from '../Pack'
import RequestContext from '../RequestContext'
import { AnyResource, CreateOptions } from '../types'

export default async function create(this: AnyResource, context: RequestContext, document: Document, _: Pack, options: CreateOptions<any>) {
  const db = this.adapter(context)
  if (db == null) {
    throw new APIError(405, `Resource \`${this.type}\` cannot be created`)
  }

  const query  = await this.query(context, pick(options, 'label'))
  const {pack} = await db.create(query, document, options)
  return pack
}