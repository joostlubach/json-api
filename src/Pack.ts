import { isArray, isPlainObject } from 'lodash'

import APIError from './APIError.js'
import Collection from './Collection.js'
import Document from './Document.js'
import ResourceRegistry from './ResourceRegistry.js'
import { Meta } from './types.js'

export default class Pack<ID> {

  constructor(
    public data:     Document<ID> | Collection<ID> | any | null,
    public included: Collection<ID> = new Collection(),
    public meta:     Meta = {},
  ) {}

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
    const {data: dataRaw = null, meta = {}, included: includedRaw = [], ...rest} = serialized
    if (Object.keys(rest).length > 0) {
      throw new APIError(400, `Malformed pack: extraneous nodes ${Object.keys(rest).join(', ')} found`)
    }

    const data = this.deserializeData(registry, dataRaw)
    const included = includedRaw == null ? new Collection<I>([]) : Collection.deserialize(registry, includedRaw)
    return new Pack<I>(data, included, meta)
  }

  private static deserializeData<M, Q, I>(registry: ResourceRegistry<M, Q, I>, raw: any): Collection<I> | Document<I> | any[] | any | null {
    if (raw == null) { return null }
    if (isArray(raw)) {
      const items = raw.map(it => this.deserializeData(registry, it))
      if (items.length > 0 && items.every(it => it instanceof Document)) {
        return new Collection(items)
      } else {
        return items
      }
    }

    if (Document.canDeserialize(raw)) {
      return Document.deserialize(registry, raw)
    } else {
      return raw
    }
  }

  public serialize(): any {
    const included = this.included.serialize()
    const data = this.data instanceof Document || this.data instanceof Collection
      ? this.data.serialize()
      : this.data

    return {
      data,
      included,
      meta: this.meta,
    }
  }

}
