
import { context, mockJSONAPI } from './mock'

import { expectAsyncError } from 'yest'

import APIError from '../APIError'
import db, { Child, Query } from './db'

describe("scoping", () => {

  const jsonAPI = mockJSONAPI()

  beforeEach(() => {
    db.seed()
  })

  beforeEach(() => {
    jsonAPI.registry.modify<Child, Query, string>('children', cfg => {
      cfg.attributes.parents = true

      cfg.scope = {
        query: (query, context) => {
          return {
            ...query,
            filters: {
              ...query.filters,
              parents: (parents: string[]) => parents.includes(context.param('parent')),
            },
          }
        },
        ensure: (model, context) => {
          model.parents = [context.param('parent')]
        },
      }
    })
  
  })

  describe("list", () => {
    
    it("should only consider data from the current scope", async () => {
      const pack = await jsonAPI.list('children', {}, context('list', {parent: 'alice'}))
      expect(pack.serialize().data.map((it: any) => it.id)).toEqual([
        'charlie',
        'dolores',
      ])
    })

  })

  describe("show", () => {

    beforeEach(() => {
      jsonAPI.registry.modify('children', cfg => {
        cfg.singletons = {
          firstborn: async query => {
            const children = db('children').list(query)
            children.sort((a, b) => b.age - a.age)
            return {data: children[0]}
          },
        }
      })
    })
    
    it("should only consider data from the current scope", async () => {
      const pack = await jsonAPI.show('children', {id: 'charlie'}, context('show', {parent: 'alice'}))
      expect(pack.serialize().data.id).toEqual('charlie')

      await expectAsyncError(() => (
        jsonAPI.show('children', {id: 'isaac'}, context('show', {parent: 'alice'}))
      ), APIError, error => {
        expect(error.status).toEqual(404)
      })
    })

    it("should also work with singletons", async () => {
      const pack1 = await jsonAPI.show('children', {singleton: 'firstborn'}, context('show', {parent: 'alice'}))
      expect(pack1.serialize().data.id).toEqual('dolores')

      const pack2 = await jsonAPI.show('children', {singleton: 'firstborn'}, context('show', {parent: 'eve'}))
      expect(pack2.serialize().data.id).toEqual('henry')
    })

  })

  describe("create", () => {
    
    it("should apply scope defaults", async () => {
      const requestPack = jsonAPI.documentRequestPack('children', 'greg', {name: "Greg", age: 10})
      const pack = await jsonAPI.create('children', requestPack, context('create', {parent: 'alice'}))
      expect(pack.serialize().data).toEqual({
        id:         'greg',
        type:       'children',
        attributes: {
          name:    "Greg",
          age:     10,
          parents: ['alice'],
        },
        relationships: {
          parents: {data: [{id: 'alice', type: 'parents'}]},
        },
      })
    })

    it("should overwrite any maliciously added data to break out of the scope", async () => {
      const requestPack = jsonAPI.documentRequestPack('children', 'greg', {name: "Greg", age: 10, parents: ['bob', 'eve']})
      const pack = await jsonAPI.create('children', requestPack, context('create', {parent: 'alice'}))
      expect(pack.serialize().data.relationships).toEqual({
        parents: {data: [{id: 'alice', type: 'parents'}]},
      })
    })

  })

  describe("replace", () => {
    
    it("should only consider data from the current scope", async () => {
      const requestPack1 = jsonAPI.documentRequestPack('children', 'charlie', {name: "Charlie 2", parents: ['alice', 'bob']})
      const pack = await jsonAPI.replace('children', 'charlie', requestPack1, context('replace', {parent: 'alice'}))
      expect(pack.serialize().data.id).toEqual('charlie')

      const requestPack2 = jsonAPI.documentRequestPack('children', 'isaac', {name: "Isaac 2"})
      await expectAsyncError(() => (
        jsonAPI.replace('children', 'isaac', requestPack2, context('replace', {parent: 'alice'}))
      ), APIError, error => {
        expect(error.status).toEqual(404)
      })
    })
    
    it("should apply scope defaults", async () => {
      const requestPack = jsonAPI.documentRequestPack('children', 'charlie', {name: "Charlie 2", age: 10, parents: ['alice', 'bob']})
      const pack = await jsonAPI.replace('children', 'charlie', requestPack, context('replace', {parent: 'alice'}))
      expect(pack.serialize().data).toEqual({
        id:         'charlie',
        type:       'children',
        attributes: {
          name:    "Charlie 2",
          age:     10,
          parents: ['alice'],
        },
        relationships: {
          parents: {data: [{id: 'alice', type: 'parents'}]},
        },
      })
    })

    it("should overwrite any maliciously added data to break out of the scope", async () => {
      const requestPack = jsonAPI.documentRequestPack('children', 'charlie', {name: "Charlie 2", parents: ['alice', 'bob']})
      const pack = await jsonAPI.replace('children', 'charlie', requestPack, context('replace', {parent: 'alice'}))
      expect(pack.serialize().data.relationships).toEqual({
        parents: {data: [{id: 'alice', type: 'parents'}]},
      })      
    })

  })

  describe("update", () => {
    
    it("should only consider data from the current scope", async () => {
      const requestPack1 = jsonAPI.documentRequestPack('children', 'charlie', {name: "Charlie 2"})
      const pack = await jsonAPI.update('children', 'charlie', requestPack1, context('update', {parent: 'alice'}))
      expect(pack.serialize().data.id).toEqual('charlie')

      const requestPack2 = jsonAPI.documentRequestPack('children', 'isaac', {name: "Isaac 2"})
      await expectAsyncError(() => (
        jsonAPI.update('children', 'isaac', requestPack2, context('update', {parent: 'alice'}))
      ), APIError, error => {
        expect(error.status).toEqual(404)
      })
    })
    
    it("should apply scope defaults even if it's an update, to prevent any maliciously added data", async () => {
      // Note: in our database, children can have multiple parents. It's not possible to automatically infer that
      // Bob is also a parent of the updated child, so the update will also remove Bob as a parent.
      // Typically, the aggregation between a scope parent and its content is 1-N, so this shouldn't normally
      // be a problem. And if it is, any code can use the scope.ensure method to perform some custom logic.

      const requestPack = jsonAPI.documentRequestPack('children', 'charlie', {
        name:    "Charlie 2",
        age:     10, 
        parents: ['alice', 'bob'],
      })
      const pack = await jsonAPI.update('children', 'charlie', requestPack, context('update', {parent: 'alice'}))
      expect(pack.serialize().data.relationships).toEqual({
        parents: {
          data: [
            {id: 'alice', type: 'parents'},
          ],
        },
      })
    })

  })

  describe("delete", () => {
    
    it("should only consider data from the current scope", async () => {
      const requestPack = jsonAPI.bulkSelectorPack('children', ['charlie', 'isaac'])
      const pack = await jsonAPI.delete('children', requestPack, context('delete', {parent: 'alice'}))
      expect(pack.serialize().data.map((it: any) => it.id)).toEqual(['charlie'])
      expect(pack.serialize().meta).toEqual({deletedCount: 1})
    })

  })

})
