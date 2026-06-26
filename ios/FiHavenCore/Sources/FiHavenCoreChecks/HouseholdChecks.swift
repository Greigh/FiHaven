import Foundation
import FiHavenCore

func runHouseholdChecks() async {
    let cfg = APIConfig.localhost

    await sectionAsync("Household — GET decodes info (no household, can create)") {
        MockURLProtocol.reset()
        let client = APIClient(config: cfg, tokens: InMemoryTokenStore("tk"), session: MockURLProtocol.session())
        MockURLProtocol.handler = { _ in (200, Data(#"{"household":null,"canCreate":true,"memberMax":3}"#.utf8)) }
        let info = try await client.getHousehold()
        check(info.household == nil, "no household")
        check(info.canCreate, "canCreate true")
        checkEqual(info.memberMax, 3, "memberMax 3")
        check(MockURLProtocol.lastRequest?.url?.absoluteString == "http://localhost:5222/api/household",
              "GET /api/household URL")
    }

    await sectionAsync("Household — create POSTs name, decodes view") {
        MockURLProtocol.reset()
        let client = APIClient(config: cfg, tokens: InMemoryTokenStore("tk"), session: MockURLProtocol.session())
        let viewJSON = #"{"household":{"household":{"id":1,"name":"Casa","ownerUserId":7,"createdAt":1},"role":"owner","memberCount":1,"memberMax":3,"members":[{"userId":7,"email":"o@e.com","name":null,"role":"owner","joinedAt":1}],"pendingInvites":[]}}"#
        MockURLProtocol.handler = { _ in (200, Data(viewJSON.utf8)) }
        let view = try await client.createHousehold(name: "Casa")
        checkEqual(view.household.name, "Casa", "decodes household name")
        checkEqual(view.role, "owner", "role owner")
        checkEqual(view.members.count, 1, "one member")
        checkEqual(MockURLProtocol.lastRequest?.httpMethod, "POST", "create uses POST")
        let body = (try? JSONSerialization.jsonObject(with: MockURLProtocol.lastBody ?? Data())) as? [String: Any]
        checkEqual(body?["name"] as? String, "Casa", "create body has name")
    }

    await sectionAsync("Household — shareEntity POSTs { kind, item }") {
        MockURLProtocol.reset()
        let client = APIClient(config: cfg, tokens: InMemoryTokenStore("tk"), session: MockURLProtocol.session())
        let entJSON = #"{"entity":{"id":"b1","kind":"bill","data":{"id":"b1","name":"Rent","amount":1500},"ownerUserId":7,"updatedBy":7,"updatedAt":9,"deleted":false}}"#
        MockURLProtocol.handler = { _ in (200, Data(entJSON.utf8)) }
        let item: JSONValue = .object(["id": .string("b1"), "name": .string("Rent"), "amount": .number(1500)])
        let ent = try await client.shareHouseholdEntity(kind: "bill", item: item)
        checkEqual(ent.kind, "bill", "entity kind")
        checkEqual(ent.id, "b1", "entity id")
        check(MockURLProtocol.lastRequest?.url?.absoluteString == "http://localhost:5222/api/household/entities",
              "POST /entities URL")
        let body = (try? JSONSerialization.jsonObject(with: MockURLProtocol.lastBody ?? Data())) as? [String: Any]
        checkEqual(body?["kind"] as? String, "bill", "share body has kind")
        check(body?["item"] != nil, "share body has item")
    }

    await sectionAsync("Household — shared data decodes entities incl. JSON payload") {
        MockURLProtocol.reset()
        let client = APIClient(config: cfg, tokens: InMemoryTokenStore("tk"), session: MockURLProtocol.session())
        let dataJSON = #"{"householdId":1,"version":5,"seq":2,"entities":[{"id":"b1","kind":"bill","data":{"name":"Rent","amount":1500},"ownerUserId":7,"updatedAt":5,"deleted":false}]}"#
        MockURLProtocol.handler = { _ in (200, Data(dataJSON.utf8)) }
        let shared = try await client.getHouseholdSharedData()
        checkEqual(shared.seq, 2, "seq decoded")
        checkEqual(shared.entities.count, 1, "one entity")
        if case .object(let o) = shared.entities[0].data, case .string(let nm)? = o["name"] {
            checkEqual(nm, "Rent", "entity payload name")
        } else {
            check(false, "entity data should be an object with name")
        }
    }
}
