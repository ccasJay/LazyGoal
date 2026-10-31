var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// GitStatusInput-validator.cjs
var require_GitStatusInput_validator = __commonJS({
  "GitStatusInput-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      ;
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        for (const key0 in data) {
          if (!(key0 === "repoPath" || key0 === "path" || key0 === "cursor" || key0 === "maxEntries")) {
            const err0 = { instancePath, schemaPath: "#/definitions/GitStatusInput/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err0];
            } else {
              vErrors.push(err0);
            }
            errors++;
          }
        }
        if (data.repoPath !== void 0) {
          if (typeof data.repoPath !== "string") {
            const err1 = { instancePath: instancePath + "/repoPath", schemaPath: "#/definitions/GitStatusInput/properties/repoPath/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
        }
        if (data.path !== void 0) {
          if (typeof data.path !== "string") {
            const err2 = { instancePath: instancePath + "/path", schemaPath: "#/definitions/GitStatusInput/properties/path/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.cursor !== void 0) {
          if (typeof data.cursor !== "string") {
            const err3 = { instancePath: instancePath + "/cursor", schemaPath: "#/definitions/GitStatusInput/properties/cursor/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.maxEntries !== void 0) {
          let data3 = data.maxEntries;
          if (!(typeof data3 == "number" && (!(data3 % 1) && !isNaN(data3)) && isFinite(data3))) {
            const err4 = { instancePath: instancePath + "/maxEntries", schemaPath: "#/definitions/GitStatusInput/properties/maxEntries/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
          if (typeof data3 == "number" && isFinite(data3)) {
            if (data3 > 500 || isNaN(data3)) {
              const err5 = { instancePath: instancePath + "/maxEntries", schemaPath: "#/definitions/GitStatusInput/properties/maxEntries/maximum", keyword: "maximum", params: { comparison: "<=", limit: 500 }, message: "must be <= 500" };
              if (vErrors === null) {
                vErrors = [err5];
              } else {
                vErrors.push(err5);
              }
              errors++;
            }
            if (data3 < 1 || isNaN(data3)) {
              const err6 = { instancePath: instancePath + "/maxEntries", schemaPath: "#/definitions/GitStatusInput/properties/maxEntries/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
              if (vErrors === null) {
                vErrors = [err6];
              } else {
                vErrors.push(err6);
              }
              errors++;
            }
          }
        }
      } else {
        const err7 = { instancePath, schemaPath: "#/definitions/GitStatusInput/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
      validate10.errors = vErrors;
      return errors === 0;
    }
  }
});
export default require_GitStatusInput_validator();
