import ResourceRegistry from './ResourceRegistry'
import APIError from './APIError'
import { AttributeBag, RelationshipBag, Links, Meta, AnyResource } from './types'
import { isFunction } from 'lodash'

export default class Document {

  constructor(
    public resource:      AnyResource,
    public id:            string | null,
    public detail:        boolean,
    public attributes:    AttributeBag = {},
    public relationships: RelationshipBag = {},
    public links:         Links = {},
    public meta:          Meta = {}
  ) {
    this.links = {...links}
    this.meta = {...meta}
  }

  public serialize(): any {
    const serialized: AnyObject = {
      id:            this.id,
      type:          this.resource.type,
      attributes:    this.serializeAttributes(this.attributes),
      relationships: this.serializeRelationships(this.relationships),
      links:         this.links,
    }
    if (Object.keys(this.meta).length > 0) {
      serialized.meta = this.meta
    }
    return serialized
  }

  public static deserialize(registry: ResourceRegistry, serialized: AnyObject, detail: boolean = true): Document {
    if (serialized.type == null) {
      throw new APIError(400, "missing 'type' node")
    }

    const resource = registry.get(serialized.type)
    if (resource == null) {
      throw new APIError(404, `Resource \`${serialized.type}\` not found`)
    }

    const document = new Document(resource, serialized.id, detail)
    document.attributes    = document.deserializeAttributes({...serialized.attributes})
    document.relationships = document.deserializeRelationships({...serialized.relationships})
    document.links         = {...serialized.links}
    document.meta          = {...serialized.meta}

    return document
  }

  private serializeAttributes(attributes: AttributeBag): AnyObject {
    if (this.resource == null) { return attributes }

    const serialized: AnyObject = {}
    for (const [name, attribute] of this.resource.attributes) {
      if (!this.detail && attribute.detail) { continue }

      serialized[name] = attribute.serialize(attributes[name])
    }
    return serialized
  }

  private deserializeAttributes(attributes: AttributeBag): AnyObject {
    if (this.resource == null) { return attributes }

    const deserialized: AnyObject = {}
    for (const name of Object.keys(attributes)) {
      const attribute = this.resource.attributes.get(name)
      if (attribute == null) {
        throw new APIError(403, `Attribute '${name}' not found`)
      }

      deserialized[name] = attribute.deserialize(attributes[name])
    }
    return deserialized
  }

  private serializeRelationships(relationships: RelationshipBag): AnyObject | undefined {
    const serialized: AnyObject = {}
    for (const name of Object.keys(relationships)) {
      if (isFunction(this.resource.config.relationships)) {
        serialized[name] = relationships[name]
      } else {
        const relConfig = this.resource.relationship(name)
        if (relConfig == null) { continue }
        if (!this.detail && relConfig.detail) { continue }

        serialized[name] = relationships[name]
      }
    }

    return serialized
  }

  private deserializeRelationships(relationships: RelationshipBag): AnyObject {
    const deserialized: AnyObject = {}
    for (const name of Object.keys(relationships)) {
      const relConfig = this.resource.relationship(name)
      if (relConfig == null) {
        throw new APIError(403, `Relationship '${name}' not found`)
      }

      deserialized[name] = relationships[name]
    }
    return deserialized
  }

}