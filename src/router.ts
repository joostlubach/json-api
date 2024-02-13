import { NextFunction, Request, Response, Router } from 'express'
import { kebabCase } from 'lodash'
import { objectEntries } from 'ytil'

import APIError from './APIError'
import JSONAPI from './JSONAPI'
import Pack from './Pack'
import RequestContext from './RequestContext'
import Resource from './Resource'
import { CustomCollectionAction, CustomDocumentAction } from './ResourceConfig'
import { negotiateContentType, validateContentType, validateRequest } from './pre'
import { AnyResource } from './types'

export function router<M, Q, I>(jsonAPI: JSONAPI<M, Q, I>): Router {
  const router = Router()

  // #region Set up

  const requestContext = jsonAPI.options.router?.requestContext ?? defaultRequestContext

  for (const resource of jsonAPI.registry.all()) {
    mountResource(resource)
  }
  mountOpenAPI()

  // #endregion

  // #region Resource mounting

  const {
    customCollectionAction,
    customDocumentAction,
    ...rest
  } = buildActions(jsonAPI)

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
      const route = jsonAPI.route(resource, name)
      if (route === false) { continue }

      const path = route.path(resource)
      router[route.method](path, regularAction(resource, kebabCase(name), action))
    }
  }

  // #endregion

  // #region Open API

  function mountOpenAPI() {
    const {openAPI} = jsonAPI.options
    if (openAPI == null) { return }

    router.get('/openapi.json', async (req, res, next) => {
      try {
        res.json(await jsonAPI.openAPISpec())
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

    if (jsonAPI.options.router?.enforceContentType !== false) {
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
      const adapter = () => jsonAPI.adapter(resource, context)
      const options = resource.extractActionOptions(context)

      const responsePack = await resource.create(requestPack, adapter, context, options)

      response.statusCode = 201
      response.json(responsePack.serialize())
    },

    async replace(resource: Resource<M, Q, I>, request: Request, response: Response, context: RequestContext) {
      const locator = resource.extractDocumentLocator(context, false)
      const requestPack = Pack.deserialize(jsonAPI.registry, request.body)
      const adapter = () => jsonAPI.adapter(resource, context)
      const options = resource.extractActionOptions(context)

      const responsePack = await resource.replace(locator.id, requestPack, adapter, context, options)
      response.json(responsePack.serialize())
    },

    async update(resource: Resource<M, Q, I>, request: Request, response: Response, context: RequestContext) {
      const locator = resource.extractDocumentLocator(context, false)
      const requestPack = Pack.deserialize(jsonAPI.registry, request.body)
      const adapter = () => jsonAPI.adapter(resource, context)
      const options = resource.extractActionOptions(context)

      const responsePack = await resource.update(locator.id, requestPack, adapter, context, options)
      response.json(responsePack.serialize())
    },

    async delete(resource: Resource<M, Q, I>, request: Request, response: Response, context: RequestContext) {
      const adapter = () => jsonAPI.adapter(resource, context)
      const requestPack = request.body?.data != null ? Pack.deserialize(jsonAPI.registry, request.body) : new Pack<I>(null)

      const responsePack = await resource.delete(requestPack, adapter, context)
      response.json(responsePack.serialize())
    },

    customCollectionAction<R extends Resource<M, Q, I>>(spec: CustomCollectionAction<M, Q, I>) {
      return async (resource: R, request: Request, response: Response, context: RequestContext) => {
        const requestPack = spec.router?.deserialize !== false
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
        const requestPack = spec.router?.deserialize !== false
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

// #region Types & defaults

function defaultRequestContext(action: string, request: Request) {
  const uri = new URL(request.originalUrl)
  return new RequestContext(action, {...request.params, uri})
}

type ResourceActionHandler = (
  resource: AnyResource,
  request:  Request,
  response: Response,
  context:  RequestContext
) => void | Promise<void>

// #endregion