var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// GitShowInput-validator.cjs
var require_GitShowInput_validator = __commonJS({
  "GitShowInput-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      ;
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.object === void 0) {
          const err0 = { instancePath, schemaPath: "#/definitions/GitShowInput/required", keyword: "required", params: { missingProperty: "object" }, message: "must have required property 'object'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "object" || key0 === "repoPath" || key0 === "maxLines" || key0 === "cursor")) {
            const err1 = { instancePath, schemaPath: "#/definitions/GitShowInput/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
        }
        if (data.object !== void 0) {
          if (typeof data.object !== "string") {
            const err2 = { instancePath: instancePath + "/object", schemaPath: "#/definitions/GitShowInput/properties/object/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.repoPath !== void 0) {
          if (typeof data.repoPath !== "string") {
            const err3 = { instancePath: instancePath + "/repoPath", schemaPath: "#/definitions/GitShowInput/properties/repoPath/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.maxLines !== void 0) {
          let data2 = data.maxLines;
          if (!(typeof data2 == "number" && (!(data2 % 1) && !isNaN(data2)) && isFinite(data2))) {
            const err4 = { instancePath: instancePath + "/maxLines", schemaPath: "#/definitions/GitShowInput/properties/maxLines/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
          if (typeof data2 == "number" && isFinite(data2)) {
            if (data2 > 2e3 || isNaN(data2)) {
              const err5 = { instancePath: instancePath + "/maxLines", schemaPath: "#/definitions/GitShowInput/properties/maxLines/maximum", keyword: "maximum", params: { comparison: "<=", limit: 2e3 }, message: "must be <= 2000" };
              if (vErrors === null) {
                vErrors = [err5];
              } else {
                vErrors.push(err5);
              }
              errors++;
            }
            if (data2 < 1 || isNaN(data2)) {
              const err6 = { instancePath: instancePath + "/maxLines", schemaPath: "#/definitions/GitShowInput/properties/maxLines/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
              if (vErrors === null) {
                vErrors = [err6];
              } else {
                vErrors.push(err6);
              }
              errors++;
            }
          }
        }
        if (data.cursor !== void 0) {
          if (typeof data.cursor !== "string") {
            const err7 = { instancePath: instancePath + "/cursor", schemaPath: "#/definitions/GitShowInput/properties/cursor/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
      } else {
        const err8 = { instancePath, schemaPath: "#/definitions/GitShowInput/type", keyword: "type", params: { type: "object" }, message: "must be object" };
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
export default require_GitShowInput_validator();
