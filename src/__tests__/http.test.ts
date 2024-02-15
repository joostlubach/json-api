import { context, MockAdapter, MockJSONAPI } from './mock'

import express, { Application, NextFunction, Request, Response, Router } from 'express'
import request from 'supertest'
import { objectKeys } from 'ytil'

import { JSONAPIOptions } from '../JSONAPI'
import RequestContext from '../RequestContext'
import Resource from '../Resource'
import { Model, Parent, Query } from './db'

describe("http", () => {

  let jsonAPI: MockJSONAPI

  let parents: Resource<Parent, Query, string>
  let spy: jest.SpyInstance

  let router: Router
  let app: Application


  function setUp(options: JSONAPIOptions<Model, Query, string> = {}) {
    jsonAPI = new MockJSONAPI(options)

    parents = jsonAPI.registry.get<Parent, Query, string>('parents')
    router = jsonAPI.router()

    app = express()
    app.use(router)
    app.use((error: any, request: Request, response: Response, next: NextFunction) => {
      if (error instanceof Error) {
        response.json(error)
        response.end()
      } else {
        next()
      }
    })
  }

  function mockPack() {
    return {
      serialize: () => '🗿',
    }
  }
  

  describe("router paths", () => {

    it("should create an express router with the correct routes", async () => {
      setUp()

      const routes = router.stack.map(layer => {
        const route = layer.route as any
        return `${String(objectKeys(route.methods)[0]).toUpperCase()} ${route.path}`
      })

      expect(routes).toEqual(expect.arrayContaining([
        'GET /parents',
        'GET /parents/::label',
        'GET /parents/:id',
        'POST /parents',
        'PUT /parents/:id',
        'PATCH /parents/:id',
        'DELETE /parents',
        'GET /children',
        'GET /children/::label',
        'GET /children/:id',
        'POST /children',
        'PUT /children/:id',
        'PATCH /children/:id',
        'DELETE /children',
      ]))
    })

    it("should create an openapi endpoint if openapi is configured", async () => {
      setUp({
        openAPI: {},
      })

      const spec = await jsonAPI.openAPISpec(context('__openapi__'))
      const response = await request(app).get('/openapi.json')
      expect(response.statusCode).toEqual(200)
      expect(JSON.parse(response.text)).toEqual(spec)
    })
  
  })

  describe("GET /parents", () => {

    beforeEach(() => {
      setUp()
      spy = jest.spyOn(parents, 'list')
      spy.mockReturnValue(Promise.resolve(mockPack()))
    })

    it("should call list() for parents and serialize its output", async () => {
      const response = await request(app).get('/parents')
      expect(response.status).toEqual(200)
      expect(response.text).toEqual('"🗿"')

      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0][0]).toEqual({
        label:   null,
        filters: {},
        search:  null,
        sorts:   [],
        offset:  0,
        limit:   null,
      })

      expect(spy.mock.calls[0][1]).toEqual(expect.any(Function))
      expect(spy.mock.calls[0][1]()).toBeInstanceOf(MockAdapter)
      expect(spy.mock.calls[0][2]).toBeInstanceOf(RequestContext)
      expect(spy.mock.calls[0][2].action).toEqual('list')
    })

    it("should set all parameters appropriately", async () => {
      await request(app)
        .get('/parents')
        .query('filter[name]=Alice')
        .query('filter[age]=>42')
        .query('search=foo')
        .query('sort=name,-age')
        .query('offset=10')
        .query('limit=20')

      expect(spy).toHaveBeenCalledTimes(1)

      const args = spy.mock.calls[0]
      expect(args[0]).toEqual({
        label:   null,
        filters: {name: "Alice", age: '>42'},
        search:  'foo',
        sorts:   [{field: 'name', direction: 1}, {field: 'age', direction: -1}],
        offset:  10,
        limit:   20,
      })
    })

  })

  describe("GET /parents/::label", () => {

    beforeEach(() => {
      setUp()
      spy = jest.spyOn(parents, 'list')
      spy.mockReturnValue(Promise.resolve(mockPack()))
    })

    it("should call list() for parents and serialize its output", async () => {
      const response = await request(app).get('/parents/:family-a')
      expect(response.status).toEqual(200)
      expect(response.text).toEqual('"🗿"')

      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0][0]).toEqual({
        label:   'family-a',
        filters: {},
        search:  null,
        sorts:   [],
        offset:  0,
        limit:   null,
      })

      expect(spy.mock.calls[0][1]).toEqual(expect.any(Function))
      expect(spy.mock.calls[0][1]()).toBeInstanceOf(MockAdapter)
      expect(spy.mock.calls[0][2]).toBeInstanceOf(RequestContext)
      expect(spy.mock.calls[0][2].action).toEqual('list')
    })

    it("should set all parameters appropriately", async () => {
      await request(app)
        .get('/parents/:family-a')
        .query('filter[name]=Alice')
        .query('filter[age]=>42')
        .query('search=foo')
        .query('sort=name,-age')
        .query('offset=10')
        .query('limit=20')

      expect(spy).toHaveBeenCalledTimes(1)

      const args = spy.mock.calls[0]
      expect(args[0]).toEqual({
        label:   'family-a',
        filters: {name: "Alice", age: '>42'},
        search:  'foo',
        sorts:   [{field: 'name', direction: 1}, {field: 'age', direction: -1}],
        offset:  10,
        limit:   20,
      })
    })

  })

  describe("GET /parents/:id", () => {

    beforeEach(() => {
      setUp()
      spy = jest.spyOn(parents, 'show')
      spy.mockReturnValue(Promise.resolve(mockPack()))
    })

    it("should call show() for parents with the given ID and serialize its output", async () => {
      const response = await request(app).get('/parents/alice')
      expect(response.status).toEqual(200)
      expect(response.text).toEqual('"🗿"')

      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0][0]).toEqual({id: 'alice'})
      expect(spy.mock.calls[0][1]).toEqual(expect.any(Function))
      expect(spy.mock.calls[0][1]()).toBeInstanceOf(MockAdapter)
      expect(spy.mock.calls[0][2]).toBeInstanceOf(RequestContext)
      expect(spy.mock.calls[0][2].action).toEqual('show')
    })

    it("should use a singleton locator if a singleton with the given name is present", async () => {
      jsonAPI.registry.modify('parents', cfg => {
        cfg.singletons = {
          alice: async () => ({model: null}),
        }
      })
      
      await request(app).get('/parents/alice')
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0][0]).toEqual({singleton: 'alice'})
    })

  })

  describe('PUT /parents/:id', () => {
    it.todo("should work")
  })
  describe('PATCH /parents/:id', () => {
    it.todo("should work")
  })
  describe('DELETE /parents', () => {
    it.todo("should work")
  })

  describe.each`
  method      | path                    | hasRequest
  ${'get'}    | ${'/parents'}           | ${false}
  ${'get'}    | ${'/parents/:family-a'} | ${false}
  ${'get'}    | ${'/parents/alice'}     | ${false}
  ${'post'}   | ${'/parents'}           | ${true}
  ${'put'}    | ${'/parents/alice'}     | ${true}
  ${'patch'}  | ${'/parents/alice'}     | ${true}
  ${'delete'} | ${'/parents'}           | ${false}
  `("request validation", ({method, path, hasRequest}) => {

    describe(`${method} ${path}`, () => {    

      it("should output the proper content type", async () => {
        setUp()

        const response = await call()
        expect(response.header['content-type']).toEqual('application/vnd.api+json; charset=utf-8')    
      })

      it("should always take the first allowed content type", async () => {
        setUp({
          router: {
            allowedContentTypes: ['application/whatever', 'application/json'],
          },
        })

        const response = await call()
        expect(response.header['content-type']).toEqual('application/whatever; charset=utf-8')
        delete jsonAPI.options.router
      })

      it.todo("should validate requests")
      it.todo("should deserialize inputs")
      it.todo("should serialize outputs")

      async function call() {
        const req = request(app)
        const fn = (req as any)[method] as typeof req.get
        return await fn.call(req, path)
      }

    })

  })

})