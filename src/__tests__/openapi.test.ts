import { mockJSONAPI } from './mock'

import * as openapi from './openapi'

describe("openapi", () => {

  const jsonAPI = mockJSONAPI({
    openAPI: {
      version: '3.1.0',
      info:    openapi.info,
    },
  })

  it("should allow generating a basic openapi spec with the given info", async () => {
    const spec = await jsonAPI.openAPISpec()
    expect(spec).toEqual({
      openapi: '3.1.0',
      info:    openapi.info,

      paths:      expect.objectContaining({}),
      components: expect.arrayContaining([]),
    })
  })

  describe("paths", () => {

    beforeEach(() => {
      jsonAPI.registry.drop('children')
    })

    it("should create all paths for basic HTTP REST access", async () => {
      const spec = await jsonAPI.openAPISpec()
      expect(spec.paths).toEqual({
        '/parents': {
          get:    expect.objectContaining({}),
          post:   expect.objectContaining({}),
          delete: expect.objectContaining({}),
        },
        '/parents/:{label}': {
          get: expect.objectContaining({}),
        },
        '/parents/{id}': {
          get:   expect.objectContaining({}),
          put:   expect.objectContaining({}),
          patch: expect.objectContaining({}),
        },
      })
    })

    it("should not include the list operations if they are disabled", async () => {
      jsonAPI.registry.modify('parents', cfg => {
        cfg.list = false
      })

      const spec = await jsonAPI.openAPISpec()
      expect(spec.paths).toEqual({
        '/parents': {
          post:   expect.objectContaining({}),
          delete: expect.objectContaining({}),
        },
        '/parents/{id}': {
          get:   expect.objectContaining({}),
          put:   expect.objectContaining({}),
          patch: expect.objectContaining({}),
        },
      })
    })

    it("should not include the show operation if they are disabled", async () => {
      jsonAPI.registry.modify('parents', cfg => {
        cfg.show = false
      })

      expect((await jsonAPI.openAPISpec()).paths).toEqual({
        '/parents': {
          get:    expect.objectContaining({}),
          post:   expect.objectContaining({}),
          delete: expect.objectContaining({}),
        },
        '/parents/:{label}': {
          get: expect.objectContaining({}),
        },
        '/parents/{id}': {
          put:   expect.objectContaining({}),
          patch: expect.objectContaining({}),
        },
      })
    })

    it("should not include the create operation if they are disabled", async () => {
      jsonAPI.registry.modify('parents', cfg => {
        cfg.create = false
      })

      expect((await jsonAPI.openAPISpec()).paths).toEqual({
        '/parents': {
          get:    expect.objectContaining({}),
          delete: expect.objectContaining({}),
        },
        '/parents/:{label}': {
          get: expect.objectContaining({}),
        },
        '/parents/{id}': {
          get:   expect.objectContaining({}),
          put:   expect.objectContaining({}),
          patch: expect.objectContaining({}),
        },
      })
    })

    it("should not include the replace operation if they are disabled", async () => {
      jsonAPI.registry.modify('parents', cfg => {
        cfg.replace = false
      })

      expect((await jsonAPI.openAPISpec()).paths).toEqual({
        '/parents': {
          get:    expect.objectContaining({}),
          post:   expect.objectContaining({}),
          delete: expect.objectContaining({}),
        },
        '/parents/:{label}': {
          get: expect.objectContaining({}),
        },
        '/parents/{id}': {
          get:   expect.objectContaining({}),
          patch: expect.objectContaining({}),
        },
      })
    })

    it("should not include the update operation if they are disabled", async () => {
      jsonAPI.registry.modify('parents', cfg => {
        cfg.update = false
      })

      expect((await jsonAPI.openAPISpec()).paths).toEqual({
        '/parents': {
          get:    expect.objectContaining({}),
          post:   expect.objectContaining({}),
          delete: expect.objectContaining({}),
        },
        '/parents/:{label}': {
          get: expect.objectContaining({}),
        },
        '/parents/{id}': {
          get: expect.objectContaining({}),
          put: expect.objectContaining({}),
        },
      })
    })

    it("should not include the delete operation if they are disabled", async () => {
      jsonAPI.registry.modify('parents', cfg => {
        cfg.delete = false
      })

      expect((await jsonAPI.openAPISpec()).paths).toEqual({
        '/parents': {
          get:  expect.objectContaining({}),
          post: expect.objectContaining({}),
        },
        '/parents/:{label}': {
          get: expect.objectContaining({}),
        },
        '/parents/{id}': {
          get:   expect.objectContaining({}),
          put:   expect.objectContaining({}),
          patch: expect.objectContaining({}),
        },
      })
    })

  })


})