import { Application, NextFunction, Request, Response, Router } from 'express'
import { safeParseInt } from 'ytil'
import Adapter from './Adapter'
import APIError from './APIError'
import Document from './Document'
import OpenAPIGenerator from './OpenAPIGenerator'
import Pack from './Pack'
import { negotiateContentType, validateContentType, validateRequest } from './pre'
import RequestContext from './RequestContext'
import Resource from './Resource'
import { CustomCollectionAction, CustomDocumentAction } from './ResourceConfig'
import ResourceRegistry from './ResourceRegistry'
import { ActionOptions, PaginationSpec, ResourceLocator, Sort } from './types'

export default class Controller<Model, Query, A extends Adapter<Model, Query>> {

  // ------
  // Constructor

  constructor(
    public readonly registry: ResourceRegistry<Model, Query, A>,
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
          app.get(`/${resource.singular}/:id/:relationship(${name})`, this.createResourceAction(resource, 'show-related', this.showRelated))
        }
      }
    }
  }

  public defineCollectionAction(spec: CustomCollectionAction<Resource<Model, Query, A>>, resource?: Resource<Model, Query, A>) {
    if (this.app == null) {
      throw new Error("Mount the controller before defining actions")
    }

    const resources = resource ? [resource] : this.registry.all()

    for (const resource of resources) {
      const action = this.createResourceAction(resource, spec.name, this.customCollectionAction(spec), false, spec.authenticate !== false)
      this.app[spec.method](`/${resource.plural}/${spec.endpoint || spec.name}`, action)
    }
  }

  public defineDocumentAction(spec: CustomDocumentAction<Resource<Model, Query, A>>, resource?: Resource<Model, Query, A>) {
    if (this.app == null) {
      throw new Error("Mount the controller before defining actions")
    }

    const resources = resource ? [resource] : this.registry.all()

    for (const resource of resources) {
      const action = this.createResourceAction(resource, spec.name, this.customDocumentAction(spec), false, spec.authenticate !== false)
      this.app[spec.method](`/${resource.singular}/:id/${spec.endpoint || spec.name}`, action)
    }
  }

  private createResourceAction(resource: Resource<Model, Query, A>, name: string, action: ResourceActionHandler<Model, Query, A>, enforceContentType = true, authenticate = true) {
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
    resource: Resource<Model, Query, A>,
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
      await resource.authenticateRequest(request, context)
    }
    await resource.emitBefore(context)
  }

  // ------
  // Actions

  public async list(resource: Resource<Model, Query, A>, request: Request, response: Response, context: RequestContext) {
    const {filters, sorts, pagination} = this.extractIndexParameters(context)
    const options = {filters, sorts, pagination, ...this.extractOptions(context)}

    const pack = await resource.list(context, options)
    resource.injectPackSelfLinks(pack, context)
    response.json(pack.serialize())
  }

  public async show(resource: Resource<Model, Query, A>, request: Request, response: Response, context: RequestContext) {
    const locator = ResourceLocator.fromRequestContext(context)
    if (locator == null) {
      throw new APIError(400, "Invalid resource locator, specify either `id` or `singleton`.")
    }

    const pack = await resource.show(context, locator, this.extractOptions(context))
    resource.injectPackSelfLinks(pack, context)
    response.json(pack.serialize())
  }

  public async create(resource: Resource<Model, Query, A>, request: Request, response: Response, context: RequestContext) {
    const requestPack  = Pack.deserialize(this.registry, request.body)
    const document     = await this.extractRequestDocument(resource, requestPack, false, context)

    const responsePack = await resource.create(context, document, requestPack, this.extractOptions(context))
    resource.injectPackSelfLinks(responsePack, context)

    response.statusCode = 201
    response.json(responsePack.serialize())
  }

  public async update(resource: Resource<Model, Query, A>, request: Request, response: Response, context: RequestContext) {
    const requestPack  = Pack.deserialize(this.registry, request.body)
    const document     = await this.extractRequestDocument(resource, requestPack, true, context)

    const responsePack = await resource.update(context, document, requestPack, this.extractOptions(context))
    resource.injectPackSelfLinks(responsePack, context)

    response.json(responsePack.serialize())
  }

  public async delete(resource: Resource<Model, Query, A>, request: Request, response: Response, context: RequestContext) {
    const requestPack  = request.body?.data != null ? Pack.deserialize(this.registry, request.body) : new Pack(null)
    const selector     = context.extractBulkSelector(requestPack, resource)

    const responsePack = await resource.delete(context, selector)
    resource.injectPackSelfLinks(responsePack, context)
    await resource.injectPaginationMeta(responsePack, context)

    response.json(responsePack.serialize())
  }

  public async listRelated(resource: Resource<Model, Query, A>, request: Request, response: Response, context: RequestContext) {
    const relationship = context.params.relationship as string
    const {filters, sorts, pagination} = this.extractIndexParameters(context)
    const options = {filters, sorts, pagination, ...this.extractOptions(context)}

    const {id} = context.params
    const pack = await resource.listRelated(context, relationship, id, options)

    resource.injectPackSelfLinks(pack, context)
    await resource.injectPaginationMeta(pack, context, pagination)
    response.json(pack.serialize())
  }

  public async showRelated(resource: Resource<Model, Query, A>, request: Request, response: Response, context: RequestContext) {
    const relationship = context.params.relationship as string

    const {id} = context.params
    const pack = await resource.showRelated(context, relationship, id, this.extractOptions(context))
    response.json(pack.serialize())
  }

  //------
  // Custom actions

  private customCollectionAction<R extends Resource<Model, Query, A>>(spec: CustomCollectionAction<R>) {
    return async (resource: R, request: Request, response: Response, context: RequestContext) => {
      const requestPack = spec.deserialize !== false
        ? Pack.tryDeserialize(this.registry, request.body) ?? new Pack(null)
        : request.body

      const pack = await spec.action.call(resource, requestPack, context, this.extractOptions(context))
      response.json(pack.serialize())
    }
  }

  private customDocumentAction<R extends Resource<Model, Query, A>>(spec: CustomDocumentAction<R>) {
    return async (resource: R, request: Request, response: Response, context: RequestContext) => {
      const requestPack = spec.deserialize !== false
        ? Pack.tryDeserialize(this.registry, request.body) ?? new Pack(null)
        : request.body

      const pack = await spec.action.call(resource, request.params.id, requestPack, context, this.extractOptions(context))
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

  //------
  // Request extracters

  private extractIndexParameters(context: RequestContext) {
    const params     = context.params
    const filters    = {...params.filter as any}
    const sorts      = this.parseSorts(params.sort as any)
    const pagination = this.parsePagination(params)

    return {filters, sorts, pagination}
  }

  public async extractRequestDocument(resource: Resource<Model, Query, A>, pack: Pack, requireID: boolean, context: RequestContext) {
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
    if (document.id != null && document.id !== context.params.id) {
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

  private parsePagination(query: Record<string, any>): PaginationSpec {
    const {limit, offset} = query

    return {
      offset: safeParseInt(offset, 0),
      limit:  safeParseInt(limit),
    }
  }

}

export interface ControllerOptions {
  getContext?: (action: string, request: Request) => RequestContext | Promise<RequestContext>
  openAPI?:    OpenAPIGenerator
}

export type ResourceActionHandler<M, Q, A extends Adapter<M, Q>> = (
  resource: Resource<M, Q, A>,
  request:  Request,
  response: Response,
  context:  RequestContext
) => void | Promise<void>