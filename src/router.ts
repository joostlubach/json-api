import bodyParser from 'body-parser'
import { parse as parseContentType } from 'content-type'
import { NextFunction, Request, Response, Router } from 'express'
import { isFunction, kebabCase } from 'lodash'
import { isPlainObject, objectEntries, objectKeys } from 'ytil'
import { z } from 'zod'

import APIError from './APIError'
import JSONAPI from './JSONAPI'
import Pack from './Pack'
import RequestContext from './RequestContext'
import Resource from './Resource'
import { CustomCollectionAction, CustomDocumentAction } from './ResourceConfig'
import {
  AnyResource,
  CreateActionOptions,
  JSONAPIRoute,
  ListActionOptions,
  ReplaceActionOptions,
  RetrievalActionOptions,
  RouteMap,
  ShowActionOptions,
  UpdateActionOptions,
} from './types'

export function router<M, Q, I>(jsonAPI: JSONAPI<M, Q, I>): Router {
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
    for (const [name, spec] of objectEntries(resource.collectionActions)) {
      const action = regularAction(resource, name, customCollectionAction(spec))
      const route = jsonAPI.customCollectionRoute(resource, name)
      if (route === false) { break }

      const routerOptions = isFunction(spec) ? undefined : spec.router
      router[routerOptions?.method ?? 'post'](route, action)
    }
    for (const [name, spec] of objectEntries(resource.documentActions)) {
      const action = regularAction(resource, name, customDocumentAction(spec))
      const route = jsonAPI.customDocumentRoute(resource, name)
      if (route === false) { break }

      const routerOptions = isFunction(spec) ? undefined : spec.router
      router[routerOptions?.method ?? 'post'](route, action)
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
    const needs = acceptsBody(request)
    if (present && !needs) {
      throw new APIError(400, 'Request body not allowed')
    }
  }
  
  function bodyPresent(request: Request): boolean {
    if (!isPlainObject(request.body)) { return false }
    if (objectKeys(request.body).length === 0) { return false }

    return true
  }
  
  function acceptsBody(request: Request) {
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
    const accept = request.get('Accept')?.split(',').map(it => it.trim())
    if (accept == null || accept.includes('*/*')) {
      return requestContentType ?? jsonAPI.preferredContentType
    }

    const accepted = accept.find(it => jsonAPI.allowedContentTypes.includes(it))
    if (accepted != null) { return accepted }

    // No acceptable content type found.
    throw new APIError(406, "Requested content type not available.")
  }
  
  function getRequestContentType(request: Request) {
    const contentType = request.get('Content-Type')
    return contentType == null ? null : parseContentType(contentType).type
  }

  // #endregion

  return router
}

// #region Action builders

function buildActions<M, Q, I>(jsonAPI: JSONAPI<M, Q, I>) {
  return {
    async list(resource: Resource<M, Q, I>, request: Request, response: Response, context: RequestContext) {
      const params = resource.extractListParams(context)
      const adapter = () => resource.adapter(context)

      const options = extractListActionOptions(context)
      options.totals = context.param('totals', z.boolean())

      const pack = await resource.list(params, adapter, context, options)
      response.json(pack.serialize())
      response.end()
    },

    async show(resource: Resource<M, Q, I>, request: Request, response: Response, context: RequestContext) {
      const locator = resource.extractDocumentLocator(context)
      const adapter = () => resource.adapter(context)
      const options = extractShowActionOptions(context)

      const pack = await resource.show(locator, adapter, context, options)
      response.json(pack.serialize())
      response.end()
    },

    async create(resource: Resource<M, Q, I>, request: Request, response: Response, context: RequestContext) {
      const requestPack = Pack.deserialize(jsonAPI.registry, request.body)
      const adapter = () => resource.adapter(context)
      const options = extractCreateActionOptions(context)

      const responsePack = await resource.create(requestPack, adapter, context, options)

      response.status(201)
      response.json(responsePack.serialize())
      response.end()
    },

    async replace(resource: Resource<M, Q, I>, request: Request, response: Response, context: RequestContext) {
      const locator = resource.extractDocumentLocator(context, false)
      const requestPack = Pack.deserialize(jsonAPI.registry, request.body)
      const adapter = () => resource.adapter(context)
      const options = extractReplaceActionOptions(context)

      const responsePack = await resource.replace(locator.id, requestPack, adapter, context, options)
    
      response.json(responsePack.serialize())
      response.end()
    },

    async update(resource: Resource<M, Q, I>, request: Request, response: Response, context: RequestContext) {
      const locator = resource.extractDocumentLocator(context, false)
      const requestPack = Pack.deserialize(jsonAPI.registry, request.body)
      const adapter = () => resource.adapter(context)
      const options = extractUpdateActionOptions(context)

      const responsePack = await resource.update(locator.id, requestPack, adapter, context, options)

      response.json(responsePack.serialize())
      response.end()
    },

    async delete(resource: Resource<M, Q, I>, request: Request, response: Response, context: RequestContext) {
      const adapter = () => resource.adapter(context)
      const requestPack = request.body?.data != null ? Pack.deserialize(jsonAPI.registry, request.body) : new Pack<I>(null)

      const responsePack = await resource.delete(requestPack, adapter, context)

      response.contentType(jsonAPI.allowedContentTypes[0])
      response.json(responsePack.serialize())
      response.end()
    },

    customCollectionAction<R extends Resource<M, Q, I>>(spec: CustomCollectionAction<M, Q, I>) {
      return async (resource: R, request: Request, response: Response, context: RequestContext) => {
        const routerOptions = isFunction(spec) ? undefined : spec.router
        const handler = isFunction(spec) ? spec : spec.handler

        const requestPack = routerOptions?.deserialize !== false
          ? Pack.tryDeserialize(jsonAPI.registry, request.body) ?? new Pack(null)
          : request.body

        const adapter = () => resource.adapter(context)
        const pack = await handler.call(resource, requestPack, adapter, context)

        response.contentType(jsonAPI.allowedContentTypes[0])
        response.json(pack.serialize())
        response.end()
      }
    },

    customDocumentAction<R extends Resource<M, Q, I>>(spec: CustomDocumentAction<M, Q, I>) {
      return async (resource: R, request: Request, response: Response, context: RequestContext) => {
        const routerOptions = isFunction(spec) ? undefined : spec.router
        const handler = isFunction(spec) ? spec : spec.handler

        const requestPack = routerOptions?.deserialize !== false
          ? Pack.tryDeserialize(jsonAPI.registry, request.body) ?? new Pack(null)
          : request.body

        const locator = resource.extractDocumentLocator(context)
        const adapter = () => resource.adapter(context)
        const pack = await handler.call(resource, locator, requestPack, adapter, context)

        response.contentType(jsonAPI.allowedContentTypes[0])
        response.json(pack.serialize())
        response.end()
      }
    },

  }
}

export function extractRetrievalActionOptions(context: RequestContext, defaultDetail: boolean): RetrievalActionOptions {
  const include = context.param('include', z.string().default(''))
    .split(',')
    .map(it => it.trim())
    .filter(it => it !== '')

  const detail = context.param('detail', z.boolean().default(defaultDetail))

  return {include, detail}
}

export function extractListActionOptions(context: RequestContext): ListActionOptions {
  const {include, detail} = extractRetrievalActionOptions(context, false)
  const totals = context.param('totals', booleanQueryParam.default(true))
  return {include, totals, detail}
}

export function extractShowActionOptions(context: RequestContext): ShowActionOptions {
  const {include, detail} = extractRetrievalActionOptions(context, true)
  return {include, detail}
}

export function extractCreateActionOptions(context: RequestContext): CreateActionOptions {
  const dryRun = context.param('dryrun', booleanQueryParam.default(false))
  return {dryRun}
}

export function extractReplaceActionOptions(context: RequestContext): ReplaceActionOptions {
  const dryRun = context.param('dryrun', booleanQueryParam.default(false))
  return {dryRun}
}

export function extractUpdateActionOptions(context: RequestContext): UpdateActionOptions {
  const dryRun = context.param('dryrun', booleanQueryParam.default(false))
  return {dryRun}
}

const booleanQueryParam = z.union([z.string(), z.boolean()]).transform(val => {
  if (val === true || val === false) { return val }
  if (val === '0' || val === 'false' || val === 'no' || val === '') { return false }
  return true
})

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
  }, request)
}

type ResourceActionHandler = (
  resource: AnyResource,
  request:  Request,
  response: Response,
  context:  RequestContext
) => void | Promise<void>

// #endregion
