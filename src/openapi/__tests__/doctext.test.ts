import { mockJSONAPI } from '../../__tests__/mock'

import Resource from '../../Resource'
import { Parent, Query } from '../../__tests__/db'
import config from '../../config'
import { resource } from '../../defineUtil'
import doctext from '../doctext'
import parseDoctext from '../doctext/parseDoctext'

describe("doctext", () => {

  const jsonAPI = mockJSONAPI()
  let warnings: string[]
  let origWarn: typeof config.logger.warn
  
  let parents: Resource<Parent, Query, string>

  beforeEach(() => {
    warnings = []
    origWarn = config.logger.warn
    config.logger.warn = (message: string) => warnings.push(message)
  })

  afterEach(() => {
    config.logger.warn = origWarn
  })

  describe("with proper doctext defined", () => {

    beforeEach(() => {
      jsonAPI.registry.clear()
      parents = jsonAPI.registry.register('parents', doctext<Parent, Query, string>({
        // """
        // Parents in the family.
        //
        // There are two nuclear families, A & B. Each have two parents and two children.
        // Relationships show spouses and children, and children's parents reciprocally.
  
        modelName: 'Parent',
  
        openapi: {
          idType: 'integer',
        },
  
        labels: {
          // """Lists only members from family A."""
          'family-a': query => ({...query, filters: {...query.filters, family: 'a'}}),
          // """Lists only members from family B."""
          'family-b': query => ({...query, filters: {...query.filters, family: 'b'}}),
        },
  
        attributes: {
          // """The name of the parent."""
          name: true,
          age:  true,
        },
        relationships: {
          /** """
           * The spouse of this parent.
           * 
           * The spouse will by convention have the same children as this parent.
           * """
           */
          spouse: {
            type:   'parents',
            plural: false,
          },
  
          // """The children of this parent."""
          children: {
            type:   'children',
            plural: true,
          },
        },
      }))
    })

    it("should inject proper openapi metadata into the config", () => {
      expect(parents.config.openapi).toEqual({
        idType: 'integer', // The values are merged with existing openapi config.
  
        summary:     "Parents in the family.",
        description: "Parents in the family. There are two nuclear families, A & B. Each have two parents and two children. Relationships show spouses and children, and children's parents reciprocally.",
  
        labels: {
          'family-a': {
            summary:     "Lists only members from family A.",
            description: "Lists only members from family A.",
          },
          'family-b': {
            summary:     "Lists only members from family B.",
            description: "Lists only members from family B.",
          },
        },
        attributes: {
          'name': {
            summary:     "The name of the parent.",
            description: "The name of the parent.",
          },
          'age': undefined,
        },
        relationships: {
          'spouse': {
            summary:     "The spouse of this parent.",
            description: "The spouse of this parent. The spouse will by convention have the same children as this parent.",
          },
          'children': {
            summary:     "The children of this parent.",
            description: "The children of this parent.",
          },
        },
      })
    })

    it("should warn about missing doctexts", () => {
      expect(warnings).toEqual([
        "Missing doctext for `attributes.age`",
      ])
    })

  })

  describe("entities", () => {

    it("should allow copying doctext from another entity", () => {
      const children = jsonAPI.registry.register('children', doctext<Parent, Query, string>({
        attributes: {
          // """The parent of this child."""
          parent: true,
        },
        relationships: {
          // """@copy attributes.parent"""
          parent: {
            type:   'parents',
            plural: false,
          },
        },
      }))

      expect(children.config.openapi?.attributes?.parent).toEqual({
        summary:     "The parent of this child.",
        description: "The parent of this child.",
      })
      expect(children.config.openapi?.relationships?.parent).toEqual({
        summary:     "The parent of this child.",
        description: "The parent of this child.",
      })
    })
    
    it("should complain if a copied entity could not be found", () => {
      const children = jsonAPI.registry.register('children', doctext<Parent, Query, string>({
        attributes: {
        },
        relationships: {
          // """@copy attributes.parent"""
          parent: {
            type:   'parents',
            plural: false,
          },
        },
      }))

      expect(children.config.openapi?.relationships?.parent).toEqual({
        summary:     '',
        description: '',
      })
      expect(warnings).toEqual([
        "Could not find doctext to copy from `attributes.parent`",
      ])
    })

  })

  describe("with invalid doctext() usage", () => {

    it("should warn if the doctext function was not called with an object expression", async () => {
      const config = resource<Parent, Query, string>({
        attributes: {},
      })
      doctext(config)

      expect(config.openapi).toBeUndefined()
      expect(warnings).toEqual([
        "the argument doctext() must be the literal resource config object",
      ])
    })
    
  })

  describe("parseDoctext", () => {

    it("should interpret anything up to a blank line as a summary, and the full text as a description", async () => {
      const doctext = parseDoctext('test.ts', 0, [
        'The name of the parent.',
        '',
        'This is only the first name.',
      ], [])

      expect(doctext).toEqual({
        lineno:      0,
        summary:     'The name of the parent.',
        description: 'The name of the parent. This is only the first name.',
        entities:    {},
        nodes:       [],
      })
    })

    it("should have an identical summary and description if no blank line was included", async () => {
      const doctext = parseDoctext('test.ts', 0, [
        'The name of the parent.',
      ], [])

      expect(doctext).toEqual({
        lineno:      0,
        summary:     'The name of the parent.',
        description: 'The name of the parent.',
        entities:    {},
        nodes:       [],
      })
    })

    it("should allow for an empty summary", async () => {
      const doctext = parseDoctext('test.ts', 0, [
        '',
      ], [])

      expect(doctext).toEqual({
        lineno:      0,
        summary:     '',
        description: '',
        entities:    {},
        nodes:       [],
      })
    })

    describe("entities", () => {

      it("should parse entities and leave all other lines for the summary and description", async () => {
        const doctext = parseDoctext('test.ts', 0, [
          'Summary',
          '@property name',
          '@link https://example.com',
          '',
          'Description',
        ], [])
  
        expect(doctext).toEqual(expect.objectContaining({
          summary:     'Summary',
          description: 'Summary Description',
        }))
      })

      it("should interpret any indented lines underneath an entity as its content", async () => {
        const doctext = parseDoctext('test.ts', 0, [
          'Summary',
          '@property name',
          '  This is the name of the parent.',
        ], [])
  
        expect(doctext).toEqual(expect.objectContaining({
          summary:     'Summary',
          description: 'Summary',

          entities: {
            properties: {
              name: {
                summary:     "This is the name of the parent.",
                description: "This is the name of the parent.",
              },
            },
          },
        }))
      })

      it("should not interpret any indented lines underneath an entity as its content if they are not indented", async () => {
        const doctext = parseDoctext('test.ts', 0, [
          'Summary',
          '@property name',
          'This is the name of the parent.',
        ], [])
  
        expect(doctext).toEqual(expect.objectContaining({
          summary:     'Summary This is the name of the parent.',
          description: 'Summary This is the name of the parent.',

          entities: {
            properties: {
              name: {
                summary:     "",
                description: "",
              },
            },
          },
        }))
      })

      it("should not interpret any indented lines underneath an entity as its content if the entity does not take content", async () => {
        const doctext = parseDoctext('test.ts', 0, [
          'Summary',
          '@copy from.here',
          '  This is the name of the parent.',
        ], [])
  
        expect(doctext).toEqual(expect.objectContaining({
          summary:     'Summary This is the name of the parent.',
          description: 'Summary This is the name of the parent.',

          entities: {
            copy: 'from.here',
          },
        }))
      })

      test("full example with all entities", async () => {
        const doctext = parseDoctext('test.ts', 0, [
          'Summary',
          '',
          'Description.',
          '@copy from.here',
          '@copy no.from.here',
          '@link https://example.com',
          '@link https://example.com With caption',
          '@property name Inline summary.',
          '@property age',
          '  Full summary.',
          '  ',
          '  With description.',
        ], [])
  
        expect(doctext).toEqual(expect.objectContaining({
          summary:     'Summary',
          description: 'Summary Description.',

          entities: {
            copy:  'no.from.here',
            links: [
              {href: 'https://example.com', caption: 'https://example.com'},
              {href: 'https://example.com', caption: 'With caption'},
            ],
            properties: {
              name: {
                summary:     "Inline summary.",
                description: "Inline summary.",
              },
              age: {
                summary:     "Full summary.",
                description: "Full summary. With description.",
              },
            },
          },
        }))
      })
  
    })


  })


})