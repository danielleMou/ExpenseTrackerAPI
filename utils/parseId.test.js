import { describe, test, expect } from "vitest";
import parseId from "./parseId.js";


test('rejects letters', () => {
    expect(parseId('a')).toBe(null);
});

test('rejects alphanumerics', () => {
    expect(parseId('a123b')).toBe(null);
    expect(parseId('123ab')).toBe(null);
    expect(parseId('abc123')).toBe(null);
});

test('rejects 0', () => {
    expect(parseId('0')).toBe(null);
});

test('accepts leading 0', () => {
    expect(parseId('002')).toBe(2);
});

test('accepts positive number', () => {
    expect(parseId('2')).toBe(2);
    expect(parseId('200')).toBe(200);
    expect(parseId('45')).toBe(45);
});

test('accepts non string number', () => {
    expect(parseId(2)).toBe(2);
    expect(parseId(200)).toBe(200);
    expect(parseId(45)).toBe(45);
});

test('rejects null', () => {
    expect(parseId(null)).toBe(null);
});

test('undefined', () => {
    expect(parseId(undefined)).toBe(null);
});

test('reject empty string', () => {
    expect(parseId('')).toBe(null);
});

test('reject negative numbers', () => {
    expect(parseId(-5)).toBe(null);
    expect(parseId('-5')).toBe(null);
});

test('reject deciaml numbers', () => {
    expect(parseId(2.5)).toBe(null);
    expect(parseId('2.5')).toBe(null);
    expect(parseId('2.0')).toBe(null);
});

test('rejects whitespace around numbers', () => {
    expect(parseId('  7')).toBe(null);
    expect(parseId('  07')).toBe(null);
});

test('reject number with a + sign', () => {
    expect(parseId('+7')).toBe(null);
});

test('rejects exponent notation', () => {
    expect(parseId('1e5')).toBe(null);
});