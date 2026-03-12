import Pack from '../Pack'
import db from './db'
import { context, mockJSONAPI } from './mock'

describe("update", () => {

  const jsonAPI = mockJSONAPI()

  beforeEach(() => {
    db.seed()
  })

  it("should allow updating a document", async () => {
    const requestPack = jsonAPI.documentRequestPack('parents', 'alice', {age: 40})
    const pack = await jsonAPI.update('parents', 'alice', requestPack, context('update'))
    expect(pack.serialize()).toEqual({
      data: {
        type: 'parents',
        id:   'alice',

        attributes: {
          name: "Alice",
          age:  40,
        },
        relationships: {
          spouse:   expect.any(Object),
          children: expect.any(Object),
        },
      },
      included: [],
      meta:     {},
    })

    expect(db('parents').get('alice')).toEqual({
      id:       'alice',
      family:   'a',
      name:     "Alice",
      age:      40,
      spouse:   'bob',
      children: ['charlie', 'dolores'],
    })
  })

  it("should require an ID", async () => {
    const requestPack = jsonAPI.documentRequestPack('parents', null, {})
    await expect(
      jsonAPI.update('parents', 'alice', requestPack, context('update'))
    ).rejects.toMatchObject({ status: 400 })
  })

  it("should not accept a mismatch between pack type and document", async () => {
    const requestPack = jsonAPI.documentRequestPack('children', 'alice', {})
    await expect(
      jsonAPI.update('parents', 'alice', requestPack, context('update'))
    ).rejects.toMatchObject({ status: 409 })
  })

  it("should not accept a mismatch between locator and document", async () => {
    const requestPack = jsonAPI.documentRequestPack('parents', 'alice', {})
    await expect(
      jsonAPI.update('parents', 'bob', requestPack, context('update'))
    ).rejects.toMatchObject({ status: 409 })
  })

  it("should not allow replacing a document that does not exist", async () => {
    const requestPack = jsonAPI.documentRequestPack('parents', 'zachary', {})
    await expect(
      jsonAPI.update('parents', 'zachary', requestPack, context('update'))
    ).rejects.toMatchObject({ status: 404 })
  })

  it("should not accept an array for data", async () => {
    await expect(
      jsonAPI.update('parents', 'alice', Pack.deserialize(jsonAPI.registry, {
        data: [],
      }), context('update'))
    ).rejects.toMatchObject({ status: 400 })
  })

  it("should not allow specifying an unconfigured attribute", async () => {
    const requestPack = jsonAPI.documentRequestPack('parents', 'alice', {
      name:    "Alice",
      hobbies: ["soccer", "piano"],
    })

    await expect(
      jsonAPI.update('parents', 'alice', requestPack, context('update'))
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
      jsonAPI.update('parents', 'alice', requestPack, context('update'))
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
      jsonAPI.update('parents', 'alice', requestPack, context('update'))
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
      jsonAPI.update('parents', 'alice', requestPack, context('update'))
    ).rejects.toMatchObject({ status: 403 })

    expect((db('parents').get('alice') as any).age).toEqual(30)
  })

})
