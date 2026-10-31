var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// WebSearchInput-validator.cjs
var require_WebSearchInput_validator = __commonJS({
  "WebSearchInput-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      ;
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.query === void 0) {
          const err0 = { instancePath, schemaPath: "#/definitions/WebSearchInput/required", keyword: "required", params: { missingProperty: "query" }, message: "must have required property 'query'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "query" || key0 === "maxResults")) {
            const err1 = { instancePath, schemaPath: "#/definitions/WebSearchInput/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
        }
        if (data.query !== void 0) {
          if (typeof data.query !== "string") {
            const err2 = { instancePath: instancePath + "/query", schemaPath: "#/definitions/WebSearchInput/properties/query/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.maxResults !== void 0) {
          let data1 = data.maxResults;
          if (!(typeof data1 == "number" && (!(data1 % 1) && !isNaN(data1)) && isFinite(data1))) {
            const err3 = { instancePath: instancePath + "/maxResults", schemaPath: "#/definitions/WebSearchInput/properties/maxResults/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
          if (typeof data1 == "number" && isFinite(data1)) {
            if (data1 > 20 || isNaN(data1)) {
              const err4 = { instancePath: instancePath + "/maxResults", schemaPath: "#/definitions/WebSearchInput/properties/maxResults/maximum", keyword: "maximum", params: { comparison: "<=", limit: 20 }, message: "must be <= 20" };
              if (vErrors === null) {
                vErrors = [err4];
              } else {
                vErrors.push(err4);
              }
              errors++;
            }
            if (data1 < 1 || isNaN(data1)) {
              const err5 = { instancePath: instancePath + "/maxResults", schemaPath: "#/definitions/WebSearchInput/properties/maxResults/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
              if (vErrors === null) {
                vErrors = [err5];
              } else {
                vErrors.push(err5);
              }
              errors++;
            }
          }
        }
      } else {
        const err6 = { instancePath, schemaPath: "#/definitions/WebSearchInput/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
      validate10.errors = vErrors;
      return errors === 0;
    }
  }
});
export default require_WebSearchInput_validator();
