import { context, mockJSONAPI } from './mock'

import { omit } from 'lodash'
import { delay } from 'yest'
import { slugify } from 'ytil'

import db from './db'

describe("list", () => {

  const jsonAPI = mockJSONAPI()

  beforeEach(() => {
    db.seed()
  })

  describe("without parameters", () => {

    it("should list documents of a specific resource type", async () => {
      const pack = await jsonAPI.list('parents', {}, context('list'))
      const out = pack.serialize()
      expect(out).toEqual({
        data: [
          expect.objectContaining({type: 'parents', id: 'alice'}),
          expect.objectContaining({type: 'parents', id: 'bob'}),
          expect.objectContaining({type: 'parents', id: 'eve'}),
          expect.objectContaining({type: 'parents', id: 'frank'}),
        ],
        meta:     expect.any(Object),
        included: [],
      })

      expect(out.data[0]).toEqual({
        type:          'parents',
        id:            'alice',
        attributes:    {name: "Alice", age: 30},
        relationships: expect.objectContaining({}), // See below.
      })
    })
  
    it("should include relationships", async () => {
      const pack = await jsonAPI.list('parents', {}, context('list'))
      const out = pack.serialize()

      expect(out.data[0].relationships).toEqual({
        spouse:   {data: {type: 'parents', id: 'bob'}},
        children: {data: [{type: 'children', id: 'charlie'}, {type: 'children', id: 'dolores'}]},
      })
      expect(out.data[1].relationships).toEqual({
        spouse:   {data: {type: 'parents', id: 'alice'}},
        children: {data: [{type: 'children', id: 'charlie'}, {type: 'children', id: 'dolores'}]},
      })
      expect(out.data[2].relationships).toEqual({
        spouse:   {data: {type: 'parents', id: 'frank'}},
        children: {data: [{type: 'children', id: 'isaac'}, {type: 'children', id: 'henry'}]},
      })
      expect(out.data[3].relationships).toEqual({
        spouse:   {data: {type: 'parents', id: 'eve'}},
        children: {data: [{type: 'children', id: 'isaac'}, {type: 'children', id: 'henry'}]},
      })
    
    })

    it("should not include detail attributes", async () => {
      jsonAPI.registry.modify('parents', cfg => {
        cfg.attributes.age = {
          detail: true,
        }
      })

      const pack = await jsonAPI.list('parents', {}, context('list'))
      const out = pack.serialize()
      expect(out.data[0].attributes).toEqual({name: "Alice"})
    })

    it("should not include detail relationships", async () => {
      jsonAPI.registry.modify('parents', cfg => {
        cfg.relationships!.children = {
          type:   'children',
          plural: true,
          detail: true,
        }
      })

      const pack = await jsonAPI.list('parents', {}, context('list'))
      const out = pack.serialize()
      expect(out.data[0].relationships).toEqual({
        spouse:   expect.objectContaining({}),
        children: undefined,
      })
    })

    it("should handle conditional attributes", async () => {
      jsonAPI.registry.modify('parents', cfg => {
        cfg.attributes.age = {
          if: model => model.age > 30,
        }
      })

      const pack = await jsonAPI.list('parents', {}, context('list'))
      const out = pack.serialize()
      expect(out.data[0].attributes).toEqual({name: "Alice"})
      expect(out.data[1].attributes).toEqual({name: "Bob", age: 40})
    })
    
    it("should handle conditional relationships", async () => {
      jsonAPI.registry.modify('parents', cfg => {
        cfg.relationships!.children = {
          type:   'children',
          plural: true,
          if:     model => model.age > 30,
        }
      })

      const pack = await jsonAPI.list('parents', {}, context('list'))
      const out = pack.serialize()
      expect(out.data[0].relationships).toEqual({
        spouse: expect.objectContaining({}),
      })
      expect(out.data[1].relationships).toEqual({
        spouse:   expect.objectContaining({}),
        children: expect.objectContaining({}),
      })
    })

    it("should handle custom attributes", async () => {
      jsonAPI.registry.modify('parents', cfg => {
        cfg.attributes.foo = {
          get: model => model.name.toUpperCase(),
        }
      })

      const pack = await jsonAPI.list('parents', {}, context('list'))
      const out = pack.serialize()
      expect(out.data[0].attributes).toEqual({name: "Alice", foo: "ALICE", age: 30})    
      expect(out.data[1].attributes).toEqual({name: "Bob", foo: "BOB", age: 40})    
    })

    it("should handle custom relationships", async () => {
      jsonAPI.registry.modify('parents', cfg => {
        cfg.relationships!.parent = {
          type:   'parents',
          plural: false,
          get:    async (model) => ({type: 'parents', id: model.id + '-parent'}),
        }
      })

      const pack = await jsonAPI.list('parents', {}, context('list'))
      const out = pack.serialize()
      expect(out.data[0].relationships).toEqual({
        children: expect.objectContaining({}),
        parent:   expect.objectContaining({data: {type: 'parents', id: 'alice-parent'}}),
        spouse:   expect.objectContaining({}),
      })
    })

    it("should include pagination info in the meta", async () => {
      const pack = await jsonAPI.list('parents', {}, context('list'))
      const out = pack.serialize()
      expect(out.meta).toEqual({
        total:      4,
        count:      4,
        offset:     0,
        nextOffset: null,
        isFirst:    true,
        isLast:     true,
      })
    })

    it("should reflect proper pagination info if offset and limit are given", async () => {
      const pack = await jsonAPI.list('parents', {offset: 3, limit: 2}, context('list'))
      const out = pack.serialize()
      expect(out.meta).toEqual({
        total:      4,
        count:      1,
        offset:     3,
        nextOffset: null,
        isFirst:    false,
        isLast:     true,
      })
    })

    it("should include additional meta if configured", async () => {
      jsonAPI.registry.modify('parents', cfg => {
        cfg.meta = {
          foo: 'bar',
        }
      })

      const pack = await jsonAPI.list('parents', {}, context('list'))
      const out = pack.serialize()
      expect(out.meta).toEqual(expect.objectContaining({
        foo: 'bar',
      }))
    })

    it("should allow meta to be configured as a (sync or async) dynamic function", async () => {
      jsonAPI.registry.modify('parents', cfg => {
        cfg.meta = async (meta, _, context) => {
          await delay(10)
          return {
            ...omit(meta, 'isFirst', 'isLast', 'nextOffset'),
            action: context.action,
          }
        }
      })

      const pack = await jsonAPI.list('parents', {}, context('my-list-action'))
      const out = pack.serialize()
      expect(out.meta).toEqual({
        action: 'my-list-action',
        total:  4,
        count:  4,
        offset: 0,
      })
    })

    it("should include document meta in each document if configured", async () => {
      jsonAPI.registry.modify('parents', cfg => {
        cfg.documentMeta = async (meta, model, context) => {
          await delay(10)
          return {
            action: context.action,
            slug:   slugify(model.name),
          }
        }
      })

      const pack = await jsonAPI.list('parents', {}, context('my-list-action'))
      const out = pack.serialize()
      expect(out.data.map((it: any) => it.meta)).toEqual([
        {action: 'my-list-action', slug: 'alice'},
        {action: 'my-list-action', slug: 'bob'},
        {action: 'my-list-action', slug: 'eve'},
        {action: 'my-list-action', slug: 'frank'},
      ])

    })

  })

  describe("filtering", () => {

    let out: any

    beforeEach(async () => {
      const pack = await jsonAPI.list('parents', {
        filters: {
          age: (age: number) => age >= 40 && age < 60, // Our mock DB allows filter functions.
        },
      }, context('list'))
      out = pack.serialize()
    })

    it("should apply specified filters", async () => {
      expect(out).toEqual({
        data: [
          expect.objectContaining({type: 'parents', id: 'bob'}),
          expect.objectContaining({type: 'parents', id: 'eve'}),
        ],
        meta:     expect.any(Object),
        included: [],
      })
    })

    it("should reflect changes in pagination meta appropriately", async () => {
      expect(out.meta).toEqual({
        count:      2,
        isFirst:    true,
        isLast:     true,
        nextOffset: null,
        offset:     0,
        total:      2,
      })
    })

  })

  describe("labels", () => {

    beforeEach(() => {
      jsonAPI.registry.modify('parents', cfg => {
        cfg.search = (query, term) => {
          return {
            ...query,
            filters: {
              ...query.filters,
              name: (name: string) => name.includes(term),
            },
          }
        }
        cfg.labels = {
          old: query => ({
            ...query,
            filters: {
              ...query.filters,
              age: (age: number) => age >= 50,
            },
          }),
        }
      })
    })

    it("should allow pre-defined filters through labels", async () => {
      const pack = await jsonAPI.list('parents', {label: 'old'}, context('list'))
      expect(pack.serialize().data.map((it: any) => it.id)).toEqual(['eve', 'frank'])
    })

    it("can be combined with filters or search", async () => {
      const pack1 = await jsonAPI.list('parents', {label: 'old', search: 'e'}, context('list'))
      expect(pack1.serialize().data.map((it: any) => it.id)).toEqual(['eve'])

      const pack2 = await jsonAPI.list('parents', {label: 'old', filters: {name: "Frank"}}, context('list'))
      expect(pack2.serialize().data.map((it: any) => it.id)).toEqual(['frank'])
    })

    it("should update pagination accordingly", async () => {
      const pack = await jsonAPI.list('parents', {label: 'old'}, context('list'))
      expect(pack.serialize().meta).toEqual({
        count:      2,
        isFirst:    true,
        isLast:     true,
        nextOffset: null,
        offset:     0,
        total:      2,
      })
    })
  
  })

  describe("searching", () => {

    beforeEach(() => {
      jsonAPI.registry.modify('parents', cfg => {
        cfg.search = (query, term) => {
          return {
            ...query,
            filters: {
              ...query.filters,
              name: (name: string) => name.includes(term),
            },
          }
        }
      })
    })

    it("should only return matching documents", async () => {
      const pack = await jsonAPI.list('parents', {
        search: "e",
      }, context('list'))

      expect(pack.serialize()).toEqual({
        data: [
          expect.objectContaining({type: 'parents', id: 'alice'}),
          expect.objectContaining({type: 'parents', id: 'eve'}),
        ],
        meta:     expect.any(Object),
        included: [],
      })
    })

    it("should reflect changes in pagination meta appropriately", async () => {
      const pack = await jsonAPI.list('parents', {
        search: "e",
      }, context('list'))

      expect(pack.serialize().meta).toEqual({
        count:      2,
        isFirst:    true,
        isLast:     true,
        nextOffset: null,
        offset:     0,
        total:      2,
      })
    })

  })

  describe("sorting", () => {

    it("should allow sorting", async () => {
      const pack = await jsonAPI.list('parents', {
        sorts: [{field: 'name', direction: -1}],
      }, context('list'))
      const out = pack.serialize()

      expect(out.data.map((it: any) => it.id)).toEqual([
        'frank',
        'eve',
        'bob',
        'alice',
      ])
    })

    it("should allow sorting on multiple fields", async () => {
      db('parents').get('bob')!.name = "Alice"
      db('parents').get('frank')!.name = "Eve"

      const pack = await jsonAPI.list('parents', {
        sorts: [
          {field: 'name', direction: -1},
          {field: 'age', direction: 1},
        ],
      }, context('list'))
      const out = pack.serialize()

      expect(out.data.map((it: any) => it.id)).toEqual([
        'eve',
        'frank',
        'alice',
        'bob',
      ])
    })

  })
    
})