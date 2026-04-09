import Document from '../Document'
import Pack from '../Pack'
import db from './db'
import { context, mockJSONAPI } from './mock'

describe("create", () => {

  const jsonAPI = mockJSONAPI()

  beforeEach(() => {
    jsonAPI.registry.modify('parents', cfg => {
      cfg.attributes.age = {detail: true}
    })
  })

  it("should allow creating a document", async () => {
    const requestPack = jsonAPI.documentRequestPack('parents', null, {
      name: "Alice",
      age:  30,
    })

    const pack = await jsonAPI.create('parents', requestPack, context('create'))
    expect(pack.serialize()).toEqual({
      data: {
        type: 'parents',
        id:   'alice',

        attributes: {
          name: "Alice",
          age:  30,
        },
        relationships: {
          spouse:   {data: null},
          children: {data: []},
        },
      },
      included: [],
      meta:     {},
    })

    expect(db('parents').get('alice')).toEqual(expect.objectContaining({
      id:   'alice',
      name: "Alice",
      age:  30,
    }))
  })

  it("should not accept a mismatch between pack type and document", async () => {
    const requestPack = jsonAPI.documentRequestPack('children', null, {
      name: "Eve",
      age:  10,
    })

    await expect(jsonAPI.create('parents', requestPack, context('create'))).rejects.toMatchObject({ status: 409 })

    expect(db('parents').get('alice')).toBeNull()
    expect(db('children').get('alice')).toBeNull()
  })

  it("should not accept an array for data", async () => {
    await expect(jsonAPI.create('parents', Pack.deserialize(jsonAPI.registry, {
      data: [],
    }), context('create'))).rejects.toMatchObject({ status: 400 })
  })

  it("should not allow specifying an unconfigured attribute", async () => {
    const requestPack = jsonAPI.documentRequestPack('parents', null, {
      name:    "Alice",
      hobbies: ["soccer", "piano"],
    })

    await expect(jsonAPI.create('parents', requestPack, context('create'))).rejects.toMatchObject({ status: 403 })

    expect(db('parents').get('alice')).toBeNull()
  })

  it("should not allow specifying an unavailable attribute", async () => {
    jsonAPI.registry.modify('parents', cfg => {
      cfg.attributes.age = {if: () => false}
    })

    const requestPack = jsonAPI.documentRequestPack('parents', null, {
      name: "Alice",
      age:  40,
    })

    await expect(jsonAPI.create('parents', requestPack, context('create'))).rejects.toMatchObject({ status: 403 })

    expect(db('parents').get('alice')).toBeNull()
  })

  it("should not allow specifying a read-only attribute", async () => {
    jsonAPI.registry.modify('parents', cfg => {
      cfg.attributes.age = {writable: false}
    })

    const requestPack = jsonAPI.documentRequestPack('parents', null, {
      name: "Alice",
      age:  40,
    })

    await expect(jsonAPI.create('parents', requestPack, context('create'))).rejects.toMatchObject({ status: 403 })

    expect(db('parents').get('alice')).toBeNull()
  })

  it("should allow specifying a writable-on-create attribute", async () => {
    jsonAPI.registry.modify('parents', cfg => {
      cfg.attributes.age = {writable: 'create'}
    })

    const requestPack = jsonAPI.documentRequestPack('parents', null, {
      name: "Alice",
      age:  40,
    })

    await jsonAPI.create('parents', requestPack, context('create'))
    expect(db('parents').get('alice')).toEqual(expect.objectContaining({
      id:   'alice',
      name: "Alice",
      age:  40,
    }))
  })

  it("should allow specifying an explicit ID", async () => {
    jsonAPI.registry.modify('parents', cfg => {
      cfg.attributes.age = {writable: 'create'}
    })

    const requestPack = jsonAPI.documentRequestPack('parents', 'ALICE', {
      name: "Alice",
      age:  40,
    })

    await jsonAPI.create('parents', requestPack, context('create'))
    expect(db('parents').get('ALICE')).toEqual(expect.objectContaining({
      id:   "ALICE",
      name: "Alice",
      age:  40,
    }))
  })

  describe("scopes", () => {

    it("should not ensure the family if no scope was specified", async () => {
      const requestPack = jsonAPI.documentRequestPack('parents', null, {
        name: "Dolores",
        age:  30,
      })

      const ctx = context('list')
      const pack = await jsonAPI.create('parents', requestPack, ctx)
      expect((pack.data as Document<number>).attributes.family).toBeUndefined()
    })

    it("should ensure the family if a scope was specified", async () => {
      const requestPack = jsonAPI.documentRequestPack('parents', null, {
        name: "Dolores",
        age:  30,
      })

      const ctx = context('list')
      ctx.setParams({scope: 'family-b'})

      const pack = await jsonAPI.create('parents', requestPack, ctx)
      expect((pack.data as Document<number>).attributes.family).toEqual('b')
    })

    describe("default scope", () => {

      beforeEach(() => {
        jsonAPI.registry.modify('parents', cfg => {
          cfg.scopes ??= {}
          cfg.scopes.$default = {
            query: query => query,
            ensure: parent => {
              parent.age = Math.max(parent.age ?? 0, 60)
            }
          }
        })
      })

      it("should allow a default scope that is always applied", async () => {
        const requestPack = jsonAPI.documentRequestPack('parents', null, {
          name: "Dolores",
          age:  30,
        })

        const pack1 = await jsonAPI.create('parents', requestPack, context('list'))
        expect((pack1.data as Document<number>).attributes.age).toEqual(60)
      })

      it("should combine a named scope with a default scope", async () => {
        const requestPack = jsonAPI.documentRequestPack('parents', null, {
          name: "Dolores",
          age:  30,
        })

        const ctx = context('list')
        ctx.setParams({scope: 'family-a'})
        const pack2 = await jsonAPI.create('parents', requestPack, ctx)
        expect((pack2.data as Document<number>).attributes.family).toEqual('a')
        expect((pack2.data as Document<number>).attributes.age).toEqual(60)
      })

      it("should allow skipping the default scope in a named scope", async () => {
        jsonAPI.registry.modify('parents', cfg => {
          (cfg.scopes!['family-a'] as any).skipDefault = true
        })

        const requestPack = jsonAPI.documentRequestPack('parents', null, {
          name: "Dolores",
          age:  30,
        })

        const ctx2 = context('list')
        ctx2.setParams({scope: 'family-a'})
        const pack2 = await jsonAPI.create('parents', requestPack, ctx2)
        expect((pack2.data as Document<number>).attributes.family).toEqual('a')
        expect((pack2.data as Document<number>).attributes.age).toEqual(30)
      })
          
    })

  })

})
