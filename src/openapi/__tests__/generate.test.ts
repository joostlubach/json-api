import SwaggerParser from '@apidevtools/swagger-parser'
import { OpenAPIV3_1 } from 'openapi-types'

import { context, MockAdapter, mockJSONAPI } from '../../__tests__/mock'
import { OpenAPIGeneratorOptions } from '../types'

describe("openapi", () => {

  const info = {
    "title":       "Mock API",
    "version":     "1.0.0",
    "description": "This is a mock API for testing purposes. It is not a real API and should not be used in production.",
    "contact":     {"email": "joostlubach@gmail.com"},

    "license": {
      "name": "Apache 2.0",
      "url":  "https://www.apache.org/licenses/LICENSE-2.0.html",
    },
  }

  const jsonAPI = mockJSONAPI({
    openAPI: {
      version: '3.1.0',
      info,
      
      defaults: {
        actions: {
          list: {
            summary: "Lists all {{plural}} in the system.",
          },
          create: {
            summary: "Create a new {{singular}} in the system.",
          },
        },
      },
    },
    router: {
      allowedContentTypes: ['application/vnd.api+json'],
    },
  })

  beforeEach(() => {
    // Drop the children resource as most tests just operate on 'parents'. There are some that do not but they
    // will reset the mock JSON API as needed.
    jsonAPI.registry.drop('children')
  })

  it("should allow generating a basic OpenAPI spec with the given info", async () => {
    const spec = await jsonAPI.openAPISpec(context('__openapi__'))
    expect(spec).toEqual({
      openapi: '3.1.0',
      info:    info,

      paths:      expect.any(Object),
      components: expect.any(Object),
    })
  })

  it("should be a valid OpenAPI spec", async () => {
    const spec = await jsonAPI.openAPISpec(context('__openapi__'))
    await SwaggerParser.validate(spec)
  })

  describe("paths", () => {

    it("should create all paths for basic HTTP REST access", async () => {
      const spec = await jsonAPI.openAPISpec(context('__openapi__'))
      expect(spec.paths).toEqual({
        '/parents': {
          get:    expect.any(Object),
          post:   expect.any(Object),
          delete: expect.any(Object),
        },
        '/parents/:family-a': {
          get: expect.any(Object),
        },
        '/parents/:family-b': {
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
      const spec = await jsonAPI.openAPISpec(context('__openapi__'))
      expect(spec.paths).toEqual({
        '/parents': {
          get:    expect.any(Object),
          post:   expect.any(Object),
          delete: expect.any(Object),
        },
        '/parents/:family-a': {
          get: expect.any(Object),
        },
        '/parents/:family-b': {
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

      const spec = await jsonAPI.openAPISpec(context('__openapi__'))
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

      expect((await jsonAPI.openAPISpec(context('__openapi__'))).paths).toEqual({
        '/parents': {
          get:    expect.any(Object),
          post:   expect.any(Object),
          delete: expect.any(Object),
        },
        '/parents/:family-a': {
          get: expect.any(Object),
        },
        '/parents/:family-b': {
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

      expect((await jsonAPI.openAPISpec(context('__openapi__'))).paths).toEqual({
        '/parents': {
          get:    expect.any(Object),
          delete: expect.any(Object),
        },
        '/parents/:family-a': {
          get: expect.any(Object),
        },
        '/parents/:family-b': {
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

      expect((await jsonAPI.openAPISpec(context('__openapi__'))).paths).toEqual({
        '/parents': {
          get:    expect.any(Object),
          post:   expect.any(Object),
          delete: expect.any(Object),
        },
        '/parents/:family-a': {
          get: expect.any(Object),
        },
        '/parents/:family-b': {
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

      expect((await jsonAPI.openAPISpec(context('__openapi__'))).paths).toEqual({
        '/parents': {
          get:    expect.any(Object),
          post:   expect.any(Object),
          delete: expect.any(Object),
        },
        '/parents/:family-a': {
          get: expect.any(Object),
        },
        '/parents/:family-b': {
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

      expect((await jsonAPI.openAPISpec(context('__openapi__'))).paths).toEqual({
        '/parents': {
          get:  expect.any(Object),
          post: expect.any(Object),
        },
        '/parents/:family-a': {
          get: expect.any(Object),
        },
        '/parents/:family-b': {
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

    describe("list (GET /parents, GET /parents/:<label>)", () => {

      it("should not require any input", async () => {
        const spec = await jsonAPI.openAPISpec(context('__openapi__'))
        expect(spec.paths?.['/parents']?.get?.requestBody).toBeUndefined()
        expect(spec.paths?.['/parents/:family-a']?.get?.requestBody).toBeUndefined()
        expect(spec.paths?.['/parents/:family-b']?.get?.requestBody).toBeUndefined()
      })
  
      it("should accept list parameters", async () => {
        const spec = await jsonAPI.openAPISpec(context('__openapi__'))

        const expected = () => ([
          expect.objectContaining({name: 'filters', in: 'query', required: false}),
          expect.objectContaining({name: 'search', in: 'query', required: false}),
          expect.objectContaining({name: 'sort', in: 'query', required: false}),
          expect.objectContaining({name: 'limit', in: 'query', required: false}),
          expect.objectContaining({name: 'offset', in: 'query', required: false}),
        ])

        expect(spec.paths?.['/parents']?.get?.parameters).toEqual(expected())
        expect(spec.paths?.['/parents/:family-a']?.get?.parameters).toEqual(expected())
        expect(spec.paths?.['/parents/:family-b']?.get?.parameters).toEqual(expected())
      })
  
      it("should in the case of 200 respond with a list pack of the resource", async () => {
        const spec = await jsonAPI.openAPISpec(context('__openapi__'))
  
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
                      $ref: '#/components/schemas/ParentsResponseDocument',
                    },
                  },
                  included: {
                    type:  'array',
                    items: {
                      $ref: '#/components/schemas/AnyResponseDocument',
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
  
        expect<any>(spec.paths?.['/parents']?.get?.responses['200']).toEqual(expected())
        expect<any>(spec.paths?.['/parents/:family-a']?.get?.responses['200']).toEqual(expected())
        expect<any>(spec.paths?.['/parents/:family-b']?.get?.responses['200']).toEqual(expected())
      })
  
    })
  
    describe("show (GET /parents/{id})", () => {
  
      it("should not require any input", async () => {
        const spec = await jsonAPI.openAPISpec(context('__openapi__'))
        expect(spec.paths?.['/parents/{id}']?.get?.requestBody).toBeUndefined()
      })
    
      it("should accept an ID parameter", async () => {
        const spec = await jsonAPI.openAPISpec(context('__openapi__'))

        expect(spec.paths?.['/parents/{id}']?.get?.parameters).toEqual([
          expect.objectContaining({name: 'id', in: 'path', required: true}),
        ])
      })

      it("should in the case of 200 respond with a document pack of the resource", async () => {
        const spec = await jsonAPI.openAPISpec(context('__openapi__'))
  
        expect(spec.paths?.['/parents/{id}']?.get?.responses['200']).toEqual({
          description: expect.any(String),
          content:     {
            'application/vnd.api+json': {
              schema: {
                type:       'object',
                properties: {
                  data: {
                    $ref: '#/components/schemas/ParentsResponseDocument',
                  },
                  included: {
                    type:  'array',
                    items: {
                      $ref: '#/components/schemas/AnyResponseDocument',
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
        const spec = await jsonAPI.openAPISpec(context('__openapi__'))
        expect(spec.paths?.['/parents']?.post?.requestBody).toEqual({
          content: {
            'application/vnd.api+json': {
              schema: {
                type:       'object',
                properties: {
                  data: {
                    $ref: '#/components/schemas/ParentsCreateDocument',
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
        const spec = await jsonAPI.openAPISpec(context('__openapi__'))
        expect(spec.paths?.['/parents']?.post?.parameters).toEqual([])
      })

      it("should in the case of 201 respond with a document pack of the resource", async () => {
        const spec = await jsonAPI.openAPISpec(context('__openapi__'))
  
        expect(spec.paths?.['/parents']?.post?.responses['200']).toBeUndefined()
        expect(spec.paths?.['/parents']?.post?.responses['201']).toEqual({
          description: expect.any(String),
          content:     {
            'application/vnd.api+json': {
              schema: {
                type:       'object',
                properties: {
                  data: {
                    $ref: '#/components/schemas/ParentsResponseDocument',
                  },
                  included: {
                    type:  'array',
                    items: {
                      $ref: '#/components/schemas/AnyResponseDocument',
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
        const spec = await jsonAPI.openAPISpec(context('__openapi__'))
        expect(spec.paths?.['/parents/{id}']?.put?.requestBody).toEqual({
          content: {
            'application/vnd.api+json': {
              schema: {
                type:       'object',
                properties: {
                  data: {
                    $ref: '#/components/schemas/ParentsCreateDocument',
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
        const spec = await jsonAPI.openAPISpec(context('__openapi__'))

        expect(spec.paths?.['/parents/{id}']?.put?.parameters).toEqual([
          expect.objectContaining({name: 'id', in: 'path', required: true}),
        ])
      })

      it("should in the case of 200 respond with a document pack of the resource", async () => {
        const spec = await jsonAPI.openAPISpec(context('__openapi__'))
  
        expect(spec.paths?.['/parents/{id}']?.put?.responses['200']).toEqual({
          description: expect.any(String),
          content:     {
            'application/vnd.api+json': {
              schema: {
                type:       'object',
                properties: {
                  data: {
                    $ref: '#/components/schemas/ParentsResponseDocument',
                  },
                  included: {
                    type:  'array',
                    items: {
                      $ref: '#/components/schemas/AnyResponseDocument',
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
        const spec = await jsonAPI.openAPISpec(context('__openapi__'))
        expect(spec.paths?.['/parents/{id}']?.patch?.requestBody).toEqual({
          content: {
            'application/vnd.api+json': {
              schema: {
                type:       'object',
                properties: {
                  data: {
                    $ref: '#/components/schemas/ParentsUpdateDocument',
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
        const spec = await jsonAPI.openAPISpec(context('__openapi__'))

        expect(spec.paths?.['/parents/{id}']?.patch?.parameters).toEqual([
          expect.objectContaining({name: 'id', in: 'path', required: true}),
        ])
      })

      it("should in the case of 200 respond with a document pack of the resource", async () => {
        const spec = await jsonAPI.openAPISpec(context('__openapi__'))
  
        expect(spec.paths?.['/parents/{id}']?.patch?.responses['200']).toEqual({
          description: expect.any(String),
          content:     {
            'application/vnd.api+json': {
              schema: {
                type:       'object',
                properties: {
                  data: {
                    $ref: '#/components/schemas/ParentsResponseDocument',
                  },
                  included: {
                    type:  'array',
                    items: {
                      $ref: '#/components/schemas/AnyResponseDocument',
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
        const spec = await jsonAPI.openAPISpec(context('__openapi__'))
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
        const spec = await jsonAPI.openAPISpec(context('__openapi__'))
        expect(spec.paths?.['/parents']?.delete?.parameters).toEqual([])
      })

      it("should in the case of 200 respond with a list pack of linkages", async () => {
        const spec = await jsonAPI.openAPISpec(context('__openapi__'))
  
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
  
      describe.each([
        {action: 'list', get: (spec: OpenAPIV3_1.Document) => spec.paths?.['/parents']?.get},
        {action: 'list-label', get: (spec: OpenAPIV3_1.Document) => spec.paths?.['/parents/:family-a']?.get},
        {action: 'show', get: (spec: OpenAPIV3_1.Document) => spec.paths?.['/parents/{id}']?.get},
        {action: 'create', get: (spec: OpenAPIV3_1.Document) => spec.paths?.['/parents']?.post},
        {action: 'replace', get: (spec: OpenAPIV3_1.Document) => spec.paths?.['/parents/{id}']?.put},
        {action: 'update', get: (spec: OpenAPIV3_1.Document) => spec.paths?.['/parents/{id}']?.patch},
        {action: 'delete', get: (spec: OpenAPIV3_1.Document) => spec.paths?.['/parents']?.delete},
      ])("$action", ({action, get}) => {
  
        it("should define all possible response codes", async () => {
          const spec = await jsonAPI.openAPISpec(context('__openapi__'))
          const okCode = action === 'create' ? '201' : '200'
  
          expect(get(spec)?.responses).toEqual({
            [okCode]: expect.any(Object),
            '400':    expect.any(Object),
            '401':    expect.any(Object),
            '403':    expect.any(Object),
            '404':    expect.any(Object),
            '405':    expect.any(Object),
            '406':    expect.any(Object),
            '409':    expect.any(Object),
            '415':    expect.any(Object),
            '500':    expect.any(Object),
          })
        })
        
      })
  
    })
  
  })

  describe("texts", () => {

    it("should interpolate {{singular}} and {{plural}} in literal texts", async () => {
      const spec = await jsonAPI.openAPISpec(context('__openapi__'))
      expect(spec.paths?.['/parents']?.get?.summary).toEqual("Lists all parents in the system.")
      expect(spec.paths?.['/parents']?.post?.summary).toEqual("Create a new parent in the system.")
    })

  })

  describe("components", () => {

    it("should create a set of components for each resource, as well as some common components", async () => {
      jsonAPI.reset()
      
      const spec = await jsonAPI.openAPISpec(context('__openapi__'))
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

          BulkSelector:         expect.any(Object),
          Relationship:         expect.any(Object),
          SingularRelationship: expect.any(Object),
          PluralRelationship:   expect.any(Object),
          Linkage:              expect.any(Object),

          Error:                 expect.any(Object),
          ValidationError:       expect.any(Object),
          ValidationErrorDetail: expect.any(Object),
        },
      })
    })

    describe("documents", () => {

      it("should expose a ParentsResponseDocument with proper references and an ID", async () => {
        const spec = await jsonAPI.openAPISpec(context('__openapi__'))
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
        const spec = await jsonAPI.openAPISpec(context('__openapi__'))
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
        const spec = await jsonAPI.openAPISpec(context('__openapi__'))
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
        const spec = await jsonAPI.openAPISpec(context('__openapi__'))
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

      let nameSchema: OpenAPIV3_1.SchemaObject
      let ageSchema: OpenAPIV3_1.SchemaObject
      let nameRequired: boolean
      let ageRequired: boolean

      beforeEach(() => {
        nameSchema = {
          type: 'string',
        }

        ageSchema = {
          type:    'integer',
          minimum: 0,
          maximum: 100,
        }

        nameRequired = true
        ageRequired = false

        jest.spyOn(MockAdapter.prototype, 'openAPISchemaForAttribute')
          .mockImplementation(name => name === 'name' ? nameSchema : ageSchema)

        jest.spyOn(MockAdapter.prototype, 'attributeRequired')
          .mockImplementation(name => name === 'name' ? nameRequired : ageRequired)
      })

      afterEach(() => {
        jest.restoreAllMocks()
      })

      it("should expose a ParentsAttributes with a property for each exposed attribute using openAPI reflection from the adapter", async () => {
        expect(await getAttributesSchema()).toEqual({
          type: 'object',

          properties: {
            name: {type: 'string'},
            age:  {type: 'integer', minimum: 0, maximum: 100},
          },
          required: ['name'],
        })

        ageRequired = true
        expect((await getAttributesSchema())?.required).toEqual(['name', 'age'])

        ageRequired = false
        nameRequired = false
        expect((await getAttributesSchema())?.required).toEqual([])

        nameSchema.minLength = 1
        nameSchema.maxLength = 100
        expect((await getAttributesSchema())?.properties?.name).toEqual({
          type:      'string',
          minLength: 1,
          maxLength: 100,
        })
      })

      it("should allow the adapter to return the metadata asynchronously", async () => {
        jest.spyOn(MockAdapter.prototype, 'openAPISchemaForAttribute')
          .mockImplementation(async name => name === 'name' ? nameSchema : ageSchema)

        jest.spyOn(MockAdapter.prototype, 'attributeRequired')
          .mockImplementation(async name => name === 'name' ? nameRequired : ageRequired)

        expect(await getAttributesSchema()).toEqual({
          type: 'object',

          properties: {
            name: {type: 'string'},
            age:  {type: 'integer', minimum: 0, maximum: 100},
          },
          required: ['name'],
        })
      })

      async function getAttributesSchema() {
        const spec = await jsonAPI.openAPISpec(context('__openapi__'))
        return spec.components?.schemas?.['ParentsAttributes']
      }

    })

    describe("relationships", () => {

      it("should expose a ParentsRelationships with a property for each exposed relationship", async () => {
        const spec = await jsonAPI.openAPISpec(context('__openapi__'))
        expect(spec.components?.schemas?.['ParentsRelationships']).toEqual({
          type: 'object',

          properties: {
            spouse:   {$ref: '#/components/schemas/SingularRelationship'},
            children: {$ref: '#/components/schemas/PluralRelationship'},
          },
          required: ['spouse', 'children'],
        })
      })

      it("should not require (aka guarantee presence of as it's only a response schema) conditional relationships", async () => {
        jsonAPI.registry.modify('parents', cfg => {
          cfg.relationships!.spouse = {
            type:   'parents',
            plural: false,
            if:     () => true,
          }
        })

        const spec = await jsonAPI.openAPISpec(context('__openapi__'))
        expect(spec.components?.schemas?.['ParentsRelationships']).toEqual({
          type: 'object',

          properties: {
            spouse:   {$ref: '#/components/schemas/SingularRelationship'},
            children: {$ref: '#/components/schemas/PluralRelationship'},
          },
          required: ['children'],
        })
      })

      it("should not require (aka guarantee presence of as it's only a response schema) detail relationships", async () => {
        jsonAPI.registry.modify('parents', cfg => {
          cfg.relationships!.children = {
            type:   'parents',
            plural: true,
            detail: true,
          }
        })

        const spec = await jsonAPI.openAPISpec(context('__openapi__'))
        expect(spec.components?.schemas?.['ParentsRelationships']).toEqual({
          type: 'object',

          properties: {
            spouse:   {$ref: '#/components/schemas/SingularRelationship'},
            children: {$ref: '#/components/schemas/PluralRelationship'},
          },
          required: ['spouse'],
        })
      })

    })

    describe("misc", () => {

      it("should expose a BulkSelector", async () => {
        const spec = await jsonAPI.openAPISpec(context('__openapi__'))
        expect(spec.components?.schemas?.['BulkSelector']).toEqual({
          type: 'object',
  
          properties: {
            data: {
              type:  'array',
              items: {
                $ref: '#/components/schemas/Linkage',
              },
            },
            meta: {
              type: 'object',
        
              properties: {
                filters: {
                  type: 'object',
                },
                search: {
                  type: 'string',
                },
              },
            },
          },
        })
      })

      it("should expose a Relationship", async () => {
        const spec = await jsonAPI.openAPISpec(context('__openapi__'))
        expect(spec.components?.schemas?.['Relationship']).toEqual({
          anyOf: [{
            $ref: '#/components/schemas/SingularRelationship',
          }, {
            $ref: '#/components/schemas/PluralRelationship',
          }],
        })
      })

      it("should expose a SingularRelationship", async () => {
        const spec = await jsonAPI.openAPISpec(context('__openapi__'))
        expect(spec.components?.schemas?.['SingularRelationship']).toEqual({
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
              ],
            },
            meta: {
              type: 'object',
            },
          },
          required: ['data'],
        })
      })

      it("should expose a PluralRelationship", async () => {
        const spec = await jsonAPI.openAPISpec(context('__openapi__'))
        expect(spec.components?.schemas?.['PluralRelationship']).toEqual({
          type: 'object',

          properties: {
            data: {
              type:  'array',
              items: {
                $ref: '#/components/schemas/Linkage',
              },
            },
            meta: {
              type: 'object',
            },
          },
          required: ['data'],
        })
      })

      it("should expose a Linkage", async () => {
        const spec = await jsonAPI.openAPISpec(context('__openapi__'))
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
        const options: OpenAPIGeneratorOptions = (jsonAPI.options.openAPI = {}) as OpenAPIGeneratorOptions
        options.defaults ??= {}
        options.defaults.idType = 'integer'

        const spec = await jsonAPI.openAPISpec(context('__openapi__'))        
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
        const spec = await jsonAPI.openAPISpec(context('__openapi__'))
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
        const spec = await jsonAPI.openAPISpec(context('__openapi__'))
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
        const spec = await jsonAPI.openAPISpec(context('__openapi__'))
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
