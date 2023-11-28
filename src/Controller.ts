import { Application, NextFunction, Request, Response, Router } from 'express'
import { string } from 'validator/types'
import { objectEntries } from 'ytil'

import Adapter from './Adapter'
import APIError from './APIError'
import OpenAPIGenerator from './OpenAPIGenerator'
import Pack from './Pack'
import { negotiateContentType, validateContentType, validateRequest } from './pre'
import RequestContext from './RequestContext'
import Resource from './Resource'
import { CustomCollectionAction, CustomDocumentAction } from './ResourceConfig'
import ResourceRegistry from './ResourceRegistry'

/**
 * A controller to use with Express. For an API interface, use {@link JSONAPI}.
 */
export default class Controller<Model, Query extends Adapter> {

  constructor(
    private readonly registry: ResourceRegistry<Model, Query>,
    private readonly adapter: <M, Q>(resource: Resource<M, Q>, context: RequestContext) => Adapter,
    private readonly options: ControllerOptions = {},
  ) {}

  // ------
  // Mounting

  private app?: Application

  public mount(appOrRouter: Application | Router) {
    if (this.app != null) {
      throw new Error("This controller is already mounted.")
    }
    const app = appOrRouter as Application
    this.app = app

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

      for (const [name, relationship] of objectEntries(resource.relationships)) {
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
    authenticate: boolean,
  ) {
    validateRequest(request, context, resource)

    if (enforceContentType) {
      negotiateContentType(request, response)
      validateContentType(request)
    }
    if (authenticate) {
      await resource.authenticateRequest(context)
    }
    await resource.runBeforeHandlers(context)
  }

  // ------
  // Actions

  public async list(resource: Resource<Model, Query>, request: Request, response: Response, context: RequestContext) {
    const params = resource.extractListParams(context)
    const adapter = () => this.adapter(resource, context)
    const options = resource.extractRetrievalActionOptions(context)

    const pack = await resource.list(params, adapter, context, options)
    response.json(pack.serialize())
  }

  public async show(resource: Resource<Model, Query>, request: Request, response: Response, context: RequestContext) {
    const locator = resource.extractResourceLocator(context)
    const adapter = () => this.adapter(resource, context)
    const options = resource.extractRetrievalActionOptions(context)

    const pack = await resource.get(locator, adapter, context, options)
    response.json(pack.serialize())
  }

  public async create(resource: Resource<Model, Query>, request: Request, response: Response, context: RequestContext) {
    const requestPack = Pack.deserialize(this.registry, request.body)
    const document = resource.extractRequestDocument(requestPack, false, context)
    const adapter = () => this.adapter(resource, context)
    const options = resource.extractActionOptions(context)

    const responsePack = await resource.create(document, requestPack, adapter, context, options)

    response.statusCode = 201
    response.json(responsePack.serialize())
  }

  public async update(resource: Resource<Model, Query>, request: Request, response: Response, context: RequestContext) {
    const locator = resource.extractResourceLocator(context)
    const requestPack = Pack.deserialize(this.registry, request.body)
    const document = resource.extractRequestDocument(requestPack, true, context)
    const adapter = () => this.adapter(resource, context)
    const options = resource.extractActionOptions(context)

    const responsePack = await resource.update(locator, document, requestPack, adapter, context, options)
    response.json(responsePack.serialize())
  }

  public async delete(resource: Resource<Model, Query>, request: Request, response: Response, context: RequestContext) {
    const adapter = () => this.adapter(resource, context)
    const requestPack = request.body?.data != null ? Pack.deserialize(this.registry, request.body) : new Pack(null)
    const selector = resource.extractBulkSelector(requestPack, context)

    const responsePack = await resource.delete(selector, adapter, context)
    response.json(responsePack.serialize())
  }

  public async listRelated(resource: Resource<Model, Query>, request: Request, response: Response, context: RequestContext) {
    const locator = resource.extractResourceLocator(context)
    const relationship = context.param('relationship', string())
    const params = resource.extractListParams(context)
    const adapter = () => this.adapter(resource, context)
    const options = resource.extractRetrievalActionOptions(context)

    const responsePack = await resource.listRelated(locator, relationship, params, adapter, context, options)
    response.json(responsePack.serialize())
  }

  public async getRelated(resource: Resource<Model, Query>, request: Request, response: Response, context: RequestContext) {
    const locator = resource.extractResourceLocator(context)
    const relationship = context.param('relationship', string())
    const adapter = () => this.adapter(resource, context)
    const options = resource.extractRetrievalActionOptions(context)

    const responsePack = await resource.getRelated(locator, relationship, adapter, context, options)
    response.json(responsePack.serialize())
  }

  // ------
  // Custom actions

  private customCollectionAction<R extends Resource<Model, Query>>(spec: CustomCollectionAction<R>) {
    return async (resource: R, request: Request, response: Response, context: RequestContext) => {
      const requestPack = spec.deserialize !== false
        ? Pack.tryDeserialize(this.registry, request.body) ?? new Pack(null)
        : request.body

      const adapter = () => this.adapter(resource, context)
      const options = resource.extractActionOptions(context)
      const pack = await spec.action.call(resource, requestPack, adapter, context, options)
      response.json(pack.serialize())
    }
  }

  private customDocumentAction<R extends Resource<Model, Query>>(spec: CustomDocumentAction<R>) {
    return async (resource: R, request: Request, response: Response, context: RequestContext) => {
      const requestPack = spec.deserialize !== false
        ? Pack.tryDeserialize(this.registry, request.body) ?? new Pack(null)
        : request.body

      const locator = resource.extractResourceLocator(context)
      const adapter = () => this.adapter(resource, context)
      const options = resource.extractActionOptions(context)

      const pack = await spec.action.call(resource, locator, requestPack, adapter, context, options)
      response.json(pack.serialize())
    }
  }

  // ------
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
