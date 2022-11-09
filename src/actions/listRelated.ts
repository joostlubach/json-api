import Pack from '../Pack'
import RequestContext from '../RequestContext'
import { AnyResource, ListOptions } from '../types'
import APIError from '../APIError'

export default async function listRelated(
  this:             AnyResource,
  context:          RequestContext,
  relationshipName: string,
  parentID:         string,
  options:          ListOptions
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

  const db = relatedResource.adapter(context)
  if (db == null) {
    throw new APIError(405, `Resource \`${relationship.type}\` can not be listed`)
  }

  let query = await db.relatedQuery(this, relationship, relationshipName, parentID)
  query = await this.applyScope(query, context)
  if (options.filters != null) {
    query = await db.applyFilters(query, options.filters)
  }
  if (options.sorts != null) {
    query = await db.applySorts(query, options.sorts)
  }

  const pagination = this.paginationParams(options.pagination ?? {offset: 0, limit: null})
  const pack = await db.find(query, pagination, options)
  pack.meta.total = await db.count(query)
  return pack
}