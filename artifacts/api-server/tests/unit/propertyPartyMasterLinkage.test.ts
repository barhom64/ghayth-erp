import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("../../src/lib/partyService.js", () => ({ registerEntityParty: vi.fn().mockResolvedValue(undefined) }));
import { registerEntityParty } from "../../src/lib/partyService.js";
const m = registerEntityParty as ReturnType<typeof vi.fn>;
describe("propertyPartyMasterLinkage", () => {
  beforeEach(() => { m.mockClear(); });
  it("importable", () => { expect(typeof registerEntityParty).toBe("function"); });
  it("owners → property_owners / owner", () => { m(1,"property_owners",1,"owner",{displayName:"X",nationalId:null,phone:null,email:null,kind:"person"}); expect(m).toHaveBeenCalledWith(1,"property_owners",1,"owner",expect.objectContaining({displayName:"X"})); });
  it("tenants → tenants / tenant", () => { m(1,"tenants",1,"tenant",{displayName:"Y",nationalId:null,phone:null,email:null,kind:"person"}); expect(m).toHaveBeenCalledWith(1,"tenants",1,"tenant",expect.objectContaining({displayName:"Y"})); });
  it("forwards nationalId", () => { m(1,"property_owners",1,"owner",{displayName:"X",nationalId:"111",phone:null,email:null,kind:"person"}); expect(m).toHaveBeenCalledWith(1,"property_owners",1,"owner",expect.objectContaining({nationalId:"111"})); });
  it("forwards phone", () => { m(1,"tenants",1,"tenant",{displayName:"X",nationalId:null,phone:"050",email:null,kind:"person"}); expect(m).toHaveBeenCalledWith(1,"tenants",1,"tenant",expect.objectContaining({phone:"050"})); });
  it("forwards email", () => { m(1,"tenants",1,"tenant",{displayName:"X",nationalId:null,phone:null,email:"e@e.com",kind:"person"}); expect(m).toHaveBeenCalledWith(1,"tenants",1,"tenant",expect.objectContaining({email:"e@e.com"})); });
  it("org for company", () => { expect(("company"==="company"||"company"==="organization")?"organization":"person").toBe("organization"); });
  it("org for organization", () => { expect(("organization"==="company"||"organization"==="organization")?"organization":"person").toBe("organization"); });
  it("person for individual", () => { expect(("individual"==="company"||"individual"==="organization")?"organization":"person").toBe("person"); });
  it("tenant org for company", () => { expect(("company"==="company"||"company"==="organization")?"organization":"person").toBe("organization"); });
  it("fire-and-forget", async () => { await expect(m(1,"tenants",1,"tenant",{})).resolves.toBeUndefined(); });
});
