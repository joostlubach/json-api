import { mockJSONAPI } from './mock'

import db from './db'

describe("singletons", () => {

  const jsonAPI = mockJSONAPI()

  beforeEach(() => {
    db.seed()
  })

  beforeEach(() => {
    jsonAPI.registry.modify('parents', cfg => {
      cfg.singletons = {
        mother: async () => db('parents').get('alice'),
      }
    })
  })

  describe("show", () => {

    it.todo("should allow showing a singleton")
    it.todo("should raise 404 if the singleton was not configured")
    it.todo("should raise 404 if the adapter returned `null`")

  })

  describe("replace", () => {

    it.todo("should allow replacing a singleton")
    it.todo("should raise 404 if the singleton was not configured")
    it.todo("should raise 404 if the adapter returned `null`")

  })

  describe("update", () => {

    it.todo("should allow updating a singleton")
    it.todo("should raise 404 if the singleton was not configured")
    it.todo("should raise 404 if the adapter returned `null`")

  })

})