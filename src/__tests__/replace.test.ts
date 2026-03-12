import Pack from '../Pack'
import db from './db'
import { context, mockJSONAPI } from './mock'

describe("replace", () => {

  const jsonAPI = mockJSONAPI()

  beforeEach(() => {
    db.seed()
  })

  it("should allow replacing a document", async () => {
    const requestPack = jsonAPI.documentRequestPack('parents', 'alice', {
      name: "Alice",
      age:  40,
    })

    const pack = await jsonAPI.replace('parents', 'alice', requestPack, context('replace'))
    expect(pack.serialize()).toEqual({
      data: {
        type: 'parents',
        id:   'alice',

        attributes: {
          name: "Alice",
          age:  40,
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
      age:  40,
    }))
  })

  it("should not update, but replace fully", async () => {
    const requestPack = jsonAPI.documentRequestPack('parents', 'alice', {name: "Alice"})
    await jsonAPI.replace('parents', 'alice', requestPack, context('replace'))

    expect(db('parents').get('alice')).toEqual(expect.objectContaining({
      id:   'alice',
      name: "Alice",
    }))
    expect((db('parents').get('alice') as any).age).toBeUndefined()
  })

  it("should not allow replacing a document that does not exist", async () => {
    const requestPack = jsonAPI.documentRequestPack('parents', 'zachary', {})
    await expect(
      jsonAPI.replace('parents', 'zachary', requestPack, context('replace'))
    ).rejects.toMatchObject({ status: 404 })
  })

  it("should not accept a mismatch between pack type and document", async () => {
    const requestPack = jsonAPI.documentRequestPack('children', 'alice', {})
    await expect(
      jsonAPI.replace('parents', 'alice', requestPack, context('replace'))
    ).rejects.toMatchObject({ status: 409 })
  })

  it("should not accept a mismatch between locator and document", async () => {
    const requestPack = jsonAPI.documentRequestPack('parents', 'alice', {})
    await expect(
      jsonAPI.update('parents', 'bob', requestPack, context('update'))
    ).rejects.toMatchObject({ status: 409 })
  })

  it("should not accept an array for data", async () => {
    await expect(
      jsonAPI.replace('parents', 'alice', Pack.deserialize(jsonAPI.registry, {
        data: [],
      }), context('replace'))
    ).rejects.toMatchObject({ status: 400 })
  })

  it("should not allow specifying an unconfigured attribute", async () => {
    const requestPack = jsonAPI.documentRequestPack('parents', 'alice', {
      name:    "Alice",
      hobbies: ["soccer", "piano"],
    })

    await expect(
      jsonAPI.replace('parents', 'alice', requestPack, context('replace'))
    ).rejects.toMatchObject({ status: 403 })

    expect((db('parents').get('alice') as any).hobbies).toBeUndefined()
  })

  it("should not allow specifying an unavailable attribute", async () => {
    jsonAPI.registry.modify('parents', cfg => {
      cfg.attributes.age = {if: () => false}
    })

    const requestPack = jsonAPI.documentRequestPack('parents', 'alice', {
      name: "Alice",
      age:  40,
    })

    await expect(
      jsonAPI.replace('parents', 'alice', requestPack, context('replace'))
    ).rejects.toMatchObject({ status: 403 })

    expect((db('parents').get('alice') as any).age).toEqual(30)
  })

  it("should not allow specifying a read-only attribute", async () => {
    jsonAPI.registry.modify('parents', cfg => {
      cfg.attributes.age = {writable: false}
    })

    const requestPack = jsonAPI.documentRequestPack('parents', 'alice', {
      name: "Alice",
      age:  40,
    })

    await expect(
      jsonAPI.replace('parents', 'alice', requestPack, context('replace'))
    ).rejects.toMatchObject({ status: 403 })

    expect((db('parents').get('alice') as any).age).toEqual(30)
  })

  it("should not allow specifying a writable-on-create attribute", async () => {
    jsonAPI.registry.modify('parents', cfg => {
      cfg.attributes.age = {writable: 'create'}
    })

    const requestPack = jsonAPI.documentRequestPack('parents', 'alice', {
      name: "Alice",
      age:  40,
    })

    await expect(
      jsonAPI.replace('parents', 'alice', requestPack, context('replace'))
    ).rejects.toMatchObject({ status: 403 })

    expect((db('parents').get('alice') as any).age).toEqual(30)
  })

})
