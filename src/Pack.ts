import { Response } from 'express'
import { APIError } from 'json-api'
import { isArray, isPlainObject } from 'lodash'
import Collection from './Collection'
import Document from './Document'
import ResourceRegistry from './ResourceRegistry'
import { Links, Meta } from './types'

export type Data = Document | Collection | any

export default class Pack {

  constructor(
    public data:     Data | null,
    public included: Collection = new Collection(),
    public links:    Links = {},
    public meta:     Meta = {}
  ) {
    this.links = {...links}
    this.meta = {...meta}
  }

  public static empty() {
    return {
      data: null,
      meta: {},
    }
  }

  public static tryDeserialize(registry: ResourceRegistry, serialized: any): Pack | null {
    if (!isPlainObject(serialized)) { return null }
    if (!('data' in serialized)) { return null }

    return this.deserialize(registry, serialized)
  }

  public static deserialize(registry: ResourceRegistry, serialized: any): Pack {
    const {data: dataRaw, meta = {}, links = {}, included: includedRaw = [], ...rest} = serialized
    if (dataRaw === undefined) {
      throw new APIError(400, "Malformed pack: missing `data` node")
    }
    if (Object.keys(rest).length > 0) {
      throw new APIError(400, `Malformed pack: extraneous nodes ${Object.keys(rest).join(', ')} found`)
    }

    const data = dataRaw == null
      ? null
      : isArray(dataRaw)
        ? Collection.deserialize(registry, dataRaw)
        : Document.deserialize(registry, dataRaw)

    const included = includedRaw == null
      ? new Collection([])
      : Collection.deserialize(registry, includedRaw)

    return new Pack(data, included, links, meta)
  }

  public serialize(): any {
    const included = this.included.serialize()
    const data = this.data instanceof Document || this.data instanceof Collection
      ? this.data.serialize()
      : this.data

    return {
      data:     data,
      included: included,
      links:    this.links,
      meta:     this.meta,
    }
  }

  public serializeToResponse(response: Response) {
    response.json(this.serialize())
  }

}