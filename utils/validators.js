// value: the value to be validated
// options: option object of the form {fieldName: "name", required: t/f, maxLength/maxDecimalPlaces: }

function validateString(value, options){
    if(options.required && value === undefined) return `${options.fieldName} is a required field.`;
    if(!options.required && value === undefined) return null;

    if(value === null && options.nullable === true) return null;
    if(value === null && options.nullable === false) return `${options.fieldName} must not be null`;
    if(value === null) return `${options.fieldName} must not be null`;

    if(typeof value !== "string" || value.trim() === "") return `${options.fieldName} must be a non-empty string.`;

    if(options.maxLength !== undefined){
        if(value.length > options.maxLength) return `${options.fieldName} must be less than or equal to ${options.maxLength} characters.`;
    }
    return null;
}

function validateDecimalString(value, options){
    if(options.required && value === undefined) return `${options.fieldName} is a required field.`;
    if(!options.required && value === undefined) return null;

    if(value === null && options.nullable === true) return null;
    if(value === null && options.nullable === false) return `${options.fieldName} must not be null`;
    if(value === null) return `${options.fieldName} must not be null`;

    const regex = new RegExp(`^\\d+(\\.\\d{1,${options.maxDecimalPlaces}})?$`);
    if(!regex.test(value)) return `${options.fieldName} must be a decimal to ${options.maxDecimalPlaces} d.p.`;

    return null;
}

function validatePositiveInteger(value, options){
    if(options.required && value === undefined) return `${options.fieldName} is a required field.`;
    if(!options.required && value === undefined) return null;

    if(value === null && options.nullable === true) return null;
    if(value === null && options.nullable === false) return `${options.fieldName} must not be null`;
    if(value === null) return `${options.fieldName} must not be null`;
    
    const regex = /^\d+$/;
    if(!regex.test(String(value)) || value == 0) return `${options.fieldName} must be a positive integer.`;

    return null;
}

function validateBoolean(value, options){
    if(options.required && value === undefined) return `${options.fieldName} is a required field.`;
    if(!options.required && value === undefined) return null;

    if(value === null && options.nullable === true) return null;
    if(value === null && options.nullable === false) return `${options.fieldName} must not be null`;
    if(value === null) return `${options.fieldName} must not be null`;

    if(typeof value !== "boolean"){
        return `${options.fieldName} must be a boolean.`
    }

    return null;
}

export { validateString, validateDecimalString, validatePositiveInteger, validateBoolean };