import { mockJSONAPI } from '../../__tests__/mock'

import Resource from '../../Resource'
import { Parent, Query } from '../../__tests__/db'
import doctext from '../doctext'

describe("enrich", () => {

  const jsonAPI = mockJSONAPI()
  let parents: Resource<Parent, Query, string>

  beforeEach(async () => {
    jsonAPI.registry.clear()
    parents = jsonAPI.registry.register('parents', await doctext<Parent, Query, string>({
      // """
      // Parents in the family.
      //
      // There are two nuclear families, A & B. Each have two parents and two
      // children. 

      modelName: 'Parent',

      labels: {
        // """Lists only members from family A."""
        'family-a': query => ({...query, filters: {...query.filters, family: 'a'}}),
        // """Lists only members from family B."""
        'family-b': query => ({...query, filters: {...query.filters, family: 'b'}}),
      },

      attributes: {
        // """The name of the parent."""
        name: true,

        // """The age of the parent in years."""
        age: true,
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
      summary:     "Parents in the family.",
      description: "Parents in the family. There are two nuclear families, A & B. Each have two parents and two children.",

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
        'age': {
          summary:     "The age of the parent in years.",
          description: "The age of the parent in years.",
        },
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


})