var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// WebFetchInput-validator.cjs
var require_WebFetchInput_validator = __commonJS({
  "WebFetchInput-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      ;
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.url === void 0) {
          const err0 = { instancePath, schemaPath: "#/definitions/WebFetchInput/required", keyword: "required", params: { missingProperty: "url" }, message: "must have required property 'url'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "url" || key0 === "maxChars" || key0 === "offset")) {
            const err1 = { instancePath, schemaPath: "#/definitions/WebFetchInput/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
        }
        if (data.url !== void 0) {
          if (typeof data.url !== "string") {
            const err2 = { instancePath: instancePath + "/url", schemaPath: "#/definitions/WebFetchInput/properties/url/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.maxChars !== void 0) {
          let data1 = data.maxChars;
          if (!(typeof data1 == "number" && (!(data1 % 1) && !isNaN(data1)) && isFinite(data1))) {
            const err3 = { instancePath: instancePath + "/maxChars", schemaPath: "#/definitions/WebFetchInput/properties/maxChars/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
          if (typeof data1 == "number" && isFinite(data1)) {
            if (data1 > 5e4 || isNaN(data1)) {
              const err4 = { instancePath: instancePath + "/maxChars", schemaPath: "#/definitions/WebFetchInput/properties/maxChars/maximum", keyword: "maximum", params: { comparison: "<=", limit: 5e4 }, message: "must be <= 50000" };
              if (vErrors === null) {
                vErrors = [err4];
              } else {
                vErrors.push(err4);
              }
              errors++;
            }
            if (data1 < 1 || isNaN(data1)) {
              const err5 = { instancePath: instancePath + "/maxChars", schemaPath: "#/definitions/WebFetchInput/properties/maxChars/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
              if (vErrors === null) {
                vErrors = [err5];
              } else {
                vErrors.push(err5);
              }
              errors++;
            }
          }
        }
        if (data.offset !== void 0) {
          let data2 = data.offset;
          if (!(typeof data2 == "number" && (!(data2 % 1) && !isNaN(data2)) && isFinite(data2))) {
            const err6 = { instancePath: instancePath + "/offset", schemaPath: "#/definitions/WebFetchInput/properties/offset/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
          if (typeof data2 == "number" && isFinite(data2)) {
            if (data2 > 9007199254740991 || isNaN(data2)) {
              const err7 = { instancePath: instancePath + "/offset", schemaPath: "#/definitions/WebFetchInput/properties/offset/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
            if (data2 < 0 || isNaN(data2)) {
              const err8 = { instancePath: instancePath + "/offset", schemaPath: "#/definitions/WebFetchInput/properties/offset/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err8];
              } else {
                vErrors.push(err8);
              }
              errors++;
            }
          }
        }
      } else {
        const err9 = { instancePath, schemaPath: "#/definitions/WebFetchInput/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
      validate10.errors = vErrors;
      return errors === 0;
    }
  }
});
export default require_WebFetchInput_validator();
