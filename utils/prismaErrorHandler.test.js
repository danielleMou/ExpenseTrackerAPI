import { describe, test, expect, vi } from "vitest";
import handlePrismaError from "./prismaErrorHandler.js";
import Prisma from "@prisma/client";

function makeRes(){
    const res = {};
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    return res;
}

function makeError(code) {
  return new Prisma.PrismaClientKnownRequestError('test error', {
    code,
    clientVersion: '6.0.0'
  });
}

describe("Handling prisma errors", () => {
    test('P2025 maps to 404', () => {
        const res = makeRes();
        const error = makeError('P2025');
        const handled = handlePrismaError(error, res);

        expect(handled).toBe(true);
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalled();
    });

    test('P2003 maps to 400', () => {
        const res = makeRes();
        const error = makeError('P2003');
        const handled = handlePrismaError(error, res);

        expect(handled).toBe(true);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalled();
    });

    test('P2002 maps to 400', () => {
        const res = makeRes();
        const error = makeError('P2002');
        const handled = handlePrismaError(error, res);

        expect(handled).toBe(true);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalled();
    });

    test('Not a prisma error', () => {
        const res = makeRes();
        const handled = handlePrismaError({}, res);

        expect(handled).toBe(false);
        expect(res.status).not.toHaveBeenCalled();
        expect(res.json).not.toHaveBeenCalled();
    });
});