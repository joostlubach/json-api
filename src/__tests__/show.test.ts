import { delay, expectAsyncError } from 'yest'
import { slugify } from 'ytil'

import APIError from '../APIError'
import db from './db'
import { context, mockJSONAPI } from './mock'

describe("show", () => {

  const jsonAPI = mockJSONAPI()

  beforeEach(() => {
    db.seed()
  })

  it.each([
    {id: 'alice', name: "Alice", age: 30},
    {id: 'bob', name: "Bob", age: 40},
  ])("should show a document of a specific resource type", async ({id, name, age}) => {
    const pack = await jsonAPI.show('parents', {id}, context('show'))
    const out = pack.serialize()
    expect(out).toEqual({
      data:     expect.objectContaining({type: 'parents', id}),
      meta:     expect.any(Object),
      included: [],
    })

    expect(out.data).toEqual({
      type:          'parents',
      id:            id,
      attributes:    {name, age},
      relationships: expect.any(Object), // See below.
    })
  })

  it("should include relationships", async () => {
    const pack = await jsonAPI.show('parents', {id: 'alice'}, context('show'))
    const out = pack.serialize()

    expect(out.data.relationships).toEqual({
      spouse:   {data: {type: 'parents', id: 'bob'}},
      children: {data: [{type: 'children', id: 'charlie'}, {type: 'children', id: 'dolores'}]},
    })
  })

  it("should include detail attributes", async () => {
    jsonAPI.registry.modify('parents', cfg => {
      cfg.attributes.age = {
        detail: true,
      }
    })

    const pack = await jsonAPI.show('parents', {id: 'alice'}, context('show'))
    const out = pack.serialize()
    expect(out.data.attributes).toEqual({name: "Alice", age: 30})
  })

  it("should include detail relationships", async () => {
    jsonAPI.registry.modify('parents', cfg => {
      cfg.relationships!.children = {
        type:   'children',
        plural: true,
        detail: true,
      }
    })

    const pack = await jsonAPI.show('parents', {id: 'alice'}, context('show'))
    const out = pack.serialize()
    expect(out.data.relationships).toEqual({
      spouse:   expect.any(Object),
      children: expect.any(Object),
    })
  })

  it("should handle conditional attributes", async () => {
    jsonAPI.registry.modify('parents', cfg => {
      cfg.attributes.age = {
        if: entity => entity.age > 30,
      }
    })

    const pack1 = await jsonAPI.show('parents', {id: 'alice'}, context('show'))
    const out1 = pack1.serialize()
    expect(out1.data.attributes).toEqual({name: "Alice"})

    const pack2 = await jsonAPI.show('parents', {id: 'bob'}, context('show'))
    const out2 = pack2.serialize()
    expect(out2.data.attributes).toEqual({name: "Bob", age: 40})
  })
  
  it("should handle conditional relationships", async () => {
    jsonAPI.registry.modify('parents', cfg => {
      cfg.relationships!.children = {
        type:   'children',
        plural: true,
        if:     entity => entity.age > 30,
      }
    })

    const pack1 = await jsonAPI.show('parents', {id: 'alice'}, context('show'))
    const out1 = pack1.serialize()
    expect(out1.data.relationships).toEqual({
      spouse: expect.any(Object),
    })

    const pack2 = await jsonAPI.show('parents', {id: 'bob'}, context('show'))
    const out2 = pack2.serialize()
    expect(out2.data.relationships).toEqual({
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

    const pack = await jsonAPI.show('parents', {id: 'bob'}, context('show'))
    const out = pack.serialize()
    expect(out.data.attributes).toEqual({name: "Bob", foo: "BOB", age: 40})    
  })

  it("should handle custom relationships", async () => {
    jsonAPI.registry.modify('parents', cfg => {
      cfg.relationships!.parent = {
        type:   'parents',
        plural: false,
        get:    async (entity) => ({type: 'parents', id: entity.id + '-parent'}),
      }
    })

    const pack = await jsonAPI.show('parents', {id: 'bob'}, context('show'))
    const out = pack.serialize()
    expect(out.data.relationships).toEqual({
      children: expect.any(Object),
      parent:   expect.objectContaining({data: {type: 'parents', id: 'bob-parent'}}),
      spouse:   expect.any(Object),
    })
  })

  it("should include additional meta if configured", async () => {
    jsonAPI.registry.modify('parents', cfg => {
      cfg.meta = {
        foo: 'bar',
      }
    })

    const pack = await jsonAPI.show('parents', {id: 'bob'}, context('show'))
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
          action: context.action,
        }
      }
    })

    const pack = await jsonAPI.show('parents', {id: 'bob'}, context('my-show-action'))
    const out = pack.serialize()
    expect(out.meta).toEqual({
      action: 'my-show-action',
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

    const pack = await jsonAPI.show('parents', {id: 'bob'}, context('my-show-action'))
    const out = pack.serialize()
    expect(out.data.meta).toEqual(
      {action: 'my-show-action', slug: 'bob'},
    )
  })

  it("should raise 404 if the document was not found", async () => {
    await expectAsyncError(() => (
      jsonAPI.show('parents', {id: 'unknown'}, context('show'))
    ), APIError, error => {
      expect(error.status).toEqual(404)
    })
  })

  describe("singletons", () => {

    it("should retrieving a singleton", async () => {
      jsonAPI.registry.modify('children', cfg => {
        cfg.singletons = {
          firstborn: async query => {
            const children = db('children').list(query)
            children.sort((a, b) => b.age - a.age)
            return {data: children[0]}
          },
        }
      })

      const pack = await jsonAPI.show('children', {singleton: 'firstborn'}, context('show'))
      expect(pack.serialize().data).toEqual({
        type:          'children',
        id:            'henry',
        attributes:    expect.any(Object),
        relationships: expect.any(Object),
      })
    })

    it("should raise 404 if the singleton was not configured", async () => {
      await expectAsyncError(() => (
        jsonAPI.show('children', {singleton: 'firstborn'}, context('show'))
      ), APIError, error => {
        expect(error.status).toEqual(404)
      })
    })

    it("should raise 404 if the adapter returned `null`", async () => {
      jsonAPI.registry.modify('children', cfg => {
        cfg.singletons = {
          firstborn: () => Promise.resolve(({data: null})),
        }
      })

      await expectAsyncError(() => (
        jsonAPI.show('children', {singleton: 'firstborn'}, context('show'))
      ), APIError, error => {
        expect(error.status).toEqual(404)
      })
    })
  
  })
  

})
