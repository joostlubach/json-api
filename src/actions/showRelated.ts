import { Pack } from 'json-api'
import { pick } from 'lodash'
import APIError from '../APIError'
import RequestContext from '../RequestContext'
import { ActionOptions, AnyResource } from '../types'

export default async function showRelated(
  this:             AnyResource,
  context:          RequestContext,
  relationshipName: string,
  parentID:         string,
  options:          ActionOptions
): Promise<Pack> {
  const relationship = this.relationship(relationshipName)
  if (relationship == null) {
    throw new APIError(404, `Relationship \`${relationshipName}\` not found`)
  }

  if (relationship.type == null) {
    throw new APIError(409, `This action is unavailable for polymorphic relationships`)
  }

  const relatedResource = this.registry.get(relationship.type)
  if (relatedResource == null) {
    throw new APIError(404, `Related resource \`${relationship.type}\` was not found`)
  }

  const db = this.adapter(context)
  if (db == null) {
    throw new APIError(405, `Resource \`${this.type}\` can not be shown`)
  }

  const query  = await this.query(context, pick(options, 'label'))
  const {pack} = await db.getRelated(this, query, relationship, relationshipName, parentID, options)
  return pack
}