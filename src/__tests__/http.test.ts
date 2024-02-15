import { context, MockAdapter, MockJSONAPI } from './mock'

import express, { Application, NextFunction, Request, Response, Router } from 'express'
import supertest from 'supertest'
import { objectKeys } from 'ytil'

import Document from '../Document'
import { JSONAPIOptions } from '../JSONAPI'
import Pack from '../Pack'
import RequestContext from '../RequestContext'
import Resource from '../Resource'
import { Model, Parent, Query } from './db'

describe("http", () => {

  let jsonAPI: MockJSONAPI

  let parents: Resource<Parent, Query, string>
  let spy: jest.SpyInstance

  let router: Router
  let app: Application
  let request: supertest.Agent

  function setUp(options: JSONAPIOptions<Model, Query, string> = {}) {
    jsonAPI = new MockJSONAPI(options)

    parents = jsonAPI.registry.get<Parent, Query, string>('parents')
    router = jsonAPI.router()

    app = express()
    app.use(router)
    app.use((error: any, request: Request, response: Response, next: NextFunction) => {
      if (error instanceof Error) {
        response.json(error)
      }
      next()
    })

    request = supertest(app)
  }

  function mockPack() {
    return {
      serialize: () => '🗿',
    }
  }
  

  describe("router paths", () => {

    it("should create an express router with the correct routes", async () => {
      setUp()

      const routes: string[] = []
      for (const layer of router.stack) {
        const route = layer.route as any
        if (route == null) { continue }

        const method = String(objectKeys(route.methods)[0]).toUpperCase()
        routes.push(`${method} ${route.path}`)
      }

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
      const response = await request.get('/openapi.json')
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
      const response = await request.get('/parents')
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
      await request
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
      const response = await request.get('/parents/:family-a')
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
      await request
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

  describe("POST /parents", () => {

    beforeEach(() => {
      setUp()
      spy = jest.spyOn(parents, 'create')
      spy.mockReturnValue(Promise.resolve(mockPack()))
    })

    it("should call create() for parents and serialize its output", async () => {
      const response = await request.post('/parents').send({
        data: {
          type:       'parents',
          id:         'alice',
          attributes: {
            name: "Alice",
            age:  40,
          },
        },        
      })
      expect(response.status).toEqual(201)
      expect(response.text).toEqual('"🗿"')

      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0][0]).toBeInstanceOf(Pack)
      expect(spy.mock.calls[0][0].data).toBeInstanceOf(Document)
      expect(spy.mock.calls[0][1]).toEqual(expect.any(Function))
      expect(spy.mock.calls[0][1]()).toBeInstanceOf(MockAdapter)
      expect(spy.mock.calls[0][2]).toBeInstanceOf(RequestContext)
      expect(spy.mock.calls[0][2].action).toEqual('create')
    })

  })

  describe("GET /parents/:id", () => {

    beforeEach(() => {
      setUp()
      spy = jest.spyOn(parents, 'show')
      spy.mockReturnValue(Promise.resolve(mockPack()))
    })

    it("should call show() for parents with the given ID and serialize its output", async () => {
      const response = await request.get('/parents/alice')
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
      
      await request.get('/parents/alice')
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0][0]).toEqual({singleton: 'alice'})
    })

  })

  describe('PUT /parents/:id', () => {

    beforeEach(() => {
      setUp()
      spy = jest.spyOn(parents, 'replace')
      spy.mockReturnValue(Promise.resolve(mockPack()))
    })

    it("should call replace() for parents with the given ID and serialize its output", async () => {
      const response = await request.put('/parents/alice').send({
        data: {
          type:       'parents',
          id:         'alice',
          attributes: {
            name: "Alice",
            age:  40,
          },
        },        
      })

      expect(response.status).toEqual(200)
      expect(response.text).toEqual('"🗿"')

      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0][0]).toEqual('alice')
      expect(spy.mock.calls[0][1]).toBeInstanceOf(Pack)
      expect(spy.mock.calls[0][1].data).toBeInstanceOf(Document)
      expect(spy.mock.calls[0][2]).toEqual(expect.any(Function))
      expect(spy.mock.calls[0][2]()).toBeInstanceOf(MockAdapter)
      expect(spy.mock.calls[0][3]).toBeInstanceOf(RequestContext)
      expect(spy.mock.calls[0][3].action).toEqual('replace')
    })

  })

  describe('PATCH /parents/:id', () => {

    beforeEach(() => {
      setUp()
      spy = jest.spyOn(parents, 'update')
      spy.mockReturnValue(Promise.resolve(mockPack()))
    })

    it("should call update() for parents with the given ID and serialize its output", async () => {
      const response = await request.patch('/parents/alice').send({
        data: {
          type:       'parents',
          id:         'alice',
          attributes: {
            name: "Alice",
            age:  40,
          },
        },
        
      })
      expect(response.status).toEqual(200)
      expect(response.text).toEqual('"🗿"')

      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0][0]).toEqual('alice')
      expect(spy.mock.calls[0][1]).toBeInstanceOf(Pack)
      expect(spy.mock.calls[0][1].data).toBeInstanceOf(Document)
      expect(spy.mock.calls[0][2]).toEqual(expect.any(Function))
      expect(spy.mock.calls[0][2]()).toBeInstanceOf(MockAdapter)
      expect(spy.mock.calls[0][3]).toBeInstanceOf(RequestContext)
      expect(spy.mock.calls[0][3].action).toEqual('update')
    })

  })

  describe('DELETE /parents', () => {

    beforeEach(() => {
      setUp()
      spy = jest.spyOn(parents, 'delete')
      spy.mockReturnValue(Promise.resolve(mockPack()))
    })

    it("should call delete() for parents with the given ID and serialize its output", async () => {
      const response = await request.delete('/parents').send({
        data: [
          {type: 'parents', id: 'alice'},
        ],
      })
      expect(response.status).toEqual(200)
      expect(response.text).toEqual('"🗿"')

      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0][0]).toBeInstanceOf(Pack)
      expect(spy.mock.calls[0][0].data).toEqual([{type: 'parents', id: 'alice'}])
      expect(spy.mock.calls[0][1]).toEqual(expect.any(Function))
      expect(spy.mock.calls[0][1]()).toBeInstanceOf(MockAdapter)
      expect(spy.mock.calls[0][2]).toBeInstanceOf(RequestContext)
      expect(spy.mock.calls[0][2].action).toEqual('delete')
    })

  })

  describe.each`
  method      | path                    | hasRequest
  ${'get'}    | ${'/parents'}           | ${false}
  ${'get'}    | ${'/parents/:family-a'} | ${false}
  ${'get'}    | ${'/parents/alice'}     | ${false}
  ${'post'}   | ${'/parents'}           | ${true}
  ${'put'}    | ${'/parents/alice'}     | ${true}
  ${'patch'}  | ${'/parents/alice'}     | ${true}
  ${'delete'} | ${'/parents'}           | ${true}
  `("request validation", ({method, path, hasRequest}) => {

    afterEach(() => {
      delete jsonAPI.options.router
    })

    describe(`${method.toUpperCase()} ${path}`, () => {

      it("should use the Accept header to determine the content type of the response", async () => {
        setUp({
          router: {
            allowedContentTypes: ['application/foo', 'application/bar'],
          },
        })
  
        const response = await call().set('Accept', 'application/json')
        expect(response.header['content-type']).toEqual('application/json; charset=utf-8')
      })

      it("should not allow an Accept header that contains an unsupported content type", async () => {
        setUp({
          router: {
            allowedContentTypes: ['application/json', 'application/foo'],
          },
        })
  
        const response = await call().set('Accept', 'application/bar')
        expect(response.statusCode).toEqual(406)
      })

      if (hasRequest) {
        it("should require a request body", async () => {
          setUp()
          const response = await call().send(Buffer.from([]))
          expect(response.statusCode).toEqual(400)
        })
  
        it("should accept a valid content type", async () => {
          setUp({
            router: {
              allowedContentTypes: ['application/json', 'application/foo'],
            },
          })

          const response = await call()
            .set('Content-Type', 'application/json' )
            .send({data: null})
          expect(response.statusCode).not.toEqual(415)
        })

        it("should not accept an invalid content type", async () => {
          setUp({
            router: {
              allowedContentTypes: ['application/json', 'application/foo'],
            },
          })

          const response = await call()
            .set('Content-Type', 'application/bar')
            .send(Buffer.from([]))
          expect(response.statusCode).toEqual(415)
        })

        it("should mirror the content type of the request if it is allowed", async () => {
          setUp({
            router: {
              allowedContentTypes: ['application/foo', 'application/bar'],
            },
          })
    
          const response = await call().set('Content-Type', 'application/bar')
          expect(response.header['content-type']).toEqual('application/bar; charset=utf-8')
          delete jsonAPI.options.router
        })
      } else {
        it("should not allow a request body", async () => {
          setUp()
          const response = await call().send({data: null})
          expect(response.statusCode).toEqual(400)
        })

        it("should by default respond with application/vnd.api+json", async () => {
          setUp()
  
          const response = await call()
          expect(response.header['content-type']).toEqual('application/vnd.api+json; charset=utf-8')    
        })
  
        it("should use the first configured content type in the response", async () => {
          setUp({
            router: {
              allowedContentTypes: ['application/foo', 'application/bar'],
            },
          })

          const response = await call()
          expect(response.header['content-type']).toEqual('application/foo; charset=utf-8')
          delete jsonAPI.options.router
        })
      }

      function call() {
        const fn = (request as any)[method] as typeof request.get
        return fn.call(request, path)
      }

    })

  })

})