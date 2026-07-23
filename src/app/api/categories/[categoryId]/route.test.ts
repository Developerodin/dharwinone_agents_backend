// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { PATCH } from "./route";
import * as categoriesRepo from "@/server/repos/categoriesRepo";
import * as usersRepo from "@/server/repos/usersRepo";

vi.mock("@/server/repos/categoriesRepo", () => ({ update: vi.fn() }));
vi.mock("@/server/repos/usersRepo", () => ({ getRole: vi.fn() }));

const params = Promise.resolve({ categoryId: "local_service" });

function patch(headers: Record<string, string>, body: unknown): Request {
  return new Request("http://t/api/categories/local_service", {
    method: "PATCH",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/categories/[categoryId]", () => {
  beforeEach(() => {
    vi.mocked(categoriesRepo.update).mockReset();
    vi.mocked(usersRepo.getRole).mockReset();
  });

  it("401 without a user", async () => {
    const res = await PATCH(patch({}, { name: "X" }), { params });
    expect(res.status).toBe(401);
    expect(categoriesRepo.update).not.toHaveBeenCalled();
  });

  it("403 for a non-admin", async () => {
    vi.mocked(usersRepo.getRole).mockResolvedValue("user");
    const res = await PATCH(patch({ "x-user-id": "u1" }, { name: "X" }), { params });
    expect(res.status).toBe(403);
    expect(categoriesRepo.update).not.toHaveBeenCalled();
  });

  it("422 on invalid body", async () => {
    vi.mocked(usersRepo.getRole).mockResolvedValue("admin");
    const res = await PATCH(patch({ "x-user-id": "a1" }, { name: 123 }), { params });
    expect(res.status).toBe(422);
  });

  it("404 when the category does not exist", async () => {
    vi.mocked(usersRepo.getRole).mockResolvedValue("admin");
    vi.mocked(categoriesRepo.update).mockResolvedValue(null);
    const res = await PATCH(patch({ "x-user-id": "a1" }, { name: "X" }), { params });
    expect(res.status).toBe(404);
  });

  it("200 and returns the updated row for an admin", async () => {
    vi.mocked(usersRepo.getRole).mockResolvedValue("admin");
    vi.mocked(categoriesRepo.update).mockResolvedValue({ categoryId: "local_service", name: "Local (edited)" });
    const res = await PATCH(patch({ "x-user-id": "a1" }, { name: "Local (edited)" }), { params });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ categoryId: "local_service", name: "Local (edited)" });
    expect(categoriesRepo.update).toHaveBeenCalledWith("local_service", { name: "Local (edited)" });
  });
});
