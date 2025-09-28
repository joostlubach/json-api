import stripAnsi from 'strip-ansi'

import Pack from '../../Pack'
import Resource from '../../Resource'
import { Parent, Query } from '../../__tests__/db'
import { mockJSONAPI } from '../../__tests__/mock'
import config from '../../config'
import doctext from '../doctext'

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
        /// Parents in the family.
        ///
        /// There are two nuclear families, A & B. Each have two parents and two children.
        /// Relationships show spouses and children, and children's parents reciprocally.
  
        entity: 'Parent',
  
        openapi: {
          idType: 'integer',
        },
  
        labels: {
          /// Lists only members from family A.
          'family-a': query => ({...query, filters: {...query.filters, family: 'a'}}),
          /// Lists only members from family B.
          'family-b': query => ({...query, filters: {...query.filters, family: 'b'}}),
        },
  
        attributes: {
          /// The name of the parent.
          name: true,
          age:  true,
        },
        relationships: {
          /**
           * The spouse of this parent.
           * 
           * The spouse will by convention have the same children as this parent.
           */
          spouse: {
            type:   'parents',
            plural: false,
          },
  
          /// The children of this parent.
          children: {
            type:   'children',
            plural: true,
          },
        },
      }))
    })

    it("should inject proper openapi metadata into the config", () => {
      expect<any>(parents.config.openapi).toEqual({
        idType: 'integer', // The values are merged with existing openapi config.
  
        summary:     "Parents in the family.",
        description: "Parents in the family. There are two nuclear families, A & B. Each have two parents and two children. Relationships show spouses and children, and children's parents reciprocally.",
  
        labels: {
          'family-a': {
            title:       "Lists only members from family A.",
            description: "Lists only members from family A.",
          },
          'family-b': {
            title:       "Lists only members from family B.",
            description: "Lists only members from family B.",
          },
        },
        attributes: {
          'name': {
            title:       "The name of the parent.",
            description: "The name of the parent.",
          },
          'age': undefined,
        },
        relationships: {
          'spouse': {
            title:       "The spouse of this parent.",
            description: "The spouse of this parent. The spouse will by convention have the same children as this parent.",
          },
          'children': {
            title:       "The children of this parent.",
            description: "The children of this parent.",
          },
        },
      })
    })

    it("should warn about missing doctexts, except attributes and relationships", () => {
      parents = jsonAPI.registry.register('parents', doctext<Parent, Query, string>({
        entity: 'Parent',

        labels: {
          one: query => query,
        },

        filters: {
          one: query => query,
        },

        singletons: {
          one: async query => ({data: null}),
        },

        collectionActions: {
          one: async () => new Pack(null),
        },

        documentActions: {
          one: async () => new Pack(null),
        },

        attributes: {
          one: true,
        },
        relationships: {
          one: {
            type:   'parents',
            plural: false,
          },
        },
      }))

      expect(warnings.map(stripAnsi)).toEqual([
        "doctext.test.ts: Missing doctext for `labels.one`",
        "doctext.test.ts: Missing doctext for `filters.one`",
        "doctext.test.ts: Missing doctext for `singletons.one`",
        "doctext.test.ts: Missing doctext for `collectionActions.one`",
        "doctext.test.ts: Missing doctext for `documentActions.one`",
      ])
    })

  })


})
