import { Request } from 'express'
import { APIError, BulkSelector, Collection, Pack } from 'json-api'
import { isPlainObject } from 'lodash'
import { AnyResource } from './'

export default class RequestContext {

  constructor(
    public readonly action: string,
    extra?: Record<string, any>
  ) {
    Object.assign(this, extra)
  }

  public static get empty(): RequestContext {
    return new RequestContext('')
  }

  public static fromRequest(action: string, request: Request) {
    return new RequestContext(action, {
      request: request,
      params:  {...request.query, ...request.params},
    })
  }

  // Allow other properties.
  [name: string]: any

  public readonly request?: Request
  public readonly params:   Record<string, any> = {}
  public model: any = null

  public extractBulkSelector(requestPack: Pack, resource: AnyResource): BulkSelector {
    if (this.request != null) {
      const {params: {id}} = this.request
      if (id != null) { return {ids: [id]} }
    }

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

}