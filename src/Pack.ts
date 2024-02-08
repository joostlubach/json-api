import { isArray, isPlainObject } from 'lodash'

import APIError from './APIError'
import Collection from './Collection'
import Document from './Document'
import ResourceRegistry from './ResourceRegistry'
import { Links, Meta } from './types'

export default class Pack<ID> {

  constructor(
    public data:     Document<ID> | Collection<ID> | any | null,
    public included: Collection<ID> = new Collection(),
    public links:    Links = {},
    public meta:     Meta = {},
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

  public static tryDeserialize<M, Q, I>(registry: ResourceRegistry<M, Q, I>, serialized: any): Pack<I> | null {
    if (!isPlainObject(serialized)) { return null }
    if (!('data' in serialized)) { return null }

    const type = isArray(serialized.data) ? serialized.data[0]?.type : serialized.data?.type
    if (type != null && !registry.has(type)) { return null }

    return this.deserialize(registry, serialized)
  }

  public static deserialize<M, Q, I>(registry: ResourceRegistry<M, Q, I>, serialized: any): Pack<I> {
    const {data: dataRaw = null, meta = {}, links = {}, included: includedRaw = [], ...rest} = serialized
    if (Object.keys(rest).length > 0) {
      throw new APIError(400, `Malformed pack: extraneous nodes ${Object.keys(rest).join(', ')} found`)
    }

    const data = dataRaw == null
      ? null
      : isArray(dataRaw)
        ? Collection.deserialize(registry, dataRaw)
        : Document.deserialize(registry, dataRaw)

    const included = includedRaw == null
      ? new Collection<I>([])
      : Collection.deserialize(registry, includedRaw)

    return new Pack<I>(data, included, links, meta)
  }

  public serialize(): any {
    const included = this.included.serialize()
    const data = this.data instanceof Document || this.data instanceof Collection
      ? this.data.serialize()
      : this.data

    return {
      data,
      included,
      links: this.links,
      meta:  this.meta,
    }
  }

}
