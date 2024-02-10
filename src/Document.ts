import { objectEntries, objectKeys } from 'ytil'

import APIError from './APIError'
import ResourceRegistry from './ResourceRegistry'
import { AnyResource, Linkage, Links, Meta, Relationship } from './types'

export default class Document<ID> {

  constructor(
    public readonly resource:      AnyResource,
    public readonly id:            ID | null,
    public readonly attributes:    Record<string, any> = {},
    public readonly relationships: Record<string, Relationship<ID>> = {},
    public readonly links:         Links = {},
    public readonly meta:          Meta = {},
  ) {}

  public serialize(): any {
    const serialized: Record<string, any> = {
      id:            this.id,
      type:          this.resource.type,
      attributes:    this.attributes,
      relationships: this.relationships,
    }

    if (objectKeys(this.links).length > 0) {
      serialized.links = this.links
    }
    if (objectKeys(this.meta).length > 0) {
      serialized.meta = this.meta
    }
      
    return serialized
  }

  public toLinkage(): Linkage<ID> {
    if (this.id == null) {
      throw new APIError(500, "Cannot create linkage: document has no ID")
    }
    return {type: this.resource.type, id: this.id}
  }

  public static deserialize<M, Q, I>(registry: ResourceRegistry<M, Q, I>, serialized: Record<string, any>, detail: boolean = true): Document<I> {
    if (serialized.type == null) {
      throw new APIError(400, "missing 'type' node")
    }

    const resource = registry.get(serialized.type)
    if (resource == null) {
      throw new APIError(404, `Resource \`${serialized.type}\` not found`)
    }

    const document = new Document(
      resource,
      serialized.id,
      {...serialized.attributes},
      {...serialized.relationships},
      {...serialized.links},
      {...serialized.meta},
    )

    document.validate()
    return document
  }

  private validate() {
    for (const [name, value] of objectEntries(this.relationships)) {
      if (!Relationship.isRelationship(value)) {
        throw new APIError(400, `Invalid relationship for relationship '${name}'`)
      }
    }

    for (const [name, link] of objectEntries(this.links)) {
      if (typeof link !== 'string') {
        throw new APIError(400, `Invalid link for link '${name}'`)
      }
    }
  }

}
