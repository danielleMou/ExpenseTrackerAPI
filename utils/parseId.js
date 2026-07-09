function parseId(id){
    if (id == null) return null;

    const intRegex = /^\d+$/;
    if(!intRegex.test(id) || Number(id) === 0) return null;
    
    return parseInt(id);
}

export default parseId;