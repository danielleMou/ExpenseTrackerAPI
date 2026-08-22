import { describe, test, expect } from "vitest";
import { validateBoolean, validateDecimalString, validatePositiveInteger, validateString } from "./validators";

// value: the value to be validated
// options: option object of the form {fieldName: "name", required: t/f, maxLength/maxDecimalPlaces: }


describe('Validate boolean tests', () => {
    test('value required and value undefined', () => {
        expect(validateBoolean(undefined, {fieldName: 'bool', required: true})).toContain('required field');
    });

    test('value required and value defined', () => {
        expect(validateBoolean(true, {fieldName: 'bool', required: true})).toBe(null);
    });

    test('value null and value nullable', () => {
        expect(validateBoolean(null, {fieldName: 'bool', required: true, nullable: true})).toBe(null);
    });

    test('value null and value not nullable', () => {
        expect(validateBoolean(null, {fieldName: 'bool', required: true, nullable: false})).toContain('not be null');
    });

    test('value null with nullable option not present', () => {
        expect(validateBoolean(null, {fieldName: 'bool', required: true})).toContain('not be null');
    });

    test('value not a boolean', () => {
        expect(validateBoolean(123, {fieldName: 'bool', required: true})).toContain('be a boolean');
    });

    test('value true', () => {
        expect(validateBoolean(true, {fieldName: 'bool', required: true})).toBe(null);
    });

    test('value false', () => {
        expect(validateBoolean(false, {fieldName: 'bool', required: true})).toBe(null);
    });

    test('value true as a string', () => {
        expect(validateBoolean('true', {fieldName: 'bool', required: true})).toContain('be a boolean');
    });

    test('required option not present', () => {
        expect(validateBoolean(true, {fieldName: 'bool'})).toBe(null);
    });

    test('fieldname option not present', () => {
        expect(validateBoolean(true, {required: true})).toBe(null);
    });
});

describe('Validate string tests', () => {
    test('value required and value undefined', () => {
        expect(validateString(undefined, {fieldName: 'string', required: true})).toContain('required field');
    });

    test('value not required and value undefined', () => {
        expect(validateString(undefined, {fieldName: 'string', required: false})).toBeNull();
    });

    test('value required and value defined', () => {
        expect(validateString("string", {fieldName: 'string', required: true})).toBeNull();
    });

    test('value null and value nullable', () => {
        expect(validateString(null, {fieldName: 'string', required: true, nullable: true})).toBeNull();
    });

    test('value null and value not nullable', () => {
        expect(validateString(null, {fieldName: 'bool', required: true, nullable: false})).toContain('not be null');
    });

    test('value null and nullable option not present', () => {
        expect(validateString(null, {fieldName: 'bool', required: true})).toContain('not be null');
    });

    test('value not a string', () => {
        expect(validateString(123, {fieldName: 'bool', required: true})).toContain('be a non-empty string');
    });

    test('value empty string', () => {
        expect(validateString("", {fieldName: 'bool', required: true})).toContain('be a non-empty string');
    });

    test('value a sting longer than max length option', () => {
        expect(validateString("This is a string longer than 10 characters", {fieldName: 'bool', required: true, maxLength: 10})).toContain('be less than');
    });

    test('value a sting shorter than max length option', () => {
        expect(validateString("string", {fieldName: 'bool', required: true, maxLength: 10})).toBeNull();
    });

    test('value only whitespace', () => {
        expect(validateString("       ", {fieldName: 'bool', required: true})).toContain('be a non-empty string');
    });

});

describe('Validate decimal string tests', () => {
    test('value required and value undefined', () => {
        expect(validateDecimalString(undefined, {fieldName: 'price', required: true, maxDecimalPlaces: 2})).toContain('required field');
    });

    test('value not required and value undefined', () => {
        expect(validateDecimalString(undefined, {fieldName: 'price', required: false, maxDecimalPlaces: 2})).toBeNull();
    });

    test('value null and value nullable', () => {
        expect(validateDecimalString(null, {fieldName: 'price', required: true, nullable: true, maxDecimalPlaces: 2})).toBeNull();
    });

    test('value null and value not nullable', () => {
        expect(validateDecimalString(null, {fieldName: 'price', required: true, nullable: false, maxDecimalPlaces: 2})).toContain('not be null');
    });

    test('value null and nullable option not present', () => {
        expect(validateDecimalString(null, {fieldName: 'price', required: true, maxDecimalPlaces: 2})).toContain('not be null');
    });

    test('accepts whole number string', () => {
        expect(validateDecimalString("5", {fieldName: 'price', required: true, maxDecimalPlaces: 2})).toBeNull();
    });

    test('accepts one decimal place', () => {
        expect(validateDecimalString("5.5", {fieldName: 'price', required: true, maxDecimalPlaces: 2})).toBeNull();
    });

    test('accepts exactly max decimal places', () => {
        expect(validateDecimalString("5.50", {fieldName: 'price', required: true, maxDecimalPlaces: 2})).toBeNull();
    });

    test('rejects more than max decimal places', () => {
        expect(validateDecimalString("5.505", {fieldName: 'price', required: true, maxDecimalPlaces: 2})).toContain('must be a decimal');
    });

    test('rejects negative values', () => {
        expect(validateDecimalString("-5.50", {fieldName: 'price', required: true, maxDecimalPlaces: 2})).toContain('must be a decimal');
    });

    test('rejects empty string', () => {
        expect(validateDecimalString("", {fieldName: 'price', required: true, maxDecimalPlaces: 2})).toContain('must be a decimal');
    });

    test('rejects trailing decimal point', () => {
        expect(validateDecimalString("5.", {fieldName: 'price', required: true, maxDecimalPlaces: 2})).toContain('must be a decimal');
    });

    test('rejects leading decimal point', () => {
        expect(validateDecimalString(".5", {fieldName: 'price', required: true, maxDecimalPlaces: 2})).toContain('must be a decimal');
    });

    test('rejects whitespace padding', () => {
        expect(validateDecimalString(" 5.50", {fieldName: 'price', required: true, maxDecimalPlaces: 2})).toContain('must be a decimal');
        expect(validateDecimalString("5.50 ", {fieldName: 'price', required: true, maxDecimalPlaces: 2})).toContain('must be a decimal');
    });

    test('rejects exponent notation', () => {
        expect(validateDecimalString("1e5", {fieldName: 'price', required: true, maxDecimalPlaces: 2})).toContain('must be a decimal');
    });

    test('rejects non-numeric string', () => {
        expect(validateDecimalString("abc", {fieldName: 'price', required: true, maxDecimalPlaces: 2})).toContain('must be a decimal');
    });

    test('rejects booleans', () => {
        expect(validateDecimalString(true, {fieldName: 'price', required: true, maxDecimalPlaces: 2})).toContain('must be a decimal');
    });

    test('accepts leading zeros', () => {
        expect(validateDecimalString("007.50", {fieldName: 'price', required: true, maxDecimalPlaces: 2})).toBeNull();
    });

    // omitting maxDecimalPlaces silently breaks the regex
    test('rejects all decimals when maxDecimalPlaces is omitted', () => {
        expect(validateDecimalString("5.50", {fieldName: 'price', required: true})).toContain('must be a decimal');
        expect(validateDecimalString("5", {fieldName: 'price', required: true})).toBeNull();
    });
});

describe('Validate positive integer tests', () => {
    test('value required and value undefined', () => {
        expect(validatePositiveInteger(undefined, {fieldName: 'qty', required: true})).toContain('required field');
    });

    test('value not required and value undefined', () => {
        expect(validatePositiveInteger(undefined, {fieldName: 'qty', required: false})).toBeNull();
    });

    test('value null and value nullable', () => {
        expect(validatePositiveInteger(null, {fieldName: 'qty', required: true, nullable: true})).toBeNull();
    });

    test('value null and value not nullable', () => {
        expect(validatePositiveInteger(null, {fieldName: 'qty', required: true, nullable: false})).toContain('not be null');
    });

    test('value null and nullable option not present', () => {
        expect(validatePositiveInteger(null, {fieldName: 'qty', required: true})).toContain('not be null');
    });

    test('accepts positive integer as a number', () => {
        expect(validatePositiveInteger(5, {fieldName: 'qty', required: true})).toBeNull();
    });

    test('accepts positive integer as a string', () => {
        expect(validatePositiveInteger("5", {fieldName: 'qty', required: true})).toBeNull();
    });

    test('rejects zero as a number', () => {
        expect(validatePositiveInteger(0, {fieldName: 'qty', required: true})).toContain('positive integer');
    });

    test('rejects negative values', () => {
        expect(validatePositiveInteger(-5, {fieldName: 'qty', required: true})).toContain('positive integer');
        expect(validatePositiveInteger("-5", {fieldName: 'qty', required: true})).toContain('positive integer');
    });

    test('rejects decimals', () => {
        expect(validatePositiveInteger(2.5, {fieldName: 'qty', required: true})).toContain('positive integer');
        expect(validatePositiveInteger("2.5", {fieldName: 'qty', required: true})).toContain('positive integer');
    });

    test('rejects empty string', () => {
        expect(validatePositiveInteger("", {fieldName: 'qty', required: true})).toContain('positive integer');
    });

    test('rejects whitespace padding', () => {
        expect(validatePositiveInteger(" 5", {fieldName: 'qty', required: true})).toContain('positive integer');
    });

    test('rejects non-numeric strings', () => {
        expect(validatePositiveInteger("abc", {fieldName: 'qty', required: true})).toContain('positive integer');
        expect(validatePositiveInteger("5abc", {fieldName: 'qty', required: true})).toContain('positive integer');
    });

    test('rejects booleans', () => {
        expect(validatePositiveInteger(true, {fieldName: 'qty', required: true})).toContain('positive integer');
    });

    test('rejects exponent notation', () => {
        expect(validatePositiveInteger("1e5", {fieldName: 'qty', required: true})).toContain('positive integer');
    });

    test('accepts leading zeros', () => {
        expect(validatePositiveInteger("007", {fieldName: 'qty', required: true})).toBeNull();
    });

    test('rejects zero as a string', () => {
        expect(validatePositiveInteger("0", {fieldName: 'qty', required: true})).toContain('positive integer');
    });
});