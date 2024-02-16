import bodyParser from 'body-parser'
import { parse as parseContentType } from 'content-type'
import { NextFunction, Request, Response, Router } from 'express'
import { isPlainObject, kebabCase } from 'lodash'
import { objectEntries, objectKeys } from 'ytil'

import APIError from './APIError'
import JSONAPI from './JSONAPI'
import Pack from './Pack'
import RequestContext from './RequestContext'
import Resource from './Resource'
import { CustomCollectionAction, CustomDocumentAction } from './ResourceConfig'
import { AnyResource, JSONAPIRoute, RouteMap } from './types'

export function createExpressRouter<M, Q, I>(jsonAPI: JSONAPI<M, Q, I>): Router {
  const router = Router()

  // #region Set up

  const {
    customCollectionAction,
    customDocumentAction,
    ...rest
  } = buildActions(jsonAPI)

  const requestContext = jsonAPI.options.router?.requestContext ?? defaultRequestContext

  router.use(bodyParser.json({
    type: jsonAPI.allowedContentTypes,
  }))

  for (const resource of jsonAPI.registry.all()) {
    mountResource(resource)
  }
  mountOpenAPI()

  // #endregion

  // #region Resource mounting

  function mountResource(resource: Resource<M, Q, I>) {
    // Mount custom actions. Do this first, as they are more specific than the regular actions. If an author
    // of a resource wants to override something here, that should be possible.
    for (const spec of resource.collectionActions) {
      const action = regularAction(resource, spec.name, customCollectionAction(spec))
      const route = jsonAPI.customCollectionRoute(resource, spec.name)
      if (route === false) { break }

      router[spec.router?.method ?? 'post'](route, action)
    }
    for (const spec of resource.documentActions) {
      const action = regularAction(resource, spec.name, customDocumentAction(spec))
      const route = jsonAPI.customDocumentRoute(resource, spec.name)
      if (route === false) { break }

      router[spec.router?.method ?? 'post'](route, action)
    }

    // Mount regular actions.
    for (const [name, action] of objectEntries(rest)) {
      for (const route of jsonAPI.routes(resource, name)) {
        const modifyContext = (context: RequestContext) => {
          context.setParams(route.params ?? {})
        }

        router[route.method](route.path, regularAction(resource, kebabCase(name), action, modifyContext))
      }
    }
  }

  // #endregion

  // #region Open API

  function mountOpenAPI() {
    if (!jsonAPI.openAPIEnabled) { return }

    router.get('/openapi.json', async (req, res, next) => {
      try {
        const context = await requestContext('__openapi__', req)
        res.json(await jsonAPI.openAPISpec(context))
      } catch (error: any) {
        next(error)
      }
    })
  }

  // #endregion

  // #region Action wrapper

  function regularAction(resource: Resource<M, Q, I>, name: string, action: ResourceActionHandler, modifyContext?: (context: RequestContext) => void) {
    return async (request: Request, response: Response, next: NextFunction) => {
      try {
        const context = await requestContext(name, request)
        modifyContext?.(context)
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
    validateAndNegotiateContentTypes(request, response)
    validateRequest(request)

    await resource.runBeforeHandlers(context)
  }

  // #endregion

  // #region Request validation

  function validateRequest(request: Request) {
    validateRequestMethod(request)
    validateRequestBody(request)
  }
  
  function validateRequestMethod(request: Request) {
    if (!['get', 'post', 'put', 'patch', 'delete'].includes(request.method.toLowerCase())) {
      throw new APIError(405, "Invalid request method")
    }
  }
  
  function validateRequestBody(request: Request) {
    const present = bodyPresent(request)
    const needs = needsBody(request)
    if (!present && needs) {
      throw new APIError(400, 'Request body required')
    }
    if (present && !needs) {
      throw new APIError(400, 'Request body not allowed')
    }
  }
  
  function bodyPresent(request: Request): boolean {
    if (!isPlainObject(request.body)) { return false }
    if (objectKeys(request.body).length === 0) { return false }

    return true
  }
  
  function needsBody(request: Request) {
    const method = request.method.toLowerCase()
    return ['post', 'put', 'patch', 'delete'].includes(method)
  }
  
  // #endregion

  // #region Content type

  function validateAndNegotiateContentTypes(request: Request, response: Response) {
    // Get the content type of the request and validate it if necessary.
    const requestContentType = getRequestContentType(request)
    if (requestContentType != null && jsonAPI.options.router?.validateContentType !== false) {
      if (!jsonAPI.allowedContentTypes.includes(requestContentType)) {
        throw new APIError(415, "Unsupported content type")
      }
    }

    const responseContentType = negotiateResponseContentType(request, requestContentType)
    if (responseContentType == null) {
      throw new APIError(406, "Requested content type not available.")
    }
  
    response.contentType(responseContentType)
  }
  
  function negotiateResponseContentType(request: Request, requestContentType: string | null): string | null {
    const accept = request.get('Accept')

    // If the accept header is set, make sure it's one of our allowed content types.
    if (accept != null && accept !== '*/*') {
      if (!jsonAPI.allowedContentTypes.includes(accept)) {
        throw new APIError(406, "Requested content type not available.")
      }
    }
    
    // 1. Try to use the requested content type. Set it to null if nothing specific is accepted.
    let contentType = accept === '*/*' ? null : accept

    // 2. If it's not set, use the content type of the request. We've already validated it.
    //    Finally, fall back to the preferred content type.
    return contentType ?? requestContentType ?? jsonAPI.preferredContentType
  }
  
  function getRequestContentType(request: Request) {
    const contentType = request.get('Content-Type')
    return contentType == null ? null : parseContentType(contentType).type
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
      response.end()
    },

    async show(resource: Resource<M, Q, I>, request: Request, response: Response, context: RequestContext) {
      const locator = resource.extractDocumentLocator(context)
      const adapter = () => jsonAPI.adapter(resource, context)
      const options = resource.extractRetrievalActionOptions(context)

      const pack = await resource.show(locator, adapter, context, options)
      response.json(pack.serialize())
      response.end()
    },

    async create(resource: Resource<M, Q, I>, request: Request, response: Response, context: RequestContext) {
      const requestPack = Pack.deserialize(jsonAPI.registry, request.body)
      const adapter = () => jsonAPI.adapter(resource, context)
      const options = resource.extractActionOptions(context)

      const responsePack = await resource.create(requestPack, adapter, context, options)

      response.status(201)
      response.json(responsePack.serialize())
      response.end()
    },

    async replace(resource: Resource<M, Q, I>, request: Request, response: Response, context: RequestContext) {
      const locator = resource.extractDocumentLocator(context, false)
      const requestPack = Pack.deserialize(jsonAPI.registry, request.body)
      const adapter = () => jsonAPI.adapter(resource, context)
      const options = resource.extractActionOptions(context)

      const responsePack = await resource.replace(locator.id, requestPack, adapter, context, options)
    
      response.json(responsePack.serialize())
      response.end()
    },

    async update(resource: Resource<M, Q, I>, request: Request, response: Response, context: RequestContext) {
      const locator = resource.extractDocumentLocator(context, false)
      const requestPack = Pack.deserialize(jsonAPI.registry, request.body)
      const adapter = () => jsonAPI.adapter(resource, context)
      const options = resource.extractActionOptions(context)

      const responsePack = await resource.update(locator.id, requestPack, adapter, context, options)

      response.json(responsePack.serialize())
      response.end()
    },

    async delete(resource: Resource<M, Q, I>, request: Request, response: Response, context: RequestContext) {
      const adapter = () => jsonAPI.adapter(resource, context)
      const requestPack = request.body?.data != null ? Pack.deserialize(jsonAPI.registry, request.body) : new Pack<I>(null)

      const responsePack = await resource.delete(requestPack, adapter, context)

      response.contentType(jsonAPI.allowedContentTypes[0])
      response.json(responsePack.serialize())
      response.end()
    },

    customCollectionAction<R extends Resource<M, Q, I>>(spec: CustomCollectionAction<M, Q, I>) {
      return async (resource: R, request: Request, response: Response, context: RequestContext) => {
        const requestPack = spec.router?.deserialize !== false
          ? Pack.tryDeserialize(jsonAPI.registry, request.body) ?? new Pack(null)
          : request.body

        const adapter = () => jsonAPI.adapter(resource, context)
        const options = resource.extractActionOptions(context)
        const pack = await spec.action.call(resource, requestPack, adapter, context, options)

        response.contentType(jsonAPI.allowedContentTypes[0])
        response.json(pack.serialize())
        response.end()
      }
    },

    customDocumentAction<R extends Resource<M, Q, I>>(spec: CustomDocumentAction<M, Q, I>) {
      return async (resource: R, request: Request, response: Response, context: RequestContext) => {
        const requestPack = spec.router?.deserialize !== false
          ? Pack.tryDeserialize(jsonAPI.registry, request.body) ?? new Pack(null)
          : request.body

        const locator = resource.extractDocumentLocator(context)
        const adapter = () => jsonAPI.adapter(resource, context)
        const options = resource.extractActionOptions(context)

        const pack = await spec.action.call(resource, locator, requestPack, adapter, context, options)

        response.contentType(jsonAPI.allowedContentTypes[0])
        response.json(pack.serialize())
        response.end()
      }
    },

  }
}

// #endregion

// #region Types & defaults

// #region Defaults
  
export const defaultRoutes: RouteMap = {
  list: resource => [{
    method: 'get',
    path:   `/${resource.plural}`,
  }, ...objectKeys(resource.config.labels ?? {}).map((label): JSONAPIRoute => ({
    method: 'get',
    path:   `/${resource.plural}/::${label}`,
    params: {label},
  }))],
  show: resource => [{
    method: 'get',
    path:   `/${resource.plural}/:id`,
  }],
  create: resource => [{
    method: 'post',
    path:   `/${resource.plural}`,
  }],
  update: resource => [{
    method: 'patch',
    path:   `/${resource.plural}/:id`,
  }],
  replace: resource => [{
    method: 'put',
    path:   `/${resource.plural}/:id`,
  }],
  delete: resource => [{
    method: 'delete',
    path:   `/${resource.plural}`,
  }],

  customCollection: name => `/{{plural}}/${name}`,
  customDocument:   name => `/{{plural}}/:id/${name}`,
}

// #endregion

function defaultRequestContext(action: string, request: Request) {
  return new RequestContext(action, {
    ...request.query,
    ...request.params,
    $request: request,
  })
}

type ResourceActionHandler = (
  resource: AnyResource,
  request:  Request,
  response: Response,
  context:  RequestContext
) => void | Promise<void>

// #endregion