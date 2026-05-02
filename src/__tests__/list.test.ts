import { delay, slugify } from 'ytil'
import db from './db'
import { context, mockJSONAPI } from './mock'

describe("list", () => {

  const jsonAPI = mockJSONAPI()

  beforeEach(() => {
    db.seed()
  })

  describe("without parameters", () => {

    it("should list documents of a specific resource type", async () => {
      const pack = await jsonAPI.list('parents', context('list'))
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
        attributes:    {family: 'a', name: "Alice", age: 30},
        relationships: expect.any(Object),
      })
    })
  
    it("should include relationships", async () => {
      const pack = await jsonAPI.list('parents', context('list'))
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

    it("should use query defaults", async () => {
      jsonAPI.registry.modify('parents', cfg => {
        cfg.query = query => ({
          ...query,
          filters: {
            ...query.filters,
            age: (age: number) => age >= 50,
          },
        })
      })

      const pack = await jsonAPI.list('parents', context('list'))
      expect(pack.serialize().data.map((it: any) => it.id)).toEqual(['eve', 'frank'])
    })

    it("should not include detail attributes", async () => {
      jsonAPI.registry.modify('parents', cfg => {
        cfg.attributes.age = {
          detail: true,
        }
      })

      const pack = await jsonAPI.list('parents', context('list'))
      const out = pack.serialize()
      expect(out.data[0].attributes).toEqual({family: 'a', name: "Alice"})
    })

    it("should not include detail relationships", async () => {
      jsonAPI.registry.modify('parents', cfg => {
        cfg.relationships!.children = {
          type:   'children',
          plural: true,
          detail: true,
        }
      })

      const pack = await jsonAPI.list('parents', context('list'))
      const out = pack.serialize()
      expect(out.data[0].relationships).toEqual({
        spouse:   expect.any(Object),
        children: undefined,
      })
    })

    it("should handle conditional attributes", async () => {
      jsonAPI.registry.modify('parents', cfg => {
        cfg.attributes.age = {
          if: entity => entity.age > 30,
        }
      })

      const pack = await jsonAPI.list('parents', context('list'))
      const out = pack.serialize()
      expect(out.data[0].attributes).toEqual({family: 'a', name: "Alice"})
      expect(out.data[1].attributes).toEqual({family: 'a', name: "Bob", age: 40})
    })
    
    it("should handle conditional relationships", async () => {
      jsonAPI.registry.modify('parents', cfg => {
        cfg.relationships!.children = {
          type:   'children',
          plural: true,
          if:     entity => entity.age > 30,
        }
      })

      const pack = await jsonAPI.list('parents', context('list'))
      const out = pack.serialize()
      expect(out.data[0].relationships).toEqual({
        spouse: expect.any(Object),
      })
      expect(out.data[1].relationships).toEqual({
        spouse:   expect.any(Object),
        children: expect.any(Object),
      })
    })

    it("should handle custom attributes", async () => {
      jsonAPI.registry.modify('parents', cfg => {
        cfg.attributes.foo = {
          get: entity => entity.name.toUpperCase(),
        }
      })

      const pack = await jsonAPI.list('parents', context('list'))
      const out = pack.serialize()
      expect(out.data[0].attributes).toEqual({family: 'a', name: "Alice", foo: "ALICE", age: 30})    
      expect(out.data[1].attributes).toEqual({family: 'a', name: "Bob", foo: "BOB", age: 40})    
    })

    it("should handle custom relationships", async () => {
      jsonAPI.registry.modify('parents', cfg => {
        cfg.relationships!.parent = {
          type:   'parents',
          plural: false,
          get:    async (entity) => ({type: 'parents', id: entity.id + '-parent'}),
        }
      })

      const pack = await jsonAPI.list('parents', context('list'))
      const out = pack.serialize()
      expect(out.data[0].relationships).toEqual({
        children: expect.any(Object),
        parent:   expect.objectContaining({data: {type: 'parents', id: 'alice-parent'}}),
        spouse:   expect.any(Object),
      })
    })

    it("should include additional meta if configured", async () => {
      jsonAPI.registry.modify('parents', cfg => {
        cfg.meta = () => ({
          foo: 'bar',
        })
      })

      const pack = await jsonAPI.list('parents', context('list'))
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
            ...meta,
            action: context.action,
          }
        }
      })

      const pack = await jsonAPI.list('parents', context('my-list-action'))
      const out = pack.serialize()
      expect(out.meta).toEqual({
        action: 'my-list-action',
      })
    })

    it("should include document meta in each document if configured", async () => {
      jsonAPI.registry.modify('parents', cfg => {
        cfg.documentMeta = async (meta, entity, context) => {
          await delay(10)
          return {
            action: context.action,
            slug:   slugify(entity.name),
          }
        }
      })

      const pack = await jsonAPI.list('parents', context('my-list-action'))
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
      const ctx = context('list')
      ctx.setParams({
        filters: {
          age: (age: number) => age >= 40 && age < 60, // Our mock DB allows filter functions.
        },
      })
      const pack = await jsonAPI.list('parents', ctx)
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

  })

  describe("scopes", () => {

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

    it("should allow pre-defined filters through scopes", async () => {
      const ctx = context('list')
      ctx.setParams({scope: 'family-a'}) 

      const pack = await jsonAPI.list('parents', ctx)
      expect(pack.serialize().data.map((it: any) => it.id)).toEqual(['alice', 'bob'])
    })

    it("can be combined with filters or search", async () => {
      const ctx = context('list')
      ctx.setParams({scope: 'family-a', search: 'e'})
      const pack1 = await jsonAPI.list('parents', ctx)
      expect(pack1.serialize().data.map((it: any) => it.id)).toEqual(['alice'])

      const ctx2 = context('list')
      ctx2.setParams({scope: 'family-a', filters: {name: "Bob"}})
      const pack2 = await jsonAPI.list('parents', ctx2)
      expect(pack2.serialize().data.map((it: any) => it.id)).toEqual(['bob'])
    })

    describe("default scope", () => {

      beforeEach(() => {
        jsonAPI.registry.modify('parents', cfg => {
          cfg.scopes ??= {}
          cfg.scopes.$default = {
            query: query => ({
              ...query,
              filters: {
                ...query.filters,
                name: (name: string) => name.length === 3,
              },
            }),
          }
        })
      })

      it("should allow a default scope that is always applied", async () => {
        const pack1 = await jsonAPI.list('parents', context('list'))
        expect(pack1.serialize().data.map((it: any) => it.id)).toEqual(['bob', 'eve'])
      })

      it("should combine a named scope with a default scope", async () => {
        const ctx2 = context('list')
        ctx2.setParams({scope: 'family-a'})
        const pack2 = await jsonAPI.list('parents', ctx2)
        expect(pack2.serialize().data.map((it: any) => it.id)).toEqual(['bob'])
      })

      it("should allow skipping the default scope in a named scope", async () => {
        jsonAPI.registry.modify('parents', cfg => {
          (cfg.scopes!['family-a'] as any).skipDefault = true
        })

        const ctx2 = context('list')
        ctx2.setParams({scope: 'family-a'})
        const pack2 = await jsonAPI.list('parents', ctx2)
        expect(pack2.serialize().data.map((it: any) => it.id)).toEqual(['alice', 'bob'])
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
      const ctx = context('list')
      ctx.setParams({
        search: "e",
      })
      const pack = await jsonAPI.list('parents', ctx)

      expect(pack.serialize()).toEqual({
        data: [
          expect.objectContaining({type: 'parents', id: 'alice'}),
          expect.objectContaining({type: 'parents', id: 'eve'}),
        ],
        meta:     expect.any(Object),
        included: [],
      })
    })

  })

  describe("sorting", () => {

    it("should allow sorting", async () => {
      const ctx = context('list')
      ctx.setParams({sort: '-name'})

      const pack = await jsonAPI.list('parents', ctx)
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

      const ctx = context('list')
      ctx.setParams({sort: '-name,age'})
      const pack = await jsonAPI.list('parents', ctx)
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
