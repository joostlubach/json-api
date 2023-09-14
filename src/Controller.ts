import { Application, NextFunction, Request, Response, Router } from 'express'
import { isPlainObject } from 'lodash'
import { any, boolean, dictionary, number, string } from 'validator/types'
import Adapter from './Adapter'
import APIError from './APIError'
import Collection from './Collection'
import Document from './Document'
import OpenAPIGenerator from './OpenAPIGenerator'
import Pack from './Pack'
import { negotiateContentType, validateContentType, validateRequest } from './pre'
import RequestContext from './RequestContext'
import Resource from './Resource'
import { CustomCollectionAction, CustomDocumentAction } from './ResourceConfig'
import ResourceRegistry from './ResourceRegistry'
import {
  ActionOptions,
  BulkSelector,
  CountActionOptions,
  DeleteActionOptions,
  ListParams,
  ResourceLocator,
  RetrievalActionOptions,
  Sort,
  UpdateActionOptions,
} from './types'

export default class Controller<Model, Query extends Adapter> {

  constructor(
    private readonly registry: ResourceRegistry<Model, Query>,
    private readonly adapter: <M, Q>(resource: Resource<M, Q>, context: RequestContext) => Adapter,
    private readonly options: ControllerOptions = {}
  ) {}

  // ------
  // Mounting

  private app?: Application

  public mount(appOrRouter: Application | Router) {
    if (this.app != null) {
      throw new Error("This controller is already mounted.")
    }
    const app = appOrRouter as Application
    this.app  = app

    app.get('/openapi.json', this.openAPI.bind(this))

    for (const resource of this.registry.all()) {
      for (const spec of resource.collectionActions) {
        this.defineCollectionAction(spec, resource)
      }
      for (const spec of resource.documentActions) {
        this.defineDocumentAction(spec, resource)
      }

      app.get(`/${resource.plural}`, this.createResourceAction(resource, 'list', this.list))
      if (resource.labelNames.length > 0) {
        app.get(`/${resource.plural}/:label`, this.createResourceAction(resource, 'list', this.list))
      }
      for (const name of resource.singletonNames) {
        app.get(`/${resource.singular}/:singleton(${name})`, this.createResourceAction(resource, 'show', this.show))
      }

      app.post(`/${resource.plural}`, this.createResourceAction(resource, 'create', this.create))
      app.post(`/${resource.plural}`, this.createResourceAction(resource, 'create', this.create))
      app.get(`/${resource.singular}/:id`, this.createResourceAction(resource, 'show', this.show))
      app.patch(`/${resource.singular}/:id`, this.createResourceAction(resource, 'update', this.update))
      app.delete(`/${resource.plural}`, this.createResourceAction(resource, 'delete', this.delete))
      app.delete(`/${resource.singular}/:id?`, this.createResourceAction(resource, 'delete', this.delete))

      for (const [name, relationship] of Object.entries(resource.relationships)) {
        if (relationship.plural) {
          app.get(`/${resource.singular}/:id/:relationship(${name})`, this.createResourceAction(resource, 'list-related', this.listRelated))
        } else {
          app.get(`/${resource.singular}/:id/:relationship(${name})`, this.createResourceAction(resource, 'show-related', this.getRelated))
        }
      }
    }
  }

  public defineCollectionAction(spec: CustomCollectionAction<Resource<Model, Query>>, resource?: Resource<Model, Query>) {
    if (this.app == null) {
      throw new Error("Mount the controller before defining actions")
    }

    const resources = resource ? [resource] : this.registry.all()

    for (const resource of resources) {
      const action = this.createResourceAction(resource, spec.name, this.customCollectionAction(spec), false, spec.authenticate !== false)
      this.app[spec.method](`/${resource.plural}/${spec.endpoint || spec.name}`, action)
    }
  }

  public defineDocumentAction(spec: CustomDocumentAction<Resource<Model, Query>>, resource?: Resource<Model, Query>) {
    if (this.app == null) {
      throw new Error("Mount the controller before defining actions")
    }

    const resources = resource ? [resource] : this.registry.all()

    for (const resource of resources) {
      const action = this.createResourceAction(resource, spec.name, this.customDocumentAction(spec), false, spec.authenticate !== false)
      this.app[spec.method](`/${resource.singular}/:id/${spec.endpoint || spec.name}`, action)
    }
  }

  private createResourceAction(resource: Resource<Model, Query>, name: string, action: ResourceActionHandler<Model, Query>, enforceContentType = true, authenticate = true) {
    return async (request: Request, response: Response, next: NextFunction) => {
      try {
        const context = await this.options.getContext?.(name, request) ?? this.requestContext(name, request)
        await this.preAction(resource, request, response, context, enforceContentType, authenticate)
        await action.call(this, resource, request, response, context)
      } catch (error: any) {
        if (error instanceof APIError) {
          const pack = error.toErrorPack()
          pack.serializeToResponse(response)

          // In the case of a server error, log the error here as well.
          if (response.statusCode >= 500) {
            process.stderr.write(`An error occurred: ${error.message}\n`)
            process.stderr.write(JSON.stringify(error.toJSON(), null, 2) + '\n')
          }
        } else {
          next(error)
        }
      }
    }
  }

  private requestContext(action: string, request: Request) {
    const uri = new URL(request.originalUrl)
    return new RequestContext(action, request.params, uri)
  }

  private async preAction(
    resource: Resource<Model, Query>,
    request: Request,
    response: Response,
    context: RequestContext,
    enforceContentType: boolean,
    authenticate: boolean
  ) {
    validateRequest(request, context, resource)

    if (enforceContentType) {
      negotiateContentType(request, response)
      validateContentType(request)
    }
    if (authenticate) {
      await resource.authenticateRequest(context)
    }
    await resource.emitBefore(context)
  }

  // ------
  // Actions

  public async list(resource: Resource<Model, Query>, request: Request, response: Response, context: RequestContext) {
    const adapter = this.adapter(resource, context)
    const params  = this.extractListParams(context)
    const options = this.extractRetrievalActionOptions(request, context)

    const pack = await resource.list(adapter, params, context, options)
    response.json(pack.serialize())
  }

  public async show(resource: Resource<Model, Query>, request: Request, response: Response, context: RequestContext) {
    const adapter = this.adapter(resource, context)
    const options = this.extractRetrievalActionOptions(request, context)
    const locator = this.extractResourceLocator(context)

    const pack = await resource.get(adapter, locator, context, options)
    response.json(pack.serialize())
  }

  public async create(resource: Resource<Model, Query>, request: Request, response: Response, context: RequestContext) {
    const adapter     = this.adapter(resource, context)
    const requestPack = Pack.deserialize(this.registry, request.body)
    const document    = await this.extractRequestDocument(resource, requestPack, false, context)
    const options     = this.extractUpdateActionOptions(request, context)

    const responsePack = await resource.create(adapter, document, requestPack, context, options)

    response.statusCode = 201
    response.json(responsePack.serialize())
  }

  public async update(resource: Resource<Model, Query>, request: Request, response: Response, context: RequestContext) {
    const adapter     = this.adapter(resource, context)
    const requestPack = Pack.deserialize(this.registry, request.body)
    const document    = await this.extractRequestDocument(resource, requestPack, true, context)
    const options     = this.extractUpdateActionOptions(request, context)

    const responsePack = await resource.update(adapter, document, requestPack, context, options)
    response.json(responsePack.serialize())
  }

  public async delete(resource: Resource<Model, Query>, request: Request, response: Response, context: RequestContext) {
    const adapter     = this.adapter(resource, context)
    const requestPack = request.body?.data != null ? Pack.deserialize(this.registry, request.body) : new Pack(null)
    const selector    = this.extractBulkSelector(resource, requestPack, context)
    const options     = this.extractDeleteActionOptions(request, context)

    const responsePack = await resource.delete(adapter, selector, context, options)
    response.json(responsePack.serialize())
  }

  public async listRelated(resource: Resource<Model, Query>, request: Request, response: Response, context: RequestContext) {
    const adapter      = this.adapter(resource, context)
    const locator      = this.extractResourceLocator(context)
    const relationship = context.param('relationship', string())
    const params       = this.extractListParams(context)
    const options      = this.extractRetrievalActionOptions(request, context)

    const responsePack = await resource.listRelated(adapter, locator, relationship, params, context, options)
    response.json(responsePack.serialize())
  }

  public async getRelated(resource: Resource<Model, Query>, request: Request, response: Response, context: RequestContext) {
    const adapter      = this.adapter(resource, context)
    const locator      = this.extractResourceLocator(context)
    const relationship = context.param('relationship', string())
    const options      = this.extractRetrievalActionOptions(request, context)

    const responsePack = await resource.getRelated(adapter, locator, relationship, context, options)
    response.json(responsePack.serialize())
  }

  //------
  // Custom actions

  private customCollectionAction<R extends Resource<Model, Query>>(spec: CustomCollectionAction<R>) {
    return async (resource: R, request: Request, response: Response, context: RequestContext) => {
      const requestPack = spec.deserialize !== false
        ? Pack.tryDeserialize(this.registry, request.body) ?? new Pack(null)
        : request.body

      const options = this.extractActionOptions(request, context)
      const pack = await spec.action.call(resource, requestPack, context, options)
      response.json(pack.serialize())
    }
  }

  private customDocumentAction<R extends Resource<Model, Query>>(spec: CustomDocumentAction<R>) {
    return async (resource: R, request: Request, response: Response, context: RequestContext) => {
      const requestPack = spec.deserialize !== false
        ? Pack.tryDeserialize(this.registry, request.body) ?? new Pack(null)
        : request.body

      const options = this.extractActionOptions(request, context)
      const pack = await spec.action.call(resource, request.params.id, requestPack, context, options)
      response.json(pack.serialize())
    }
  }

  //------
  // Open API

  private async openAPI(request: Request, response: Response, next: NextFunction) {
    try {
      const generator = this.options.openAPI
      if (generator == null) {
        throw new APIError(501, "This server does not support open API documentation.")
      }
      response.json(await generator.generate())
    } catch (error: any) {
      next(error)
    }
  }

  // #region Request extracters

  private extractListParams(context: RequestContext): ListParams {
    const filters         = this.extractFilters(context)
    const search          = this.extractSearch(context)
    const sorts           = this.extractSorts(context)
    const {limit, offset} = this.extractPagination(context)

    return {filters, search, sorts, limit, offset}
  }

  private async extractRequestDocument(resource: Resource<Model, Query>, pack: Pack, requireID: boolean, context: RequestContext) {
    const document = pack.data

    if (document == null) {
      throw new APIError(400, "No document sent")
    }
    if (!(document instanceof Document)) {
      throw new APIError(400, "Expected Document")
    }
    if (requireID && document.id == null) {
      throw new APIError(400, "Document ID required")
    }
    if (document.id != null && document.id !== context.param('id', string({required: false}))) {
      throw new APIError(409, "Document ID does not match endpoint ID")
    }
    if (document.resource.type !== resource.type) {
      throw new APIError(409, "Document type does not match endpoint type")
    }

    return document
  }

  private extractActionOptions(request: Request, context: RequestContext): ActionOptions {
    const pack = Pack.deserialize(this.registry, request.body)
    return {
      meta: pack.meta,
    }
  }

  private extractRetrievalActionOptions(request: Request, context: RequestContext): RetrievalActionOptions {
    const include = context.param('include', string({default: ''})).split(',').map(it => it.trim()).filter(it => it !== '')
    const detail  = context.param('detail', boolean({default: false}))

    return {
      ...this.extractActionOptions(request, context),
      include,
      detail
    }
  }

  private extractUpdateActionOptions(request: Request, context: RequestContext): UpdateActionOptions {
    return this.extractActionOptions(request, context)
  }

  private extractDeleteActionOptions(request: Request, context: RequestContext): DeleteActionOptions {
    return this.extractActionOptions(request, context)
  }

  private extractFilters(context: RequestContext) {
    return context.param('filter', dictionary({
      valueType: any(),
      default:   () => ({})
    }))
  }

  private extractSearch(context: RequestContext) {
    return context.param('search', string({required: false}))
  }

  private extractSorts(context: RequestContext) {
    const sort = context.param('sort', string({required: false}))
    if (sort == null) { return [] }

    const parts = sort.split(',')
    const sorts: Sort[] = []

    for (const part of parts) {
      if (part.charAt(0) === '-') {
        sorts.push({field: part.slice(1), direction: -1})
      } else {
        sorts.push({field: part, direction: 1})
      }
    }

    return sorts
  }

  private extractPagination(context: RequestContext): {offset: number, limit: number | null} {
    const offset = context.param('limit', number({integer: true, defaultValue: 0}))
    const limit  = context.param('limit', number({integer: true, required: false}))

    return {offset, limit}
  }

  private extractResourceLocator(context: RequestContext): ResourceLocator {
    const id        = context.param('id', string({required: false}))
    const singleton = context.param('singleton', string({required: false}))

    if (id != null) {
      return {id}
    } else if (singleton != null) {
      return {singleton}
    } else {
      throw new APIError(400, "Invalid resource locator, specify either `id` or `singleton`.")
    }
  }

  public extractBulkSelector<M, Q>(resource: Resource<M, Q>, requestPack: Pack, context: RequestContext): BulkSelector {
    const id = context.param('id', string({required: false}))
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

  private extractBulkSelectorIDs<M, Q>(data: any, resource: Resource<M, Q>) {
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

export interface ControllerOptions {
  getContext?: (action: string, request: Request) => RequestContext | Promise<RequestContext>
  openAPI?:    OpenAPIGenerator
}

export type ResourceActionHandler<M, Q> = (
  resource: Resource<M, Q>,
  request:  Request,
  response: Response,
  context:  RequestContext
) => void | Promise<void>