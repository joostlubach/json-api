import { Application, NextFunction, Request, Response, Router } from 'express'
import APIError from './APIError'
import Collection from './Collection'
import Document from './Document'
import OpenAPIGenerator from './OpenAPIGenerator'
import Pack from './Pack'
import { negotiateContentType, validateContentType, validateRequest } from './pre'
import RequestContext from './RequestContext'
import { CustomCollectionAction, CustomDocumentAction } from './ResourceConfig'
import ResourceRegistry from './ResourceRegistry'
import { ActionOptions, AnyResource, PaginationSpec, Sort } from './types'

export default class Controller {

  // ------
  // Constructor

  constructor(
    public readonly registry: ResourceRegistry,
    private readonly options: ControllerOptions = {}
  ) {}

  // ------
  // Mounting

  private app?: Application | Router
  private afterMountListeners = new Set<AfterMountListener>()

  public mount(app: Application | Router) {
    if (this.app != null) {
      throw new Error("This controller is already mounted.")
    }
    this.app = app

    app.get('/openapi.json', this.openAPI.bind(this))

    for (const resource of this.registry.resources.values()) {
      for (const spec of resource.collectionActions) {
        this.defineCustomCollectionAction(spec, resource)
      }
      for (const spec of resource.documentActions) {
        this.defineCustomDocumentAction(spec, resource)
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
          app.get(`/${resource.singular}/:id/:relationship(${name})`, this.createResourceAction(resource, 'show-related', this.showRelated))
        }
      }
    }

    for (const listener of this.afterMountListeners) {
      listener.call(this)
    }
  }

  public afterMount(listener: AfterMountListener) {
    this.afterMountListeners.add(listener)
    return () => {
      this.afterMountListeners.delete(listener)
    }
  }

  public defineCustomCollectionAction(spec: CustomCollectionAction<AnyResource>, resource?: AnyResource) {
    if (this.app == null) {
      throw new Error("Mount the controller before defining actions")
    }

    const resources = resource ? [resource] : this.registry.resources.values()

    for (const resource of resources) {
      const action = this.createResourceAction(resource, spec.name, this.customCollectionAction(spec), false)
      this.app[spec.method](`/${resource.plural}/${spec.endpoint || spec.name}`, action)
    }
  }

  public defineCustomDocumentAction(spec: CustomDocumentAction<AnyResource>, resource?: AnyResource) {
    if (this.app == null) {
      throw new Error("Mount the controller before defining actions")
    }

    const resources = resource ? [resource] : this.registry.resources.values()

    for (const resource of resources) {
      const action = this.createResourceAction(resource, spec.name, this.customDocumentAction(spec), false)
      this.app[spec.method](`/${resource.singular}/:id/${spec.endpoint || spec.name}`, action)
    }
  }

  private createResourceAction(resource: AnyResource, name: string, action: ResourceActionHandler, enforceContentType = true) {
    return async (request: Request, response: Response, next: NextFunction) => {
      try {
        const context = await this.options.getContext?.(name, request) ?? RequestContext.fromRequest(name, request)
        await this.preAction(resource, request, response, context, enforceContentType)

        const pack = await action.call(this, resource, request, response, context)
        await this.postAction(resource, pack || new Pack(null), request, response, context)

        pack?.serializeToResponse(response)
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

  private async preAction(
    resource: AnyResource,
    request: Request,
    response: Response,
    context: RequestContext,
    enforceContentType: boolean,
  ) {
    validateRequest(request)
    if (enforceContentType) {
      negotiateContentType(request, response)
      validateContentType(request)
    }
    await resource.emitBefore(context)
  }

  private async postAction(resource: AnyResource, pack: Pack, request: Request, response: Response, context: RequestContext) {
    await resource.emitAfter(pack, context)
  }

  // ------
  // Actions

  public async list(resource: AnyResource, request: Request, response: Response, context: RequestContext) {
    const {filters, sorts, pagination} = this.extractIndexParameters(request)
    const options = {filters, sorts, pagination, ...this.extractOptions(context)}

    const pack = await resource.list(context, options)
    resource.injectPackSelfLinks(pack, request)
    return pack
  }

  public async show(resource: AnyResource, request: Request, response: Response, context: RequestContext) {
    const pack = await resource.show(context, request.params, this.extractOptions(context))
    resource.injectPackSelfLinks(pack, request)
    return pack
  }

  public async create(resource: AnyResource, request: Request, response: Response, context: RequestContext) {
    const pack = this.extractRequestPack(request)
    const document = await this.extractRequestDocument(resource, request, pack, false)
    const responsePack = await resource.create(context, document, pack, this.extractOptions(context))
    resource.injectPackSelfLinks(responsePack, request)
    response.statusCode = 201
    return responsePack
  }

  public async update(resource: AnyResource, request: Request, response: Response, context: RequestContext) {
    const pack = this.extractRequestPack(request)
    const document = await this.extractRequestDocument(resource, request, pack, true)
    const responsePack = await resource.update(context, document, pack, this.extractOptions(context))
    resource.injectPackSelfLinks(responsePack, request)
    return responsePack
  }

  public async delete(resource: AnyResource, request: Request, response: Response, context: RequestContext) {
    const requestPack  = request.body?.data != null ? Pack.deserialize(this.registry, request.body) : new Pack(null)
    const selector     = context.extractBulkSelector(requestPack, resource)
    const responsePack = await resource.delete(context, selector)
    resource.injectPackSelfLinks(responsePack, request)
    await resource.injectPaginationMeta(responsePack, context)

    return responsePack
  }

  public async listRelated(resource: AnyResource, request: Request, response: Response, context: RequestContext) {
    const relationship = request.params.relationship as string
    const {filters, sorts, pagination} = this.extractIndexParameters(request)
    const options = {filters, sorts, pagination, ...this.extractOptions(context)}

    const {id} = request.params
    const pack = await resource.listRelated(context, relationship, id, options)

    // TODO: Look at these two
    // resource.injectPackSelfLinks(pack, request)
    await resource.injectPaginationMeta(pack, context, pagination)

    return pack
  }

  public async showRelated(resource: AnyResource, request: Request, response: Response, context: RequestContext) {
    const relationship = request.params.relationship as string

    const {id} = request.params
    const pack = await resource.showRelated(context, relationship, id, this.extractOptions(context))

    return pack
  }

  //------
  // Custom actions

  private customCollectionAction<R extends AnyResource>(spec: CustomCollectionAction<R>) {
    return async (resource: R, request: Request, response: Response, context: RequestContext) => {
      const requestPack = spec.deserialize !== false
        ? Pack.tryDeserialize(this.registry, request.body) ?? new Pack(null)
        : request.body

      return await spec.action.call(resource, requestPack, context, this.extractOptions(context))
    }
  }

  private customDocumentAction<R extends AnyResource>(spec: CustomDocumentAction<R>) {
    return async (resource: R, request: Request, response: Response, context: RequestContext) => {
      const requestPack = spec.deserialize !== false
        ? Pack.tryDeserialize(this.registry, request.body) ?? new Pack(null)
        : request.body

      return await spec.action.call(resource, request.params.id, requestPack, context, this.extractOptions(context))
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

  //------
  // Request extracters

  private extractIndexParameters(request: Request) {
    const {query}    = request
    const filters    = {...query.filter}
    const sorts      = this.parseSorts(query.sort)
    const pagination = this.parsePagination(query)

    return {filters, sorts, pagination}
  }

  private extractRequestPack(request: Request) {
    return Pack.deserialize(this.registry, request.body)
  }

  public async extractRequestDocument(resource: AnyResource, request: Request, pack: Pack, requireID: boolean) {
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
    if (document.id != null && document.id !== request.params.id) {
      throw new APIError(409, "Document ID does not match endpoint ID")
    }
    if (document.resource.type !== resource.type) {
      throw new APIError(409, "Document type does not match endpoint type")
    }

    return document
  }

  public extractOptions(context: RequestContext): ActionOptions {
    const options: ActionOptions = {}
    if (context.params.include != null) {
      options.include = context.params.include?.split(',')
    }
    if (context.params.detail != null) {
      options.detail = !!context.params.detail
    }
    return options
  }

  // ------
  // Filters & sorts

  private parseSorts(sort: string) {
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

  //------
  // Pagination

  private parsePagination(query: AnyObject): PaginationSpec {
    const {limit, offset} = query

    return {
      offset: offset == null ? 0 : parseInt(offset, 10),
      limit:  limit == null ? null : parseInt(limit, 10),
    }
  }

  //------
  // Serialization API

  public async buildDocument<T>(resourceType: string, model: T, detail: boolean = true, context: RequestContext = RequestContext.empty): Promise<Document> {
    const resource = this.registry.get(resourceType)
    if (resource == null) {
      throw new ReferenceError(`Resource \`${resourceType}\` not found`)
    }

    const db = resource.adapter(context)
    return await db.modelToDocument(model, detail)
  }

  public async buildCollection<T>(resourceType: string, models: T[], detail: boolean = false, context: RequestContext = RequestContext.empty): Promise<Collection> {
    const promises = models.map(model => this.buildDocument(resourceType, model, detail, context))
    const documents = await Promise.all(promises)
    return new Collection(documents)
  }

  public async serializeDocument<T>(
    resourceType: string,
    model:        T,
    detail:       boolean = true,
    context:      RequestContext = RequestContext.empty,
  ): Promise<AnyObject> {
    const document = await this.buildDocument(resourceType, model, detail, context)
    return document.serialize()
  }

  public async serializeCollection<T>(
    resourceType: string,
    models:       T[],
    detail:       boolean = false,
    context:      RequestContext = RequestContext.empty,
  ): Promise<AnyObject> {
    const collection = await this.buildCollection(resourceType, models, detail, context)
    return collection.serialize()
  }

}

export interface ControllerOptions {
  getContext?: (action: string, request: Request) => RequestContext | Promise<RequestContext>
  openAPI?:    OpenAPIGenerator
}

export type AfterMountListener    = (this: Controller) => void
export type ResourceActionHandler = (resource: AnyResource, request: Request, response: Response, context: RequestContext) => Pack | Promise<Pack>