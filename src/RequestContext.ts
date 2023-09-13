import { isPlainObject } from 'lodash'
import { AnyResource } from './'
import APIError from './APIError'
import Collection from './Collection'
import Pack from './Pack'
import { BulkSelector } from './types'

export default class RequestContext {

  constructor(
    public readonly action: string,
    public readonly params: Record<string, any>,
    public readonly requestURI?: URL,
  ) {}

  // #region Bulk selector

  public extractBulkSelector(this: RequestContext, requestPack: Pack, resource: AnyResource): BulkSelector {
    const {id} = this.params
    if (id != null) { return {ids: [id]} }

    const {data, meta: {filters, search}} = requestPack

    if (data != null && (filters != null || search != null)) {
      throw new APIError(400, "Mix of explicit linkages and filters/search specified")
    }

    if (data != null) {
      return {ids: this.extractBulkSelectorIDs(data, resource)}
    } else {
      if (filters != null && !isPlainObject(filters)) {
        throw new APIError(400, "Node `meta.filters`: must be a plain object")
      }
      if (search != null && typeof search !== 'string') {
        throw new APIError(400, "Node `meta.search`: must be a string")
      }

      return {
        filters: filters,
        search:  search,
      }
    }
  }

  private extractBulkSelectorIDs(data: any, resource: AnyResource) {
    if (!(data instanceof Collection)) {
      throw new APIError(400, "Collection expected")
    }

    const ids: string[] = []
    for (const linkage of data) {
      if (linkage.resource.type !== resource.type) {
        throw new APIError(409, "Linkage type does not match endpoint type")
      }
      if (linkage.id == null) {
        throw new APIError(400, "ID required in linkage")
      }
      ids.push(linkage.id)
    }

    return ids
  }

  // #endregion

}