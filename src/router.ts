import { NextFunction, Request, Response, Router } from 'express'
import { kebabCase } from 'lodash'
import { string } from 'validator/types'
import { objectEntries } from 'ytil'

import APIError from './APIError'
import JSONAPI from './JSONAPI'
import OpenAPIGenerator from './OpenAPIGenerator'
import Pack from './Pack'
import RequestContext from './RequestContext'
import Resource from './Resource'
import { CustomCollectionAction, CustomDocumentAction } from './ResourceConfig'
import { negotiateContentType, validateContentType, validateRequest } from './pre'
import { AnyResource } from './types'

export function router<M, Q, I>(jsonAPI: JSONAPI<M, Q, I>, options: RouterOptions = {}): Router {
  const router = Router()
  const routes: JSONAPIRoutesMap = {
    ...options.routes,
    ...defaultRoutes,
  }
  const requestContext = options.requestContext ?? defaultRequestContext

  for (const resource of jsonAPI.registry.all()) {
    mountResource(resource)
  }
  mountOpenAPI()

  // #region Resource mounting

  const {
    customCollectionAction,
    customDocumentAction,
    listRelated,
    showRelated,
    ...rest
  } = buildActions(jsonAPI)

  function mountResource(resource: Resource<M, Q, I>) {
    // Mount custom actions. Do this first, as they are more specific than the regular actions. If an author
    // of a resource wants to override something here, that should be possible.
    if (routes.customCollection !== false) {
      for (const spec of resource.collectionActions) {
        const action = regularAction(resource, spec.name, customCollectionAction(spec))
        router[spec.method](routes.customCollection(spec.name), action)
      }
    }
    if (routes.customDocument !== false) {
      for (const spec of resource.documentActions) {
        const action = regularAction(resource, spec.name, customDocumentAction(spec))
        router[spec.method](routes.customDocument(spec.name), action)
      }
    }

    // Mount regular actions.
    for (const [name, action] of objectEntries(rest)) {
      const route = routes[name]
      if (route === false) { continue }

      const {method, path} = route
      router[method](path, regularAction(resource, kebabCase(name), action))
    }

    // Mount relationship actions.
    for (const [relationshipName, relationship] of objectEntries(resource.relationships)) {
      const actionName = relationship.plural ? 'listRelated' : 'showRelated'
      const action = relationship.plural ? listRelated : showRelated

      const route = routes[actionName]
      if (route === false) { continue }

      const {method, path} = route(relationshipName)
      router[method](path, regularAction(resource, kebabCase(actionName), action))
    }
  }

  // #endregion

  // #region Open API

  function mountOpenAPI() {
    const {openAPI} = options
    if (openAPI == null) { return }

    router.get('/openapi.json', async (req, res, next) => {
      try {
        res.json(await openAPI.generate())
      } catch (error: any) {
        next(error)
      }
    })
  }

  // #endregion

  // #region Action wrapper

  function regularAction(resource: Resource<M, Q, I>, name: string, action: ResourceActionHandler) {
    return async (request: Request, response: Response, next: NextFunction) => {
      try {
        const context = await requestContext(name, request)
        await preAction(resource, request, response, context)
        await action(resource, request, response, context)
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

  async function preAction(resource: Resource<M, Q, I>, request: Request, response: Response, context: RequestContext) {
    validateRequest(request, context, resource)

    if (options.enforceContentType !== false) {
      negotiateContentType(request, response)
      validateContentType(request)
    }
    await resource.runBeforeHandlers(context)
  }

  // #endregion

  return router
}

// #region Action builders

export function buildActions<M, Q, I>(jsonAPI: JSONAPI<M, Q, I>) {
  return {
    async list(resource: Resource<M, Q, I>, request: Request, response: Response, context: RequestContext) {
      const params = resource.extractListParams(context)
      const adapter = () => jsonAPI.adapter(resource, context)
      const options = resource.extractRetrievalActionOptions(context)

      const pack = await resource.list(params, adapter, context, options)
      response.json(pack.serialize())
    },

    async show(resource: Resource<M, Q, I>, request: Request, response: Response, context: RequestContext) {
      const locator = resource.extractDocumentLocator(context)
      const adapter = () => jsonAPI.adapter(resource, context)
      const options = resource.extractRetrievalActionOptions(context)

      const pack = await resource.show(locator, adapter, context, options)
      response.json(pack.serialize())
    },

    async create(resource: Resource<M, Q, I>, request: Request, response: Response, context: RequestContext) {
      const requestPack = Pack.deserialize(jsonAPI.registry, request.body)
      const document = resource.extractRequestDocument(requestPack, false, context)
      const adapter = () => jsonAPI.adapter(resource, context)
      const options = resource.extractActionOptions(context)

      const responsePack = await resource.create(document, requestPack, adapter, context, options)

      response.statusCode = 201
      response.json(responsePack.serialize())
    },

    async replace(resource: Resource<M, Q, I>, request: Request, response: Response, context: RequestContext) {
      const locator = resource.extractDocumentLocator(context)
      const requestPack = Pack.deserialize(jsonAPI.registry, request.body)
      const document = resource.extractRequestDocument(requestPack, true, context)
      const adapter = () => jsonAPI.adapter(resource, context)
      const options = resource.extractActionOptions(context)

      const responsePack = await resource.replace(locator, document, requestPack, adapter, context, options)
      response.json(responsePack.serialize())
    },

    async update(resource: Resource<M, Q, I>, request: Request, response: Response, context: RequestContext) {
      const locator = resource.extractDocumentLocator(context)
      const requestPack = Pack.deserialize(jsonAPI.registry, request.body)
      const document = resource.extractRequestDocument(requestPack, true, context)
      const adapter = () => jsonAPI.adapter(resource, context)
      const options = resource.extractActionOptions(context)

      const responsePack = await resource.update(locator, document, requestPack, adapter, context, options)
      response.json(responsePack.serialize())
    },

    async delete(resource: Resource<M, Q, I>, request: Request, response: Response, context: RequestContext) {
      const adapter = () => jsonAPI.adapter(resource, context)
      const requestPack = request.body?.data != null ? Pack.deserialize(jsonAPI.registry, request.body) : new Pack<I>(null)
      const selector = resource.extractBulkSelector(requestPack, context)

      const responsePack = await resource.delete(selector, adapter, context)
      response.json(responsePack.serialize())
    },

    async listRelated(resource: Resource<M, Q, I>, request: Request, response: Response, context: RequestContext) {
      const locator = resource.extractDocumentLocator(context)
      const relationship = context.param('relationship', string())
      const params = resource.extractListParams(context)
      const adapter = () => jsonAPI.adapter(resource, context)
      const options = resource.extractRetrievalActionOptions(context)

      const responsePack = await resource.listRelated(locator, relationship, params, adapter, context, options)
      response.json(responsePack.serialize())
    },

    async showRelated(resource: Resource<M, Q, I>, request: Request, response: Response, context: RequestContext) {
      const locator = resource.extractDocumentLocator(context)
      const relationship = context.param('relationship', string())
      const adapter = () => jsonAPI.adapter(resource, context)
      const options = resource.extractRetrievalActionOptions(context)

      const responsePack = await resource.showRelated(locator, relationship, adapter, context, options)
      response.json(responsePack.serialize())
    },

    customCollectionAction<R extends Resource<M, Q, I>>(spec: CustomCollectionAction<M, Q, I>) {
      return async (resource: R, request: Request, response: Response, context: RequestContext) => {
        const requestPack = spec.deserialize !== false
          ? Pack.tryDeserialize(jsonAPI.registry, request.body) ?? new Pack(null)
          : request.body

        const adapter = () => jsonAPI.adapter(resource, context)
        const options = resource.extractActionOptions(context)
        const pack = await spec.action.call(resource, requestPack, adapter, context, options)
        response.json(pack.serialize())
      }
    },

    customDocumentAction<R extends Resource<M, Q, I>>(spec: CustomDocumentAction<M, Q, I>) {
      return async (resource: R, request: Request, response: Response, context: RequestContext) => {
        const requestPack = spec.deserialize !== false
          ? Pack.tryDeserialize(jsonAPI.registry, request.body) ?? new Pack(null)
          : request.body

        const locator = resource.extractDocumentLocator(context)
        const adapter = () => jsonAPI.adapter(resource, context)
        const options = resource.extractActionOptions(context)

        const pack = await spec.action.call(resource, locator, requestPack, adapter, context, options)
        response.json(pack.serialize())
      }
    },

  }
}

// #endregion

// #region Defaults
  
const defaultRoutes: JSONAPIRoutesMap = {
  list: {
    method: 'get',
    path:   '/:plural/:label?',
  },
  show: {
    method: 'get',
    path:   '/:plural/-/:id',
  },
  create: {
    method: 'post',
    path:   '/:plural',
  },
  update: {
    method: 'patch',
    path:   '/:plural/-/:id',
  },
  replace: {
    method: 'put',
    path:   '/:plural/-/:id',
  },
  delete: {
    method: 'delete',
    path:   '/:plural/-/:id',
  },
  listRelated: name => ({
    method: 'get',
    path:   `/:plural/-/:id/:relationship(${name})`,
  }),
  showRelated: name => ({
    method: 'get',
    path:   `/:plural/-/:id/:relationship(${name})`,
  }),
  customCollection: name => `/:plural/${name}`,
  customDocument:   name => `/:plural/-/:id/${name}`,
}

function defaultRequestContext(action: string, request: Request) {
  const uri = new URL(request.originalUrl)
  return new RequestContext(action, request.params, uri)
}

// #endregion

// #region Options

export interface RouterOptions {
  routes?:             Partial<JSONAPIRoutesMap>
  requestContext?:     (action: string, request: Request) => RequestContext | Promise<RequestContext>
  openAPI?:            OpenAPIGenerator
  enforceContentType?: boolean
}

export interface JSONAPIRoutesMap {
  list:    false | JSONAPIRoute
  show:    false | JSONAPIRoute
  create:  false | JSONAPIRoute
  update:  false | JSONAPIRoute
  replace: false | JSONAPIRoute
  delete:  false | JSONAPIRoute
  
  listRelated: false | ((name: string) => JSONAPIRoute)
  showRelated: false | ((name: string) => JSONAPIRoute)

  customCollection: false | ((name: string) => string)
  customDocument:   false | ((name: string) => string)
}

export interface JSONAPIRoute {
  method: Method
  path:   string
}

export type Method =
  | 'get' 
  | 'post' 
  | 'put' 
  | 'patch' 
  | 'delete'

type ResourceActionHandler = (
  resource: AnyResource,
  request:  Request,
  response: Response,
  context:  RequestContext
) => void | Promise<void>

// #endregion