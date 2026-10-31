var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// GitLogInput-validator.cjs
var require_GitLogInput_validator = __commonJS({
  "GitLogInput-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      ;
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        for (const key0 in data) {
          if (!(key0 === "repoPath" || key0 === "maxCount" || key0 === "path" || key0 === "revisionRange" || key0 === "cursor")) {
            const err0 = { instancePath, schemaPath: "#/definitions/GitLogInput/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
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
            const err1 = { instancePath: instancePath + "/repoPath", schemaPath: "#/definitions/GitLogInput/properties/repoPath/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
        }
        if (data.maxCount !== void 0) {
          let data1 = data.maxCount;
          if (!(typeof data1 == "number" && (!(data1 % 1) && !isNaN(data1)) && isFinite(data1))) {
            const err2 = { instancePath: instancePath + "/maxCount", schemaPath: "#/definitions/GitLogInput/properties/maxCount/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
          if (typeof data1 == "number" && isFinite(data1)) {
            if (data1 > 100 || isNaN(data1)) {
              const err3 = { instancePath: instancePath + "/maxCount", schemaPath: "#/definitions/GitLogInput/properties/maxCount/maximum", keyword: "maximum", params: { comparison: "<=", limit: 100 }, message: "must be <= 100" };
              if (vErrors === null) {
                vErrors = [err3];
              } else {
                vErrors.push(err3);
              }
              errors++;
            }
            if (data1 < 1 || isNaN(data1)) {
              const err4 = { instancePath: instancePath + "/maxCount", schemaPath: "#/definitions/GitLogInput/properties/maxCount/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
              if (vErrors === null) {
                vErrors = [err4];
              } else {
                vErrors.push(err4);
              }
              errors++;
            }
          }
        }
        if (data.path !== void 0) {
          if (typeof data.path !== "string") {
            const err5 = { instancePath: instancePath + "/path", schemaPath: "#/definitions/GitLogInput/properties/path/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.revisionRange !== void 0) {
          if (typeof data.revisionRange !== "string") {
            const err6 = { instancePath: instancePath + "/revisionRange", schemaPath: "#/definitions/GitLogInput/properties/revisionRange/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data.cursor !== void 0) {
          if (typeof data.cursor !== "string") {
            const err7 = { instancePath: instancePath + "/cursor", schemaPath: "#/definitions/GitLogInput/properties/cursor/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
      } else {
        const err8 = { instancePath, schemaPath: "#/definitions/GitLogInput/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
      validate10.errors = vErrors;
      return errors === 0;
    }
  }
});
export default require_GitLogInput_validator();
