import { MockJSONAPI } from './mock'

import { delay } from 'yest'
import { slugify } from 'ytil'

import RequestContext from '../RequestContext'
import db from './db'

describe("show", () => {

  let jsonAPI: MockJSONAPI

  beforeEach(() => {
    db.seed()

    // Rather than creating mock functions, we, we've created a mock DB with a mock adapter that actually
    // sort of works. This exemplifies JSON API better.
    jsonAPI = new MockJSONAPI()
  })

  function context(action: string) {
    return new RequestContext(action, {})
  }

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
      relationships: expect.objectContaining({}), // See below.
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
      spouse:   expect.objectContaining({}),
      children: expect.objectContaining({}),
    })
  })

  it("should handle conditional attributes", async () => {
    jsonAPI.registry.modify('parents', cfg => {
      cfg.attributes.age = {
        if: model => model.age > 30,
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
        if:     model => model.age > 30,
      }
    })

    const pack1 = await jsonAPI.show('parents', {id: 'alice'}, context('show'))
    const out1 = pack1.serialize()
    expect(out1.data.relationships).toEqual({
      spouse: expect.objectContaining({}),
    })

    const pack2 = await jsonAPI.show('parents', {id: 'bob'}, context('show'))
    const out2 = pack2.serialize()
    expect(out2.data.relationships).toEqual({
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

    const pack = await jsonAPI.show('parents', {id: 'bob'}, context('show'))
    const out = pack.serialize()
    expect(out.data.attributes).toEqual({name: "Bob", foo: "BOB", age: 40})    
  })

  it("should handle custom relationships", async () => {
    jsonAPI.registry.modify('parents', cfg => {
      cfg.relationships!.parent = {
        type:   'parents',
        plural: false,
        get:    async (model) => ({type: 'parents', id: model.id + '-parent'}),
      }
    })

    const pack = await jsonAPI.show('parents', {id: 'bob'}, context('show'))
    const out = pack.serialize()
    expect(out.data.relationships).toEqual({
      children: expect.objectContaining({}),
      parent:   expect.objectContaining({data: {type: 'parents', id: 'bob-parent'}}),
      spouse:   expect.objectContaining({}),
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
      cfg.documentMeta = async (meta, model, context) => {
        await delay(10)
        return {
          action: context.action,
          slug:   slugify(model.name),
        }
      }
    })

    const pack = await jsonAPI.show('parents', {id: 'bob'}, context('my-show-action'))
    const out = pack.serialize()
    expect(out.data.meta).toEqual(
      {action: 'my-show-action', slug: 'bob'},
    )

  })

})