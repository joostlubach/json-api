import { isPlainObject, mapValues } from 'lodash'
import { objectEntries, objectKeys } from 'ytil'

import APIError from './APIError'
import ResourceRegistry from './ResourceRegistry'
import { AnyResource, Linkage, Meta, Relationship } from './types'

export default class Document<ID> {

  constructor(
    public readonly resource:      AnyResource,
    public readonly id:            ID | null,
    public readonly attributes:    Record<string, any> = {},
    public readonly relationships: Record<string, Relationship<ID>> = {},
    public meta: Meta = {},
  ) {}

  public toLinkage(): Linkage<ID> {
    if (this.id == null) {
      throw new APIError(500, "Cannot create linkage: document has no ID")
    }
    return {type: this.resource.type, id: this.id}
  }

  public serialize(): any {
    const serialized: Record<string, any> = {
      id:            this.id,
      type:          this.resource.type,
      attributes:    mapValues(this.attributes, (val, name) => this.serializeAttribute(name, val)),
      relationships: this.relationships,
    }

    if (objectKeys(this.meta).length > 0) {
      serialized.meta = this.meta
    }
      
    return serialized
  }

  private serializeAttribute(name: string, value: any) {
    const attribute = this.resource.attributes[name]
    if (attribute?.serialize == null) { return value }

    return attribute.serialize(value)
  }

  public static canDeserialize(serialized: Record<string, any>) {
    if (!isPlainObject(serialized)) { return false }
    if (!('type' in serialized) || typeof serialized.type !== 'string') { return false }
    if (!('attributes' in serialized) || !isPlainObject(serialized.attributes)) { return false }
    if ('relationships' in serialized && !isPlainObject(serialized.relationships)) { return false }
    if ('meta' in serialized && !isPlainObject(serialized.meta)) { return false }
    return true
  }

  public static deserialize<E, Q, I>(registry: ResourceRegistry<E, Q, I>, serialized: Record<string, any>): Document<I> {
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
  }

}
