import { mockJSONAPI } from './mock'

import { OpenAPIV3_1 } from 'openapi-types'

import * as openapi from './openapi'

describe("openapi", () => {

  const jsonAPI = mockJSONAPI({
    openAPI: {
      version: '3.1.0',
      info:    openapi.info,
    },
  })

  beforeEach(() => {
    // Drop the children resource as most tests just operate on 'parents'. There are some that do not but they
    // will reset the mock JSON API as needed.
    jsonAPI.registry.drop('children')
  })

  it("should allow generating a basic openapi spec with the given info", async () => {
    const spec = await jsonAPI.openAPISpec()
    expect(spec).toEqual({
      openapi: '3.1.0',
      info:    openapi.info,

      paths:      expect.any(Object),
      components: expect.any(Array),
    })
  })

  describe("paths", () => {

    it("should create all paths for basic HTTP REST access", async () => {
      const spec = await jsonAPI.openAPISpec()
      expect(spec.paths).toEqual({
        '/parents': {
          get:    expect.any(Object),
          post:   expect.any(Object),
          delete: expect.any(Object),
        },
        '/parents/:{label}': {
          get: expect.any(Object),
        },
        '/parents/{id}': {
          get:   expect.any(Object),
          put:   expect.any(Object),
          patch: expect.any(Object),
        },
      })
    })

    it("should create paths for all resources", async () => {
      jsonAPI.reset()
      const spec = await jsonAPI.openAPISpec()
      expect(spec.paths).toEqual({
        '/parents': {
          get:    expect.any(Object),
          post:   expect.any(Object),
          delete: expect.any(Object),
        },
        '/parents/:{label}': {
          get: expect.any(Object),
        },
        '/parents/{id}': {
          get:   expect.any(Object),
          put:   expect.any(Object),
          patch: expect.any(Object),
        },
        '/children': {
          get:    expect.any(Object),
          post:   expect.any(Object),
          delete: expect.any(Object),
        },
        '/children/:{label}': {
          get: expect.any(Object),
        },
        '/children/{id}': {
          get:   expect.any(Object),
          put:   expect.any(Object),
          patch: expect.any(Object),
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
          post:   expect.any(Object),
          delete: expect.any(Object),
        },
        '/parents/{id}': {
          get:   expect.any(Object),
          put:   expect.any(Object),
          patch: expect.any(Object),
        },
      })
    })

    it("should not include the show operation if they are disabled", async () => {
      jsonAPI.registry.modify('parents', cfg => {
        cfg.show = false
      })

      expect((await jsonAPI.openAPISpec()).paths).toEqual({
        '/parents': {
          get:    expect.any(Object),
          post:   expect.any(Object),
          delete: expect.any(Object),
        },
        '/parents/:{label}': {
          get: expect.any(Object),
        },
        '/parents/{id}': {
          put:   expect.any(Object),
          patch: expect.any(Object),
        },
      })
    })

    it("should not include the create operation if they are disabled", async () => {
      jsonAPI.registry.modify('parents', cfg => {
        cfg.create = false
      })

      expect((await jsonAPI.openAPISpec()).paths).toEqual({
        '/parents': {
          get:    expect.any(Object),
          delete: expect.any(Object),
        },
        '/parents/:{label}': {
          get: expect.any(Object),
        },
        '/parents/{id}': {
          get:   expect.any(Object),
          put:   expect.any(Object),
          patch: expect.any(Object),
        },
      })
    })

    it("should not include the replace operation if they are disabled", async () => {
      jsonAPI.registry.modify('parents', cfg => {
        cfg.replace = false
      })

      expect((await jsonAPI.openAPISpec()).paths).toEqual({
        '/parents': {
          get:    expect.any(Object),
          post:   expect.any(Object),
          delete: expect.any(Object),
        },
        '/parents/:{label}': {
          get: expect.any(Object),
        },
        '/parents/{id}': {
          get:   expect.any(Object),
          patch: expect.any(Object),
        },
      })
    })

    it("should not include the update operation if they are disabled", async () => {
      jsonAPI.registry.modify('parents', cfg => {
        cfg.update = false
      })

      expect((await jsonAPI.openAPISpec()).paths).toEqual({
        '/parents': {
          get:    expect.any(Object),
          post:   expect.any(Object),
          delete: expect.any(Object),
        },
        '/parents/:{label}': {
          get: expect.any(Object),
        },
        '/parents/{id}': {
          get: expect.any(Object),
          put: expect.any(Object),
        },
      })
    })

    it("should not include the delete operation if they are disabled", async () => {
      jsonAPI.registry.modify('parents', cfg => {
        cfg.delete = false
      })

      expect((await jsonAPI.openAPISpec()).paths).toEqual({
        '/parents': {
          get:  expect.any(Object),
          post: expect.any(Object),
        },
        '/parents/:{label}': {
          get: expect.any(Object),
        },
        '/parents/{id}': {
          get:   expect.any(Object),
          put:   expect.any(Object),
          patch: expect.any(Object),
        },
      })
    })

  })

  describe("requests & responses", () => {

    describe("list (GET /parents, GET /parents/:{label})", () => {

      it("should not require any input", async () => {
        const spec = await jsonAPI.openAPISpec()
        expect(spec.paths?.['/parents']?.get?.requestBody).toBeUndefined()
        expect(spec.paths?.['/parents/:{label}']?.get?.requestBody).toBeUndefined()
      })
  
      it("should accept list parameters", async () => {
        const spec = await jsonAPI.openAPISpec()

        const expected = (label: boolean) => ([
          ...(label ? [
            expect.objectContaining({name: 'label', in: 'path', required: true}),
          ] : []),
          expect.objectContaining({name: 'filters', in: 'query', required: false}),
          expect.objectContaining({name: 'search', in: 'query', required: false}),
          expect.objectContaining({name: 'sorts', in: 'query', required: false}),
          expect.objectContaining({name: 'limit', in: 'query', required: false}),
          expect.objectContaining({name: 'offset', in: 'query', required: false}),
        ])

        expect(spec.paths?.['/parents']?.get?.parameters).toEqual(expected(false))
        expect(spec.paths?.['/parents/:{label}']?.get?.parameters).toEqual(expected(true))
      })
  
      it("should in the case of 200 respond with a list pack of the resource", async () => {
        const spec = await jsonAPI.openAPISpec()
  
        const expected = () => ({
          description: expect.any(String),
          content:     {
            'application/vnd.api+json': {
              schema: {
                type:       'object',
                properties: {
                  data: {
                    type:  'array',
                    items: {
                      $ref: '#/components/schemas/ParentsDocument',
                    },
                  },
                  included: {
                    type:  'array',
                    items: {
                      $ref: '#/components/schemas/AnyDocument',
                    },
                  },
                  meta: {
                    type: 'object',
                  },
                },
                required: ['data'],
              },
            },
          },
        })
  
        expect(spec.paths?.['/parents']?.get?.responses['200']).toEqual(expected())
        expect(spec.paths?.['/parents/:{label}']?.get?.responses['200']).toEqual(expected())
      })
  
    })
  
    describe("show (GET /parents/{id})", () => {
  
      it("should not require any input", async () => {
        const spec = await jsonAPI.openAPISpec()
        expect(spec.paths?.['/parents/{id}']?.get?.requestBody).toBeUndefined()
      })
    
      it("should accept an ID parameter", async () => {
        const spec = await jsonAPI.openAPISpec()

        expect(spec.paths?.['/parents/{id}']?.get?.parameters).toEqual([
          expect.objectContaining({name: 'id', in: 'path', required: true}),
        ])
      })

      it("should in the case of 200 respond with a document pack of the resource", async () => {
        const spec = await jsonAPI.openAPISpec()
  
        expect(spec.paths?.['/parents/{id}']?.get?.responses['200']).toEqual({
          description: expect.any(String),
          content:     {
            'application/vnd.api+json': {
              schema: {
                type:       'object',
                properties: {
                  data: {
                    $ref: '#/components/schemas/ParentsDocument',
                  },
                  included: {
                    type:  'array',
                    items: {
                      $ref: '#/components/schemas/AnyDocument',
                    },
                  },
                  meta: {
                    type: 'object',
                  },
                },
                required: ['data'],
              },
            },
          },
        })
      })
  
    })
  
    describe("create (POST /parents)", () => {
  
      it("should require a document pack of the resource as input", async () => {
        const spec = await jsonAPI.openAPISpec()
        expect(spec.paths?.['/parents']?.post?.requestBody).toEqual({
          content: {
            'application/vnd.api+json': {
              schema: {
                type:       'object',
                properties: {
                  data: {
                    $ref: '#/components/schemas/ParentsDocumentWithoutID',
                  },
                  meta: {
                    type: 'object',
                  },
                },
                required: ['data'],
              },
            },
          },
        })
      })
    
      it("should accept no parameters", async () => {
        const spec = await jsonAPI.openAPISpec()
        expect(spec.paths?.['/parents']?.post?.parameters).toEqual([])
      })

      it("should in the case of 201 respond with a document pack of the resource", async () => {
        const spec = await jsonAPI.openAPISpec()
  
        expect(spec.paths?.['/parents']?.post?.responses['200']).toBeUndefined()
        expect(spec.paths?.['/parents']?.post?.responses['201']).toEqual({
          description: expect.any(String),
          content:     {
            'application/vnd.api+json': {
              schema: {
                type:       'object',
                properties: {
                  data: {
                    $ref: '#/components/schemas/ParentsDocument',
                  },
                  included: {
                    type:  'array',
                    items: {
                      $ref: '#/components/schemas/AnyDocument',
                    },
                  },
                  meta: {
                    type: 'object',
                  },
                },
                required: ['data'],
              },
            },
          },
        })
      })
  
    })
  
    describe("replace (PUT /parents/id)", () => {
  
      it("should require a document pack of the resource as input", async () => {
        const spec = await jsonAPI.openAPISpec()
        expect(spec.paths?.['/parents/{id}']?.put?.requestBody).toEqual({
          content: {
            'application/vnd.api+json': {
              schema: {
                type:       'object',
                properties: {
                  data: {
                    $ref: '#/components/schemas/ParentsDocument',
                  },
                  meta: {
                    type: 'object',
                  },
                },
                required: ['data'],
              },
            },
          },
        })
      })
    
      it("should accept an ID parameter", async () => {
        const spec = await jsonAPI.openAPISpec()

        expect(spec.paths?.['/parents/{id}']?.put?.parameters).toEqual([
          expect.objectContaining({name: 'id', in: 'path', required: true}),
        ])
      })

      it("should in the case of 200 respond with a document pack of the resource", async () => {
        const spec = await jsonAPI.openAPISpec()
  
        expect(spec.paths?.['/parents/{id}']?.put?.responses['200']).toEqual({
          description: expect.any(String),
          content:     {
            'application/vnd.api+json': {
              schema: {
                type:       'object',
                properties: {
                  data: {
                    $ref: '#/components/schemas/ParentsDocument',
                  },
                  included: {
                    type:  'array',
                    items: {
                      $ref: '#/components/schemas/AnyDocument',
                    },
                  },
                  meta: {
                    type: 'object',
                  },
                },
                required: ['data'],
              },
            },
          },
        })
      })
  
    })
  
    describe("update (PATCH /parents/id)", () => {
  
      it("should require a document pack of the resource as input", async () => {
        const spec = await jsonAPI.openAPISpec()
        expect(spec.paths?.['/parents/{id}']?.patch?.requestBody).toEqual({
          content: {
            'application/vnd.api+json': {
              schema: {
                type:       'object',
                properties: {
                  data: {
                    $ref: '#/components/schemas/ParentsDocument',
                  },
                  meta: {
                    type: 'object',
                  },
                },
                required: ['data'],
              },
            },
          },
        })
      })
    
      it("should accept an ID parameter", async () => {
        const spec = await jsonAPI.openAPISpec()

        expect(spec.paths?.['/parents/{id}']?.patch?.parameters).toEqual([
          expect.objectContaining({name: 'id', in: 'path', required: true}),
        ])
      })

      it("should in the case of 200 respond with a document pack of the resource", async () => {
        const spec = await jsonAPI.openAPISpec()
  
        expect(spec.paths?.['/parents/{id}']?.patch?.responses['200']).toEqual({
          description: expect.any(String),
          content:     {
            'application/vnd.api+json': {
              schema: {
                type:       'object',
                properties: {
                  data: {
                    $ref: '#/components/schemas/ParentsDocument',
                  },
                  included: {
                    type:  'array',
                    items: {
                      $ref: '#/components/schemas/AnyDocument',
                    },
                  },
                  meta: {
                    type: 'object',
                  },
                },
                required: ['data'],
              },
            },
          },
        })
      })
  
    })
  
    describe("delete (DELETE /parents)", () => {
  
      it("should require a bulk selector pack of the resource as input", async () => {
        const spec = await jsonAPI.openAPISpec()
        expect(spec.paths?.['/parents']?.delete?.requestBody).toEqual({
          content: {
            'application/vnd.api+json': {
              schema: {
                $ref: '#/components/schemas/BulkSelector',
              },
            },
          },
        })
      })
    
      it("should accept no parameters", async () => {
        const spec = await jsonAPI.openAPISpec()
        expect(spec.paths?.['/parents']?.delete?.parameters).toEqual([])
      })

      it("should in the case of 200 respond with a list pack of linkages", async () => {
        const spec = await jsonAPI.openAPISpec()
  
        expect(spec.paths?.['/parents']?.delete?.responses['200']).toEqual({
          description: expect.any(String),
          content:     {
            'application/vnd.api+json': {
              schema: {
                type:       'object',
                properties: {
                  data: {
                    type:  'array',
                    items: {
                      $ref: '#/components/schemas/Linkage',
                    },
                  },
                  meta: {
                    type:       'object',
                    properties: {
                      deletedCount: {
                        type: 'integer',
                      },
                    },
                  },
                },
                required: ['data', 'meta'],
              },
            },
          },
        })
      })
  
    })
  
    describe("all actions", () => {
  
      describe.each`
      action          | get
      ${'list'}       | ${(spec: OpenAPIV3_1.Document) => spec.paths?.['/parents']?.get}
      ${'list-label'} | ${(spec: OpenAPIV3_1.Document) => spec.paths?.['/parents/:{label}']?.get}
      ${'show'}       | ${(spec: OpenAPIV3_1.Document) => spec.paths?.['/parents/{id}']?.get}
      ${'create'}     | ${(spec: OpenAPIV3_1.Document) => spec.paths?.['/parents']?.post}
      ${'replace'}    | ${(spec: OpenAPIV3_1.Document) => spec.paths?.['/parents/{id}']?.put}
      ${'update'}     | ${(spec: OpenAPIV3_1.Document) => spec.paths?.['/parents/{id}']?.patch}
      ${'delete'}     | ${(spec: OpenAPIV3_1.Document) => spec.paths?.['/parents']?.delete}
      `("$action", ({action, get}) => {
  
        it("should define all possible response codes", async () => {
          const spec = await jsonAPI.openAPISpec()
          const okCode = action === 'create' ? '201' : '200'
  
          expect(get(spec).responses).toEqual({
            [okCode]: expect.any(Object),
            '400':    expect.any(Object),
            '401':    expect.any(Object),
            '403':    expect.any(Object),
            '404':    expect.any(Object),
            '405':    expect.any(Object),
            '409':    expect.any(Object),
            '500':    expect.any(Object),
          })
        })
        
      })
  
    })
  
  })

  describe("components", () => {

    it("should create a set of components for each resource, as well as some common components", async () => {
      jsonAPI.reset()
      
      const spec = await jsonAPI.openAPISpec()
      expect(spec.components).toEqual({
        schemas: {
          ParentsCreateDocument:   expect.any(Object),
          ParentsUpdateDocument:   expect.any(Object),
          ParentsResponseDocument: expect.any(Object),
          ParentsAttributes:       expect.any(Object),
          ParentsRelationships:    expect.any(Object),

          ChildrenCreateDocument:   expect.any(Object),
          ChildrenUpdateDocument:   expect.any(Object),
          ChildrenResponseDocument: expect.any(Object),
          ChildrenAttributes:       expect.any(Object),
          ChildrenRelationships:    expect.any(Object),
          
          AnyResponseDocument: expect.any(Object),

          BulkSelector: expect.any(Object),
          Relationship: expect.any(Object),
          Linkage:      expect.any(Object),

          Error:                 expect.any(Object),
          ValidationError:       expect.any(Object),
          ValidationErrorDetail: expect.any(Object),
        },
      })
    })

    describe("documents", () => {

      it("should expose a ParentsResponseDocument with proper references and an ID", async () => {
        const spec = await jsonAPI.openAPISpec()
        expect(spec.components?.schemas?.['ParentsResponseDocument']).toEqual({
          type: 'object',

          properties: {
            type: {
              type: 'string',
              enum: ['parents'],
            },
            id: {
              type: 'string',
            },
            attributes: {
              $ref: '#/components/schemas/ParentsAttributes',
            },
            relationships: {
              $ref: '#/components/schemas/ParentsRelationships',
            },
            meta: {
              type: 'object',
            },
          },
          required: ['type', 'id', 'attributes', 'relationships'],
        })
      })

      it("should expose a ParentsCreateDocument with proper references but with an optional ID and without relationships", async () => {
        const spec = await jsonAPI.openAPISpec()
        expect(spec.components?.schemas?.['ParentsCreateDocument']).toEqual({
          type: 'object',

          properties: {
            type: {
              type: 'string',
              enum: ['parents'],
            },
            id: {
              anyOf: [{
                type: 'string',
              }, {
                type: 'null',
              }],
            },
            attributes: {
              $ref: '#/components/schemas/ParentsAttributes',
            },
            meta: {
              type: 'object',
            },
          },
          required: ['type', 'attributes'],
        })
      })

      it("should expose a ParentsUpdateDocument with proper references but without relationships", async () => {
        const spec = await jsonAPI.openAPISpec()
        expect(spec.components?.schemas?.['ParentsUpdateDocument']).toEqual({
          type: 'object',

          properties: {
            type: {
              type: 'string',
              enum: ['parents'],
            },
            id: {
              type: 'string',
            },
            attributes: {
              $ref: '#/components/schemas/ParentsAttributes',
            },
            meta: {
              type: 'object',
            },
          },
          required: ['type', 'id', 'attributes'],
        })
      })

      it("should expose a generic AnyResponseDocument", async () => {
        const spec = await jsonAPI.openAPISpec()
        expect(spec.components?.schemas?.['AnyResponseDocument']).toEqual({
          type: 'object',

          properties: {
            type: {
              type: 'string',
            },
            id: {
              type: 'string',
            },
            attributes: {
              type: 'object',
            },
            relationships: {
              type: 'object',

              additionalProperties: {
                $ref: '#/components/schemas/Relationship',
              },
            },
            meta: {
              type: 'object',
            },
          },
          required: ['type', 'id', 'attributes', 'relationships'],
        })
      })

    })

    describe("attributes", () => {

      it("should expose a ParentsAttributes with a property for each exposed attribute", async () => {
        const spec = await jsonAPI.openAPISpec()
        expect(spec.components?.schemas?.['ParentsAttributes']).toEqual({
          type: 'object',

          properties: {
            name: expect.any(Object),
            age:  expect.any(Object),
          },
          required: expect.any(Array),
        })
      })

    })

    describe("misc", () => {

      it("should expose a BulkSelector", async () => {
        const spec = await jsonAPI.openAPISpec()
        expect(spec.components?.schemas?.['BulkSelector']).toEqual({
          anyOf: [{
            type: 'object',

            properties: {
              data: {
                type:  'array',
                items: {
                  $ref: '#/components/schemas/Linkage',
                },
              },
            },
            required: ['data'],
          }, {
            type: 'object',

            properties: {
              meta: {
                type: 'object',
                
                properties: {
                  filters: {
                    type: 'object',
                  },
                },
                required: ['filters'],
              },
            },
            required: ['meta'],
          }, {
            type: 'object',

            properties: {
              meta: {
                type: 'object',
                
                properties: {
                  search: {
                    type: 'string',
                  },
                },
                required: ['search'],
              },
            },
            required: ['meta'],
          }],
        })
      })

      it("should expose a Relationship", async () => {
        const spec = await jsonAPI.openAPISpec()
        expect(spec.components?.schemas?.['Relationship']).toEqual({
          type: 'object',

          properties: {
            data: {
              anyOf: [
                {
                  type: 'null',
                },
                {
                  $ref: '#/components/schemas/Linkage',
                },
                {
                  type:  'array',
                  items: {
                    $ref: '#/components/schemas/Linkage',
                  },
                },
              ],
            },
            meta: {
              type: 'object',
            },
          },
          required: ['data'],
        })
      })

      it("should expose a Linkage", async () => {
        const spec = await jsonAPI.openAPISpec()
        expect(spec.components?.schemas?.['Linkage']).toEqual({
          type: 'object',

          properties: {
            type: {
              type: 'string',
            },
            id: {
              type: 'string',
            },
            meta: {
              type: 'object',
            },
          },
          required: ['type', 'id'],
        })
      })

      it("should use the proper ID type in Linkage", async () => {
        jsonAPI.options.openAPI ??= {}
        jsonAPI.options.openAPI.metaDefaults ??= {}
        jsonAPI.options.openAPI.metaDefaults.idType = 'integer'

        const spec = await jsonAPI.openAPISpec()        
        expect(spec.components?.schemas?.['Linkage']).toEqual({
          type: 'object',

          properties: {
            type: {
              type: 'string',
            },
            id: {
              type: 'integer',
            },
            meta: {
              type: 'object',
            },
          },
          required: ['type', 'id'],
        })
      })

      it("should expose an Error", async () => {
        const spec = await jsonAPI.openAPISpec()
        expect(spec.components?.schemas?.['Error']).toEqual({
          type: 'object',

          properties: {
            status:  {type: 'integer'},
            message: {type: 'string'},
          },
          required: ['status', 'message'],
        })
      })

      it("should expose a ValidationError", async () => {
        const spec = await jsonAPI.openAPISpec()
        expect(spec.components?.schemas?.['ValidationError']).toEqual({
          type: 'object',

          properties: {
            status:  {type: 'integer'},
            message: {type: 'string'},
            errors:  {
              type:  'array',
              items: {
                $ref: '#/components/schemas/ValidationErrorDetail',
              },
            },
          },
          required: ['status', 'message', 'errors'],
        })
      })

      it("should expose a ValidationErrorDetail", async () => {
        const spec = await jsonAPI.openAPISpec()
        expect(spec.components?.schemas?.['ValidationErrorDetail']).toEqual({
          type: 'object',

          properties: {
            code:   {type: 'string'},
            title:  {type: 'string'},
            detail: {type: 'string'},
            source: {
              anyOf: [{
                type:       'object',
                properties: {pointer: {type: 'string'}},
                required:   ['pointer'],
              }, {
                type:       'object',
                properties: {parameter: {type: 'string'}},
                required:   ['parameter'],
              }],
            },
          },
          required: ['title'],
        })
      })

    })

  })

})